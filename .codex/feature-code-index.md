# Kite Desktop 功能代码索引

这份文档用于按“功能名 -> 前端页面 -> 共享组件 -> API -> 后端 handler”快速定位代码。

适用场景：

- 用户提到某个左侧菜单功能，想快速定位前后端文件
- 需要判断某个功能是走通用列表/详情还是专用页面
- 需要查找近期已经沉淀下来的全局实现模式

## 1. 核心入口与总分发

后续定位任何功能，优先从这些文件开始看：

- 桌面应用入口
  - `desktop/main.go`
  - `desktop/host.go`
  - `desktop/bridge.go`
- 后端启动与总路由
  - `internal/server/app.go`
  - `internal/server/routes.go`
  - `pkg/handlers/resources/handler.go`
- 前端总路由与页面分发
  - `ui/src/routes.tsx`
  - `ui/src/App.tsx`
  - `ui/src/pages/resource-list.tsx`
  - `ui/src/pages/resource-detail.tsx`
- 左侧导航来源
  - `ui/src/components/app-sidebar.tsx`
  - `ui/src/contexts/sidebar-config-context.tsx`
  - `ui/src/types/sidebar.ts`

几个重要事实：

- 左侧菜单的默认分组，不写死在页面里，而是集中在 `ui/src/contexts/sidebar-config-context.tsx` 的 `defaultMenus`。
- 资源列表页的总分发入口是 `ui/src/pages/resource-list.tsx`。
- 资源详情页的总分发入口是 `ui/src/pages/resource-detail.tsx`。
- Kubernetes 资源后端总注册入口是 `pkg/handlers/resources/handler.go`。
- 通用资源 REST 路由注册在 `pkg/handlers/resources/handler.go`，业务外接口注册在 `internal/server/routes.go`。

## 2. 前端共享骨架

后续无论新增列表、详情、右键、固定操作列还是元数据编辑，优先复用这些共享层：

- 列表总骨架
  - `ui/src/components/resource-table.tsx`
  - `ui/src/components/resource-table-view.tsx`
- 列表页通用实现
  - `ui/src/pages/simple-list-page.tsx`
- 详情页通用实现
  - `ui/src/pages/simple-resource-detail.tsx`
- 设置类表格
  - `ui/src/components/action-table.tsx`
- 右键菜单共享实现
  - `ui/src/components/row-context-menu.tsx`
  - `ui/src/components/ui/context-menu.tsx`
- 资源元数据展示/编辑
  - `ui/src/components/lables-anno.tsx`
  - `ui/src/components/editors/resource-metadata-dialog.tsx`
  - `ui/src/components/metadata-action-button.tsx`
- 详情页常见公共块
  - `ui/src/components/describe-dialog.tsx`
  - `ui/src/components/event-table.tsx`
  - `ui/src/components/related-resource-table.tsx`
  - `ui/src/components/resource-history-table.tsx`
  - `ui/src/components/resource-delete-confirmation-dialog.tsx`
  - `ui/src/components/yaml-editor.tsx`

## 3. 后端共享骨架

- 资源总注册与 CRUD 路由
  - `pkg/handlers/resources/handler.go`
- 通用资源 handler
  - `pkg/handlers/resources/generic_resource_handler.go`
  - `pkg/handlers/resources/generic_resource_handler_list.go`
  - `pkg/handlers/resources/generic_resource_handler_write.go`
  - `pkg/handlers/resources/generic_resource_handler_history.go`
- 关联资源
  - `pkg/handlers/resources/related_resources.go`
- 资源搜索
  - `pkg/handlers/search_handler.go`
- 偏好与本地持久化接口
  - `pkg/handlers/preferences_handler.go`
  - `pkg/handlers/favorite_handler.go`
- 概览、模板、资源应用、日志与终端
  - `pkg/handlers/overview_handler.go`
  - `pkg/handlers/template_handler.go`
  - `pkg/handlers/resource_apply_handler.go`
  - `pkg/handlers/logs_handler.go`
  - `pkg/handlers/terminal_handler.go`
  - `pkg/handlers/node_terminal_handler.go`
  - `pkg/handlers/kubectl_terminal_handler.go`

## 4. 按主功能定位代码

这一节按当前桌面左侧导航和几个全局功能来整理。后续只要用户提“哪个功能”，优先从这里跳转。

### 4.1 概览

- 页面入口
  - `ui/src/pages/overview.tsx`
- 主要组件
  - `ui/src/components/cluster-stats-cards.tsx`
  - `ui/src/components/resources-charts.tsx`
  - `ui/src/components/recent-events.tsx`
  - `ui/src/components/chart/resource-utilization.tsx`
  - `ui/src/components/chart/network-usage-chart.tsx`
- 前端数据接口
  - `ui/src/lib/api/core.ts`
  - 重点 hook：`useOverview`、`useResourceUsageHistory`
- 后端接口
  - `internal/server/routes.go`
  - `pkg/handlers/overview_handler.go`
  - `pkg/handlers/prom_handler.go`

### 4.2 集群分组

#### 节点

- 列表页
  - `ui/src/pages/node-list-page.tsx`
- 详情页
  - `ui/src/pages/node-detail.tsx`
- 关联组件
  - `ui/src/components/node-status-icon.tsx`
  - `ui/src/components/metrics-cell.tsx`
  - `ui/src/components/terminal.tsx`
  - `ui/src/components/node-monitoring.tsx`
  - `ui/src/components/node-image-table.tsx`
- 前端接口
  - `ui/src/lib/api/core.ts`
  - 重点方法：`cordonNode`、`uncordonNode`、`drainNode`、`taintNode`、`untaintNode`
- 后端
  - `pkg/handlers/resources/node_handler.go`
  - `pkg/handlers/node_terminal_handler.go`
  - `pkg/handlers/resources/handler.go`
- 特征
  - 节点列表不是 `SimpleListPage`，有专属状态、资源利用率、右键运维动作、节点终端。
  - `DrainNode` 目前后端仍偏占位实现，后续若增强真实 drain 逻辑，先看 `pkg/handlers/resources/node_handler.go`。

#### 命名空间

- 列表页
  - `ui/src/pages/namespace-list-page.tsx`
- 详情页
  - 走通用详情：`ui/src/pages/resource-detail.tsx` -> `ui/src/pages/simple-resource-detail.tsx`
- 关联组件
  - `ui/src/components/editors/namespace-create-dialog.tsx`
  - `ui/src/components/editors/namespace-edit-dialog.tsx`
  - `ui/src/components/editors/namespace-metadata-dialog.tsx`
  - `ui/src/components/metadata-action-button.tsx`
- 前端接口/辅助
  - `ui/src/lib/api/core.ts`
  - `ui/src/lib/namespace-utils.ts`
  - `ui/src/lib/namespace-resource-quota.ts`
- 后端
  - `pkg/handlers/resources/handler.go`
  - `pkg/handlers/resources/generic_resource_handler*.go`
- 特征
  - 命名空间列表页维护资源配额摘要与“配额编辑”入口。
  - 命名空间详情暂未做专属详情页，默认走通用详情页。

#### 事件

- 列表页
  - `ui/src/pages/event-list-page.tsx`
- 详情页
  - 无专属详情；资源详情页中的事件标签走共享 `EventTable`
- 关联组件
  - `ui/src/components/event-table.tsx`
  - `ui/src/components/recent-events.tsx`
- 前端接口
  - `ui/src/lib/api/core.ts`
- 后端
  - `pkg/handlers/resources/event_handler.go`
  - `pkg/handlers/resources/handler.go`
- 特征
  - `event_handler.go` 既支持事件列表，也支持按资源反查事件 `GET /events/resources`。

#### 收藏

- 页面入口
  - `ui/src/pages/favorites.tsx`
- 关联组件/上下文
  - `ui/src/hooks/use-favorites.ts`
  - `ui/src/lib/favorites.ts`
  - `ui/src/components/global-search-provider.tsx`
- 前端接口
  - `ui/src/lib/api/core.ts`
  - 重点方法：`listFavoriteResources`、`addFavoriteResource`、`removeFavoriteResource`
- 后端
  - `pkg/handlers/favorite_handler.go`
  - `pkg/model/` 下收藏持久化模型
- 特征
  - 收藏按 cluster 维度持久化，不是单纯前端 `localStorage`。

### 4.3 工作负载分组

#### 部署 Deployment

- 列表页
  - `ui/src/pages/deployment-list-page.tsx`
- 详情页
  - `ui/src/pages/deployment-detail.tsx`
- 关联组件
  - `ui/src/components/deployment-status-icon.tsx`
  - `ui/src/components/deployment-overview-info-card.tsx`
  - `ui/src/components/deployment-overview-status-card.tsx`
  - `ui/src/components/deployment-resource-summary.tsx`
  - `ui/src/components/container-images-summary.tsx`
  - `ui/src/components/editors/deployment-create-dialog.tsx`
  - `ui/src/hooks/use-deployment-container-editor.ts`
- 前端接口
  - `ui/src/lib/api/core.ts`
  - 重点方法：`patchResource`
- 后端
  - `pkg/handlers/resources/deployment_handler.go`
  - `pkg/handlers/resources/handler.go`
- 特征
  - 列表页有专属创建、扩缩容、重启、标签/注解按钮列、镜像摘要与资源限制摘要。
  - 详情页会结合 `useResourcesWatch` 观察 Pod。

#### 有状态副本集 StatefulSet

- 列表页
  - `ui/src/pages/statefulset-list-page.tsx`
- 详情页
  - `ui/src/pages/statefulset-detail.tsx`
- 关联组件
  - `ui/src/components/container-images-summary.tsx`
  - `ui/src/components/container-table.tsx`
  - `ui/src/components/volume-table.tsx`
- 前端接口
  - `ui/src/lib/api/core.ts`
- 后端
  - `pkg/handlers/resources/handler.go`
  - `pkg/handlers/resources/generic_resource_handler*.go`
- 特征
  - 详情页有专属 Pod 观察、容器/卷、模板注解重启时间戳等逻辑。

#### 守护进程集 DaemonSet

- 列表页
  - `ui/src/pages/daemonset-list-page.tsx`
- 详情页
  - `ui/src/pages/daemonset-detail.tsx`
- 前端接口
  - `ui/src/lib/api/core.ts`
- 后端
  - `pkg/handlers/resources/handler.go`
  - `pkg/handlers/resources/generic_resource_handler*.go`
- 特征
  - 详情页有专属 Pod watch 与模板注解重启逻辑。

#### 容器组 Pod

- 列表页
  - `ui/src/pages/pod-list-page.tsx`
- 详情页
  - `ui/src/pages/pod-detail.tsx`
- 关联组件
  - `ui/src/components/pod-status-icon.tsx`
  - `ui/src/components/pod-monitoring.tsx`
  - `ui/src/components/pod-file-browser.tsx`
  - `ui/src/components/container-info-card.tsx`
  - `ui/src/components/container-table.tsx`
  - `ui/src/components/terminal.tsx`
- 前端接口
  - `ui/src/lib/api/core.ts`
  - 重点方法：`resizePod`、`updateResource`
- 后端
  - `pkg/handlers/resources/pod_handler.go`
  - `pkg/handlers/terminal_handler.go`
  - `pkg/handlers/logs_handler.go`
- 特征
  - Pod handler 是复杂专用 handler，额外提供：
    - metrics 聚合
    - SSE watch
    - 原地 resize
    - 容器文件浏览 / 预览 / 下载 / 上传
  - Pod 详情页通常是终端、日志、文件、监控等排障入口。

#### 任务 Job

- 列表页
  - `ui/src/pages/job-list-page.tsx`
- 详情页
  - `ui/src/pages/job-detail.tsx`
- 后端
  - `pkg/handlers/resources/handler.go`
  - `pkg/handlers/resources/generic_resource_handler*.go`
- 特征
  - 列表一般偏通用，详情页是专属。

#### 定时任务 CronJob

- 列表页
  - `ui/src/pages/cronjob-list-page.tsx`
- 详情页
  - `ui/src/pages/cronjob-detail.tsx`
- 后端
  - `pkg/handlers/resources/handler.go`
  - `pkg/handlers/resources/generic_resource_handler*.go`
- 特征
  - 详情页专门处理 schedule、jobTemplate、模板 labels/annotations 等信息。

#### HPA

- 列表页
  - `ui/src/pages/horizontalpodautoscaler-list-page.tsx`
- 详情页
  - 走通用详情：`ui/src/pages/simple-resource-detail.tsx`
- 后端
  - `pkg/handlers/resources/handler.go`

### 4.4 网络分组

#### 服务 Service

- 列表页
  - `ui/src/pages/service-list-page.tsx`
- 详情页
  - `ui/src/pages/service-detail.tsx`
- 关联组件
  - `ui/src/components/service-table.tsx`
- 前端接口/辅助
  - `ui/src/lib/api/core.ts`
  - `ui/src/lib/k8s.ts` 中 `getServiceExternalIP`
- 后端
  - `pkg/handlers/resources/handler.go`
  - `pkg/handlers/resources/generic_resource_handler*.go`
- 特征
  - 列表页有 ClusterIP / ExternalIP / 端口专属列与右键复制 ClusterIP。

#### Ingress

- 列表页
  - `ui/src/pages/ingress-list-page.tsx`
- 详情页
  - 走通用详情：`ui/src/pages/simple-resource-detail.tsx`
- 后端
  - `pkg/handlers/resources/handler.go`

#### 高级网络

- 页面入口
  - `ui/src/pages/advanced-networking.tsx`
- 子功能
  - NetworkPolicy：`ui/src/pages/simple-list-page.tsx` + 通用详情
  - Gateway：`ui/src/pages/gateway-list-page.tsx`
  - HTTPRoute：`ui/src/pages/httproute-list-page.tsx`
- 关联类型
  - `ui/src/types/gateway.ts`
- 后端
  - `pkg/handlers/resources/handler.go`
- 特征
  - 该页是一个聚合 tab 页，不是单一资源页。

### 4.5 配置分组

#### 配置项 ConfigMap

- 列表页
  - `ui/src/pages/configmap-list-page.tsx`
- 详情页
  - `ui/src/pages/configmap-detail.tsx`
- 后端
  - `pkg/handlers/resources/handler.go`

#### 密钥 Secret

- 列表页
  - `ui/src/pages/secret-list-page.tsx`
- 详情页
  - `ui/src/pages/secret-detail.tsx`
- 后端
  - `pkg/handlers/resources/handler.go`

### 4.6 存储分组

#### 存储卷声明 PVC

- 列表页
  - `ui/src/pages/pvc-list-page.tsx`
- 详情页
  - 走通用详情：`ui/src/pages/simple-resource-detail.tsx`
- 关联组件
  - `ui/src/components/selector/pvc-selector.tsx`
- 后端
  - `pkg/handlers/resources/handler.go`

#### 存储卷 PV

- 列表页
  - `ui/src/pages/pv-list-page.tsx`
- 详情页
  - 走通用详情：`ui/src/pages/simple-resource-detail.tsx`
- 后端
  - `pkg/handlers/resources/handler.go`

#### 存储类 StorageClass

- 列表页
  - 走通用列表：`ui/src/pages/simple-list-page.tsx`
- 详情页
  - 走通用详情：`ui/src/pages/simple-resource-detail.tsx`
- 后端
  - `pkg/handlers/resources/handler.go`

### 4.7 安全分组

这些资源当前大多走通用列表页 + 通用详情页：

- 服务账户
  - 列表：`ui/src/pages/simple-list-page.tsx`
  - 详情：`ui/src/pages/simple-resource-detail.tsx`
  - 资源类型：`serviceaccounts`
- 角色
  - 资源类型：`roles`
- 角色绑定
  - 资源类型：`rolebindings`
- 集群角色
  - 资源类型：`clusterroles`
- 集群角色绑定
  - 资源类型：`clusterrolebindings`
- 后端统一入口
  - `pkg/handlers/resources/handler.go`
  - `pkg/handlers/resources/generic_resource_handler*.go`

### 4.8 扩展分组

#### CRD 列表

- 列表页
  - `ui/src/pages/crd-list-page.tsx`
- 详情页
  - 当前不是传统“CRD 详情页”，点击后进入该 CRD 对应实例列表：`ui/src/pages/cr-list-page.tsx`
- 后端
  - CRD 自身列表：`pkg/handlers/resources/handler.go` 中 `crds`
- 特征
  - CRD 页面只负责 CRD 资源本身。

#### CR 实例列表与详情

- 列表页
  - `ui/src/pages/cr-list-page.tsx`
- 详情页
  - `ui/src/pages/resource-detail.tsx` -> 默认 `ui/src/pages/simple-resource-detail.tsx`
- 前端接口
  - `ui/src/lib/api/core.ts`
  - `useResource('crds', crdName)` 先取 CRD 定义
- 后端
  - `pkg/handlers/resources/cr_handler.go`
- 特征
  - 这是动态资源体系，前端列定义来自 CRD 的 `additionalPrinterColumns`。
  - 详情、更新、删除、describe 都走 `CRHandler`。

## 5. 设置页与全局管理功能

设置页总入口：

- `ui/src/pages/settings.tsx`

子模块如下：

### 通用设置 General

- 前端
  - `ui/src/components/settings/general-management.tsx`
- 后端
  - `internal/server/routes.go`
  - `pkg/ai/` 下 general setting 相关 handler
- 说明
  - AI、模型、连接测试等优先从这里进。

### 集群管理 Clusters

- 前端
  - `ui/src/components/settings/cluster-management.tsx`
  - `ui/src/components/settings/cluster-dialog.tsx`
- 前端接口
  - `ui/src/lib/api/admin.ts`
- 后端
  - `internal/server/routes.go`
  - `pkg/cluster/`
- 说明
  - 包含集群增删改查、导入 kubeconfig、测试连通性。

### 模板管理 Templates

- 前端
  - `ui/src/components/settings/template-management.tsx`
  - `ui/src/components/simple-yaml-editor.tsx`
- 前端接口
  - `ui/src/lib/api/core.ts`
- 后端
  - `pkg/handlers/template_handler.go`
- 说明
  - 创建资源模板和 YAML 模板的统一管理入口。

### 桌面信息 Desktop

- 前端
  - `ui/src/components/settings/desktop-management.tsx`
- 前端桥接
  - `ui/src/lib/desktop.ts`
- 后端/宿主
  - `desktop/bridge.go`
  - `desktop/host.go`
- 说明
  - 打开配置目录、日志目录、查看本地路径与运行时信息。

### 关于与更新 About

- 前端
  - `ui/src/components/settings/about-management.tsx`
  - `ui/src/components/update-download-toast.tsx`
  - `ui/src/hooks/use-desktop-update.ts`
- 前端接口/桥接
  - `ui/src/lib/api/system.ts`
  - `ui/src/lib/desktop.ts`
- 后端/宿主
  - `desktop/bridge.go`
  - `desktop/update_state.go`
  - `desktop/update_download.go`
  - `desktop/update_apply.go`
- 说明
  - 版本信息、检查更新、忽略版本、下载更新、应用更新都在这里串起来。

## 6. 非导航但高频全局功能

### 全局搜索

- 前端入口
  - `ui/src/components/global-search.tsx`
  - `ui/src/components/global-search-provider.tsx`
- 关联
  - `ui/src/components/search.tsx`
  - `ui/src/lib/global-search-history.ts`
- 前端接口
  - `ui/src/lib/api/core.ts` 中 `globalSearch`
- 后端
  - `pkg/handlers/search_handler.go`
  - `pkg/handlers/resources/handler.go` 中各资源 `Searchable()` 注册
- 说明
  - 同时承担资源搜索、导航跳转、cluster switch 模式、快捷动作入口。

### AI 聊天

- 前端入口
  - `ui/src/components/ai-chat/ai-chatbox.tsx`
  - `ui/src/components/ai-chat/ai-chat-trigger.tsx`
  - `ui/src/contexts/ai-chat-context.tsx`
  - `ui/src/hooks/use-ai-chat.ts`
- 路由
  - `ui/src/routes.tsx` 中 `/ai-chat-box`
- 前端接口
  - `ui/src/lib/api/ai.ts`
  - `ui/src/lib/api/ai-history.ts`
- 后端
  - `internal/server/routes.go`
  - `pkg/ai/`
- 桌面侧边车
  - `ui/src/lib/desktop.ts`
  - `desktop/bridge.go`

### 集群切换

- 前端入口
  - `ui/src/contexts/cluster-context.tsx`
  - `ui/src/components/cluster-selector.tsx`
  - `ui/src/components/global-search.tsx`
- 关联持久化
  - `ui/src/lib/desktop-preferences.ts`
  - `ui/src/lib/cluster-cookie.ts`
- 后端
  - `internal/server/routes.go`
  - `pkg/cluster/`

### 终端 / 日志 / 文件浏览

- Pod 终端
  - 前端：`ui/src/components/terminal.tsx`、`ui/src/contexts/terminal-context.tsx`
  - 后端：`pkg/handlers/terminal_handler.go`
- Node 终端
  - 前端：`ui/src/pages/node-list-page.tsx`、`ui/src/pages/node-detail.tsx`
  - 后端：`pkg/handlers/node_terminal_handler.go`
- Kubectl 终端
  - 后端：`pkg/handlers/kubectl_terminal_handler.go`
- Pod 日志
  - 前端：`ui/src/components/log-viewer.tsx`
  - 后端：`pkg/handlers/logs_handler.go`
- Pod 文件浏览
  - 前端：`ui/src/components/pod-file-browser.tsx`
  - 后端：`pkg/handlers/resources/pod_handler.go`

### 创建资源

- 前端
  - `ui/src/components/create-resource-dialog.tsx`
  - `ui/src/components/editors/resource-editor.tsx`
  - `ui/src/components/editors/index.ts`
- 前端接口
  - `ui/src/lib/api/core.ts` 中 `applyResource`
- 后端
  - `pkg/handlers/resource_apply_handler.go`
  - `pkg/handlers/template_handler.go`

## 7. 近期已经沉淀的全局实现约定

这些是后续同类需求优先复用的现成约定，不要再散落重写一套。

### 标签与注解设计

- 列表页中的标签/注解操作，优先复用：
  - `ui/src/components/metadata-action-button.tsx`
  - `ui/src/components/editors/resource-metadata-dialog.tsx`
- 详情页中的标签/注解展示，优先复用：
  - `ui/src/components/lables-anno.tsx`
- 通用列表页默认右键动作中，标签/注解已经作为一级标准动作存在：
  - `ui/src/pages/simple-list-page.tsx`
- 已经采用这套模式的页面：
  - `ui/src/pages/deployment-list-page.tsx`
  - `ui/src/pages/namespace-list-page.tsx`
  - `ui/src/pages/pod-list-page.tsx`
  - `ui/src/pages/service-list-page.tsx`
  - `ui/src/pages/configmap-list-page.tsx`
  - `ui/src/pages/secret-list-page.tsx`
  - `ui/src/pages/pvc-list-page.tsx`
  - `ui/src/pages/pv-list-page.tsx`
  - `ui/src/pages/ingress-list-page.tsx`
- 设计原则
  - 列表页优先给出“数量 + tooltip + 点击编辑”。
  - 详情页优先给出只读聚合展示。
  - 真正写入 Kubernetes 资源统一走 `updateResource`，不要新造独立 metadata API。

### 列表页右侧固定操作列设计

- 统一实现位置：
  - `ui/src/components/resource-table.tsx`
  - `ui/src/components/resource-table-view.tsx`
- 当前规则
  - 只要页面传入 `getRowContextMenuItems`，`ResourceTable` 会自动补一个 `actions` 列。
  - `ResourceTableView` 会把 `actions` 列做成 `sticky right-0` 固定在右侧。
  - 表头与单元格的固定样式都集中在 `getStickyColumnClassName`。
- 约束
  - 后续资源列表如果要做行级操作，优先通过 `getRowContextMenuItems` 接入，而不是手搓一个新的操作列。
  - 如果是设置页表格，优先用 `ActionTable`；如果是资源页，优先用 `ResourceTable`。

### 页面右键菜单设计

- 规范文档
  - `docs/frontend-context-menu-pattern.md`
- 实现入口
  - `ui/src/components/row-context-menu.tsx`
  - `ui/src/components/ui/context-menu.tsx`
  - `ui/src/components/resource-table.tsx`
  - `ui/src/components/action-table.tsx`
- 标准模式
  - 页面提供 `getRowContextMenuItems`
  - 共享表格接管右键触发与右侧 actions dropdown
  - 页面只负责业务动作，不负责浮层定位和显隐管理
- 默认动作结构
  - `view-yaml`
  - `copy-name`
  - `copy-namespace`（命名空间资源）
  - `manage-labels`
  - `manage-annotations`
- 参考页
  - `ui/src/pages/pod-list-page.tsx`
  - `ui/src/pages/service-list-page.tsx`
  - `ui/src/pages/node-list-page.tsx`
  - `ui/src/pages/deployment-list-page.tsx`
  - `ui/src/pages/namespace-list-page.tsx`

### 通用列表页与专用列表页的选择规则

- 满足以下条件时，优先走 `ui/src/pages/simple-list-page.tsx`
  - 只是标准资源表格
  - 不需要复杂自定义列
  - 不需要专属创建/扩缩容/终端/配额/监控操作
- 有这些特征之一时，应考虑专用列表页
  - 复杂指标列
  - 专属对话框或运维动作
  - 资源模板/元数据按钮列
  - 需要组合多个接口数据
- 当前典型专用列表页
  - `ui/src/pages/deployment-list-page.tsx`
  - `ui/src/pages/node-list-page.tsx`
  - `ui/src/pages/namespace-list-page.tsx`
  - `ui/src/pages/pod-list-page.tsx`
  - `ui/src/pages/service-list-page.tsx`
  - `ui/src/pages/cr-list-page.tsx`

### 通用详情页与专用详情页的选择规则

- 默认详情分发：
  - `ui/src/pages/resource-detail.tsx`
- 走通用详情页：
  - `ui/src/pages/simple-resource-detail.tsx`
- 走专用详情页的资源
  - Deployment
  - Pod
  - DaemonSet
  - StatefulSet
  - Job
  - CronJob
  - Secret
  - ConfigMap
  - Node
  - Service
- 判断标准
  - 只要详情涉及监控、终端、文件、复杂 spec 展示、模板重启、扩缩容等复合能力，就不要硬塞回通用详情。

### 桌面能力接入约定

- 前端只通过 `ui/src/lib/desktop.ts` 使用桌面能力，不要在页面里直接假设浏览器行为。
- 桌面能力的后端/宿主桥统一在：
  - `desktop/bridge.go`
  - `desktop/host.go`
- 典型能力
  - 打开外链
  - 打开本地路径
  - 打开配置目录、日志目录
  - 原生文件选择/保存/下载
  - 剪贴板复制
  - AI chat sidecar
  - 更新器相关操作

### 本地偏好与 cluster 维度持久化

- 统一偏好接口
  - `pkg/handlers/preferences_handler.go`
- 前端封装
  - `ui/src/lib/desktop-preferences.ts`
- 已经按 cluster 维度持久化的重要状态
  - 当前 cluster
  - 最近 cluster
  - 选中的 namespace
  - 资源表格列显示
  - sidebar 配置
  - 收藏
- 约束
  - 不要只改 `localStorage` 而忽略后端偏好接口。
  - 任何“工作区偏好”都要先判断是否需要按 cluster 分桶。

## 8. 新增功能时的定位顺序建议

当用户提到一个功能时，建议按这个顺序找：

1. 看它是否在左侧导航里。
2. 去 `ui/src/contexts/sidebar-config-context.tsx` 找默认菜单项 URL。
3. 去 `ui/src/routes.tsx` 看对应路由。
4. 如果是资源页：
   - 先看 `ui/src/pages/resource-list.tsx` / `ui/src/pages/resource-detail.tsx`
   - 再看是专用页还是通用页
   - 再看 `pkg/handlers/resources/handler.go` 是否已有专用 handler
5. 如果是设置/桌面/全局功能：
   - 先看 `ui/src/pages/settings.tsx` 或 `ui/src/App.tsx`
   - 再看 `ui/src/lib/api/*.ts` 与 `internal/server/routes.go`
6. 如果涉及桌面原生能力：
   - 一定再看 `ui/src/lib/desktop.ts` 和 `desktop/bridge.go`
