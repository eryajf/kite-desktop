# Kite 桌面原生化改造实施方案

## 文档定位

这份文档用于把 `docs/gaizao.md` 的审计结论整理成可执行的编码实施方案。

它和现有 [desktop-migration-plan.md](./desktop-migration-plan.md) 的关系是：

- `desktop-migration-plan.md` 解决“如何先跑起来”
- 本文解决“如何从可跑走到可用、可维护、像一个桌面应用”

## 当前判断

当前仓库已经完成第一阶段迁移目标，但仍处于“Wails 窗口 + 本地 Gin 服务 + Web UI”的过渡态。

最关键的问题不是某一个单点缺陷，而是桌面运行时语义没有收口：

- 桌面模式仍复用匿名模式
- 前后端对“当前用户”理解不一致
- 窗口、下载、关闭、菜单、托盘等宿主能力不完整
- 页面层仍散落大量浏览器假设

如果继续在这个状态上做零散 patch，技术债会迅速扩大。

## 总体目标

本轮改造的目标不是重写架构，而是在保留现有 loopback HTTP 方案的前提下，把桌面运行时补齐成一套清晰的产品模式。

改造后应达到以下状态：

- 桌面模式有独立、明确的运行时标识
- 前后端共享同一套本地桌面用户语义
- 下载、打开目录、窗口关闭、托盘、菜单等行为走桌面宿主能力
- 前端不再直接依赖浏览器式能力来完成桌面动作
- 桌面子工程不再保留误导性的模板前端和漂移依赖

## 明确不做

本轮不建议做以下事情：

- 不把现有 API 全量重写为 Wails bindings/events
- 不取消 loopback HTTP + WebSocket 运行形态
- 不在第一批里重做整套视觉设计
- 不把 server 模式和 desktop 模式彻底拆成两套产品代码线

## 架构原则

### 1. 保留现有 loopback 形态

继续保留：

- 后端进程内启动 Gin 服务
- Wails 主窗口加载 `127.0.0.1:<随机端口>`
- React UI 继续通过相对路径调用 HTTP/WebSocket

原因很直接：

- 现有 WebSocket、Cookie、文件预览等能力可继续复用
- 迁移成本最低
- 风险远低于直接改纯 bindings 模式

### 2. 把“桌面模式”定义成运行时，而不是页面补丁

后续所有桌面分支判断都应来自统一 runtime/capabilities，而不是页面自己推断。

推荐统一概念：

- `APP_RUNTIME=desktop-local`
- `desktop.status.runtime = "desktop-local"`
- `desktop.status.capabilities = {...}`

### 3. 页面不直接碰浏览器假设

桌面相关动作必须先经过统一适配层。

例如：

- 外链打开
- 另存为
- 打开日志目录
- Reveal Path
- 退出、隐藏、聚焦窗口

都不应再由页面直接调用 `window.open`、`window.location.href`、`a.download`。

## 实施分期

建议拆成五个改造包，按顺序落地。

---

## 改造包 1：运行时与身份模型收口

### 目标

解决当前最核心的语义混乱问题：桌面模式不应继续复用匿名模式。

### 当前问题

- `desktop/main.go` 通过 `ANONYMOUS_USER_ENABLED=true` 开启桌面模式
- 后端鉴权中间件把当前用户注入为 `Anonymous`
- 前端 `AuthProvider` 又额外伪造 `Local User`

这会导致：

- 前端显示身份和后端真实身份不一致
- 审计、权限、用户展示语义错位
- 桌面模式和匿名访问耦合在一起

### 改造原则

- 不再使用 `ANONYMOUS_USER_ENABLED` 表达桌面模式
- 单独定义桌面本地运行时
- 前端只消费后端返回的桌面用户，不再本地伪造

### 涉及文件

- `desktop/main.go`
- `pkg/common/common.go`
- `pkg/auth/middleware.go`
- `pkg/auth/login_handler.go`
- `pkg/model/user.go`
- `ui/src/lib/desktop.ts`
- `ui/src/contexts/auth-context.tsx`

### 具体改造

#### 1. 运行时变量收口

在 `pkg/common/common.go` 新增明确的运行时变量，例如：

```go
var (
    AppRuntime = "server"
    DesktopLocalMode = false
)
```

环境变量建议：

- `APP_RUNTIME=desktop-local`

在 `LoadEnvs()` 中统一解析。

#### 2. 桌面启动逻辑改造

`desktop/main.go` 中：

- 删除 `ANONYMOUS_USER_ENABLED=true`
- 改为设置 `APP_RUNTIME=desktop-local`
- 初始化桌面数据目录、日志目录、缓存目录

#### 3. 后端用户模型统一

在 `pkg/model/user.go` 增加桌面用户常量或构造函数，例如：

```go
func GetLocalDesktopUser() User
```

语义要求：

- 用户名、显示名、provider 固定且明确
- 默认具备本地桌面所需管理权限
- 前后端看到的是同一个用户对象

推荐语义：

- `username = "local"`
- `name = "Local User"`
- `provider = "DesktopLocal"`

#### 4. 鉴权中间件改造

`pkg/auth/middleware.go` 中：

- 优先识别 `DesktopLocalMode`
- 命中后直接注入 `LocalDesktopUser`
- 匿名模式保留给 server/web 模式下的显式配置，不再与桌面模式共用

#### 5. 前端认证上下文改造

`ui/src/contexts/auth-context.tsx` 中：

- 删除 `createLocalUser()`
- 删除 `normalizeLocalUser()`
- `checkAuth()` 在桌面模式下仍请求 `/api/auth/user`
- 以返回结果作为唯一用户来源

### `/api/desktop/status` 建议扩展

当前只返回：

```json
{ "enabled": true }
```

建议改成：

```json
{
  "enabled": true,
  "runtime": "desktop-local",
  "capabilities": {
    "nativeFileDialog": true,
    "nativeSaveDialog": false,
    "tray": false,
    "menu": false,
    "singleInstance": false
  }
}
```

### 验收标准

- 桌面模式启动后不再依赖 `ANONYMOUS_USER_ENABLED`
- `/api/auth/user` 返回的用户就是 UI 展示用户
- 前端不再出现本地伪造用户逻辑
- server 模式匿名访问能力不受桌面模式影响

### 风险

- 若仍沿用匿名模型，后续托盘、日志、用户态设置都会继续建立在错误语义上

---

## 改造包 2：窗口行为与生命周期补齐

### 目标

先把桌面应用最基础的窗口行为补齐，解决“像网页壳”的直接违和感。

### 当前问题

- macOS 隐藏原生标题栏但没有可拖动区域
- 点击关闭直接退出应用
- 主窗口和子窗口生产环境都默认开启 DevTools

### 涉及文件

- `desktop/main.go`
- `desktop/bridge.go`
- 新增 `desktop/window_manager.go`

### 具体改造

#### 1. 第一阶段先回退原生标题栏

在主窗口和子窗口里先移除：

- `MacTitleBarHiddenInset`

先恢复系统标题栏，立即解决拖拽问题。

这个阶段不要急着做自定义标题栏，因为那会引入前端 drag/no-drag、按钮区、跨平台样式等额外复杂度。

#### 2. 关闭策略集中管理

新增 `desktop/window_manager.go`，统一处理：

- 主窗口创建
- 关闭拦截
- 显示/隐藏
- 聚焦已有主窗口

建议策略：

- macOS：关闭窗口但不退出应用
- Windows/Linux：第一阶段先做关闭确认，第二阶段接入托盘后再改成关闭隐藏

#### 3. 生产环境关闭 DevTools

主窗口和 `openInternalWindow` 都要改成仅开发模式开启 DevTools。

推荐做法：

- 通过环境变量或 build flag 判断 dev/prod
- 将窗口默认配置抽成统一函数，避免主窗口与子窗口再次漂移

#### 4. 窗口状态持久化预留

本包可先预留接口，下一包正式实现：

- 保存窗口尺寸
- 保存窗口位置
- 保存最大化状态

### 验收标准

- macOS 窗口可正常拖动
- 点击关闭不再直接粗暴退出
- production build 默认无法打开 DevTools
- 主窗口和子窗口窗口配置不再散落重复

### 风险

- 如果直接做自定义 titlebar，复杂度会上升且容易把一个 P0 问题拖成长周期任务

---

## 改造包 3：文件与下载桥接重构

### 目标

把所有“保存到本地”的动作从浏览器思维切到桌面原生保存流程。

### 当前问题

- 日志下载仍使用 `Blob + a.download`
- 某些下载动作复用 `openURL`
- 桌面桥接没有保存文件、打开目录、Reveal Path 能力

### 涉及文件

- `desktop/bridge.go`
- 新增 `desktop/file_bridge.go`
- `ui/src/lib/desktop.ts`
- 建议新增 `ui/src/lib/desktop-runtime.ts`
- `ui/src/components/log-viewer.tsx`
- 其他下载入口页面

### 建议的桌面 API

建议至少增加以下接口：

- `POST /api/desktop/save-file`
- `POST /api/desktop/reveal-path`
- `POST /api/desktop/open-path`
- `POST /api/desktop/open-logs-dir`
- `POST /api/desktop/open-config-dir`

如果后续需要代理下载，再补：

- `POST /api/desktop/download-to-path`

### 优先实现方式

第一批不要走“大文件内容经 JSON 回传前端再保存”。

优先使用：

1. 前端发起保存请求
2. 桌面侧弹原生 Save Dialog
3. 前端把文本内容或目标 URL 传给桌面侧
4. 桌面侧直接写文件

日志下载这种纯文本场景，可先支持：

```json
{
  "suggestedName": "pod-logs.txt",
  "content": "..."
}
```

更大的文件下载建议后续走 `download-to-path`，避免大内容走 JSON。

### 前端适配原则

- 下载类动作统一走 `desktop runtime service`
- 外链/预览继续走 `openURL`
- 页面组件不直接创建 `<a download>`

### 验收标准

- 日志下载在桌面模式下弹原生保存框
- 下载不会再误开新窗口
- 日志目录、配置目录可从桌面侧直接打开
- 页面层不再直接使用浏览器下载手法处理桌面保存

### 风险

- 如果继续让下载路径依赖 `openURL`，后续文件预览、导出、备份功能都会继续混乱

---

## 改造包 4：宿主能力补齐

### 目标

建立桌面应用应有的宿主能力，而不是只提供一个可显示网页的窗口。

### 涉及文件

- `desktop/main.go`
- `desktop/bridge.go`
- 新增 `desktop/tray.go`
- 新增 `desktop/menu.go`
- 新增 `desktop/app_paths.go`
- 新增 `desktop/window_state.go`

### 子项

#### 1. 托盘

建议最小可用菜单：

- 显示 Kite
- 导入 kubeconfig
- 打开配置目录
- 打开日志目录
- 退出

托盘是“关闭不退出”策略的基础设施，没有托盘就不应该把关闭语义改成后台驻留。

#### 2. 单实例

启动第二个实例时：

- 不再新开一个应用实例
- 只激活已有主窗口

#### 3. 桌面菜单

建议最小菜单结构：

- App: About, Preferences, Quit
- File: Import kubeconfig, Open Config Dir, Open Logs Dir
- View: Reload, Reset Zoom, Toggle DevTools(dev only)
- Window: Minimize, Zoom
- Help: Documentation, GitHub, Report Issue

#### 4. 路径与日志能力

桌面启动时应确保：

- `Kite/kite.db`
- `Kite/logs/`
- `Kite/cache/`
- `Kite/tmp/`

同时提供“打开日志目录”和“打开配置目录”入口。

#### 5. 窗口状态持久化

至少记录：

- 宽高
- 位置
- 最大化状态

二次启动恢复上次状态。

#### 6. 启动失败体验

后端启动失败不应只 `log.Fatal`。

建议增加：

- 简单 splash 或 loading shell
- 启动失败原生对话框

### 验收标准

- 应用支持单实例
- 托盘可用
- 桌面菜单可用
- 日志目录与配置目录可打开
- 窗口状态可恢复
- 启动失败时用户能看到明确错误反馈

---

## 改造包 5：架构清理与能力收敛

### 目标

消除当前“半桌面半模板”的维护噪音，把桌面能力统一收口。

### 当前问题

- `desktop/frontend` 仍是模板 React 前端
- `desktop/assets` 只是占位壳
- `@wailsio/runtime` 使用 `latest`
- 页面层仍散落桌面判断和浏览器假设

### 涉及文件

- `desktop/frontend/package.json`
- `desktop/frontend/src/*`
- `desktop/assets/*`
- `desktop/build/*`
- `ui/src/lib/desktop.ts`
- `ui/src/contexts/auth-context.tsx`
- 各页面组件中的桌面判断逻辑

### 具体改造

#### 1. 处理模板前端

二选一：

- 删除 `desktop/frontend`，只保留运行所需最小资产
- 或把它改造成真正的 splash/error shell

当前更建议第二种中的“最小壳”路线，前提是它真的承担启动壳职责；否则就直接删除。

#### 2. 固定依赖版本

把 `@wailsio/runtime: latest` 改成明确版本，避免不可重复构建。

#### 3. 收口桌面 runtime service

建议在 UI 侧建立统一模块，集中封装：

- runtime 状态
- capabilities
- 外链打开
- 文件保存
- 打开目录
- 聚焦主窗口
- 隐藏/退出

页面组件只消费这个 service，不再直接操作浏览器 API。

#### 4. 明确桌面版功能边界

需要逐步判定以下能力在桌面版中的角色：

- OAuth
- LDAP
- RBAC
- 用户管理
- API Key

建议原则：

- 本地单用户工具不强调这些能力
- server 模式继续保留
- desktop 模式隐藏或禁用

### 验收标准

- 不再保留误导性的模板桌面前端
- 桌面依赖版本固定
- 页面层桌面能力统一从 runtime service 获取
- 桌面和 server 的功能边界清晰

---

## 推荐 PR 切分

建议按以下顺序提交，避免一个大 PR 把运行时、UI、宿主能力全混在一起。

### PR1：运行时与身份收口

包含：

- `APP_RUNTIME=desktop-local`
- 后端 `LocalDesktopUser`
- `/api/desktop/status` 扩展
- 前端认证上下文去本地伪造用户

### PR2：窗口行为修正

包含：

- 标题栏回退到原生
- 关闭策略基础改造
- 生产关闭 DevTools
- 窗口配置收口

### PR3：文件与下载桥接

包含：

- `save-file`
- `open-logs-dir`
- `open-config-dir`
- 日志下载桌面化

### PR4：宿主能力补齐

包含：

- 托盘
- 单实例
- 菜单
- 窗口状态持久化

### PR5：架构清理

包含：

- `desktop/frontend` 清理
- 依赖固定
- runtime service 收口
- 桌面功能边界整理

## 每个 PR 的最小验证项

### 通用验证

- `make desktop-dev`
- `make desktop-build`
- 主窗口正常打开
- 基础 API 和 WebSocket 不回归

### PR1 验证

- 桌面模式 `/api/auth/user` 返回统一用户
- 前端显示用户与后端日志用户一致
- server 模式匿名配置仍可独立工作

### PR2 验证

- macOS 可拖动窗口
- 点击关闭不再直接退出
- production build 不默认开启 DevTools

### PR3 验证

- 日志下载走原生保存
- 打开日志目录与配置目录可用
- 下载行为不再开新窗口

### PR4 验证

- 第二次启动只激活已有实例
- 托盘菜单可用
- 窗口尺寸和位置能恢复

### PR5 验证

- 桌面模板资源不再误导入口判断
- 依赖安装可重复
- 页面层不再直接使用桌面相关浏览器假设

## 立即执行建议

如果按投入产出比排序，建议先做下面三项：

1. 运行时与身份模型收口
2. 窗口行为修正
3. 下载与文件桥接

原因：

- 这三项直接决定桌面版是否像一个真实产品
- 同时也是后续托盘、菜单、初始化流程继续演进的基础

## 后续文档建议

在本方案基础上，建议后续再补两份更细文档：

- `docs/desktop-runtime-contract.md`
  约定 `/api/desktop/status` 与桌面桥接 API 的请求/响应结构

- `docs/desktop-feature-boundary.md`
  约定 desktop/server 两种运行时下的能力差异与隐藏策略
