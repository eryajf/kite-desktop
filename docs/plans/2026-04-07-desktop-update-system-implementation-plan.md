# 桌面端应用内更新 Implementation Plan

> **Goal:** 按 [docs/plans/2026-04-07-desktop-update-system-design.md](./2026-04-07-desktop-update-system-design.md) 为桌面端实现“启动静默检查 + 手动检查 + 可忽略版本 + 应用内下载 + 重启执行更新”的完整更新链路，仅支持 macOS 与 Windows。

> **Tech Stack:** Go, Gin, Wails v3, React 19, TanStack Query, Sonner, GitHub Releases.

---

## 总体实施顺序

本功能建议分 6 个阶段推进：

1. 发布资产与版本检查模型收敛
2. 本地更新状态存储
3. 扩展检查更新接口与启动静默检查
4. 前端更新中心与忽略版本
5. 下载任务、右下角下载卡片与校验
6. helper/updater 与“重启并更新”

阶段 1 到阶段 4 完成后，用户已经可以看到完整的更新状态与交互入口。阶段 5 到阶段 6 再补齐真正的下载与更新执行链路。

---

## Task 1: 收敛发布资产命名与更新元数据模型

**Goal:** 为应用内更新建立稳定的 Release 资产选择规则，并让后端拥有完整的更新比较模型。

**Files:**
- Modify: `.github/workflows/release.yaml`
- Modify: `pkg/version/update_checker.go`
- Modify: `pkg/version/version.go`
- Modify: `pkg/version/version_test.go`
- Modify: `internal/server/server_test.go`
- Doc: `docs/plans/2026-04-07-desktop-update-system-design.md`

### 任务说明

- [ ] 给 macOS 发布链路增加 `.zip` 资产，命名规则与 `.dmg` 保持一致。
- [ ] 保持 Windows 安装器命名固定为 `Kite-vX.Y.Z-windows-<arch>-installer.exe`。
- [ ] 在版本检查结构中引入 `comparison` 字段，明确区分：
  - `update_available`
  - `up_to_date`
  - `local_newer`
  - `uncomparable`
- [ ] 扩展更新检查返回结构，允许后续返回：
  - `releaseNotes`
  - `publishedAt`
  - `assetAvailable`
  - `asset`

### 验收标准

- [ ] 本地版本高于远程 release 时，不再显示“当前已是最新版本”。
- [ ] 后端测试覆盖三态比较结果。
- [ ] 发布流程具备 macOS `.zip` 资产产出设计。

---

## Task 2: 新增桌面端本地更新状态存储

**Goal:** 在桌面端数据目录中持久化忽略版本、上次检查结果、下载任务和待应用更新状态。

**Files:**
- Create: `desktop/update_state.go`
- Modify: `desktop/host.go`
- Modify: `desktop/bridge.go`
- Test: `desktop/host_test.go`

### 任务说明

- [ ] 定义更新状态结构：
  - `ignoredVersion`
  - `lastCheckedAt`
  - `lastCheckResultVersion`
  - `download`
  - `readyToApply`
- [ ] 在桌面端数据目录中新增更新状态文件，例如：
  - `~/Library/Application Support/Kite/update-state.json`
  - `%AppData%/Kite/update-state.json`
- [ ] 提供线程安全的读写能力。
- [ ] 将状态文件与现有桌面路径模型整合。

### 验收标准

- [ ] 可以从桌面端宿主层稳定读写更新状态。
- [ ] 应用重启后可以恢复忽略版本和已下载状态。

---

## Task 3: 扩展检查更新接口，并支持启动后静默检查

**Goal:** 除了手动检查，还要在应用启动后执行一次后台静默检查，但不阻断 UI。

**Files:**
- Modify: `pkg/version/update_checker.go`
- Modify: `pkg/version/version.go`
- Modify: `internal/server/routes.go`
- Modify: `desktop/main.go`
- Modify: `desktop/host.go`
- Modify: `ui/src/contexts/runtime-context.tsx`
- Modify: `ui/src/lib/api/system.ts`
- Test: `pkg/version/version_test.go`

### 任务说明

- [ ] 扩展 `POST /api/v1/version/check-update` 返回结构，加入：
  - `comparison`
  - `releaseNotes`
  - `publishedAt`
  - `ignored`
  - `assetAvailable`
  - `asset`
- [ ] 加入当前平台/架构资产匹配能力。
- [ ] 在桌面端启动完成后触发一次静默检查。
- [ ] 静默检查结果写入本地更新状态。
- [ ] 静默检查发现新版本时：
  - 不弹阻断式对话框
  - 只发一个轻量 UI 信号供前端消费

### 事件建议

- [ ] 新增桌面事件，例如：
  - `desktop:update:status`
  - `desktop:update:available`

### 验收标准

- [ ] 应用重新打开时会在后台检查一次。
- [ ] 被忽略版本不会重复提示。
- [ ] 前端刷新后仍能读到最后一次检查结果。

---

## Task 4: 完成关于页更新中心与“忽略此版本”交互

**Goal:** 让关于页成为更新主入口，并支持忽略版本和三态结果展示。

**Files:**
- Modify: `ui/src/components/settings/about-management.tsx`
- Modify: `ui/src/lib/api/system.ts`
- Modify: `ui/src/lib/desktop.ts`
- Create: `ui/src/hooks/use-desktop-update.ts`
- Modify: `ui/src/i18n/locales/zh.json`
- Modify: `ui/src/i18n/locales/en.json`
- Test: `ui/src/pages/settings.test.tsx`

### 任务说明

- [ ] 引入统一的桌面更新 hook，封装：
  - 检查更新
  - 忽略版本
  - 当前状态读取
- [ ] 关于页支持展示四种检查结果：
  - 有新版本
  - 当前已是最新
  - 本地版本高于远程
  - 当前版本不可比较
- [ ] 新增按钮：
  - `立即更新`
  - `忽略此版本`
  - `查看 Release`
- [ ] 若版本已被忽略，则在手动检查时仍展示结果，但标记为已忽略。
- [ ] 可选恢复：
  - `取消忽略`

### 验收标准

- [ ] 关于页已不再把 `local_newer` 错误显示为“已是最新版本”。
- [ ] 用户点击“忽略此版本”后，重启应用仍不再收到该版本提示。

---

## Task 5: 实现后台下载任务与右下角下载卡片

**Goal:** 用户点击“立即更新”后，应用负责下载更新包，并在右下角展示进度、速度、失败重试状态。

**Files:**
- Modify: `desktop/bridge.go`
- Modify: `desktop/host.go`
- Create: `desktop/update_download.go`
- Create: `ui/src/components/update-download-toast.tsx`
- Create: `ui/src/contexts/update-download-context.tsx`
- Modify: `ui/src/App.tsx`
- Modify: `ui/src/lib/desktop.ts`
- Modify: `ui/src/i18n/locales/zh.json`
- Modify: `ui/src/i18n/locales/en.json`
- Test: `desktop/host_test.go`

### 任务说明

- [ ] 新增下载接口：
  - `POST /api/desktop/update/download`
  - `GET /api/desktop/update/status`
  - `POST /api/desktop/update/retry`
  - `POST /api/desktop/update/cancel`
- [ ] 宿主层维护后台下载协程，负责：
  - 进度统计
  - 速度计算
  - 错误状态
  - SHA256 校验
- [ ] 下载状态变化通过桌面事件推送到前端。
- [ ] 前端新增右下角下载卡片，展示：
  - 当前版本
  - 进度条
  - 已下载/总大小
  - 速度
  - 错误信息
  - `取消`
  - `重试`
- [ ] 下载完成后切换为：
  - `已下载完成`
  - `重启并更新`
  - `稍后`

### 验收标准

- [ ] 点击“立即更新”后，界面右下角出现下载卡片。
- [ ] 失败时可以重试。
- [ ] 校验失败时不能进入待更新状态。
- [ ] 应用重启后如果已下载完成，仍可恢复“重启并更新”状态。

---

## Task 6: 实现最小 helper/updater 与“重启并更新”

**Goal:** 下载完成后，由独立 updater 进程接管更新执行，主程序退出后完成安装或替换，再拉起新版本。

**Files:**
- Create: `cmd/updater/main.go`
- Create: `desktop/update_apply.go`
- Modify: `desktop/bridge.go`
- Modify: `desktop/host.go`
- Modify: `.github/workflows/release.yaml`
- Modify: `desktop/build/darwin/Taskfile.yml`
- Modify: `desktop/build/windows/Taskfile.yml`
- Modify: `desktop/build/config.yml`
- Test: `desktop/host_test.go`

### 任务说明

- [ ] 新增独立 updater 可执行程序。
- [ ] 新增接口：
  - `POST /api/desktop/update/apply`
- [ ] 主程序点击“重启并更新”后：
  - 写入待应用任务
  - 启动 updater
  - 主程序退出
- [ ] updater 的职责：
  - 等待主程序退出
  - macOS：解压 zip，替换 `.app`，启动新版本
  - Windows：执行 installer，安装完成后启动应用
  - 写更新日志
- [ ] 发布流程把 updater 一起打包到发行产物中，或作为主应用内部资源嵌入。

### 平台细节

- [ ] macOS：
  - 更新资产使用 `.zip`
  - updater 解压后替换 `.app`
- [ ] Windows：
  - 更新资产使用 installer `.exe`
  - 第一版允许 installer 具备界面，不要求完全静默

### 验收标准

- [ ] 下载完成后点击“重启并更新”，应用能退出并启动更新执行流程。
- [ ] 更新完成后能重新打开新版本。
- [ ] 更新失败时有日志可查。

---

## Task 7: 调整版本角标与轻提示，接入静默检查结果

**Goal:** 启动后静默检查发现新版本时，给出轻提示，但不打断用户当前工作。

**Files:**
- Modify: `ui/src/components/app-sidebar.tsx`
- Modify: `ui/src/components/version-info.tsx`
- Create: `ui/src/components/update-available-toast.tsx`
- Modify: `ui/src/App.tsx`
- Test: `ui/src/components/version-info.test.tsx`

### 任务说明

- [ ] 恢复或重构侧边栏版本角标逻辑，不再依赖旧的 `/version` 被动更新字段。
- [ ] 将角标数据改为来自统一更新状态。
- [ ] 静默检查发现新版本时可触发一次 toast：
  - `发现新版本 vX.Y.Z`
  - `立即查看`

### 验收标准

- [ ] 启动静默检查发现更新时，有且仅有一次轻提示。
- [ ] 被忽略版本不再弹提示。

---

## Task 8: 补充测试、文档与发布说明

**Goal:** 为更新链路补齐必要测试和文档，确保后续维护可控。

**Files:**
- Modify: `pkg/version/version_test.go`
- Modify: `internal/server/server_test.go`
- Create: `desktop/update_download_test.go`
- Create: `ui/src/hooks/use-desktop-update.test.tsx`
- Modify: `desktop/README.md`
- Modify: `README.md`
- Modify: `README_zh.md`
- Modify: `docs/plans/2026-04-07-desktop-update-system-design.md`

### 任务说明

- [ ] 后端测试覆盖：
  - 版本比较三态
  - 资产匹配
  - 忽略版本
- [ ] 前端测试覆盖：
  - 关于页状态展示
  - 忽略版本交互
  - 下载卡片状态切换
- [ ] 桌面端测试覆盖：
  - 下载状态持久化
  - 校验失败
  - 待应用状态恢复
- [ ] README 增加说明：
  - 更新系统仅支持 macOS / Windows
  - 应用内更新依赖 GitHub Releases 资产命名规范

### 验收标准

- [ ] 更新系统文档与代码实现一致。
- [ ] 关键路径具备可重复执行的自动化验证。

---

## 建议的实际落地节奏

推荐按以下顺序推进：

1. Task 1
2. Task 2
3. Task 3
4. Task 4
5. Task 5
6. Task 7
7. Task 6
8. Task 8

原因：

- 先把检查逻辑和状态模型做稳。
- 再做前端入口与下载。
- helper/updater 放在下载能力稳定后接入，风险更低。

---

## 当前最小可交付里程碑

如果需要尽快形成第一个可演示版本，建议里程碑定义为：

- 启动后静默检查
- 手动检查
- 可忽略版本
- 右下角下载卡片
- 下载完成后可显示“重启并更新”按钮

这一版不要求 updater 最终完全打通，也已经能验证大部分交互和状态流。
