# 收藏功能改造交接记录

日期：2026-04-17

## 1. 背景

当前仓库已经是桌面优先的 `Kite Desktop`，不再适合继续把“收藏”作为纯前端 `localStorage` 功能。

最初分析结论：

- 旧实现完全依赖 `localStorage`
- 收藏主键使用搜索结果里的 `id`
- 搜索结果里的 `id` 实际上是 Kubernetes 资源 `UID`
- `UID` 不稳定，资源重建后收藏会失效
- 桌面版已经有 SQLite、本地桌面用户和偏好接口模式，因此收藏更适合作为桌面本地偏好写入 DB

## 2. 当前已完成的改造

### 2.1 后端

已新增收藏相关模型与接口：

- 新增模型：
  - `pkg/model/favorite_resource.go`
- 已注册到 AutoMigrate：
  - `pkg/model/model.go`
- 新增 handler：
  - `pkg/handlers/favorite_handler.go`
- 已接入路由：
  - `internal/server/routes.go`
- 已更新路由测试：
  - `internal/server/routes_test.go`
- 已新增模型测试：
  - `pkg/model/favorite_resource_test.go`

当前后端设计要点：

- 收藏以独立表存储，而不是塞进 `User` JSON 字段
- 收藏按以下自然键唯一：
  - `user_id`
  - `cluster_name`
  - `resource_type`
  - `namespace`
  - `resource_name`
- 不再使用资源 `UID` 作为收藏身份

当前后端接口：

- `GET /api/v1/preferences/favorites`
- `POST /api/v1/preferences/favorites`
- `POST /api/v1/preferences/favorites/remove`
- `POST /api/v1/preferences/favorites/import`

### 2.2 前端

已完成前端主逻辑改造：

- 收藏 API 已加入：
  - `ui/src/lib/api/core.ts`
- 收藏 hook 已改为 React Query + 后端接口：
  - `ui/src/hooks/use-favorites.ts`
- 搜索弹窗星标逻辑已改为按资源自然键判断：
  - `ui/src/components/global-search.tsx`
- 旧 `ui/src/lib/favorites.ts` 已改为工具函数集合，不再承担主存储职责

当前前端设计要点：

- 收藏主数据源已经切换为后端接口
- 前端 `isFavorite` 判断基于：
  - `resourceType`
  - `namespace`
  - `resourceName`
- 不再依赖搜索结果 `id`

## 3. 已经确认通过的验证

已执行并通过：

- `go test ./pkg/model ./internal/server`
- `go test ./...`
- `pnpm --dir ui exec vitest run src/hooks/use-favorites.test.tsx`
- `pnpm --dir ui run type-check`

## 4. 遇到过的问题

### 4.1 自动迁移旧收藏时，页面进入 React 运行时异常

曾经实现过“自动把旧 `localStorage` 收藏迁移到 SQLite”的逻辑。

问题表现：

- `make dev` 后页面进入错误页
- 用户反馈页面“所有按钮都点不动”
- 截图中出现：
  - `Minified React error #185`

这说明当时不是普通交互失效，而是前端已经进入 React 运行时异常状态。

### 4.2 当前判断

结合现象和改动范围，最可疑的是：

- 收藏 hook 里的自动迁移逻辑
- 自动迁移过程中，query + mutation + 状态更新形成了不稳定的渲染链
- 即使测试没稳定复现，运行时在 Wails dev 环境里仍可能触发异常

## 5. 当前采取的临时处理

为了先恢复页面稳定性，已经做了以下处理：

- 已完全移除 `useFavorites` 中的自动迁移逻辑
- 当前版本只保留 SQLite 收藏主逻辑
- 旧 `localStorage` 收藏暂时不会被自动导入

也就是说，当前状态是：

- 收藏读写已经走 SQLite
- 旧收藏迁移功能暂时关闭

## 6. 当前已知的未完成项

### 6.1 旧收藏迁移策略还没有最终落地

目前只是保留了旧收藏相关工具函数：

- `getLegacyFavorites`
- `hasFavoritesMigrationMarker`
- `markFavoritesMigrated`

但它们现在没有被主流程调用。

后续如果要继续迁移旧收藏，建议不要再走“页面加载自动迁移”的方式，优先考虑：

1. 手动迁移按钮
2. 设置页显式触发迁移
3. 更保守的一次性后台迁移，并先做错误隔离

### 6.2 仍然挂靠在本地桌面用户模型上

当前收藏表仍然通过 `user_id` 关联本地桌面用户。

这和当前系统整体状态一致，因为：

- 侧边栏偏好仍挂在本地桌面用户上
- 资源历史也仍使用 `OperatorID -> User`

如果未来要推进“去用户化”改造，收藏这块后续可能还要一起迁出。

## 7. 建议的下一步

如果下次继续做收藏功能，建议按这个顺序推进：

1. 先确认当前版本在 `make dev` 下页面已恢复正常
2. 手动验证以下交互：
   - 搜索弹窗打开
   - 点击星标收藏
   - 关闭再打开搜索弹窗
   - 切换集群后收藏隔离
3. 如果基本可用，再决定是否恢复“旧收藏迁移”
4. 如果恢复迁移，优先做成手动触发方案，而不是自动触发

## 8. 调试补充

以后排查前端运行时错误时，可优先尝试打开桌面开发控制台：

- `Cmd + Option + I`
- `Cmd + Option + J`
- `F12`

如果快捷键无效，可直接查看 `make dev` 的终端输出。

## 9. 当前工作树中的相关文件

与本次收藏改造直接相关的主要文件：

- `pkg/model/favorite_resource.go`
- `pkg/model/favorite_resource_test.go`
- `pkg/handlers/favorite_handler.go`
- `pkg/model/model.go`
- `internal/server/routes.go`
- `internal/server/routes_test.go`
- `ui/src/lib/api/core.ts`
- `ui/src/hooks/use-favorites.ts`
- `ui/src/hooks/use-favorites.test.tsx`
- `ui/src/components/global-search.tsx`
- `ui/src/lib/favorites.ts`

与本次并行整理但不直接属于收藏逻辑的文档类变更：

- `AGENTS.md`
- `.codex/README.md`
- `.codex/project-context.md`
- `.codex/development-guide.md`

## 10. 当前状态总结

当前收藏改造处于“主存储切到 SQLite，但迁移逻辑暂时回退”的状态。

这是一个可接受的中间态：

- 方向是对的
- 主体代码已经落下去了
- 测试也通过了
- 但页面稳定性曾被自动迁移逻辑影响

因此当前最重要的不是继续扩功能，而是先确认桌面 dev 运行时已经恢复稳定，再决定是否继续补旧收藏迁移。
