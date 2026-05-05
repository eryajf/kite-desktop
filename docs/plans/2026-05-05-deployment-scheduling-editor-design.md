# Deployment 调度策略编辑能力设计方案

> **Goal:** 为 `Kite Desktop` 的 Deployment 列表与详情页补齐 `tolerations` 与 `affinity` 的查看、编辑与保存能力，采用桌面端友好的结构化弹窗交互，并为后续扩展到其他 Workload 资源预留公共能力。

> **Scope:** 本文聚焦 Deployment 的 Pod 调度策略编辑，不覆盖 DaemonSet / StatefulSet / Job / CronJob 的首批接入，也不在第一期一并处理 `nodeSelector`、`topologySpreadConstraints`、`runtimeClassName` 等其他调度相关字段。

> **Current Date:** 2026-05-05

## 1. 背景

当前 Deployment 列表页已经展示了：

- `标签`
- `注解`
- `容忍度`
- `亲和性`
- `容器与镜像`
- `资源限制`

其中 `标签` 与 `注解` 已经升级为 icon 入口，点击后可查看并编辑。对应公共能力包括：

- [ui/src/components/metadata-action-button.tsx](../../ui/src/components/metadata-action-button.tsx)
- [ui/src/components/editors/resource-metadata-dialog.tsx](../../ui/src/components/editors/resource-metadata-dialog.tsx)

但 `容忍度` 与 `亲和性` 目前仍然只是 Deployment 列表里的只读摘要：

- [ui/src/pages/deployment-list-page.tsx](../../ui/src/pages/deployment-list-page.tsx)

Deployment 当前的结构化编辑能力主要集中在容器层：

- [ui/src/components/container-edit-dialog.tsx](../../ui/src/components/container-edit-dialog.tsx)
- [ui/src/hooks/use-deployment-container-editor.ts](../../ui/src/hooks/use-deployment-container-editor.ts)

也就是说，调度策略这块还没有一套结构化的查看 / 编辑 / 校验 / 保存链路。

## 2. 目标

本次能力设计的目标是：

1. 将 Deployment 列表页中的 `容忍度` 与 `亲和性` 改造成和标签 / 注解一致的 icon 入口。
2. 用户点击后，可以以结构化方式查看当前配置，而不是被迫直接改 YAML。
3. 第一版先解决最常见、最有价值的字段，不追求一次覆盖 Kubernetes 全量调度参数。
4. 抽离为可复用的公共能力，为后续扩展到 `StatefulSet`、`DaemonSet` 等资源预留复用点。
5. 保留 YAML 作为高级配置兜底，而不是把所有边缘字段都塞进首版 UI。

## 3. 非目标

本方案明确不在第一期处理：

- `nodeSelector`
- `topologySpreadConstraints`
- `runtimeClassName`
- `schedulerName`
- `priorityClassName`
- `hostAliases`
- Feature Gate 相关的 alpha 字段完整支持
- 对除 Deployment 之外的所有资源同步接入
- 完整的“任意 Kubernetes 调度 DSL 可视化编辑器”

## 4. 设计原则

### 4.1 桌面优先，而不是 YAML 优先

首要目标是让桌面用户在常见场景下，不需要先理解完整 YAML 结构，也能完成调度策略维护。

### 4.2 结构化优先，复杂场景允许回退 YAML

对于高频且稳定的字段，提供结构化表单。
对于复杂、低频、容易误配的字段，第一版允许继续走 YAML。

### 4.3 先覆盖 80% 常见需求，再补高级能力

`tolerations` 的字段面较小、收益高，适合第一期完整支持。
`affinity` 的字段面明显更大，应分期推进。

### 4.4 公共能力先抽象，再接入具体页面

不要直接在 Deployment 页面手写一套弹窗与保存逻辑。
应先沉淀公共组件 / hook / 校验模型，再接入 Deployment。

## 5. 用户体验方案

## 5.1 列表页入口

Deployment 列表页中的：

- `容忍度`
- `亲和性`

改为和 `标签` / `注解` 一致的 icon 入口。

交互模式：

- `容忍度`：使用单独 icon 按钮
- `亲和性`：使用单独 icon 按钮
- 鼠标 hover 显示 tooltip，说明当前入口语义
- 点击后打开对应编辑弹窗

列表页不再承担详情摘要展示职责，避免列宽继续膨胀。

## 5.2 弹窗形态

推荐采用和当前元数据弹窗一致的总体交互风格：

- 弹窗打开于当前页面上下文
- 内容较少时使用相对紧凑高度
- 内容较多时自动进入大尺寸滚动模式
- 底部固定操作区：`取消` / `保存`

但调度策略弹窗不应直接复用元数据编辑器，因为它们的数据结构不是简单键值对。

## 5.3 两类弹窗

建议拆成两个公共编辑器：

1. `WorkloadTolerationsDialog`
2. `WorkloadAffinityDialog`

原因：

- `tolerations` 是扁平数组，适合“条目卡片 / 行编辑器”
- `affinity` 是分组嵌套结构，适合“分区编辑 + 分组折叠”

如果强行合成一个“大调度策略弹窗”，第一版实现和维护成本都会明显上升。

## 6. 数据范围与参数项

## 6.1 Tolerations 第一版支持范围

第一版建议完整支持以下字段：

- `key`
- `operator`
- `value`
- `effect`
- `tolerationSeconds`

字段来源：

- `spec.template.spec.tolerations[]`

推荐支持的 operator：

- `Equal`
- `Exists`

推荐支持的 effect：

- `NoSchedule`
- `PreferNoSchedule`
- `NoExecute`

## 6.2 Tolerations 交互细节

每个 toleration 作为一个可编辑条目，包含：

- 键 `key`
- 操作符 `operator`
- 值 `value`
- 效果 `effect`
- 容忍时长 `tolerationSeconds`
- 删除按钮

额外行为：

- 支持新增条目
- 支持删除条目
- 支持空状态提示
- 支持保存前校验

## 6.3 Tolerations 校验规则

需要补齐以下前端校验：

1. `operator` 为空时，默认按 `Equal` 处理或在 UI 中默认选中 `Equal`
2. `operator=Exists` 时：
   - `value` 应隐藏或禁用
   - 保存前不写入 `value`
3. `key` 为空时：
   - 仅允许 `operator=Exists`
4. `effect=NoExecute` 时：
   - 可编辑 `tolerationSeconds`
5. `effect` 不是 `NoExecute` 时：
   - `tolerationSeconds` 不展示或保存前移除
6. `tolerationSeconds` 必须为非负整数

## 6.4 Affinity 第一版支持范围

Affinity 结构明显更复杂，建议第一版支持“常用子集”。

支持的顶层分组：

- `nodeAffinity`
- `podAffinity`
- `podAntiAffinity`

每个分组先支持最常用字段：

### Node Affinity

- `requiredDuringSchedulingIgnoredDuringExecution`
  - `nodeSelectorTerms[]`
  - `matchExpressions[]`
- `preferredDuringSchedulingIgnoredDuringExecution`
  - `weight`
  - `preference.matchExpressions[]`

第一版建议暂不支持：

- `matchFields`

### Pod Affinity / Pod Anti-Affinity

- `requiredDuringSchedulingIgnoredDuringExecution`
  - `labelSelector.matchLabels`
  - `labelSelector.matchExpressions[]`
  - `namespaces[]`
  - `topologyKey`
- `preferredDuringSchedulingIgnoredDuringExecution`
  - `weight`
  - `podAffinityTerm`
    - `labelSelector.matchLabels`
    - `labelSelector.matchExpressions[]`
    - `namespaces[]`
    - `topologyKey`

第一版建议暂不支持：

- `namespaceSelector`
- `matchLabelKeys`
- `mismatchLabelKeys`

## 6.5 为什么要裁剪 Affinity 范围

原因不是 Kubernetes 不支持，而是首版桌面 UI 不适合一次吃下全部复杂度：

- `podAffinityTerm` 嵌套层级深
- `namespaceSelector` 会引入另一个选择器编辑器
- `matchFields` 使用频率低
- alpha / feature-gate 字段一旦半支持，用户反而更容易误解

因此推荐第一版聚焦：

- 节点标签亲和
- 基于 Pod 标签的亲和 / 反亲和
- 权重
- topologyKey

这已经覆盖大多数常见生产场景。

## 7. 建议的公共能力拆分

## 7.1 公共入口按钮

延续当前模式，复用或扩展现有：

- [ui/src/components/metadata-action-button.tsx](../../ui/src/components/metadata-action-button.tsx)

建议不要继续沿用“metadata”语义命名去承载调度能力。
更合理的方式是新增更通用的：

- `ResourceActionIconButton`

但这不是第一期的硬性要求。

## 7.2 公共 Workload 调度编辑器

推荐新增：

- `ui/src/components/editors/workload-tolerations-dialog.tsx`
- `ui/src/components/editors/workload-affinity-dialog.tsx`

如果后续要复用到 DaemonSet / StatefulSet：

- 可以继续抽一个更底层的 `workload-scheduling-shared.ts`

## 7.3 公共草稿与校验 Hook

推荐新增一个调度策略专用 hook：

- `ui/src/hooks/use-workload-scheduling-editor.ts`

职责：

- 从 Workload 资源中提取 `spec.template.spec.tolerations`
- 从 Workload 资源中提取 `spec.template.spec.affinity`
- 维护草稿状态
- 统一 sanitize
- 统一 validation
- 输出保存后的 next resource

这和当前容器编辑的职责边界类似：

- [ui/src/hooks/use-deployment-container-editor.ts](../../ui/src/hooks/use-deployment-container-editor.ts)

## 7.4 公共字段编辑器

如果实现中发现 Affinity 表单过大，建议继续拆分：

- `toleration-item-editor.tsx`
- `node-affinity-editor.tsx`
- `pod-affinity-term-editor.tsx`
- `label-selector-editor.tsx`
- `match-expression-editor.tsx`

这样可以避免单文件过大，也更方便未来扩展到其他 workload。

## 8. 页面接入建议

## 8.1 Deployment 列表页

Deployment 列表页应只负责：

- 展示 icon 列
- 打开对应弹窗
- 关闭弹窗后刷新资源列表

不负责承担复杂表单逻辑。

目标文件：

- [ui/src/pages/deployment-list-page.tsx](../../ui/src/pages/deployment-list-page.tsx)

## 8.2 Deployment 详情页

第二步建议在 Deployment 详情页增加同样的入口，这样用户不必回到列表页编辑。

入口位置建议：

- `DeploymentOverviewInfoCard` 所在区域
- 或详情页顶部资源操作区的次级按钮

目标文件：

- [ui/src/pages/deployment-detail.tsx](../../ui/src/pages/deployment-detail.tsx)
- [ui/src/components/deployment-overview-info-card.tsx](../../ui/src/components/deployment-overview-info-card.tsx)

## 9. 保存策略

所有结构化编辑最终都应回写到：

- `spec.template.spec.tolerations`
- `spec.template.spec.affinity`

推荐沿用当前 Deployment 编辑逻辑：

- 对完整 Deployment 对象做浅克隆 / 深拷贝
- 写回对应字段
- 使用 `updateResource('deployments', name, namespace, body)` 提交

而不是只发局部 patch，原因是：

- 当前项目已有完整对象保存习惯
- 对嵌套结构调试更直观
- 更容易和 YAML 编辑路径保持一致

需要补一个 sanitize 过程：

- 空数组可删掉字段
- 空对象可删掉字段
- `operator=Exists` 时删掉 `value`
- 非 `NoExecute` 时删掉 `tolerationSeconds`
- 空的 `affinity` 子块应自动折叠清理

## 10. 测试策略

## 10.1 单元测试

至少覆盖：

- toleration sanitize
- toleration validation
- affinity required/preferred 结构保存
- label selector expression 校验
- 空结构清理

建议新增：

- `ui/src/hooks/use-workload-scheduling-editor.test.tsx`

## 10.2 组件测试

至少覆盖：

- 列表页 icon 点击可打开弹窗
- 弹窗可新增 / 删除 / 修改条目
- 错误校验可正确阻止保存
- 内容少时使用紧凑高度
- 内容多时使用大窗口滚动模式

## 10.3 页面回归

至少回归：

- Deployment 列表页
- Deployment 详情页
- 现有标签 / 注解元数据弹窗

避免引入：

- 列表列宽回归
- 弹窗尺寸回归
- 资源保存逻辑串扰

## 11. 分阶段实施建议

## Phase 1：Tolerations 结构化编辑

交付目标：

- Deployment 列表页 `容忍度` 改成 icon
- 新增 tolerations 弹窗
- 支持完整 toleration 字段编辑
- 支持保存与校验

这是最适合先落地的一期，因为：

- 字段面小
- 用户价值高
- 风险相对可控

## Phase 2：Affinity 查看与常用编辑

交付目标：

- Deployment 列表页 `亲和性` 改成 icon
- 新增 affinity 弹窗
- 支持 nodeAffinity / podAffinity / podAntiAffinity 常用子集
- 支持 required / preferred

这期建议先保证“常用配置能编辑”，而不是追求全量。

## Phase 3：Affinity 高级字段扩展

按需求逐步补齐：

- `matchFields`
- `namespaceSelector`
- `matchLabelKeys`
- `mismatchLabelKeys`

如果后续真实需求不高，这一期可以不做。

## Phase 4：扩展到其他 Workload

在公共能力稳定后，再评估接入：

- StatefulSet
- DaemonSet
- Job
- CronJob

此时公共抽象应已经基本稳定，接入成本会远小于首批实现。

## 12. 推荐的首版实现边界

为了降低专项分支的风险，推荐本次能力首版边界如下：

### 必做

- `tolerations` 全量结构化编辑
- `affinity` 常用子集结构化编辑
- Deployment 列表页 icon 入口
- 保存与基础校验
- 公共 hook / dialog 抽象

### 可选

- Deployment 详情页入口
- Affinity 摘要卡片
- 条件展示说明文案

### 暂不做

- 高级 Affinity 字段全量支持
- 其他 workload 同步接入
- 可视化 DSL 与 YAML 双向复杂映射器

## 13. 开放问题

以下问题建议在专项分支开始前确认：

1. Deployment 详情页是否要和列表页同一期一起接入？
2. Affinity 第一版是否需要支持 `namespaceSelector`？
3. 是否允许首版在弹窗里保留一个“查看原始 YAML 片段”的只读区域？
4. 保存时是否继续沿用完整对象 `PUT`，还是为这块单独引入 patch 路径？

本文默认答案是：

- 详情页入口：可第二步再接
- `namespaceSelector`：第一版不支持
- YAML 片段：可选，不是必做
- 保存方式：沿用完整对象 `PUT`

## 14. 结论

这项能力确实是一个中等偏大的专项内容，不适合作为 Deployment 列表页的小修补直接塞进去。

最稳妥的推进方式是：

1. 先沉淀公共调度策略编辑能力
2. 第一阶段优先落 `tolerations`
3. 第二阶段补 `affinity` 常用子集
4. 高级字段继续通过 YAML 兜底

这样既能尽快给用户带来价值，也能避免在第一版里把调度策略编辑器做成一套复杂但难维护的巨型表单。
