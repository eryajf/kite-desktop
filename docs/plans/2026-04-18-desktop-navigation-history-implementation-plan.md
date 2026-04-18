# 桌面端全局前进后退方案与开发计划

> **Goal:** 为 `Kite Desktop` 增加主窗口内全局可用的前进 / 后退能力，覆盖页面内导航、原生菜单、快捷键和左侧导航头部按钮，并保证行为符合桌面应用与浏览器历史语义的共同预期。

> **Scope:** 本文仅讨论桌面版 `Kite Desktop` 主窗口内的全局导航历史能力，不包含未来 Web 版本兼容方案，也不在第一期处理所有子窗口的原生菜单联动。

> **Current Baseline:** 当前主业务前端位于 `ui/`，使用 `react-router-dom@7` 的 `createBrowserRouter`。大部分页面跳转已经通过 `<Link>` 与 `useNavigate()` 进入浏览器 history，但桌面宿主尚未提供统一的“前进 / 后退”菜单、快捷键、状态同步与头部按钮承载区。

> **Related Docs:**
> - [桌面运行时契约](../desktop-runtime-contract.md)
> - [桌面能力边界](../desktop-feature-boundary.md)
> - [AI 助手侧边吸附窗口设计方案](./2026-04-14-ai-chat-sidecar-window-design.md)

---

## 1. 文档定位

本文用于回答四个问题：

1. 当前项目为什么需要显式建设“全局前进 / 后退”，而不能只依赖页面零散返回按钮。
2. 这套能力在产品层面到底遵循什么历史语义。
3. 左侧导航头部按钮与原生菜单 / 快捷键应如何统一实现。
4. 这项能力应如何拆成一组可落地、可验证的开发任务。

本文是后续编码实施的主计划文档。

---

## 2. 现状结论

### 2.1 当前已有基础

当前项目已经具备构建全局导航历史能力的几个关键前提：

1. 主业务前端使用 `createBrowserRouter`：
   - `ui/src/routes.tsx`
2. 绝大多数页面跳转已通过 `<Link>` 或 `useNavigate()` 进入客户端路由：
   - `ui/src/pages/*`
   - `ui/src/components/*`
3. 桌面宿主已经有成熟的“原生菜单 -> 前端 window event -> provider 统一处理”模式：
   - `desktop/host.go`
   - `ui/src/components/page-find-provider.tsx`
4. 前端顶层已有统一 provider 装配区，适合接入新的导航上下文：
   - `ui/src/App.tsx`

### 2.2 当前主要缺口

当前“页面之间能跳转”不等于“桌面端全局具备前进 / 后退能力”。主要缺口包括：

1. 原生菜单没有 `Back / Forward` 项。
2. 桌面端没有统一快捷键来触发导航历史。
3. 前端没有集中维护 `canGoBack / canGoForward` 的会话级状态。
4. 左侧导航头部没有明确的前进 / 后退按钮承载位。
5. 宿主层无法根据当前历史状态动态禁用菜单项。

### 2.3 当前实现约束

当前左侧导航在桌面端仍然采用：

- `ui/src/components/app-sidebar.tsx`
  - `collapsible="offcanvas"`

结合本轮交互调整，最终选择是：

1. 保持折叠按钮留在顶部原位置。
2. 左侧导航头部只承载品牌区和前进 / 后退。
3. 不为了放置折叠按钮而强行改成 `icon collapse`。

这样可以兼顾两点：

1. 保留当前桌面版已经习惯的顶部折叠入口。
2. 让前进 / 后退贴近品牌区，视觉上更接近用户期望。

---

## 3. 产品结论

本功能采用以下产品决策：

1. 主窗口内支持全局、多层前进 / 后退。
2. 历史语义采用标准浏览器 session history 语义，而不是页面父子关系硬编码。
3. 左侧导航头部新增一组控制：
   - 后退按钮
   - 前进按钮
4. 这组控制位于：
   - 左侧导航栏头部
   - Logo 和 `Kite` 文案右侧
5. 折叠按钮保留在顶部原位置，不迁入侧边栏头部。
6. 桌面端侧边栏继续使用 `offcanvas`。
7. 原生菜单和快捷键与左侧头部按钮共用同一套导航能力，不做多套逻辑。
8. 第一阶段先覆盖主窗口。
9. 第一阶段不要求“主窗口菜单 / 快捷键自动路由到当前焦点子窗口”。

---

## 4. 历史语义定义

### 4.1 采用标准 session history 语义

本方案不把“返回”理解为“回到父页面”，而是理解为“回到当前窗口上一个历史条目”。

例如：

- `Deployments 列表 -> Deployment A -> Deployment B -> Settings`

此时用户应当能够：

1. 连续后退多层：
   - `Settings -> Deployment B -> Deployment A -> Deployments 列表`
2. 在未分叉前继续前进多层：
   - `Deployments 列表 -> Deployment A -> Deployment B -> Settings`

### 4.2 分叉规则

若用户执行以下操作：

1. 从 `A -> B -> C`
2. 后退回 `B`
3. 再进入 `D`

则前进栈中的 `C` 应被截断。这与浏览器一致。

### 4.3 不入栈的 URL 变化

以下 URL 变化不应制造新的历史层级：

1. 明确使用 `replace` 的查询参数更新。
2. 页面内部仅用于表达视图状态、且当前已经被定义为“轻量状态”的 URL 微调。

当前已知例子：

- `ui/src/components/ui/responsive-tabs.tsx`
  - 设置页 tab 通过 `{ replace: true }` 更新 `?tab=...`

这类行为应继续保持不污染历史。

### 4.4 集群切换边界

当前集群切换由本地状态驱动，而不是 URL 驱动：

- `ui/src/contexts/cluster-context.tsx`

因此第一期明确不承诺：

- “后退会自动恢复上一个集群”

换言之，本期的导航历史只还原路由，不额外重建 cluster 上下文。

### 4.5 深链行为

若应用直接打开某个详情页深链，例如：

- `/deployments/default/nginx`

且当前窗口中此前没有可回退的应用内历史，则：

- 后退按钮默认禁用
- 原生菜单中的 `Back` 默认禁用

---

## 5. 用户体验设计

### 5.1 左侧导航头部布局

桌面端左侧导航头部统一改为一排控制项，顺序建议为：

1. Logo
2. `Kite` 文案
3. 后退按钮
4. 前进按钮

目标效果接近 Codex 应用当前头部交互风格：

1. 按钮整体偏轻量、非强视觉强调。
2. 可用态使用正常前景色。
3. 禁用态使用明显灰态。
4. hover 时给予轻微背景反馈。
5. 点击热区应略大于图标本体，保证桌面端易用性。

### 5.2 侧边栏折叠后的表现

桌面端继续采用 `offcanvas` 后：

1. 左侧侧边栏收起后整体滑出视图。
2. 顶部原位置的折叠按钮仍然作为重新展开入口。
3. 前进 / 后退按钮跟随侧边栏头部一起隐藏。

这意味着前进 / 后退更偏向“侧边栏可见时的全局辅助导航”，而不是收起状态下的常驻控制。

### 5.3 顶栏调整

当前顶栏的侧边栏折叠按钮位于：

- `ui/src/components/site-header.tsx`

方案落地后：

1. 顶栏中的 `SidebarTrigger` 保留在原位置。
2. 左侧导航头部不再承担折叠职责。
3. 整体职责变为：
   - 顶栏负责折叠入口与页面上下文
   - 左侧导航头部负责品牌区与前进 / 后退

### 5.4 原生菜单与按钮的关系

头部按钮、原生菜单、快捷键应共用相同能力：

1. 按钮触发 `goBack()` / `goForward()`
2. 菜单项触发同样的导航动作
3. 快捷键触发同样的导航动作
4. 三者状态一致：
   - 可退时可点击
   - 不可退时禁用

---

## 6. 快捷键设计

### 6.1 平台习惯

建议按平台分别采用用户熟悉的桌面习惯：

1. `macOS`
   - 后退：`Cmd+[`
   - 前进：`Cmd+]`
2. `Windows / Linux`
   - 后退：`Alt+Left`
   - 前进：`Alt+Right`

### 6.2 为什么不统一成一套快捷键

不建议所有平台强行统一为同一组快捷键，原因是：

1. macOS 用户更熟悉 `Cmd+[` / `Cmd+]`
2. Windows / Linux 用户更熟悉 `Alt+Left` / `Alt+Right`
3. 这套设计更贴合“桌面应用”而不是“网页内通用快捷键”

### 6.3 与浏览器默认行为的关系

当前 Wails 在 Windows 侧明确关闭了浏览器默认 accelerator 和 swipe navigation。

这意味着：

1. 不能依赖浏览器 / WebView 自己处理前进后退快捷键。
2. 应用必须显式注册菜单与快捷键，并路由到自己的导航上下文。

---

## 7. 技术方案

### 7.1 总体原则

推荐方案是：

1. 继续让真实页面切换由 React Router / 浏览器 history 驱动。
2. 新增前端会话级 `NavigationProvider`，集中维护导航状态。
3. 桌面宿主只负责：
   - 暴露菜单与快捷键
   - 向前端派发导航事件
   - 接收前端回传的 `canGoBack / canGoForward`
   - 动态更新菜单可用态

### 7.2 为什么不直接在 Go 里执行 `window.history.back()`

不推荐把宿主层实现成“菜单一点击就 `ExecJS("window.history.back()")`”，原因是：

1. 宿主层拿不到稳定的会话级 `canGoBack / canGoForward`
2. 无法优雅支持头部按钮与菜单状态共享
3. 不利于测试
4. 后续扩展到窗口级状态同步时会更难维护

### 7.3 前端 `NavigationProvider`

建议新增：

- `ui/src/contexts/navigation-context.tsx`

职责：

1. 监听当前 location 变化。
2. 维护主窗口当前会话内的导航条目数组与索引。
3. 暴露：
   - `goBack()`
   - `goForward()`
   - `canGoBack`
   - `canGoForward`
4. 监听桌面端导航事件：
   - `kite:navigate-back`
   - `kite:navigate-forward`
5. 在状态变化时回传给桌面宿主。

### 7.4 历史条目模型

推荐最小条目结构：

```ts
type NavigationEntry = {
  key: string
  pathname: string
  search: string
  hash: string
}
```

记录粒度：

1. `location.key`
2. `pathname`
3. `search`
4. `hash`

处理规则：

1. `PUSH`
   - 追加新条目
   - 丢弃当前索引之后的前进栈
2. `REPLACE`
   - 覆盖当前索引对应条目
3. `POP`
   - 根据 `location.key` 回定位已有条目索引
   - 若未命中，再做兜底处理

### 7.5 前端事件桥接

当前项目已有成熟先例：

- `desktop/host.go`
- `ui/src/components/page-find-provider.tsx`

本功能复用相同模式，新增两个事件：

1. `kite:navigate-back`
2. `kite:navigate-forward`

### 7.6 左侧头部按钮组件

建议新增：

- `ui/src/components/navigation-controls.tsx`

职责：

1. 渲染后退 / 前进按钮
2. 使用 `NavigationContext`
3. 根据 `canGoBack / canGoForward` 控制 disabled 态
4. 提供与侧边栏头部布局一致的轻量样式

### 7.7 侧边栏折叠模式调整

桌面端需要把当前：

- `collapsible="offcanvas"`

调整为：

- `collapsible="icon"`

移动端行为不变，仍保留 sheet / offcanvas 模式。

### 7.8 宿主层菜单与状态同步

建议在桌面层增加：

1. 新的菜单项：
   - `Back`
   - `Forward`
2. 菜单项快捷键：
   - macOS：`Cmd+[` / `Cmd+]`
   - Windows / Linux：`Alt+Left` / `Alt+Right`
3. 菜单项状态管理：
   - `SetEnabled(canGoBack)`
   - `SetEnabled(canGoForward)`

建议 `desktopHost` 保存这两个菜单项引用，以便动态更新状态。

### 7.9 宿主层接口

建议在 `desktop bridge` 新增轻量状态同步接口，例如：

- `POST /api/desktop/navigation/state`

请求体建议：

```json
{
  "canGoBack": true,
  "canGoForward": false
}
```

该接口只服务主窗口当前状态同步，不承载具体导航动作。

---

## 8. 多窗口策略

### 8.1 第一阶段边界

第一阶段明确只保证以下能力完整成立：

1. 主窗口内左侧头部按钮可用
2. 主窗口原生菜单可用
3. 主窗口快捷键可用
4. 主窗口内所有主业务页面共享同一套历史

### 8.2 子窗口处理原则

当前同源链接在桌面端可能被打开为新的内部窗口：

- `desktop/bridge.go`

第一阶段不要求：

1. 主窗口菜单自动识别当前焦点子窗口并把 `Back / Forward` 路由过去
2. 主窗口与子窗口共享一套历史栈

对于内部子窗口，第一阶段可接受的行为是：

1. 若子窗口加载 app shell，本身页面内按钮可以复用同一个 `NavigationProvider` 机制
2. 但宿主层菜单状态与快捷键默认仍以主窗口为准

第二阶段若要增强，则需补：

1. 当前焦点窗口跟踪
2. 每个窗口各自的导航状态注册
3. 菜单动作按焦点窗口路由

---

## 9. 开发计划

### Phase 0：文档与设计冻结

目标：

1. 明确产品语义与 UI 落点
2. 冻结“桌面端必须改为 icon collapse”这一前提

交付：

1. 本文档

### Phase 1：前端导航能力基建

目标：

1. 新增 `NavigationProvider`
2. 打通主窗口会话级历史状态
3. 支持按钮级 `Back / Forward`

建议改动：

1. Create: `ui/src/contexts/navigation-context.tsx`
2. Create: `ui/src/components/navigation-controls.tsx`
3. Modify: `ui/src/App.tsx`
4. Modify: `ui/src/lib/desktop.ts`

验收：

1. 页面间可多层回退 / 前进
2. 深链场景初始禁用 `Back`
3. `replace` 型 URL 更新不制造多余条目

### Phase 2：左侧导航头部布局调整

目标：

1. 折叠按钮迁入左侧导航头部
2. 新增前进 / 后退按钮组
3. 侧边栏切换为 icon collapse
4. 顶栏移除折叠按钮

建议改动：

1. Modify: `ui/src/components/app-sidebar.tsx`
2. Modify: `ui/src/components/site-header.tsx`
3. Modify: `ui/src/components/ui/sidebar.tsx`

验收：

1. 桌面端侧边栏可收起为 icon 模式
2. 收起后仍可通过左侧头部重新展开
3. Logo / 文案 / 更新角标布局不冲突

### Phase 3：桌面宿主菜单与快捷键

目标：

1. 增加 `Back / Forward` 菜单项
2. 增加平台化快捷键
3. 宿主层派发导航事件
4. 宿主层根据前端状态动态启用 / 禁用菜单

建议改动：

1. Modify: `desktop/host.go`
2. Modify: `desktop/bridge.go`
3. Modify: `desktop/host_test.go`

验收：

1. 菜单点击可触发导航
2. 快捷键可触发导航
3. 菜单禁用态与前端按钮一致

### Phase 4：测试与回归

目标：

1. 补齐前端与桌面层关键测试
2. 验证页面查找、AI 快捷键、集群切换等现有能力未受影响

建议改动：

1. Create or Modify: `ui/src/contexts/navigation-context.test.tsx`
2. Modify: `ui/src/components/app-sidebar.test.tsx`
3. Modify: `ui/src/routes.test.tsx`
4. Modify: `desktop/host_test.go`

---

## 10. 详细任务拆分

### Task 1：实现前端导航上下文

要求：

1. 维护主窗口当前会话级历史数组与索引。
2. 提供 `goBack / goForward` 与布尔状态。
3. 监听桌面事件并执行对应动作。
4. 在状态变化时节制地同步到桌面宿主。

注意：

1. 不要依赖 `window.history.length` 作为唯一可退依据。
2. 不要把 cluster 状态塞进本期导航条目。

### Task 2：接入左侧头部按钮

要求：

1. 在侧边栏头部新增控制区。
2. 将折叠按钮迁入控制区。
3. 新增 `Back / Forward` 视觉按钮。
4. 收起态与展开态都能正常工作。

注意：

1. 桌面端与移动端行为需要分开处理。
2. 当前 `new` 更新角标位置需同步校正。

### Task 3：接入桌面菜单与快捷键

要求：

1. 在原生菜单中新增 `Back / Forward`
2. 注册平台化快捷键
3. 菜单点击通过事件桥接到前端
4. 宿主层根据前端回传状态更新菜单可用态

注意：

1. 第一阶段动作默认作用于主窗口
2. 避免在 Go 层直接维护一套独立历史

### Task 4：补齐测试与手工验收

要求：

1. 编写或更新单元测试
2. 跑通关键桌面和前端测试
3. 补一轮手工验收清单

---

## 11. 测试计划

### 11.1 前端单元测试

需要覆盖：

1. `PUSH` 导航会追加历史
2. `REPLACE` 导航不会追加历史
3. `POP` 导航能正确回退索引
4. 后退后再进入新页面会截断前进栈
5. 深链首屏 `canGoBack === false`

### 11.2 组件测试

需要覆盖：

1. 左侧头部按钮渲染正确
2. `Back / Forward` 禁用态正确
3. 顶栏不再渲染折叠按钮
4. 桌面端 icon collapse 模式下布局不崩

### 11.3 Go 测试

需要覆盖：

1. 应用菜单包含 `Back / Forward`
2. 菜单快捷键正确注册
3. 菜单项可根据状态被启用 / 禁用

### 11.4 手工验收清单

至少验证以下路径：

1. `/deployments` -> 详情 -> 后退 -> 前进
2. 连续多层：
   - 列表 -> 详情 A -> 详情 B -> 设置 -> 多次后退 / 前进
3. 设置页 tab 切换不污染历史
4. 深链直接打开详情页时 `Back` 禁用
5. 左侧收起后仍能重新展开
6. 页面查找、AI 快捷键、全局搜索不受影响

---

## 12. 验收标准

整套方案完成后，应满足以下验收标准：

1. 主窗口内所有主业务页面支持全局、多层前进 / 后退。
2. 左侧导航头部提供可发现的折叠 / 后退 / 前进控制。
3. 原生菜单与快捷键可驱动同一套导航能力。
4. 不可退 / 不可进时，按钮与菜单都呈禁用态。
5. `replace` 型 URL 变化不污染历史。
6. 桌面端侧边栏收起后仍可通过头部控制重新展开。
7. 现有页面查找、AI 快捷键、全局搜索、集群切换等能力不发生行为回退。

---

## 13. 本期明确不做

本期不建议做以下事情：

1. 不把 cluster 状态纳入历史回放模型。
2. 不把所有子窗口的菜单 / 快捷键路由问题一起解决。
3. 不做复杂的“页面层级父子图谱”推断。
4. 不做浏览器原生 WebView `GoBack / GoForward` 平台特化接入。
5. 不做整套视觉系统重构，只在现有侧边栏风格下完成控制区增强。

---

## 14. 推荐落地顺序

推荐按以下顺序实施：

1. 先完成前端 `NavigationProvider`
2. 再完成左侧头部按钮与侧边栏折叠模式调整
3. 再接入桌面菜单 / 快捷键 / 状态同步
4. 最后补测试与回归

原因：

1. 前端导航上下文是整套能力的单一真实来源。
2. UI 与宿主层都应消费同一份状态，而不是各自维护。
3. 这样可以避免“菜单先做完、但头部按钮和状态同步又返工”的重复劳动。
