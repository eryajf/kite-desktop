# 桌面端应用内更新技术设计

## 概述

本文档定义 `kite-desktop` 的桌面端应用内更新方案。

设计目标是：

- 仅支持 `macOS` 与 `Windows` 两个平台。
- 用户点击“检查更新”时主动检查版本。
- 应用每次重新打开后，后台静默检查一次更新。
- 更新为非强制，用户可以选择更新、忽略当前版本或暂不处理。
- 用户选择更新后，应用内负责下载安装包，并在右下角展示下载进度、速度、失败重试状态。
- 下载完成后提示用户“重启并更新”。
- 不追求运行中的无感热更新；目标是“下载新版本 + 重启执行更新”。

## 目标

- 为桌面端提供一套统一的版本检查、下载、重启更新链路。
- 让用户无需手动打开 GitHub Releases 页面即可完成更新。
- 保持更新链路与当前 GitHub Releases 发布流程兼容。
- 将平台差异收敛到 macOS 与 Windows 两类实现中。
- 为后续引入 helper/updater 预留明确的接口和状态机。

## 非目标

- 不支持 Linux 平台的应用内更新。
- 不实现运行中直接替换当前进程的“真热更新”。
- 不实现增量包、差分更新、P2P 更新等复杂分发机制。
- 不引入独立更新服务；版本源仍然基于 GitHub Releases。
- 不在首次版本中实现静默自动下载并自动安装。

## 产品约束

### 一、支持平台

- 支持：
  - macOS
  - Windows
- 不支持：
  - Linux

### 二、更新触发时机

存在两类检查时机：

1. 启动后静默检查
- 应用每次重新打开时执行一次。
- 检查在后台完成，不弹阻断式对话框。
- 如果发现新版本：
  - 在关于页展示更新状态。
  - 可在侧边栏版本角标、标题栏轻提示或 toast 中提示有更新。
- 如果用户已明确忽略该版本，则本次启动不再提示。

2. 用户手动检查
- 仅当用户点击“检查更新”按钮时触发。
- 该检查应视为强制刷新，不能只依赖缓存结果。
- 结果要立即反馈到关于页。

### 三、更新策略

- 更新非强制。
- 用户可选择：
  - 立即更新
  - 忽略当前版本
  - 稍后处理
- 忽略仅针对某一个具体版本生效，例如 `v0.1.3`。
- 当远程最新版本升级到更高版本时，例如 `v0.1.4`，应重新提示。

## 当前发布链路前提

项目当前已经具备：

- GitHub Releases 发布流程
- 平台安装包产物
- `SHA256SUMS`
- 运行时版本注入能力

因此本方案优先复用 GitHub Releases 作为更新源，不额外引入新的更新服务。

## 发布资产规范

为了支持应用内更新，需要对 Release 资产命名进行标准化。

### 一、macOS

建议同时保留两类资产：

- 面向手动下载安装：
  - `Kite-vX.Y.Z-macos-arm64.dmg`
  - `Kite-vX.Y.Z-macos-amd64.dmg`
- 面向应用内更新：
  - `Kite-vX.Y.Z-macos-arm64.zip`
  - `Kite-vX.Y.Z-macos-amd64.zip`

原因：

- `.dmg` 更适合用户手动安装。
- `.zip` 更适合应用下载后解压、交给 helper 执行替换。

### 二、Windows

建议保留安装器：

- `Kite-vX.Y.Z-windows-amd64-installer.exe`
- `Kite-vX.Y.Z-windows-arm64-installer.exe`

Windows 第一版不要求无交互静默安装，允许重启后启动安装器完成升级。

### 三、校验文件

Release 中保留：

- `SHA256SUMS`

每个可更新资产都必须在 `SHA256SUMS` 中有对应条目。

## 版本检查设计

### 一、远程数据来源

版本检查仍基于 GitHub Releases：

- `GET /repos/eryajf/kite-desktop/releases/latest`

远程检查需要获取：

- `tag_name`
- `html_url`
- `body`
- `published_at`
- `assets[]`

### 二、当前版本比较规则

版本比较继续使用 semver：

- 去掉前缀 `v`
- 使用 semver 解析
- 只接受合法 semver

比较结果需要区分三种状态：

1. `latest > current`
- 有新版本

2. `latest == current`
- 当前已是最新版本

3. `latest < current`
- 当前版本高于远程最新发布版本
- 常见于本地测试构建或内部预发布版本

UI 不应再把第 2 和第 3 种状态混为一谈。

### 三、平台资产匹配规则

后端或桌面宿主层根据当前平台和架构，从 Release assets 中选出最合适资产。

匹配维度：

- `GOOS`
  - `darwin`
  - `windows`
- `GOARCH`
  - `amd64`
  - `arm64`

匹配规则：

1. macOS
- 优先 `.zip`
- 其次 `.dmg` 仅用于“打开下载页”或兜底提示，不用于自动安装链路

2. Windows
- 选择 `*-installer.exe`

如果当前平台找不到可更新资产：

- 仍返回版本信息
- 但标记 `assetAvailable = false`
- 前端显示“检测到新版本，但当前平台暂无自动更新包”

## 本地状态设计

更新相关状态保存在桌面端本地配置中。

建议新增 `update_state.json` 或并入现有桌面配置存储。

建议字段：

```json
{
  "ignoredVersion": "v0.1.3",
  "lastCheckedAt": "2026-04-07T14:12:00Z",
  "lastCheckResultVersion": "v0.1.3",
  "download": {
    "version": "v0.1.3",
    "status": "downloading",
    "assetName": "Kite-v0.1.3-macos-arm64.zip",
    "targetPath": "/tmp/kite-update/Kite-v0.1.3-macos-arm64.zip",
    "receivedBytes": 10485760,
    "totalBytes": 52428800,
    "speedBytesPerSec": 1835008,
    "sha256": "..."
  },
  "readyToApply": {
    "version": "v0.1.3",
    "assetName": "Kite-v0.1.3-macos-arm64.zip",
    "path": "/tmp/kite-update/Kite-v0.1.3-macos-arm64.zip"
  }
}
```

## 更新状态机

前端和桌面宿主统一围绕以下状态工作：

- `idle`
- `checking`
- `available`
- `ignored`
- `downloading`
- `download_failed`
- `downloaded`
- `applying`

状态说明：

1. `idle`
- 尚未检查

2. `checking`
- 正在访问 GitHub Releases

3. `available`
- 存在可更新版本，且有可用资产

4. `ignored`
- 当前远程最新版本已被忽略

5. `downloading`
- 正在下载更新包

6. `download_failed`
- 下载失败，可重试

7. `downloaded`
- 下载与校验完成，等待用户点击“重启并更新”

8. `applying`
- 已启动更新执行流程，主程序即将退出

## 界面设计

### 一、关于页

关于页承担更新主入口职责。

应展示：

- 当前版本
- 构建时间
- 提交哈希
- 当前更新状态
- 更新按钮
- 忽略按钮
- 查看 Release 按钮

当存在新版本时：

- 展示版本差异
- 展示发布日期
- 展示摘要说明

### 二、启动后的轻提示

当应用启动后静默检查发现新版本时：

- 不弹阻断式 modal
- 只显示轻提示

可选形式：

- 右上角 toast
- 侧边栏版本角标 `New`
- 关于页 tab 状态点

### 三、右下角下载卡片

当用户点击“立即更新”并启动下载后，在右下角显示更新下载卡片。

卡片内容：

- 标题：`正在下载 vX.Y.Z`
- 进度条
- 已下载大小 / 总大小
- 当前下载速度
- 下载失败原因
- 操作按钮：
  - `取消`
  - `重试`
  - `后台继续`

下载完成后卡片切换为：

- `vX.Y.Z 已下载完成`
- `重启并更新`
- `稍后`

## 桌面端接口设计

### 一、检查更新

`POST /api/v1/version/check-update`

请求：

```json
{
  "force": true
}
```

响应建议扩展为：

```json
{
  "currentVersion": "0.1.2",
  "latestVersion": "0.1.3",
  "comparison": "update_available",
  "hasNewVersion": true,
  "releaseUrl": "https://github.com/eryajf/kite-desktop/releases/tag/v0.1.3",
  "releaseNotes": "bug fixes...",
  "publishedAt": "2026-04-07T14:00:00Z",
  "checkedAt": "2026-04-07T14:10:00Z",
  "ignored": false,
  "asset": {
    "name": "Kite-v0.1.3-macos-arm64.zip",
    "downloadUrl": "https://...",
    "size": 52428800,
    "sha256": "..."
  },
  "assetAvailable": true
}
```

其中 `comparison` 建议枚举为：

- `update_available`
- `up_to_date`
- `local_newer`
- `uncomparable`

### 二、忽略版本

`POST /api/desktop/update/ignore`

请求：

```json
{
  "version": "v0.1.3"
}
```

语义：

- 将该版本记录为本地忽略版本

### 三、开始下载

`POST /api/desktop/update/download`

请求：

```json
{
  "version": "v0.1.3",
  "assetName": "Kite-v0.1.3-macos-arm64.zip",
  "downloadUrl": "https://...",
  "sha256": "...",
  "size": 52428800
}
```

语义：

- 创建后台下载任务
- 返回任务 ID 或直接返回当前任务状态

### 四、查询下载状态

建议两种方案二选一：

1. `GET /api/desktop/update/status`
2. 桌面事件推送

推荐方案：

- 下载过程使用事件推送
- 页面初始化时再调用一次 `status` 做恢复

状态返回：

```json
{
  "status": "downloading",
  "version": "v0.1.3",
  "receivedBytes": 10485760,
  "totalBytes": 52428800,
  "speedBytesPerSec": 1835008,
  "error": ""
}
```

### 五、执行更新

`POST /api/desktop/update/apply`

请求：

```json
{
  "version": "v0.1.3"
}
```

语义：

- 启动 updater/helper
- 传递下载包路径、当前应用路径、目标版本
- 主程序准备退出

## 下载设计

### 一、下载位置

建议统一下载到桌面端专用临时更新目录，例如：

- macOS: `~/Library/Application Support/Kite/updates/`
- Windows: `%AppData%/Kite/updates/`

不建议使用完全随机的系统临时目录作为唯一存储位置，否则应用重启恢复下载状态会较难处理。

### 二、速度与进度统计

下载器需周期性上报：

- `receivedBytes`
- `totalBytes`
- `speedBytesPerSec`

更新频率建议：

- 300ms 到 1000ms 一次

### 三、失败重试

第一版建议支持：

- 手动重试

可选支持：

- 自动重试 1 到 2 次

失败原因建议区分：

- 网络错误
- 校验失败
- 磁盘写入失败
- 权限不足

### 四、校验

下载完成后必须进行：

1. 文件完整性校验
- 使用 `SHA256SUMS`

2. 平台签名校验
- 第一版可暂缓
- 但文档层面应预留：
  - macOS 应用签名/公证校验
  - Windows Authenticode 校验

## 更新执行设计

### 一、为什么需要 helper/updater

主程序不适合直接替换自身文件，原因包括：

- 当前进程可能锁定自身二进制或安装目录
- 替换失败后难以恢复
- 各平台安装行为不同

因此建议引入一个独立的 helper/updater 进程。

### 二、helper/updater 职责

helper 的职责应保持最小化：

- 接收主程序传递的更新任务参数
- 等待主程序退出
- 执行解压、替换或启动安装器
- 完成后拉起新版本
- 将失败日志落到更新日志文件

### 三、macOS 流程

建议使用 `.zip` 作为应用内更新资产。

流程：

1. 主程序下载 `zip`
2. 校验 SHA256
3. 用户点击“重启并更新”
4. 主程序启动 helper，并传入：
   - zip 路径
   - 当前 `.app` 路径
   - 目标版本
5. 主程序退出
6. helper 解压 zip 到临时目录
7. helper 用新 `.app` 替换旧 `.app`
8. helper 启动新应用

### 四、Windows 流程

建议使用 installer `.exe` 作为应用内更新资产。

流程：

1. 主程序下载 installer
2. 校验 SHA256
3. 用户点击“重启并更新”
4. 主程序启动 helper，并传入：
   - installer 路径
   - 当前应用路径
   - 目标版本
5. 主程序退出
6. helper 启动 installer
7. 安装完成后由 helper 或安装器拉起新版本

第一版允许安装器存在交互界面，不要求完全静默安装。

## 启动检查策略

### 一、缓存策略

建议保留更新检查缓存，但区分来源：

1. 自动静默检查
- 可复用短缓存，例如 6 小时到 24 小时

2. 用户手动检查
- 必须 `force=true`
- 直接刷新远程结果

### 二、忽略版本策略

自动检查时：

- 如果远程最新版本等于 `ignoredVersion`，则状态为 `ignored`
- 不弹出提醒

手动检查时：

- 仍展示远程结果
- 但页面上要标记“此版本已被忽略”

## 安全性设计

### 一、来源限制

- 更新源仅允许来自 GitHub 官方 Release 资产 URL
- 不允许任意 URL 注入下载任务

### 二、校验要求

- 必须校验 SHA256
- 若校验失败，不允许进入“重启并更新”状态

### 三、日志

更新相关日志写入本地日志目录，方便故障排查：

- 检查更新日志
- 下载日志
- 更新执行日志

## 失败与恢复

### 一、下载中断恢复

第一版建议：

- 应用重启后读取本地 `download` 状态
- 若任务未完成，则显示“上次更新下载未完成”
- 提供“重新下载”而不是复杂断点续传

### 二、下载完成但尚未更新

如果应用关闭前已经下载完成：

- 启动后恢复 `downloaded` 状态
- 继续显示“重启并更新”按钮

### 三、更新执行失败

若 helper 执行失败：

- 主程序下次启动后应能检测到上一次更新失败
- 提示用户查看日志或重新下载

## 第一阶段实施范围

第一阶段建议只做以下内容：

1. 启动后静默检查一次更新
2. 关于页手动检查更新
3. 忽略当前版本
4. 右下角下载卡片
5. 下载进度、速度、失败重试
6. SHA256 校验
7. 下载完成后“重启并更新”
8. 最小 helper/updater

不进入第一阶段的内容：

- 自动后台下载安装
- 自动静默安装
- 签名校验强化
- 差分更新

## 建议的实现顺序

### 阶段一：检查与状态

- 扩展版本检查返回结构
- 引入 `comparison` 三态结果
- 引入 `ignoredVersion`
- 实现启动静默检查

### 阶段二：下载能力

- 新增下载接口
- 新增下载状态与事件
- 实现右下角下载卡片
- 实现 SHA256 校验

### 阶段三：更新执行

- 引入 helper/updater
- 实现 macOS zip 更新流程
- 实现 Windows installer 更新流程
- 实现“重启并更新”

## 风险与开放问题

### 一、macOS 资产发布链路

当前 Release 需要新增 `.zip` 资产。

若没有 `.zip`，则无法优雅支撑应用内更新链路。

### 二、Windows 安装器行为

需要确认当前 NSIS 安装器是否支持：

- 静默参数
- 安装完成后自动重启应用

如果不支持，需在 helper 中补一层控制。

### 三、签名与公证

第一版不强制做签名校验，但正式发布前建议补齐。

### 四、更新提醒的 UI 位置

当前可选方案包括：

- 关于页状态更新
- 侧边栏版本角标
- 右上角 toast

最终需要在实现前确认一个主方案，避免重复提示。

## 结论

在放弃 Linux 平台后，桌面端更新系统可以收敛为：

- GitHub Releases 作为版本源
- 应用启动静默检查 + 用户手动检查
- 非强制更新 + 支持忽略当前版本
- 应用内下载更新包并展示右下角下载状态
- 下载完成后通过 helper/updater 执行“重启并更新”

这是一个复杂度可控、产品体验足够完整、并且与当前项目发布链路兼容的方案。
