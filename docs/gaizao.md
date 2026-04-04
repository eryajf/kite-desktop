# Kite Wails 原生化审计报告

## 审计结论

当前桌面版已经完成了“能运行”的第一阶段目标，但距离一个成熟的 Wails 桌面应用还有明显差距。

现状更准确地说是：

- Wails 负责窗口、打包、原生文件选择器这层壳
- 真正的 UI 仍然是内嵌的本地 Gin + React Web 应用
- 只有极少数浏览器行为被桌面桥接接管
- 窗口生命周期、标题栏、下载、菜单、托盘、单实例、日志、构建资产仍然偏模板状态

如果要从“桌面可跑”走到“桌面可用”，建议优先补齐窗口行为、图标、关闭策略、下载保存，以及桌面本地模式的身份收口这几项。

## 结合 `feat-login` 后的重新判断

我额外审查了另一个 worktree `/Users/eryajf/ensoai/workspaces/kite/feat-login` 中尚未提交的改动。

这批改动的产品方向已经很清晰：

- 桌面模式不再把自己当成“一个需要登录的 Web 后台”
- 而是转向“本地单用户桌面工具”

它已经做了几件关键事：

- `desktop/main.go` 在桌面启动时强制设置 `ANONYMOUS_USER_ENABLED=true`
- 前端 `AuthProvider` 在桌面模式下不再加载 OAuth/LDAP/密码登录提供者
- 桌面模式下前端直接构造一个本地用户 `Local User`
- `ProtectedRoute` 在桌面模式不再跳转登录页
- 初始化页在桌面模式下跳过“创建超级管理员”步骤
- Settings / Search / UserMenu 开始隐藏认证、RBAC、用户、API Key 等偏服务端能力

这会直接改变原报告中一部分优先级：

- “OAuth 桌面化联调”不再是当前路线的 P0
- “去登录后的本地身份模型是否统一”变成新的高优先级问题
- “初始化不应再要求创建系统用户”从建议项变成了已经开始落地的正确方向

换句话说，报告应该从“如何把 Web 登录系统桌面化”，切到“如何把桌面应用彻底去 Web 后台化”。

## 当前架构画像

### 1. 运行形态

- `desktop/main.go` 会先在 `127.0.0.1:随机端口` 启动内嵌 Gin 服务，再让 Wails 主窗口直接打开该地址。
- 桌面桥接层只有三个接口：`/api/desktop/status`、`/api/desktop/open-url`、`/api/desktop/open-file`。
- 当前不是基于 Wails bindings/events 的原生桌面前端，而是“Wails 窗口 + 本地 Web 服务”。

### 2. 前端适配现状

- 目前只做了两类桌面适配：
- `target="_blank"` 拦截后走 `openURL`
- 初始化页面支持原生打开 kubeconfig 文件

除此之外，大部分行为仍然保留浏览器假设：

- OAuth 登录仍用 `window.location.href`
- 下载仍走浏览器下载思路
- 多处页面仍依赖 `target="_blank"`、`iframe`、`window.location`

如果以 `feat-login` 为目标态，还需要再补一层理解：

- 现在前端已经开始把桌面模式视为 `isLocalMode`
- 但这个“本地模式”是前端通过 `/api/desktop/status` 推断出来的
- 后端对应的身份策略仍然复用了“匿名用户”语义

这说明桌面本地模式已经出现，但还没有被抽象成一个真正独立、清晰的运行时能力。

### 3. 构建现状

- `desktop/build/*` 平台任务同时构建 `ui/` 和 `desktop/frontend/`
- 但运行时真正显示的是 `ui/` 构建出的 `internal/server/static`
- `desktop/frontend/` 和 `desktop/assets/` 仍然保留着 Wails 默认模板前端和占位资源

这会带来维护噪音和构建冗余。

## 已确认的问题

### P0. 应用图标仍然是默认占位图标

现象：

- 你已经观察到应用图标是默认图标

根因：

- `desktop/build/appicon.icon/icon.json` 仍然引用 `wails_icon_vector.svg`
- `desktop/frontend/public/wails.png`、`react.svg` 等模板资源还在

影响：

- 品牌感极弱
- 安装包、Dock、任务栏、Finder/Explorer 中辨识度很差

建议：

- 直接替换 `desktop/build/appicon.png`
- 替换 `desktop/build/appicon.icon` 内的占位资源
- 重新生成 `darwin/icons.icns` 和 `windows/icon.ico`
- 把模板资源从桌面子工程里清干净，避免后续继续混入默认品牌元素

### P0. macOS 窗口不可拖动

现象：

- 你反馈应用启动后任何地方都拖不动

根因：

- 主窗口和子窗口都设置了 `MacTitleBarHiddenInset`
- 前端顶部 `SiteHeader` 是纯 Web Header，没有任何拖拽区域标记
- 代码里也没有针对交互控件做 `drag / no-drag` 区分

这等于把系统标题栏隐藏了，但又没有真正实现自定义标题栏。

影响：

- 桌面应用最基本的窗口操作缺失
- 用户会直接感知为“这只是一个网页壳”

建议：

- 第一阶段最务实的做法：先取消 `MacTitleBarHiddenInset`，回到系统原生标题栏
- 第二阶段再做真正的桌面标题栏：
- 在 `SiteHeader` 上方或内部增加桌面专用 titlebar
- 明确区分拖拽区和按钮区
- 再决定是否继续隐藏原生标题栏

### P0. 点击关闭会直接退出应用

现象：

- 右上角关闭按钮会直接结束应用

根因：

- 主窗口没有注册 `WindowClosing` 拦截逻辑
- `desktop/main.go` 明确设置了 `ApplicationShouldTerminateAfterLastWindowClosed: true`
- 当前也没有托盘、隐藏到后台、最小化到托盘、退出确认等任何桌面生命周期策略

影响：

- 用户无法区分“关闭窗口”和“退出应用”
- 已打开的日志、终端、长任务、认证状态都可能被粗暴终止

建议：

- 至少实现下面三选一中的一种：
- 关闭主窗口时隐藏到托盘
- 关闭主窗口时最小化
- 关闭前弹确认框，明确区分“关闭窗口”和“退出应用”

更建议的做法：

- macOS 默认关闭窗口但不退出应用
- Windows/Linux 可配置为“关闭即隐藏到托盘”或“关闭即退出”

### P0. 本地模式身份模型仍然是“前后端双拼”，没有统一

这是结合 `feat-login` 后最需要补充的新结论。

现状：

- 桌面启动时后端通过 `ANONYMOUS_USER_ENABLED=true` 进入匿名管理员模式
- 前端又在桌面模式下手工构造了一个 `Local User`
- 前端显示身份是 `Local`
- 后端实际注入身份是 `Anonymous`

影响：

- 前后端看到的不是同一个“人”
- 审计日志、用户展示、权限判断语义会出现错位
- “匿名访问”和“本地桌面单用户模式”被复用成同一个开关，概念上是混乱的
- 未来如果继续演进，容易把桌面模式的豁免逻辑误带回 Web/server 模式

这类问题不一定今天就炸，但它是架构语义上的隐患。

建议：

- 不要继续复用 `ANONYMOUS_USER_ENABLED` 来表达桌面本地模式
- 单独引入更明确的模式，例如：
- `DESKTOP_LOCAL_MODE=true`
- `APP_RUNTIME=desktop-local`

同时统一身份来源：

- 要么由后端显式返回一个“本地桌面用户”
- 要么由前后端统一使用 `anonymous` 这一身份，不再额外伪造 `Local`

目标是：

- 前端展示的用户
- 后端鉴权中的用户
- 审计日志中的用户

三者必须是同一个概念。

### P0. 下载行为仍然是 Web 思维，不是桌面原生保存

现象：

- 日志下载仍然通过 `Blob + a.download` 触发
- Pod 文件下载通过 `openURL(url)` 打开下载链接

根因：

- 桌面桥接层没有 `save-file` / `download-file` 能力
- `openURL` 对同源地址会直接开新的 Wails 窗口，而不是走原生“另存为”

这意味着：

- 文件下载在桌面端不是一个明确的原生保存流程
- 某些下载链接甚至可能打开新窗口，而不是保存文件

建议：

- 新增桌面桥接 API：
- `save-file`
- `download-to-path`
- `reveal-in-finder` / `show-in-folder`

前端统一改造：

- 下载类动作不再走 `openURL`
- 预览和打开页面继续走 `openURL`
- 保存类动作统一走原生保存对话框

### P0. 生产构建仍默认开启 DevTools

现象：

- 主窗口和子窗口都设置了 `DevToolsEnabled: true`

影响：

- 生产包暴露调试入口
- 不利于安全、稳定和交付形态

建议：

- 只在 dev 模式开启
- production 构建统一关闭

## 重要但不是第一批必须修的项

### P1. `feat-login` 当前只是“跳过登录”，还不是完整的桌面本地模式收口

现状：

- 前端已经开始分支处理 `isLocalMode`
- 但改动仍然散落在 `AuthProvider`、`ProtectedRoute`、`Settings`、`GlobalSearch`、`UserMenu`、`Initialization` 等多个点
- 这是一个正确方向，但还偏 patch 风格

建议：

- 把“桌面本地模式”的能力集中收口成统一 runtime/context
- 明确哪些能力在本地模式下：
- 永远启用
- 永远隐藏
- 需要替换交互

否则后面会越来越多 `if (isLocalMode)` 散落在页面层。

### P1. 没有托盘，没有后台驻留策略

现状：

- 没有 `SystemTray`
- 没有“显示主窗口 / 打开设置 / 打开日志目录 / 退出”这类托盘菜单

建议：

- 如果你希望关闭后不直接退出，就必须同时补托盘
- 托盘建议至少包含：
- 显示 Kite
- 导入 kubeconfig
- 打开配置目录
- 打开日志目录
- 退出

### P1. 没有单实例保护

现状：

- `application.Options` 没有配置 `SingleInstance`

影响：

- 用户重复打开应用时可能启动多个实例
- 本地数据库、Cookie、端口、运行状态都可能出现竞争或混乱

建议：

- 启用单实例
- 第二次启动时只激活已有主窗口

### P1. 没有桌面级菜单

现状：

- 只是 `UseApplicationMenu: true`
- 代码里没有定义桌面菜单结构

影响：

- 缺失 About、Preferences、Check Updates、Reload、Open Logs、Help 等典型桌面入口

建议：

- 建一个最小可用桌面菜单：
- App: About, Preferences, Quit
- File: Import kubeconfig, Open Config Dir, Open Logs Dir
- View: Reload, Reset Zoom, Toggle DevTools(dev only)
- Window: Minimize, Zoom
- Help: Documentation, GitHub, Report Issue

如果 `feat-login` 方向成立，菜单里不需要再强调登录、账户、认证之类入口，应该更偏工具型应用。

### P1. 没有窗口状态持久化

现状：

- 代码里只写死初始宽高和最小尺寸
- 没有保存窗口位置、尺寸、是否最大化

建议：

- 保存主窗口 bounds
- 二次启动恢复上次窗口状态

### P1. 启动体验仍偏“工程态”

现状：

- 启动流程会先等待内嵌后端健康检查成功，再创建窗口
- 没有 splash、没有 loading shell、没有失败时的原生错误弹窗

影响：

- 冷启动期间没有明显反馈
- 后端启动失败时只会 `log.Fatal`

建议：

- 加一个真正可用的启动壳或 splash
- 启动失败时给出原生对话框，而不是只打日志退出

### P1. 日志、缓存、临时目录和故障排查能力不足

现状：

- 当前只确保了 `Kite/kite.db`
- 没有 `logs/`、`cache/`、`tmp/`
- 没有“打开日志目录”入口

建议：

- 按桌面应用惯例建立：
- `logs/`
- `cache/`
- `tmp/`
- 日志落盘
- 菜单/托盘里提供“打开日志目录”

### P1. 初始化流程虽然开始去登录化，但还没有完全桌面化

结合 `feat-login`，这里有一个正向变化：

- 桌面模式已经开始跳过“创建超级管理员”步骤

但还不够彻底：

- 初始化页仍然沿用服务端产品心智
- 文案和步骤结构仍然偏“部署一套系统”
- 对桌面用户来说，更合理的心智应该是：
- 选择 kubeconfig
- 导入集群
- 完成

建议：

- 为桌面模式单独设计初始化引导
- 弱化用户系统、认证系统、平台运维配置这些服务端概念

### P1. 安全初始化仍沿用默认密钥

现状：

- 后端默认 JWT secret 和加密 key 都有默认值
- 桌面启动逻辑没有在首次运行时生成本地专属 secret

影响：

- 桌面应用虽然跑在本地，但长期使用默认 secret 并不合适

建议：

- 首次启动生成随机 secret
- 保存到应用配置目录或更进一步接入系统钥匙串

## 维护和架构层面的优化项

### P2. `desktop/frontend` 仍然是模板前端，运行时基本不用

现状：

- `desktop/frontend/src/App.tsx` 还是默认 bootstrap 文案
- `desktop/assets/index.html` 也只是占位壳
- 桌面打包时却仍然会构建这套前端

影响：

- 维护噪音大
- 依赖重复
- 容易误导后续开发者判断桌面真正入口

建议：

- 明确二选一：
- 要么删除这套模板前端，只保留运行必须的最小 Wails 资产
- 要么把它真正用作启动壳、错误页、加载页，而不是纯占位

### P2. 桌面桥接能力太薄

现状：

- 现在桥接层只覆盖了状态探测、打开 URL、打开文件

建议补齐的桌面 API：

- `openExternalURL`
- `openInternalWindow`
- `openFile`
- `saveFile`
- `revealPath`
- `copyToClipboard`
- `showNotification`
- `getAppInfo`
- `openLogsDir`
- `openConfigDir`
- `startOAuthFlow`
- `quit`
- `hide`
- `focusMainWindow`

### P2. 仍有大量浏览器假设散落在业务代码

典型表现：

- `window.location.href`
- `target="_blank"`
- `iframe`
- `Blob + a.download`
- 原生文件和浏览器文件选择器并存

建议：

- 增加统一的 `desktop runtime service`
- 所有桌面相关动作只通过这一层走
- 页面不再直接操作浏览器能力

### P2. OAuth / LDAP / RBAC / 用户管理在桌面版里的产品定位需要重判

结合 `feat-login`，这几个模块的优先级已经变了。

如果桌面版目标是本地单用户工具：

- OAuth / LDAP 不应继续当作桌面版的核心能力
- RBAC / 用户管理 / API Key 更像 server 版功能

建议：

- 明确桌面版与 server 版的能力边界
- 不要把 Web 控制台的全部系统管理能力强行保留到桌面版

否则桌面产品会始终带着“这是个被装进壳里的后台系统”的味道。

### P2. 依赖版本和模板产物存在漂移风险

现状：

- `desktop/frontend/package.json` 使用 `@wailsio/runtime: "latest"`
- `desktop/frontend` 仍是单独一套 React 18 依赖
- 主 UI `ui/` 已经是 React 19

影响：

- 构建不够可重复
- 多套前端依赖容易产生版本漂移

建议：

- 删掉不用的模板前端，或至少把版本固定
- 不要保留 `latest`

## 建议的分阶段方案

## 第一阶段：先把“像个桌面应用”补齐

目标：

- 修复最明显的桌面违和感

任务：

- 替换应用图标并重生成平台图标
- 修复标题栏拖动
- 设计关闭策略，不再直接退出
- 下载改成原生保存
- 统一桌面本地模式身份模型
- 生产环境关闭 DevTools

这是最应该先做的一批。

## 第二阶段：补生命周期和宿主能力

目标：

- 让应用具备完整桌面宿主能力

任务：

- 加托盘
- 加单实例
- 加桌面菜单
- 加窗口状态持久化
- 加日志目录、配置目录入口
- 加启动 splash 和启动失败对话框
- 把初始化流程改成真正的桌面单用户引导

## 第三阶段：收敛桌面架构

目标：

- 降低技术债，避免继续“半套壳半桌面”

任务：

- 收口所有桌面能力到统一 runtime service
- 清理 `desktop/frontend` 和模板资源
- 固定依赖版本
- 把更多浏览器假设从页面层抽掉
- 明确桌面版与 server 版的能力边界

## 我对优先级的建议

最优先处理：

1. 图标
2. 窗口拖动
3. 关闭策略
4. 下载保存
5. 本地模式身份模型统一
6. 生产关闭 DevTools

第二优先级：

1. 托盘
2. 单实例
3. 桌面菜单
4. 窗口状态持久化
5. 日志与配置目录能力
6. 桌面初始化流程重做

第三优先级：

1. 清理模板前端
2. 扩展桌面 bridge
3. 统一桌面 runtime 适配层
4. 明确桌面版与 server 版功能边界
5. 补通知、打开目录、Reveal Path 等增强能力

## 对当前版本的总体判断

如果用一句话概括：

现在这版已经不是“纯 Web”，但也还远远谈不上“原生桌面应用”。

如果不考虑 `feat-login`，它最接近的状态是：

- 架构路线是对的
- 第一阶段壳已经搭起来了
- 但桌面产品化该有的交互和宿主能力还没有补齐

结合 `feat-login` 之后，我会把结论改成：

- 方向更对了
- 桌面版正在摆脱“必须登录的 Web 后台”包袱
- 但还停留在“前端跳过登录 + 后端匿名放行”的过渡态

所以后续工作的重点不在“继续把登录桌面化”，而在两件事：

- 把窗口、生命周期、文件、下载、菜单、托盘这些宿主能力补齐
- 把桌面本地模式从过渡 patch 收敛成一套清晰、统一、可维护的产品模式
