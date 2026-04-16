# Deployment 概览增强与编辑能力设计方案

## 概述

本文档定义 `Deployment` 详情页中 `概览` 区域的展示增强方案，以及容器级编辑弹窗的能力扩展方案。

目标是解决当前两个问题：

- `概览` 信息过少，关键配置与状态不够集中，用户需要频繁切到 `YAML` 或展开容器卡片才能判断 Deployment 的真实状态。
- 当前编辑能力仅覆盖 `镜像 / 资源 / 环境变量`，缺少 `挂载 / 探针` 两类高频配置的可视化编辑入口。

本方案优先复用现有前端与 API 能力，不引入新的后端专用接口，尽量在现有 `Deployment update` 流程上完成。

## 产品结论

本功能采用以下产品决策：

1. 保留当前 `Deployment` 详情页整体结构，不重做页面导航或改成独立 spec editor。
2. 将 `概览` 升级为 Deployment 的核心工作区，既提供关键状态信息，也提供统一编辑入口。
3. 容器编辑弹窗保留现有模式，但从 3 个 Tab 扩展为 5 个 Tab：
   - `镜像`
   - `资源`
   - `环境变量`
   - `挂载`
   - `探针`
4. 一期仍通过现有 `updateResource('deployments', ...)` 更新 Deployment，不新增后端 patch 专用接口。
5. 一期只覆盖高频、低歧义配置；复杂能力继续建议通过 `YAML` 修改。

## 目标

- 在 `概览` 中集中展示 Deployment 运行状态和关键配置信息。
- 提供统一、可视化的容器编辑入口，覆盖镜像、资源、环境变量、挂载、探针。
- 最大化复用当前的容器编辑能力与 Deployment 更新链路。
- 降低用户在 `概览 / 容器卡片 / YAML` 之间来回切换的频率。
- 为后续扩展到 `StatefulSet`、`DaemonSet` 保留可复用的展示和编辑模式。

## 非目标

- 不在第一版实现完整的 Deployment spec 可视化编辑器。
- 不在第一版支持 `gRPC probe`、复杂 HTTP Header、`projected`/`CSI` 卷等高级配置。
- 不在第一版为 `initContainers` 提供与普通容器完全一致的全量编辑体验。
- 不在第一版新增后端聚合接口或后端校验逻辑。
- 不替代 `YAML` 编辑；复杂配置仍由 `YAML` 兜底。

## 当前实现现状

### 一、概览区现状

当前 `Deployment` 详情页已在 [deployment-detail.tsx](/Users/eryajf/code/github/kite-desktop/ui/src/pages/deployment-detail.tsx) 中提供：

- `状态`
- `Ready Replicas`
- `Updated Replicas`
- `Available Replicas`
- 创建时间、策略、副本数、选择器
- 标签、注解

问题是：

- 字段数量不足，缺少 `hostNetwork`、`schedulerName`、`revision`、聚合资源等关键数据。
- 信息分组较弱，难以支持扫描式阅读。
- 概览和编辑入口关联不够紧密。

### 二、编辑能力现状

当前 [container-edit-dialog.tsx](/Users/eryajf/code/github/kite-desktop/ui/src/components/container-edit-dialog.tsx) 已支持：

- `镜像`
- `资源`
- `环境变量`

现有 editor 组件包括：

- [image-editor.tsx](/Users/eryajf/code/github/kite-desktop/ui/src/components/editors/image-editor.tsx)
- [resource-editor.tsx](/Users/eryajf/code/github/kite-desktop/ui/src/components/editors/resource-editor.tsx)
- [environment-editor.tsx](/Users/eryajf/code/github/kite-desktop/ui/src/components/editors/environment-editor.tsx)

现状优势：

- 容器编辑弹窗已经具备基本框架。
- Deployment 保存链路已存在，能直接更新整个 Deployment 对象。

现状缺口：

- `挂载` 与 `探针` 没有对应 editor。
- 编辑流程目前主要围绕单个 `container`，尚未很好覆盖 `spec.template.spec.volumes` 这类 Pod 模板级数据。

## 用户体验设计

### 一、概览信息架构

`overview` Tab 建议重构为两张主卡：

1. `状态概览`
- 状态
- `Ready / Spec`
- `Updated Replicas`
- `Available Replicas`
- `ObservedGeneration / Generation` 收敛提示

2. `Deployment 信息`
- 状态
- 更新策略
- 副本数
- 创建时间
- Age
- 主机网络
- 调度器
- 资源请求
- 资源限制
- 选择器
- 修订版本
- 链路追踪或关键特性状态
- 标签
- 注解

布局建议：

- 桌面端采用 2 到 3 列信息块布局
- 移动端自动收敛为单列
- `状态概览` 和 `Deployment 信息` 保持清晰层次，不混成单一 key-value 列表

### 二、统一编辑入口

建议在 `Deployment 信息` 卡片中提供统一编辑入口：

- 单容器 Deployment：点击后直接进入该容器编辑弹窗
- 多容器 Deployment：打开弹窗并默认选中第一个普通容器，弹窗头部提供容器切换器

不建议在概览卡的每个字段上散落单独的编辑图标，否则会让交互边界变得模糊。

### 三、编辑弹窗结构

编辑弹窗保持单窗口模式，分为 5 个 Tab：

1. `镜像`
- `image`
- `imagePullPolicy`

2. `资源`
- `requests.cpu`
- `requests.memory`
- `limits.cpu`
- `limits.memory`

3. `环境变量`
- `env`
- `envFrom`

4. `挂载`
- `volumeMounts`
- `volumes`

5. `探针`
- `livenessProbe`
- `readinessProbe`
- `startupProbe`

弹窗底部保留统一 `取消 / 保存` 操作。

## 关键字段口径

### 一、状态与副本

- 状态：复用 [k8s.ts](/Users/eryajf/code/github/kite-desktop/ui/src/lib/k8s.ts) 中的 `getDeploymentStatus`
- `Ready / Spec`：`status.readyReplicas / spec.replicas`
- `Updated Replicas`：`status.updatedReplicas`
- `Available Replicas`：`status.availableReplicas`
- `ObservedGeneration`：`status.observedGeneration`
- `Generation`：`metadata.generation`

当 `observedGeneration < generation` 时，应在概览中提示 Deployment 还未完全收敛。

### 二、Deployment 信息

- 创建时间：`metadata.creationTimestamp`
- Age：基于创建时间派生
- 更新策略：`spec.strategy.type`
- 主机网络：`spec.template.spec.hostNetwork`
- 调度器：`spec.template.spec.schedulerName`
- 选择器：`spec.selector.matchLabels`
- 修订版本：`metadata.annotations["deployment.kubernetes.io/revision"]`

### 三、资源展示口径

概览中的 `资源请求 / 资源限制` 不应来自单个容器，而应对 `spec.template.spec.containers` 做聚合求和。

一期建议：

- 对普通 `containers` 做聚合
- `initContainers` 不并入概览总计
- 空值显示 `未指定 / Not set`

## 挂载设计

### 一、数据模型

`挂载` 必须拆分成两层：

1. `Volume Mounts`
- 数据位置：`container.volumeMounts`
- 字段：
  - `name`
  - `mountPath`
  - `readOnly`
  - `subPath`

2. `Volumes`
- 数据位置：`spec.template.spec.volumes`
- 一期支持类型：
  - `ConfigMap`
  - `Secret`
  - `PVC`
  - `EmptyDir`
  - `HostPath`

### 二、交互规则

- 新增挂载时，卷名称从当前 `volumes` 列表中选择。
- 新增卷时，采用列表式表单，而不是复用创建向导的多步骤体验。
- 删除卷时，需要先判断是否被任意 `container.volumeMounts` 引用。
- 已被引用的卷删除时应阻止操作，并给出明确提示。

## 探针设计

### 一、支持范围

一期支持以下探针类型：

- `HTTP`
- `TCP`
- `Exec`

每个探针包含：

- 启用/关闭
- 探针类型
- 通用参数：
  - `initialDelaySeconds`
  - `periodSeconds`
  - `timeoutSeconds`
  - `successThreshold`
  - `failureThreshold`
- 类型参数：
  - `HTTP`: `path`, `port`
  - `TCP`: `port`
  - `Exec`: `command[]`

### 二、交互规则

- `Liveness`、`Readiness`、`Startup` 分组展示
- 未启用时展示空态与启用按钮
- 切换探针类型时，清理不兼容字段
- 一期不支持的高级能力保留 `YAML` 兜底说明

## 技术方案

### 一、概览 View Model

建议为 Deployment 概览定义统一的 view model，避免在页面 JSX 中直接做复杂派生计算。

建议字段：

```ts
type DeploymentOverviewViewModel = {
  status: string
  statusTone: 'success' | 'warning' | 'danger' | 'muted'
  readyReplicas: number
  specReplicas: number
  updatedReplicas: number
  availableReplicas: number
  observedGeneration?: number
  generation?: number
  isObserved: boolean
  createdAt: string
  age: string
  strategy: string
  hostNetworkText: string
  schedulerNameText: string
  resourceRequestsText: string
  resourceLimitsText: string
  selectorLabels: Record<string, string>
  revision?: string
  traceStatusText: string
  labels: Record<string, string>
  annotations: Record<string, string>
}
```

建议提供纯函数：

- `buildDeploymentOverviewViewModel(deployment)`

### 二、编辑态模型

建议容器编辑能力围绕一个本地草稿模型实现：

- `draftDeployment`
- `selectedContainerName`
- `activeTab`
- `isDirty`
- `validationErrors`
- `isSaving`

推荐约束：

- 打开弹窗时深拷贝当前 Deployment
- 所有 Tab 编辑都只落到本地草稿
- 点击保存时统一提交整个 `draftDeployment`
- 子 editor 不直接调用 API

### 三、校验错误模型

建议统一采用路径式错误 map：

```ts
type ValidationErrors = Record<string, string>
```

示例 key：

- `container.image`
- `container.resources.requests.cpu`
- `container.volumeMounts.0.mountPath`
- `volumes.1.name`
- `container.livenessProbe.httpGet.port`

这样可以支持：

- editor 内就地展示错误
- 弹窗 Tab 级高亮
- 保存前统一校验

## 组件拆分

### 一、概览展示组件

建议新增：

- `DeploymentOverviewStatusCard`
- `DeploymentOverviewInfoCard`
- `DeploymentResourceSummary`

职责划分：

- `StatusCard` 只负责状态展示
- `InfoCard` 只负责 Deployment 信息展示和编辑入口
- `ResourceSummary` 只负责渲染聚合资源摘要

### 二、编辑相关组件

建议在现有 editor 基础上新增：

- `VolumeMountEditor`
- `VolumeSourceEditor`
- `ProbeEditor`
- `ProbeGroupEditor`

编辑弹窗 [container-edit-dialog.tsx](/Users/eryajf/code/github/kite-desktop/ui/src/components/container-edit-dialog.tsx) 升级后负责：

- 容器切换
- Tab 切换
- 保存与取消
- 将局部变更回写到 `draftDeployment`

### 三、Hook

建议新增：

- `useDeploymentContainerEditor`

职责：

- 初始化草稿
- 提供容器切换能力
- 更新 `container` 与 `volumes`
- 提供统一校验
- 计算 `isDirty`

## 文件级改造范围

### 一、建议修改的文件

- [deployment-detail.tsx](/Users/eryajf/code/github/kite-desktop/ui/src/pages/deployment-detail.tsx)
- [container-edit-dialog.tsx](/Users/eryajf/code/github/kite-desktop/ui/src/components/container-edit-dialog.tsx)
- [index.ts](/Users/eryajf/code/github/kite-desktop/ui/src/components/editors/index.ts)
- [k8s.ts](/Users/eryajf/code/github/kite-desktop/ui/src/lib/k8s.ts)
- [zh.json](/Users/eryajf/code/github/kite-desktop/ui/src/i18n/locales/zh.json)
- [en.json](/Users/eryajf/code/github/kite-desktop/ui/src/i18n/locales/en.json)

### 二、建议新增的文件

- `ui/src/components/deployment-overview-status-card.tsx`
- `ui/src/components/deployment-overview-info-card.tsx`
- `ui/src/components/deployment-resource-summary.tsx`
- `ui/src/components/editors/volume-mount-editor.tsx`
- `ui/src/components/editors/volume-source-editor.tsx`
- `ui/src/components/editors/probe-editor.tsx`
- `ui/src/components/editors/probe-group-editor.tsx`
- `ui/src/hooks/use-deployment-container-editor.ts`

### 三、建议避免修改的文件

- [deployment_handler.go](/Users/eryajf/code/github/kite-desktop/pkg/handlers/resources/deployment_handler.go)
- [container-info-card.tsx](/Users/eryajf/code/github/kite-desktop/ui/src/components/container-info-card.tsx)

原因是一期无需改后端接口，也无需同时重构另一套只读容器信息卡。

## 交互事件流

推荐流程如下：

1. 用户进入 `Deployment` 详情页
2. 页面拉取 Deployment 并构建概览 view model
3. 用户在概览或容器卡点击编辑
4. 初始化 `draftDeployment`
5. 用户在弹窗各 Tab 中修改草稿
6. 点击保存时执行统一校验
7. 校验通过后调用现有 `updateResource('deployments', ...)`
8. 更新成功后关闭弹窗，并进入现有刷新观察流程
9. 更新失败时保留草稿，允许用户继续修改

## 校验规则

一期至少覆盖以下校验：

- 镜像不能为空
- CPU/Memory 做基础格式校验
- 环境变量名称不能为空
- `envFrom` 的资源名不能为空
- `volume.name` 不能为空且在 Pod 内唯一
- `mountPath` 不能为空
- 被引用卷不能直接删除
- `HTTP/TCP` 探针端口不能为空
- `Exec` 探针命令不能为空

## 分阶段实施建议

### Phase 1：概览增强

- 构建 Deployment 概览 view model
- 重构概览展示卡片
- 增加资源聚合、revision、hostNetwork、scheduler 等字段

### Phase 2：编辑弹窗扩展

- 将容器编辑弹窗从 3 个 Tab 扩展到 5 个 Tab
- 接入 `VolumeMountEditor`
- 接入 `VolumeSourceEditor`

### Phase 3：探针与体验补全

- 接入 `ProbeGroupEditor`
- 完成校验、脏数据提示、Tab 错误高亮
- 补齐中英文文案

## 测试建议

建议至少补充以下测试：

- Deployment 概览字段渲染正确
- 资源聚合结果正确
- 多容器切换不会串改数据
- 删除被引用卷时会阻止保存
- 切换探针类型会清理旧字段
- 保存后更新到正确的 container 和 volumes
- 空值字段显示统一的 `未指定 / Not set`

## 风险与约束

- `volumes` 是 Pod 模板级配置，编辑一个 container 时可能影响其他 container，删除和改名必须谨慎处理。
- `initContainers` 与普通容器能力边界不同，一期不建议完全并轨。
- 若后续要支持 `StatefulSet`/`DaemonSet`，应尽量将 view model 与 editor 设计为可复用，而不是写死在 Deployment 页面中。

## 最终建议

推荐以“概览增强优先、编辑能力分阶段补齐”的方式推进：

1. 先做概览信息架构和 view model
2. 再扩展编辑弹窗
3. 最后补挂载和探针编辑细节

这样可以尽快交付可见价值，同时把复杂度控制在可回归、可验证的范围内。

## 开发任务清单

本节将设计方案进一步拆解为可执行的阶段任务，默认按 `Phase 0 -> Phase 1 -> Phase 2 -> Phase 3 -> 收尾` 的顺序推进。

建议执行原则：

- 每完成一个阶段，都先做一次自测再进入下一阶段
- 每个阶段尽量保持独立可提交
- 优先保证展示正确，其次保证编辑可用，最后再补体验细节

### Phase 0：准备与基线梳理

目标：

- 为后续改造建立稳定基线
- 明确现有组件和测试覆盖点

任务清单：

- 阅读并确认 [deployment-detail.tsx](/Users/eryajf/code/github/kite-desktop/ui/src/pages/deployment-detail.tsx) 当前 `overview` 区域结构
- 阅读并确认 [container-edit-dialog.tsx](/Users/eryajf/code/github/kite-desktop/ui/src/components/container-edit-dialog.tsx) 当前编辑弹窗结构
- 阅读并确认 [container-table.tsx](/Users/eryajf/code/github/kite-desktop/ui/src/components/container-table.tsx) 当前编辑入口位置
- 阅读并确认 [k8s.ts](/Users/eryajf/code/github/kite-desktop/ui/src/lib/k8s.ts) 中与 Deployment 状态相关的工具函数
- 阅读并确认 [zh.json](/Users/eryajf/code/github/kite-desktop/ui/src/i18n/locales/zh.json) 与 [en.json](/Users/eryajf/code/github/kite-desktop/ui/src/i18n/locales/en.json) 当前已有文案键
- 确认现有测试文件位置，优先检查是否已有 `deployment-detail`、`k8s.ts`、editor 相关测试
- 记录当前页面手工验证路径：
  - 打开 Deployment 详情页
  - 查看概览
  - 打开容器编辑弹窗
  - 保存镜像/资源/环境变量

完成标准：

- 已明确各核心文件职责
- 已明确从哪里插入新组件、新 hook、新文案
- 已明确后续每个阶段的验证入口

建议提交：

- `docs: refine deployment overview/editor design tasks`

### Phase 1：概览增强

目标：

- 在不改编辑能力的前提下，先把 Deployment 概览重构为高信息密度的展示区

任务清单：

- 在 [k8s.ts](/Users/eryajf/code/github/kite-desktop/ui/src/lib/k8s.ts) 或新建 deployment utils 中新增 `buildDeploymentOverviewViewModel`
- 在同一工具层新增资源聚合函数：
  - 聚合 `containers` 的 `requests`
  - 聚合 `containers` 的 `limits`
  - 统一空值格式化输出
- 在工具层新增辅助函数：
  - 读取 revision
  - 读取 scheduler
  - 判断 observed generation 是否收敛
- 新增 `DeploymentOverviewStatusCard`
- 新增 `DeploymentOverviewInfoCard`
- 新增 `DeploymentResourceSummary`
- 在 [deployment-detail.tsx](/Users/eryajf/code/github/kite-desktop/ui/src/pages/deployment-detail.tsx) 中替换当前 overview 卡片实现
- 将概览中的硬编码英文文案替换为 i18n key
- 在 [zh.json](/Users/eryajf/code/github/kite-desktop/ui/src/i18n/locales/zh.json) 中补齐新增字段文案
- 在 [en.json](/Users/eryajf/code/github/kite-desktop/ui/src/i18n/locales/en.json) 中补齐新增字段文案

建议新增或修改的字段：

- 状态
- Ready / Spec
- Updated Replicas
- Available Replicas
- Observed / Generation 提示
- 创建时间
- Age
- 更新策略
- 主机网络
- 调度器
- 资源请求
- 资源限制
- 选择器
- 修订版本
- 链路追踪状态

测试任务：

- 为资源聚合函数补单测
- 为 `buildDeploymentOverviewViewModel` 补单测
- 如已有页面测试基础，则补 overview 渲染测试

手工验证清单：

- Deployment 详情页概览布局是否正确
- 单行/多行字段在中英文下是否都能正常显示
- 资源聚合文本是否符合预期
- `schedulerName`、`hostNetwork`、`revision` 缺失时是否显示 `未指定 / Not set`
- `observedGeneration < generation` 时是否出现提示

完成标准：

- 概览区不再依赖散落在 JSX 里的派生计算
- 页面在不进入 YAML 的情况下可看清关键状态与关键配置

建议提交：

- `feat: enhance deployment overview summary`

### Phase 2：编辑弹窗骨架升级

目标：

- 在不引入挂载/探针复杂逻辑前，先把编辑弹窗升级为可扩展框架

任务清单：

- 重构 [container-edit-dialog.tsx](/Users/eryajf/code/github/kite-desktop/ui/src/components/container-edit-dialog.tsx) 的 props 设计，使其可接收：
  - `deploymentDraft`
  - `selectedContainerName`
  - `namespace`
  - `onDeploymentDraftChange`
  - `onSelectedContainerChange`
  - `onSave`
- 保留并适配现有 `ImageEditor`
- 保留并适配现有 `ResourceEditor`
- 保留并适配现有 `EnvironmentEditor`
- 在弹窗中加入 5 个 Tab 的完整骨架：
  - `image`
  - `resources`
  - `environment`
  - `mounts`
  - `probes`
- 多容器 Deployment 时，在弹窗头部加入容器切换器
- 在 [container-table.tsx](/Users/eryajf/code/github/kite-desktop/ui/src/components/container-table.tsx) 与 [deployment-detail.tsx](/Users/eryajf/code/github/kite-desktop/ui/src/pages/deployment-detail.tsx) 中梳理新的编辑弹窗打开方式
- 新增或重构 `useDeploymentContainerEditor`，负责：
  - 初始化草稿
  - 选择容器
  - 更新当前容器
  - 回写 Deployment 草稿
  - 计算 `isDirty`

测试任务：

- 为 `useDeploymentContainerEditor` 补单测
- 测试多容器切换时不会串改 container 数据
- 测试关闭弹窗重新打开时草稿会重置到最新 Deployment

手工验证清单：

- 单容器 Deployment 能直接编辑
- 多容器 Deployment 能切换目标容器
- 现有 `镜像 / 资源 / 环境变量` 保存逻辑不回归
- 新增 `挂载 / 探针` Tab 即使未实现，也不会破坏弹窗结构

完成标准：

- 编辑弹窗状态与 Deployment 数据模型对齐
- 不再只适用于单个 container 的局部更新

建议提交：

- `refactor: prepare deployment container editor scaffold`

### Phase 3：挂载编辑能力

目标：

- 在弹窗中补齐 `挂载` 编辑，覆盖 `volumeMounts` 与 `volumes`

任务清单：

- 新增 `VolumeMountEditor`
- 新增 `VolumeSourceEditor`
- 从 [deployment-create-dialog.tsx](/Users/eryajf/code/github/kite-desktop/ui/src/components/editors/deployment-create-dialog.tsx) 中提取可复用的卷类型处理逻辑
- 在 `VolumeMountEditor` 中支持：
  - 新增挂载
  - 删除挂载
  - 选择卷名称
  - 编辑 `mountPath`
  - 编辑 `readOnly`
  - 编辑 `subPath`
- 在 `VolumeSourceEditor` 中支持：
  - 新增卷
  - 删除卷
  - 编辑卷名称
  - 切换卷类型
  - 编辑卷来源配置
- 在 hook 或工具层新增：
  - `isVolumeReferenced`
  - 卷名唯一性校验
  - 卷删除前校验
- 将 `volumes` 的变更正确回写到 `draftDeployment.spec.template.spec.volumes`
- 将 `volumeMounts` 的变更正确回写到当前 container
- 在 [index.ts](/Users/eryajf/code/github/kite-desktop/ui/src/components/editors/index.ts) 中导出新增 editor
- 补齐挂载相关 i18n 文案

一期建议支持的卷类型：

- `ConfigMap`
- `Secret`
- `PVC`
- `EmptyDir`
- `HostPath`

测试任务：

- 测试新增卷后可被挂载下拉选中
- 测试删除未引用卷成功
- 测试删除已引用卷被阻止
- 测试卷名重复时校验失败
- 测试保存后 `volumes` 与 `volumeMounts` 都进入正确位置

手工验证清单：

- 新增卷与新增挂载的联动是否正确
- 编辑多个容器时，卷定义是否全局共享而挂载是否按容器隔离
- 删除卷时提示是否明确
- 保存后重新拉取 Deployment，挂载是否正确展示

完成标准：

- 用户无需切 YAML 即可完成常见卷挂载配置
- 卷级与挂载级数据不会混写

建议提交：

- `feat: add deployment volume and mount editors`

### Phase 4：探针编辑能力

目标：

- 在弹窗中补齐 `Liveness / Readiness / Startup` 探针编辑能力

任务清单：

- 新增 `ProbeEditor`
- 新增 `ProbeGroupEditor`
- 在 `ProbeEditor` 中支持探针启用/关闭
- 在 `ProbeEditor` 中支持切换探针类型：
  - `HTTP`
  - `TCP`
  - `Exec`
- 支持编辑通用参数：
  - `initialDelaySeconds`
  - `periodSeconds`
  - `timeoutSeconds`
  - `successThreshold`
  - `failureThreshold`
- 支持编辑类型参数：
  - HTTP: `path`, `port`
  - TCP: `port`
  - Exec: `command[]`
- 切换探针类型时清理旧类型字段
- 将探针变更回写到当前 container
- 补齐探针相关 i18n 文案

测试任务：

- 测试启用探针后对象结构正确
- 测试切换 `HTTP -> TCP -> Exec` 时字段清理正确
- 测试 HTTP/TCP 缺少端口时校验失败
- 测试 Exec 缺少命令时校验失败
- 测试保存后 Deployment 中三个 probe 字段位置正确

手工验证清单：

- 三类探针都能独立开关
- 三类探针互不串值
- 切换类型后界面是否正确收敛字段
- 保存后重新打开弹窗，探针值是否能正确回填

完成标准：

- 常见探针配置可在 UI 中完成
- 探针类型切换不会留下脏字段

建议提交：

- `feat: add deployment probe editors`

### Phase 5：校验、错误态与体验收尾

目标：

- 将编辑流程打磨到可稳定交付的状态

任务清单：

- 在 `useDeploymentContainerEditor` 或单独校验模块中统一实现校验入口
- 对以下字段补齐校验：
  - 镜像
  - 资源格式
  - 环境变量名称
  - `envFrom` 来源名
  - 卷名唯一性
  - `mountPath`
  - 探针端口
  - Exec 命令
- 为 `validationErrors` 建立统一路径格式
- 在弹窗内实现错误展示
- 对有错误的 Tab 做高亮提示
- 增加关闭弹窗前的脏数据提示
- 优化保存中、保存成功、保存失败反馈
- 梳理空态、无数据态、未设置态文案
- 完成中英文文案对齐与清理

测试任务：

- 测试 `isDirty` 的行为
- 测试关闭未保存草稿时出现提示
- 测试错误字段在对应 Tab 中可见
- 测试保存失败后草稿不丢失

手工验证清单：

- 故意输入无效值时是否能看到清晰错误
- 保存失败后是否还能继续编辑
- 关闭弹窗时是否能保护未保存修改
- 中英文切换后文案是否完整

完成标准：

- 编辑流程具备基本的可用性和容错性
- 典型误操作不会直接导致数据丢失或错误提交

建议提交：

- `feat: polish deployment editor validation and ux`

### Phase 6：测试补全与回归验证

目标：

- 进行上线前的集中回归，避免概览和编辑能力互相影响

任务清单：

- 统一整理本次改动涉及的测试文件
- 确认工具函数测试全部通过
- 确认 hook 测试全部通过
- 确认 editor 组件测试全部通过
- 如项目已有页面级测试，补充 Deployment detail 相关渲染与编辑测试
- 手工回归以下路径：
  - 打开 Deployment 详情页
  - 查看概览
  - 编辑镜像
  - 编辑资源
  - 编辑环境变量
  - 编辑挂载
  - 编辑探针
  - 保存成功后查看 Deployment 回填
  - 保存失败后的错误处理
- 回归确认以下未受影响区域：
  - YAML 编辑
  - 扩缩容
  - 重启
  - 容器卡片展示
  - Volumes Tab

建议测试命令方向：

- 运行 `ui` 相关单测
- 定向运行 `k8s.ts` 工具测试
- 定向运行新增 hook 与 editor 组件测试

完成标准：

- 核心展示与编辑链路可稳定工作
- 旧功能未出现明显回归

建议提交：

- `test: cover deployment overview and editor flows`

## 推荐开发顺序

如果晚上开发时间有限，建议按下面顺序做，不要并行开太多分支任务：

1. 先完成 `Phase 1`
2. 再完成 `Phase 2`
3. 之后优先做 `Phase 3`
4. `Phase 4` 放在挂载稳定之后
5. 最后统一做 `Phase 5` 和 `Phase 6`

原因：

- `Phase 1` 是纯展示，回归风险最低
- `Phase 2` 先把弹窗结构打稳，后面挂载和探针不会反复重构
- `Phase 3` 比 `Phase 4` 更依赖 Pod 模板数据模型，优先做更稳
- `Phase 5` 和 `Phase 6` 适合统一收尾

## 晚间开发最小落地建议

如果今晚只想先开一个头，建议优先完成下面这组最小闭环：

- 完成 `Phase 1`
- 完成 `Phase 2` 的弹窗骨架与 hook 初版
- 不实现挂载/探针逻辑，只先把 Tab 和状态模型打通

这样明天继续时，你已经有：

- 新的概览展示
- 新的编辑框架
- 明确的挂载/探针接入点

这是最容易保持上下文连续性的切入方式。
