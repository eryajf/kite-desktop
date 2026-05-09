# Code TODO Research

本文档记录当前代码中 TODO / FIXME / HACK / XXX 标记的调研结果。

扫描范围：

- 包含代码与配置脚本中的 `TODO` / `FIXME` / `HACK` / `XXX`。
- 排除 `.codex/`、`docs/`、Markdown、依赖目录、覆盖率目录。
- 本次未发现 `FIXME` / `HACK` / `XXX`。

## 1. 总览

| 分类 | 文件 | 行 | 当前状态 | 建议优先级 |
|---|---:|---:|---|---|
| 真实功能缺口 | `pkg/handlers/resources/node_handler.go` | 64 | Node Drain 后端是假实现 | P0 |
| 协议/兼容性技术债 | `pkg/kube/terminal.go` | 66 | 终端仍使用 SPDY executor | P1/P2 |
| 测试可维护性技术债 | `pkg/cluster/cluster_manager.go` | 362 | Discovery 依赖仍是函数变量 stub | P3 |
| 产品体验增强 | `ui/src/hooks/use-ai-chat.ts` | 127 | AI 会话标题使用首条用户消息截断 | P2 |
| 上下文治理 | `pkg/handlers/node_terminal_handler.go` | 45, 192, 210 | Node terminal 部分 K8s 调用未用请求 ctx | P2/P3 |
| 上下文治理 | `pkg/handlers/kubectl_terminal_handler.go` | 219 | Kubectl terminal 清理未接收 ctx | P2/P3 |
| 上下文治理 | `pkg/cluster/prometheus.go` | 29 | Prometheus 自动发现使用 `context.TODO()` | P3 |

## 2. Node Drain 真实实现

位置：

- `pkg/handlers/resources/node_handler.go:64`
- 前端入口：
  - `ui/src/pages/node-list-page.tsx`
  - `ui/src/pages/node-detail.tsx`
  - `ui/src/lib/api/core.ts`
- 当前测试：
  - `pkg/handlers/resources/node_handler_test.go`

### 现状

`DrainNode` 当前只做了三件事：

1. 解析请求体。
2. 读取节点，确认节点存在。
3. 返回 `Node <name> drain initiated`。

它没有执行：

- cordon 节点
- 找出节点上的 Pod
- 调用 Eviction API
- 等待 Pod 删除
- 处理 PDB、DaemonSet、mirror/static Pod、emptyDir、本地数据、裸 Pod 等 drain 边界

### 为什么没有实现

真实 drain 不是简单删除 Pod。它需要复刻 `kubectl drain` 的关键安全语义：

- drain 前先将 Node 标记为 unschedulable
- 优先使用 `policy/v1` Eviction
- 正确处理 DaemonSet、mirror/static Pod、emptyDir、裸 Pod、已删除中的 Pod
- `force` 只能允许删除没有 controller 的 Pod
- `ignoreDaemonsets` 不是删除 DaemonSet，而是忽略它们
- `deleteLocalData` 对应 kubectl 的 `DeleteEmptyDirData`

### 推荐实现路径

优先复用 `k8s.io/kubectl/pkg/drain.Helper`。项目已经依赖 `k8s.io/kubectl v0.35.3`，它已经实现了上述大部分语义。

可行流程：

1. 保留现有 API 路径和请求体。
2. 构造 `drain.Helper`。
3. 先 cordon。
4. 调用 `GetPodsForDeletion(nodeName)`。
5. 再调用 `DeleteOrEvictPods(list.Pods())`。
6. 返回真实结果、warnings 和错误摘要。

### 需要讨论的产品取舍

- API 是否保持同步阻塞直到 drain 完成。
- 是否新增 `timeout` 请求参数。
- `gracePeriod` 的默认值如何规范化。
- drain 失败后是否自动 uncordon。

### 建议测试

- `force=false` 时，裸 Pod 阻止 drain
- `force=true` 时，裸 Pod 允许删除
- `ignoreDaemonsets=false` 时，DaemonSet Pod 阻止 drain
- `ignoreDaemonsets=true` 时，DaemonSet Pod 被忽略
- `deleteLocalData=false` 时，emptyDir Pod 阻止 drain
- 节点不存在返回 404
- 验证节点被 cordon

## 3. Terminal SPDY -> WebSocket Executor

位置：

- `pkg/kube/terminal.go:66`
- 相关：
  - `pkg/handlers/terminal_handler.go`
  - `pkg/handlers/node_terminal_handler.go`
  - `pkg/handlers/kubectl_terminal_handler.go`
  - `pkg/kube/exec.go`
  - `ui/src/components/terminal-content.tsx`

### 现状

`TerminalSession.Start` 当前使用：

```go
remotecommand.NewSPDYExecutor(session.k8sClient.Configuration, "POST", req.URL())
```

该 `TerminalSession` 被三类终端共用：

- Pod exec terminal
- Node terminal agent attach
- Kubectl terminal agent attach

### 为什么没有实现

这是 Kubernetes 远程命令传输协议演进留下的技术债。SPDY 是老路径，WebSocket executor 是新路径，但直接切换有兼容性风险：

- 不同 apiserver / 代理 / 反向代理对 WebSocket upgrade 支持不同
- 终端功能覆盖 stdin/stdout/stderr/resize/ping
- Node terminal 和 kubectl terminal 使用 attach，Pod terminal 使用 exec，都要验证

### 推荐实现路径

优先使用 WebSocket executor，并保留 SPDY fallback。

### 风险

- 代理环境中 WebSocket upgrade 失败，需要确认 fallback 生效
- `attach` 子资源是否在目标集群版本与运行时组合下正常
- resize 消息是否仍稳定

### 建议测试

- Pod 终端输入、resize、空闲保持
- Node 终端 agent 创建、attach、关闭清理
- Kubectl 终端 SA/CRB 创建、agent Pod attach、关闭清理
- 代理或不支持 WebSocket upgrade 环境下验证 fallback

## 4. Cluster DiscoveryInterface 抽象

位置：

- `pkg/cluster/cluster_manager.go:362`
- 相关测试：
  - `pkg/cluster/cluster_manager_test.go`
  - `pkg/cluster/cluster_manager_additional_test.go`

### 现状

当前 `shouldUpdateCluster` 判断 K8s 版本变化时调用包级函数变量：

```go
version, err := getClientSetServerVersion(cs.K8sClient)
```

### 为什么没有实现

这是测试可维护性问题，不是功能缺口。为了让测试可控，项目引入了函数变量 stub，但 TODO 仍希望进一步抽一个更小的接口，让依赖关系更明确。

### 推荐实现路径

可选两条：

1. 保留当前函数变量，仅删 TODO 或改注释。
2. 抽一个小接口，减少对 `*kubernetes.Clientset` 的直接依赖。

### 建议

优先级不高，适合放在后续重构期处理。

## 5. AI 会话标题生成

位置：

- `ui/src/hooks/use-ai-chat.ts:127`
- 相关：
  - `ui/src/lib/api/ai-history.ts`
  - `pkg/ai/history_handler.go`
  - `pkg/model/ai_chat_session.go`

### 现状

前端 `generateSessionTitle` 直接取第一条用户消息，超过 50 字符截断。后端历史接口只做持久化，不会重新生成标题。

### 为什么没有实现

AI 标题生成需要产品和工程取舍：

- 是否为每个新会话额外发起一次模型调用
- 什么时候生成
- 失败时如何兜底
- 是否允许用户手动重命名
- 是否受 AI 开关、provider、model、max tokens 影响

### 推荐实现路径

建议后端新增一个轻量标题接口，而不是在前端直接调用完整 Agent。

### 可选更小实现

如果暂不想新增模型调用，可以先增强本地标题生成：

- 去掉 Markdown / 代码块
- 优先提取资源名、命名空间、动作词
- 中英文分别截断

### 建议测试

- OpenAI / Anthropic mock 标题返回
- AI 未启用时 fallback
- 空消息、超长消息处理
- 标题接口失败时前端仍可继续使用本地 fallback

## 6. `context.TODO()` 上下文治理

这些命中不是显式功能 TODO，但建议作为一组小修处理。

### 6.1 Node terminal 获取 Node

位置：

- `pkg/handlers/node_terminal_handler.go:45`

现状：

WebSocket handler 内先调用 `Nodes().Get(context.TODO(), ...)`，随后才创建请求 ctx。

建议：

- 将 `ctx, cancel := context.WithCancel(c.Request.Context())` 提前
- 所有后续 K8s 调用共用这个 ctx

### 6.2 Node terminal 等待 agent Pod ready

位置：

- `pkg/handlers/node_terminal_handler.go:192`

现状：

`waitForPodReady` 已经接收入参 `ctx`，但 Pod Get 仍使用 `context.TODO()`

建议：

- 直接替换为入参 `ctx`

### 6.3 Node terminal cleanup

位置：

- `pkg/handlers/node_terminal_handler.go:210`

建议：

- 改成接收 ctx
- cleanup 使用短超时的独立 ctx，而不是复用可能已取消的请求 ctx

### 6.4 Kubectl terminal cleanup

位置：

- `pkg/handlers/kubectl_terminal_handler.go:219`

建议：

- 改成接收 ctx
- create 失败后的 cleanup 也复用同一 helper

### 6.5 Prometheus 自动发现

位置：

- `pkg/cluster/prometheus.go:29`

建议：

- 短期改为 `context.Background()`
- 长期再考虑把 ctx 往下传

## 7. 建议执行顺序

1. Node Drain 真实实现
2. `context.TODO()` 治理
3. Terminal WebSocket executor + SPDY fallback
4. AI 会话标题生成
5. DiscoveryInterface 小重构
