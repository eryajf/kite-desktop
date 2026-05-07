# Kite Desktop 本地配置持久化排查与治理建议

## 1. 背景

本次排查起因是一个已确认问题：

- 用户将右上角主题切换为暗色后，重启应用会丢失
- 根因是该设置此前只写入前端 `localStorage`，没有进入桌面端可长期持久化的偏好层

基于这个现象，对 `ui/` 下所有 `localStorage` / `sessionStorage` 使用点做了进一步排查，目标是识别：

1. 哪些属于长期设置，应该持久化
2. 哪些属于工作现场恢复状态，可按产品取舍决定是否持久化
3. 哪些只是临时态，应保持本地会话级存储即可

## 2. 排查范围

本次排查覆盖的主要区域包括：

- `ui/src/components/`
- `ui/src/contexts/`
- `ui/src/hooks/`
- `ui/src/lib/`
- `ui/src/i18n/`

重点关注对象：

- 用户显式修改的设置项
- 用户重启后会期待保留的状态
- 已经存在桌面偏好接口但未复用的实现
- 目前仅靠浏览器存储维持的桌面应用行为

## 3. 结论摘要

### 3.1 总体结论

当前仓库中确实仍有多处配置/偏好项直接存储在 `localStorage`，其中一部分与这次主题问题属于同一类问题。

这些问题的共同特征是：

- 用户会把它理解为“设置”
- 用户很可能期待它在应用重启后仍然保留
- 但实现上仍停留在前端本地存储，没有进入桌面偏好持久化链路

### 3.2 建议治理原则

建议将状态分为三类：

1. 长期设置
   用户主动设置，且明确期待重启后保留
   应进入桌面偏好持久化层

2. 恢复型状态
   用于恢复上次工作现场
   可按产品策略决定是否持久化

3. 临时态
   只服务当前页面或当前会话
   应保留在组件状态或 `sessionStorage`

## 4. 分类清单

### 4.1 建议持久化的长期设置

这类最接近“正式配置”，建议优先纳入桌面偏好体系。

#### A. 全局外观与语言

##### 1. 主题、配色、字体

文件：

- `ui/src/components/appearance-provider.tsx`

状态：

- 已开始接入桌面偏好持久化
- 属于正确方向

结论：

- 应继续保留在正式偏好结构中

##### 2. 语言设置

文件：

- `ui/src/i18n/index.ts`

当前 key：

- `i18nextLng`

判断：

- 语言是全局设置
- 明确属于长期偏好
- 不应仅依赖 `localStorage`

建议：

- 纳入 `appearance` 或 `general` 偏好块

#### B. 日志查看器偏好

文件：

- `ui/src/components/log-viewer.tsx`

当前 key：

- `log-viewer-theme`
- `log-viewer-tail-lines`
- `log-viewer-word-wrap`
- `log-viewer-show-line-numbers`
- `log-viewer-font-size`

判断：

- 都是用户显式选择的查看器偏好
- 用户有较强预期“下次打开仍保持”
- 与这次主题丢失问题属于同类

建议：

- 统一纳入 `viewer.logViewer` 偏好块

#### C. 终端偏好

文件：

- `ui/src/components/terminal-content.tsx`

当前 key：

- `terminal-theme`
- `terminal-cursor-style`
- 复用 `log-viewer-font-size`

判断：

- 属于明确长期偏好
- 当前仍只是 `localStorage`
- `terminal` 和 `log viewer` 共用字号 key 的做法语义不够清晰

建议：

- 纳入 `viewer.terminal`
- 终端字号建议单独显式建字段，不再隐式复用日志字号 key

#### D. 资源表格列显示偏好

文件：

- `ui/src/components/resource-table.tsx`

当前 key：

- `${cluster}-${resourceName}-columnVisibility`

判断：

- 这不是临时筛选，而是展示偏好
- 用户通常会期待重启后仍保留

建议：

- 纳入 `resourceTable.columnVisibilityByCluster`

#### E. 设置提示卡关闭状态

文件：

- `ui/src/components/settings-hint.tsx`

当前 key：

- `settings-hint-dismissed`

判断：

- 这是用户明确做出的“不再提示”选择
- 属于小型长期偏好

建议：

- 纳入 `ui.settingsHintDismissed`

### 4.2 建议持久化的工作区上下文

这类不是传统“设置”，但在桌面产品里很适合长期保留。

#### A. 当前集群与最近集群

文件：

- `ui/src/contexts/cluster-context.tsx`
- `ui/src/App.tsx`
- `ui/src/components/global-search.tsx`

当前 key：

- `current-cluster`
- `recent-clusters`

判断：

- 这是桌面应用级上下文
- 用户重启后回到上次使用集群，体验更合理
- 目前它们已经是多个模块共享的全局约定

建议：

- 纳入 `workspace.currentCluster`
- 纳入 `workspace.recentClusters`

#### B. 当前 namespace 选择

文件：

- `ui/src/components/resource-table.tsx`

当前 key：

- `${currentCluster}selectedNamespace`

判断：

- 这是工作现场的一部分
- 尤其在桌面模式下，恢复上次集群/命名空间上下文是合理的

建议：

- 纳入 `workspace.selectedNamespaceByCluster`

### 4.3 可选持久化的恢复型状态

这类不是必须，但如果产品目标是“更像 IDE，一打开尽量恢复现场”，可以考虑纳入。

#### A. 全局搜索历史

文件：

- `ui/src/lib/global-search-history.ts`

当前 key：

- `global-search-history-v1-<cluster>`

判断：

- 更像本地历史记录
- 不是强配置
- 是否需要正式持久化，取决于产品定位

建议：

- 可暂缓
- 若后续要做“最近访问/工作历史”，再纳入单独的搜索或历史状态结构

#### B. AI Sidecar 页面上下文

文件：

- `ui/src/contexts/ai-chat-context.tsx`

当前 key：

- `ai-chat-sidecar-page-context-<cluster>`

判断：

- 用于 sidecar 恢复上次上下文
- 更像恢复现场，而非正式设置

建议：

- 可以继续保留本地
- 或在未来并入 `workspaceState`，但不建议和正式 `preferences` 混在一起

#### C. AI 当前活动会话

文件：

- `ui/src/hooks/use-ai-chat.ts`

当前 key：

- `ai-chat-active-session-<cluster>`

判断：

- 属于恢复型状态
- 产品上可以成立，但不是当前最紧急问题

建议：

- 暂不优先改
- 后续如要支持“重启后回到上次 AI 会话”，再进入恢复状态层

### 4.4 建议保持临时态的内容

这类不建议进入正式持久化偏好体系。

#### A. 表格搜索与过滤状态

文件：

- `ui/src/components/resource-table.tsx`

当前 key：

- `${cluster}-${resourceName}-searchQuery`
- `${cluster}-${resourceName}-columnFilters`

存储位置：

- `sessionStorage`

判断：

- 明显属于当前浏览过程中的临时态
- 不建议在重启后恢复
- 保持会话级最合理

建议：

- 维持现状

#### B. 表格分页大小

文件：

- `ui/src/components/resource-table.tsx`

当前 key：

- `${cluster}-${resourceName}-pageSize`

存储位置：

- `sessionStorage`

判断：

- 介于临时态与长期偏好之间
- 若团队认为“分页大小是用户习惯”，可以提升为正式偏好
- 若只是当前浏览环境，则保持会话级即可

建议：

- 作为待定项，由产品或交互统一决定

#### C. AI 历史迁移标记

文件：

- `ui/src/hooks/use-ai-chat.ts`

当前 key：

- `ai-chat-history-migrated-v1-<cluster>`

判断：

- 属于纯技术迁移标记
- 不应进入正式偏好体系

建议：

- 维持现状

## 5. 推荐的偏好模型设计

为避免后续继续出现“一项设置一个接口、一堆零散 key”的问题，建议按域收口。

推荐的偏好结构如下：

```json
{
  "version": 1,
  "appearance": {
    "theme": "system",
    "colorTheme": "default",
    "font": "maple",
    "language": "zh"
  },
  "viewer": {
    "logViewer": {
      "theme": "classic",
      "tailLines": 100,
      "wordWrap": true,
      "showLineNumbers": false,
      "fontSize": 14
    },
    "terminal": {
      "theme": "classic",
      "cursorStyle": "bar",
      "fontSize": 14
    }
  },
  "workspace": {
    "currentCluster": "",
    "recentClusters": [],
    "selectedNamespaceByCluster": {}
  },
  "resourceTable": {
    "columnVisibilityByCluster": {}
  },
  "ui": {
    "settingsHintDismissed": false
  }
}
```

## 6. 推荐接口方案

### 6.1 推荐方向

推荐逐步收敛到统一偏好对象，而不是持续增加分散字段。

可选方案有两种。

#### 方案 A：统一对象接口

- `GET /api/v1/preferences`
- `PUT /api/v1/preferences`

优点：

- 结构最统一
- 后续扩展最方便

缺点：

- 前端更新时要注意局部 merge
- 并发写入时要处理覆盖问题

#### 方案 B：按域拆分接口

- `GET/PUT /api/v1/preferences/appearance`
- `GET/PUT /api/v1/preferences/viewer`
- `GET/PUT /api/v1/preferences/workspace`
- `GET/PUT /api/v1/preferences/resource-table`
- `GET/PUT /api/v1/preferences/ui`

优点：

- 改造更渐进
- 模块边界清晰
- 风险较低

缺点：

- 接口数量更多

### 建议

结合当前仓库已有风格，建议：

- 短期采用按域拆分接口
- 服务端内部仍统一挂到一个 `DesktopPreferences` 结构
- 后期再决定是否暴露统一总接口

## 7. 实施优先级建议

### 7.1 第一期

优先解决最像正式设置、用户最容易感知为 bug 的项。

第一优先级：

- `LogViewer` 偏好
- `Terminal` 偏好
- 语言设置

第二优先级：

- `current-cluster`
- `recent-clusters`
- `selectedNamespace`

第三优先级：

- `columnVisibility`
- `settings-hint-dismissed`

### 7.2 第二期

处理恢复型状态与可选保留项。

- 全局搜索历史
- AI sidecar 页面上下文
- AI 当前活动会话
- 是否将 `pageSize` 升级为长期偏好

## 8. 判定规则建议

后续遇到新的状态项时，建议统一用以下规则判断：

### 应持久化

同时满足以下两个条件时，默认应进入桌面偏好层：

1. 用户主动设置过
2. 用户会期待重启后仍保留

### 可选持久化

满足以下条件时，可视产品需要决定：

1. 不是正式设置
2. 但对“恢复现场”有明显价值

### 不应持久化

满足以下任一条件时，建议保留临时态：

1. 只是当前页面过程中的中间状态
2. 只是一次性搜索或筛选输入
3. 是技术迁移标记或内部缓存

## 9. 最终建议

### 明确应该进入长期偏好的项

- 外观主题、配色、字体
- 语言
- 日志查看器偏好
- 终端偏好
- 表格列显示偏好
- 当前集群
- 最近集群
- 当前命名空间
- 不再提示类 UI 选项

### 可延后处理的恢复项

- 搜索历史
- AI sidecar 页面上下文
- AI 当前活动会话

### 建议继续保持临时态的项

- 搜索词
- 过滤器
- 迁移标记
- 其他纯会话过程状态

## 10. 附录：重点文件列表

### 长期设置相关

- `ui/src/components/appearance-provider.tsx`
- `ui/src/i18n/index.ts`
- `ui/src/components/log-viewer.tsx`
- `ui/src/components/terminal-content.tsx`
- `ui/src/components/resource-table.tsx`
- `ui/src/components/settings-hint.tsx`

### 工作区上下文相关

- `ui/src/contexts/cluster-context.tsx`
- `ui/src/App.tsx`
- `ui/src/components/global-search.tsx`

### 恢复型状态相关

- `ui/src/lib/global-search-history.ts`
- `ui/src/contexts/ai-chat-context.tsx`
- `ui/src/hooks/use-ai-chat.ts`
