# Kite Desktop AI 导航

这份文档是后续 AI 进入本仓库后的导航入口。

## 必读顺序

1. [项目背景](./project-context.md)
2. [开发约定](./development-guide.md)
3. 仓库根目录的 `README.md`
4. `desktop/README.md`
5. `docs/desktop-runtime-contract.md`
6. `docs/desktop-feature-boundary.md`

## 这份导航解决什么问题

当前仓库已经不是上游的 Web 优先 `Kite`，而是桌面优先的 `Kite Desktop`。  
后续 AI 最容易犯的错误有两类：

- 把项目继续按纯 Web 产品理解
- 误改 `desktop/frontend/`，而不是主业务前端 `ui/`

因此，进入仓库后先看本目录下两份文档：

- [项目背景](./project-context.md)
  - 解决“这个项目现在到底是什么、核心架构是什么、桌面版和上游有什么不同”
- [开发约定](./development-guide.md)
  - 解决“改动应该落在哪里、怎么开发、怎么验证、哪些地方最容易出错”

## 使用原则

- 如果旧有 Web 假设与当前桌面版方向冲突，默认优先服从桌面版产品方向。
- 如果运行时、目录职责、桌面能力接入方式发生变化，应同步更新本目录文档。
