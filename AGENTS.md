# AGENTS.md

本文件用于约束进入本仓库工作的 AI agent。

功能级代码索引已单独拆分到：

- `.codex/feature-code-index.md`

后续如果需要按“功能名 -> 前后端文件”定位代码，应优先去该文档查询。

## 1. 进入仓库后的第一步

开始任何分析、设计、编码之前，必须优先阅读以下文件：

1. `.codex/README.md`
2. `.codex/project-context.md`
3. `.codex/development-guide.md`
4. `.codex/feature-code-index.md`
5. `README.md`
6. `desktop/README.md`
7. `docs/desktop-runtime-contract.md`
8. `docs/desktop-feature-boundary.md`
9. `docs/frontend-context-menu-pattern.md`（涉及列表页右键/上下文菜单时必读）

其中，`.codex/README.md` 是本仓库给 AI 使用的导航入口，后续工作必须以其中索引到的说明为准。

## 2. 必须遵守的高优先级规则

- 当前仓库是 `Kite Desktop`，不是原始的 Web 优先 `Kite`。
- 这是桌面优先项目，不要默认按纯 Web 项目思路设计或改造。
- `desktop/main.go` 是桌面应用真实入口，不能忽略。
- `ui/` 是主业务前端，`desktop/frontend/` 只是 Wails 壳层前端。
- 涉及桌面专属能力时，优先检查：
  - `ui/src/lib/desktop.ts`
  - `desktop/bridge.go`
  - `desktop/host.go`
  - `desktop/` 宿主层代码
- 涉及表格列表的右键菜单 / context menu 功能时，优先阅读并复用 `docs/frontend-context-menu-pattern.md` 中约定的共享实现模式。
- 后续做前端功能开发或新增前端能力时，优先在当前项目既有技术栈、已安装依赖、现有组件体系中查找可复用的现成组件或方案，不要先入为主地手写一套实现。
- 如果当前技术栈里没有合适的现成组件，应先明确告知用户当前缺口，由用户决定是否补充依赖、引入组件或提供选型，而不是在未确认前自行硬写。
- 如果旧有 Web 假设与桌面版产品方向冲突，默认优先服从桌面版方向，除非用户明确要求保留 Web 语义。

## 3. 快速定位建议

当用户提到某个功能时，建议按以下顺序定位：

1. 先看 `.codex/feature-code-index.md`
2. 再根据索引跳转到：
   - `ui/src/routes.tsx`
   - `ui/src/pages/resource-list.tsx`
   - `ui/src/pages/resource-detail.tsx`
   - `pkg/handlers/resources/handler.go`
   - `internal/server/routes.go`
3. 如果涉及桌面原生能力，再补看：
   - `ui/src/lib/desktop.ts`
   - `desktop/bridge.go`

## 4. 文档维护规则

当你修改了以下内容时，应同步更新 `.codex/` 或 `docs/` 下对应文档，必要时更新本文件：

- 项目运行方式
- 关键目录职责
- 桌面能力接入方式
- 运行时契约
- 标准开发命令
- 左侧导航主功能结构
- 某个主功能的前后端定位关系
- 已经形成共识的全局 UI / 交互实现模式

如果只是普通代码改动，不需要机械式更新文档；只有当事实或约定发生变化时才更新。
