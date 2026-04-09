# 桌面端移除鉴权与初始化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 [docs/superpowers/specs/2026-04-07-桌面端移除鉴权与初始化设计.md](../superpowers/specs/2026-04-07-%E6%A1%8C%E9%9D%A2%E7%AB%AF%E7%A7%BB%E9%99%A4%E9%89%B4%E6%9D%83%E4%B8%8E%E5%88%9D%E5%A7%8B%E5%8C%96%E8%AE%BE%E8%AE%A1.md) 把 Kite 收敛为"打开即进入主应用、无集群也是合法状态、无 auth/init/RBAC 管理台残留"的桌面端产品。

**Architecture:** 先拆掉前端 `/login`、`/setup`、`AuthContext` 对主应用壳的控制，让桌面端只依赖运行时状态和集群状态。再把后端从 `auth/admin/protected` 三段式路由改成"桌面核心能力 API"——**同步**把偏好接口和 general-setting 接口迁出 admin 组，确保前端 Task 4 和后端 Task 5 同批完成不断层。最后逐步删掉 `pkg/auth`、Kite 自身 RBAC、用户/OAuth/LDAP/API Key/审计管理链路，并同步处理 `ResourceHistory.OperatorID` 这类对用户模型的隐式依赖。

**Tech Stack:** Go, Gin, GORM, React 19, React Router, TanStack Query, Vitest, Wails v3 desktop runtime.

---

### Task 1: 让前端根路由直入主应用

**Files:**
- Modify: `ui/src/routes.tsx`
- Modify: `ui/src/App.tsx`
- Modify: `ui/src/lib/api-client.ts`
- Modify: `ui/src/lib/api/system.ts`
- Delete: `ui/src/components/protected-route.tsx`
- Delete: `ui/src/components/protected-route.test.tsx`
- Delete: `ui/src/components/init-check-route.tsx`
- Delete: `ui/src/components/init-check-route.test.tsx`
- Delete: `ui/src/pages/login.tsx`
- Delete: `ui/src/pages/initialization.tsx`
- Test: `ui/src/routes.test.tsx`

- [ ] **Step 1: Write the failing route tests**

```tsx
it('renders the root app without login/setup guards', async () => {
  renderRouter('/')
  expect(screen.queryByText(/login/i)).not.toBeInTheDocument()
  expect(screen.queryByText(/setup/i)).not.toBeInTheDocument()
})

it('does not register /login or /setup routes', async () => {
  expect(() => renderRouter('/login')).toThrow()
  expect(() => renderRouter('/setup')).toThrow()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir ui exec vitest run ui/src/routes.test.tsx`
Expected: FAIL because `routes.tsx` still imports `ProtectedRoute`, `InitCheckRoute`, `LoginPage`, and `InitializationPage`.

- [ ] **Step 3: Write minimal implementation**

In `ui/src/routes.tsx`, replace the current router definition with one that removes `InitCheckRoute` and `ProtectedRoute` wrappers:

```tsx
export const router = createBrowserRouter([
  {
    path: '/ai-chat-box',
    element: <StandaloneAIChatApp />,
  },
  {
    path: '/',
    element: <App />,
    children: [/* retain all existing desktop child routes as-is */],
  },
])
```

In `ui/src/lib/api-client.ts`, remove the 401-redirect logic (桌面端不应跳转到登录页):

```ts
// Remove the following block:
// if (response.status === 401) {
//   window.location.href = '/login'
// }
// Replace with:
if (response.status === 401) {
  throw new Error('Unauthorized')
}
```

In `ui/src/lib/api/system.ts`, delete the three functions: `useInitCheck`, `createSuperUser`, `importClusters`.

Delete the files listed above.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir ui exec vitest run ui/src/routes.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ui/src/routes.tsx ui/src/App.tsx ui/src/lib/api-client.ts ui/src/lib/api/system.ts ui/src/routes.test.tsx
git rm ui/src/components/protected-route.tsx ui/src/components/protected-route.test.tsx ui/src/components/init-check-route.tsx ui/src/components/init-check-route.test.tsx ui/src/pages/login.tsx ui/src/pages/initialization.tsx
git commit -m "refactor: remove login and setup routes from desktop shell"
```

---

### Task 2: 用运行时状态替代 AuthContext，收缩 use-ai-chat 的用户语义

**Files:**
- Create: `ui/src/contexts/runtime-context.tsx`
- Modify: `ui/src/App.tsx`
- Modify: `ui/src/pages/settings.tsx`
- Modify: `ui/src/pages/overview.tsx`
- Modify: `ui/src/components/site-header.tsx`
- Modify: `ui/src/components/user-menu.tsx`
- Modify: `ui/src/components/global-search.tsx`
- Modify: `ui/src/components/floating-terminal.tsx`
- Modify: `ui/src/contexts/sidebar-config-context.tsx`
- Modify: `ui/src/hooks/use-ai-chat.ts`
- Delete: `ui/src/contexts/auth-context.tsx`
- Test: `ui/src/pages/settings.test.tsx`

- [ ] **Step 1: Write the failing settings/runtime tests**

```tsx
// ui/src/pages/settings.test.tsx
it('shows only desktop tabs in settings', () => {
  render(<SettingsPage />)
  expect(screen.getByText('Desktop')).toBeInTheDocument()
  expect(screen.queryByText('Authentication')).not.toBeInTheDocument()
  expect(screen.queryByText('RBAC')).not.toBeInTheDocument()
  expect(screen.queryByText('User')).not.toBeInTheDocument()
  expect(screen.queryByText('API Keys')).not.toBeInTheDocument()
  expect(screen.queryByText('Audit')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir ui exec vitest run ui/src/pages/settings.test.tsx`
Expected: FAIL because `SettingsPage` still depends on `useAuth()` and renders auth/admin tabs.

- [ ] **Step 3: Create the runtime context**

Create `ui/src/contexts/runtime-context.tsx`:

```tsx
import { createContext, useContext, useEffect, useState } from 'react'
import { getDesktopStatus } from '@/lib/api/system'

type RuntimeState = {
  isDesktop: boolean
  isReady: boolean
}

const RuntimeContext = createContext<RuntimeState>({ isDesktop: false, isReady: false })

export function RuntimeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<RuntimeState>({ isDesktop: false, isReady: false })

  useEffect(() => {
    getDesktopStatus()
      .then((res) => setState({ isDesktop: res.isDesktop, isReady: true }))
      .catch(() => setState({ isDesktop: false, isReady: true }))
  }, [])

  return <RuntimeContext.Provider value={state}>{children}</RuntimeContext.Provider>
}

export function useRuntime() {
  return useContext(RuntimeContext)
}
```

- [ ] **Step 4: Replace useAuth() across all consumers**

In each file, replace `const { user, isLocalMode, ... } = useAuth()` with the appropriate substitute:

- `ui/src/pages/settings.tsx`: remove `isLocalMode` check; settings tabs are now fixed to `['desktop', 'general', 'clusters', 'templates']` with no conditional rendering based on user/admin state.
- `ui/src/pages/overview.tsx`: delete all `user`/`admin`/`provider` gating; render the page unconditionally (no-cluster empty state will be handled in Task 3).
- `ui/src/components/user-menu.tsx`: remove avatar/provider/logout branch. Keep only local desktop actions (appearance toggle, language toggle). Replace the entire user section with a simple desktop app identifier.
- `ui/src/components/site-header.tsx`: remove `user.isAdmin()` check; replace `isLocalMode` with `useRuntime().isDesktop`.
- `ui/src/components/global-search.tsx`: remove `user` read; replace `isLocalMode` with `useRuntime().isDesktop`.
- `ui/src/components/floating-terminal.tsx`: remove `user` read; replace `isLocalMode` with `useRuntime().isDesktop`.
- `ui/src/contexts/sidebar-config-context.tsx`: remove `const { user } = useAuth()` and the `user.sidebar_preference` read. Sidebar preference will be migrated to local storage or the new preferences API in Task 4.
- `ui/src/hooks/use-ai-chat.ts`: replace the `user.Key()` based storage key with a fixed desktop key:

```ts
// Before (line 100-101):
// const { user } = useAuth()
// const username = user?.Key() || 'anonymous'

// After:
const username = 'desktop'
```

This removes the per-user history separation semantics (桌面端只有一个本地用户，不需要按用户名隔离历史记录).

In `ui/src/App.tsx`, replace `<AuthProvider>` with `<RuntimeProvider>` in the provider tree.

Delete `ui/src/contexts/auth-context.tsx`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --dir ui exec vitest run ui/src/pages/settings.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add ui/src/contexts/runtime-context.tsx ui/src/App.tsx ui/src/pages/settings.tsx ui/src/pages/overview.tsx ui/src/components/site-header.tsx ui/src/components/user-menu.tsx ui/src/components/global-search.tsx ui/src/components/floating-terminal.tsx ui/src/contexts/sidebar-config-context.tsx ui/src/hooks/use-ai-chat.ts ui/src/pages/settings.test.tsx
git rm ui/src/contexts/auth-context.tsx
git commit -m "refactor: replace auth context with desktop runtime state"
```

---

### Task 3: 把"无集群"做成稳定的桌面端空状态

**Files:**
- Modify: `ui/src/contexts/cluster-context.tsx`
- Modify: `ui/src/App.tsx`
- Modify: `ui/src/pages/overview.tsx`
- Modify: `ui/src/components/app-sidebar.tsx`
- Modify: `ui/src/components/site-header.tsx`
- Create: `ui/src/components/no-cluster-state.tsx`
- Test: `ui/src/pages/overview.test.tsx`
- Test: `ui/src/contexts/cluster-context.test.tsx`

- [ ] **Step 1: Write the failing no-cluster tests**

```tsx
// ui/src/pages/overview.test.tsx
it('renders an empty state when there are no clusters', () => {
  mockClusters([])
  render(<Overview />)
  expect(screen.getByText(/please configure a cluster/i)).toBeInTheDocument()
})

// ui/src/contexts/cluster-context.test.tsx
it('does not auto-select or crash when clusters is empty', () => {
  renderClusterProviderWith([])
  expect(localStorage.setItem).not.toHaveBeenCalledWith(
    'current-cluster',
    expect.any(String)
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir ui exec vitest run ui/src/pages/overview.test.tsx ui/src/contexts/cluster-context.test.tsx`
Expected: FAIL because `Overview` still fetches overview charts unconditionally and `ClusterGate` still treats cluster fetch as a hard prerequisite.

- [ ] **Step 3: Create the no-cluster state component**

Create `ui/src/components/no-cluster-state.tsx`:

```tsx
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

export function NoClusterState() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
      <p>{t('cluster.noCluster')}</p>
      <Button variant="outline" onClick={() => navigate('/settings?tab=clusters')}>
        {t('cluster.goToSettings')}
      </Button>
    </div>
  )
}
```

- [ ] **Step 4: Write minimal implementation**

In `ui/src/contexts/cluster-context.tsx`:
- `ClusterProvider` must treat `[]` as success (set `isLoading: false`, `clusters: []`), not error or indefinite loading.
- `ClusterGate` (or equivalent wrapper) must allow the app shell to render when `clusters.length === 0` — only block access to cluster-specific pages, not the entire app.

In `ui/src/pages/overview.tsx`:

```tsx
const { clusters, currentCluster } = useCluster()

if (!currentCluster) {
  return <NoClusterState />
}
// existing overview fetch/render logic below
```

In `ui/src/components/app-sidebar.tsx`: when `clusters.length === 0`, show a dedicated empty-state entry in the cluster selector instead of crashing or showing a stale error.

In `ui/src/components/site-header.tsx`: cluster selector must show a clear placeholder when `clusters.length === 0`.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --dir ui exec vitest run ui/src/pages/overview.test.tsx ui/src/contexts/cluster-context.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add ui/src/contexts/cluster-context.tsx ui/src/App.tsx ui/src/pages/overview.tsx ui/src/components/app-sidebar.tsx ui/src/components/site-header.tsx ui/src/components/no-cluster-state.tsx ui/src/pages/overview.test.tsx ui/src/contexts/cluster-context.test.tsx
git commit -m "feat: support empty desktop state without configured clusters"
```

---

### Task 4: 迁移偏好接口、迁移 general-setting 接口、删除旧设置组件

> **注意：** 本 task 的前端调用 `/api/v1/preferences/sidebar` 和 `/api/v1/settings/general`，后端需在 **Task 5** 中同步创建。本 task 的测试在 Task 5 完成后才能通过。建议 Task 4 和 Task 5 同批执行后再一起验证。

**Files:**
- Modify: `ui/src/components/sidebar-customizer.tsx`
- Modify: `ui/src/contexts/sidebar-config-context.tsx`
- Modify: `ui/src/components/settings/general-management.tsx`
- Modify: `ui/src/components/settings/cluster-management.tsx`
- Modify: `ui/src/components/settings/template-management.tsx`
- Delete: `ui/src/components/settings/authentication-management.tsx`
- Delete: `ui/src/components/settings/oauth-provider-management.tsx`
- Delete: `ui/src/components/settings/oauth-provider-dialog.tsx`
- Delete: `ui/src/components/settings/rbac-management.tsx`
- Delete: `ui/src/components/settings/rbac-dialog.tsx`
- Delete: `ui/src/components/settings/rbac-assignment-dialog.tsx`
- Delete: `ui/src/components/settings/user-management.tsx`
- Delete: `ui/src/components/settings/user-role-assignment.tsx`
- Delete: `ui/src/components/settings/apikey-management.tsx`
- Delete: `ui/src/components/settings/apikey-dialog.tsx`
- Delete: `ui/src/components/settings/audit-log.tsx`
- Modify: `ui/src/lib/api/admin.ts`
- Modify: `ui/src/i18n/locales/en.json`
- Modify: `ui/src/i18n/locales/zh.json`
- Test: `ui/src/contexts/sidebar-config-context.test.tsx`

- [ ] **Step 1: Write the failing sidebar preference tests**

```tsx
// ui/src/contexts/sidebar-config-context.test.tsx
it('persists sidebar config to the local preferences endpoint without user context', async () => {
  render(<SidebarConfigProvider>{null}</SidebarConfigProvider>)
  await act(() => toggleItemVisibility('pods'))
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/api/v1/preferences/sidebar'),
    expect.objectContaining({ method: 'PUT' })
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir ui exec vitest run ui/src/contexts/sidebar-config-context.test.tsx`
Expected: FAIL because sidebar config still reads `user.sidebar_preference` via `/api/users/sidebar_preference`.

- [ ] **Step 3: Migrate sidebar preference API calls**

In `ui/src/lib/api/admin.ts`, add the new desktop preference helpers and remove all admin-scoped sidebar and old user sidebar exports:

```ts
// Add:
export const getSidebarPreference = () =>
  apiClient.get<SidebarConfig>('/v1/preferences/sidebar')

export const saveSidebarPreference = (payload: SidebarConfig) =>
  apiClient.put<void>('/v1/preferences/sidebar', payload)

// Remove: updateSidebarPreference, updateGlobalSidebarPreference,
//         clearGlobalSidebarPreference, and any admin sidebar exports
```

In `ui/src/contexts/sidebar-config-context.tsx`:
- Replace `const { user, globalSidebarPreference } = useAuth()` with `getSidebarPreference()` / `saveSidebarPreference()`.
- Remove global sidebar preference apply/publish/clear flows entirely.
- Keep only single-user local customization semantics.

In `ui/src/components/sidebar-customizer.tsx`:
- Remove `const { user, globalSidebarPreference } = useAuth()` and the `globalSidebarPreference` merge logic.
- Keep the per-user toggle/visibility UI but bind it directly to `saveSidebarPreference`.

- [ ] **Step 4: Migrate general-setting API path**

In `ui/src/lib/api/admin.ts`, update the general-setting fetch path from `/admin/general-setting/` to the new non-admin path:

```ts
// Before:
export const getGeneralSetting = () =>
  fetchAPI<GeneralSetting>('/admin/general-setting/')

export const updateGeneralSetting = (data: Partial<GeneralSetting>) =>
  apiClient.put<GeneralSetting>('/admin/general-setting/', data)

// After:
export const getGeneralSetting = () =>
  fetchAPI<GeneralSetting>('/v1/settings/general')

export const updateGeneralSetting = (data: Partial<GeneralSetting>) =>
  apiClient.put<GeneralSetting>('/v1/settings/general', data)
```

In `ui/src/components/settings/general-management.tsx`, verify the import of `getGeneralSetting`/`updateGeneralSetting` still resolves — no other changes needed here.

- [ ] **Step 5: Delete removed settings components**

```bash
git rm \
  ui/src/components/settings/authentication-management.tsx \
  ui/src/components/settings/oauth-provider-management.tsx \
  ui/src/components/settings/oauth-provider-dialog.tsx \
  ui/src/components/settings/rbac-management.tsx \
  ui/src/components/settings/rbac-dialog.tsx \
  ui/src/components/settings/rbac-assignment-dialog.tsx \
  ui/src/components/settings/user-management.tsx \
  ui/src/components/settings/user-role-assignment.tsx \
  ui/src/components/settings/apikey-management.tsx \
  ui/src/components/settings/apikey-dialog.tsx \
  ui/src/components/settings/audit-log.tsx
```

- [ ] **Step 6: Remove stale i18n keys**

In `ui/src/i18n/locales/en.json` and `ui/src/i18n/locales/zh.json`, delete all keys under:
- `settings.authentication`
- `settings.rbac`
- `settings.users`
- `settings.apiKeys`
- `settings.audit`

Keep all keys under `settings.desktop`, `settings.general`, `settings.clusters`, `settings.templates`.

- [ ] **Step 7: Commit (to be verified together with Task 5)**

```bash
git add ui/src/components/sidebar-customizer.tsx ui/src/contexts/sidebar-config-context.tsx ui/src/components/settings/general-management.tsx ui/src/lib/api/admin.ts ui/src/i18n/locales/en.json ui/src/i18n/locales/zh.json ui/src/contexts/sidebar-config-context.test.tsx
git commit -m "refactor: migrate preference and general-setting to desktop api paths, remove old settings components"
```

---

### Task 5: 把后端路由改成桌面核心能力 API（与 Task 4 同批验证）

> **与 Task 4 的依赖关系：** Task 4 的前端调用 `/api/v1/preferences/sidebar` 和 `/api/v1/settings/general`。本 task 负责在后端创建这两个路由，并把 `general-setting` 从 admin 组迁出。两个 task 完成后一起运行集成验证。

**Files:**
- Modify: `internal/server/routes.go`
- Create: `pkg/handlers/preferences_handler.go`
- Modify: `pkg/ai/handler.go`  *(general-setting handler 路径不变，只是注册位置变了)*
- Test: `internal/server/routes_test.go`

- [ ] **Step 1: Write the failing route tests**

```go
// internal/server/routes_test.go
func TestDesktopRoutesExcludeLegacyAuthAndInit(t *testing.T) {
    r := gin.New()
    setupAPIRouter(&r.RouterGroup, testClusterManager())

    for _, path := range []string{
        "/api/v1/init_check",
        "/api/auth/login",
        "/api/auth/user",
        "/api/v1/admin/users/create_super_user",
        "/api/v1/admin/general-setting/",  // 旧 admin 路径应当 404
    } {
        req := httptest.NewRequest(http.MethodGet, path, nil)
        rec := httptest.NewRecorder()
        r.ServeHTTP(rec, req)
        if rec.Code != http.StatusNotFound {
            t.Fatalf("%s status = %d, want 404", path, rec.Code)
        }
    }
}

func TestDesktopPreferenceAndSettingRoutesExist(t *testing.T) {
    r := gin.New()
    setupAPIRouter(&r.RouterGroup, testClusterManager())

    for _, tc := range []struct {
        method string
        path   string
    }{
        {http.MethodGet, "/api/v1/preferences/sidebar"},
        {http.MethodPut, "/api/v1/preferences/sidebar"},
        {http.MethodGet, "/api/v1/settings/general"},
        {http.MethodPut, "/api/v1/settings/general"},
    } {
        req := httptest.NewRequest(tc.method, tc.path, nil)
        rec := httptest.NewRecorder()
        r.ServeHTTP(rec, req)
        if rec.Code == http.StatusNotFound {
            t.Fatalf("%s %s returned 404, want registered route", tc.method, tc.path)
        }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/server -run 'TestDesktopRoutesExcludeLegacyAuthAndInit|TestDesktopPreferenceAndSettingRoutesExist' -v`
Expected: FAIL because the legacy routes still exist and the new preference/setting routes are not yet registered.

- [ ] **Step 3: Create the preferences handler**

Create `pkg/handlers/preferences_handler.go`:

```go
package handlers

import (
    "net/http"

    "github.com/gin-gonic/gin"
    "github.com/eryajf/kite-desktop/pkg/model"
)

// GetSidebarPreference returns the desktop-local sidebar preference.
// Stored in the single "desktop" user row in the local DB.
func GetSidebarPreference(c *gin.Context) {
    pref, err := model.GetDesktopSidebarPreference()
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
        return
    }
    c.JSON(http.StatusOK, gin.H{"sidebar_preference": pref})
}

// SaveSidebarPreference persists the desktop-local sidebar preference.
func SaveSidebarPreference(c *gin.Context) {
    var body struct {
        SidebarPreference string `json:"sidebar_preference" binding:"required"`
    }
    if err := c.ShouldBindJSON(&body); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }
    if err := model.SaveDesktopSidebarPreference(body.SidebarPreference); err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
        return
    }
    c.Status(http.StatusNoContent)
}
```

- [ ] **Step 4: Add model helpers for desktop preference**

In `pkg/model/user.go`, add two helpers that operate on a fixed local desktop record (ID=1) without requiring an authenticated user:

```go
const desktopLocalUserID = uint(1)

// GetDesktopSidebarPreference returns the sidebar preference for the local desktop user.
func GetDesktopSidebarPreference() (string, error) {
    var user User
    err := DB.Select("sidebar_preference").First(&user, desktopLocalUserID).Error
    if err != nil {
        return "", err
    }
    return user.SidebarPreference, nil
}

// SaveDesktopSidebarPreference persists the sidebar preference for the local desktop user.
func SaveDesktopSidebarPreference(pref string) error {
    return DB.Model(&User{}).Where("id = ?", desktopLocalUserID).
        Update("sidebar_preference", pref).Error
}
```

- [ ] **Step 5: Rebuild setupAPIRouter without auth/admin/init groups**

In `internal/server/routes.go`, replace the entire `setupAPIRouter` function and its sub-functions with:

```go
func setupAPIRouter(r *gin.RouterGroup, cm *cluster.ClusterManager) {
    registerBaseRoutes(r)
    registerDesktopPreferenceRoutes(r)
    registerDesktopSettingRoutes(r)
    registerClusterRoutes(r, cm)
    registerCoreResourceRoutes(r, cm)
}

func registerBaseRoutes(r *gin.RouterGroup) {
    r.GET("/metrics", gin.WrapH(promhttp.HandlerFor(prometheus.Gatherers{
        prometheus.DefaultGatherer,
        ctrlmetrics.Registry,
    }, promhttp.HandlerOpts{})))
    r.GET("/healthz", func(c *gin.Context) {
        c.JSON(http.StatusOK, gin.H{"status": "ok"})
    })
    r.GET("/api/v1/version", version.GetVersion)
    // /api/v1/init_check removed
}

func registerDesktopPreferenceRoutes(r *gin.RouterGroup) {
    pref := r.Group("/api/v1/preferences")
    pref.GET("/sidebar", handlers.GetSidebarPreference)
    pref.PUT("/sidebar", handlers.SaveSidebarPreference)
}

func registerDesktopSettingRoutes(r *gin.RouterGroup) {
    setting := r.Group("/api/v1/settings")
    setting.GET("/general", ai.HandleGetGeneralSetting)
    setting.PUT("/general", ai.HandleUpdateGeneralSetting)
}

func registerClusterRoutes(r *gin.RouterGroup, cm *cluster.ClusterManager) {
    clusterAPI := r.Group("/api/v1/admin/clusters")
    clusterAPI.GET("/", cm.GetClusterList)
    clusterAPI.POST("/", cm.CreateCluster)
    clusterAPI.PUT("/:id", cm.UpdateCluster)
    clusterAPI.DELETE("/:id", cm.DeleteCluster)
    clusterAPI.POST("/import", cm.ImportClustersFromKubeconfig)
}

func registerCoreResourceRoutes(r *gin.RouterGroup, cm *cluster.ClusterManager) {
    api := r.Group("/api/v1")
    api.GET("/clusters", cm.GetClusters)
    api.Use(middleware.ClusterMiddleware(cm))
    // No RequireAuth(), No RequireAdmin(), No RBACMiddleware()

    api.GET("/overview", handlers.GetOverview)

    promHandler := handlers.NewPromHandler()
    api.GET("/prometheus/resource-usage-history", promHandler.GetResourceUsageHistory)
    api.GET("/prometheus/pods/:namespace/:podName/metrics", promHandler.GetPodMetrics)

    logsHandler := handlers.NewLogsHandler()
    api.GET("/logs/:namespace/:podName/ws", logsHandler.HandleLogsWebSocket)

    terminalHandler := handlers.NewTerminalHandler()
    api.GET("/terminal/:namespace/:podName/ws", terminalHandler.HandleTerminalWebSocket)

    nodeTerminalHandler := handlers.NewNodeTerminalHandler()
    api.GET("/node-terminal/:nodeName/ws", nodeTerminalHandler.HandleNodeTerminalWebSocket)

    kubectlTerminalHandler := handlers.NewKubectlTerminalHandler()
    api.GET("/kubectl-terminal/ws", kubectlTerminalHandler.HandleKubectlTerminalWebSocket)

    searchHandler := handlers.NewSearchHandler()
    api.GET("/search", searchHandler.GlobalSearch)

    resourceApplyHandler := handlers.NewResourceApplyHandler()
    api.POST("/resources/apply", resourceApplyHandler.ApplyResource)

    api.GET("/image/tags", handlers.GetImageTags)
    api.GET("/templates", handlers.ListTemplates)
    templateAPI := api.Group("/templates")
    templateAPI.POST("/", handlers.CreateTemplate)
    templateAPI.PUT("/:id", handlers.UpdateTemplate)
    templateAPI.DELETE("/:id", handlers.DeleteTemplate)

    proxyHandler := handlers.NewProxyHandler()
    proxyHandler.RegisterRoutes(api)

    api.GET("/ai/status", ai.HandleAIStatus)
    api.POST("/ai/chat", ai.HandleChat)
    api.POST("/ai/execute/continue", ai.HandleExecuteContinue)
    api.POST("/ai/input/continue", ai.HandleInputContinue)

    // No RBACMiddleware() — Kubernetes RBAC resources are retained as plain resource pages
    resources.RegisterRoutes(api)
}
```

Remove the old imports of `pkg/auth` and `pkg/rbac` from `routes.go`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `go test ./internal/server -run 'TestDesktopRoutesExcludeLegacyAuthAndInit|TestDesktopPreferenceAndSettingRoutesExist' -v`
Expected: PASS

Now also run the frontend sidebar test (requires the backend to be reachable via msw or test mock):

Run: `pnpm --dir ui exec vitest run ui/src/contexts/sidebar-config-context.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add internal/server/routes.go internal/server/routes_test.go pkg/handlers/preferences_handler.go pkg/model/user.go
git commit -m "refactor: expose desktop api surface without auth or init routes, add preferences and settings endpoints"
```

---

### Task 6: 移除 Kite 自身 RBAC 与旧 auth/admin 实现，清理 AI 授权与资源历史的用户依赖

**Files:**
- Delete: `pkg/auth/handler.go`
- Delete: `pkg/auth/login_handler.go`
- Delete: `pkg/auth/middleware.go`
- Delete: `pkg/auth/oauth_manager.go`
- Delete: `pkg/auth/oauth_provider.go`
- Delete: `pkg/auth/oauth_provider_handler.go`
- Delete: `pkg/auth/ldap.go`
- Delete: `pkg/auth/ldap_setting_handler.go`
- Delete: `pkg/auth/*_test.go`
- Delete: `pkg/middleware/rbac.go`
- Delete: `pkg/middleware/rbac_test.go`
- Delete: `pkg/rbac/` (entire directory)
- Delete: `pkg/handlers/apikey_handler.go`
- Delete: `pkg/handlers/audit_handler.go`
- Delete: `pkg/model/oauth.go`
- Delete: `pkg/model/oauth_test.go`
- Delete: `pkg/model/ldap_setting_test.go`
- Modify: `internal/server/app.go`
- Modify: `internal/load.go`
- Modify: `internal/load_test.go`
- Modify: `pkg/handlers/logs_handler.go`
- Modify: `pkg/handlers/terminal_handler.go`
- Modify: `pkg/handlers/node_terminal_handler.go`
- Modify: `pkg/handlers/kubectl_terminal_handler.go`
- Modify: `pkg/handlers/proxy_handler.go`
- Modify: `pkg/handlers/resource_apply_handler.go`
- Modify: `pkg/handlers/resources/pod_handler.go`
- Modify: `pkg/handlers/resources/generic_resource_handler_list.go`
- Modify: `pkg/handlers/resources/generic_resource_handler.go`
- Modify: `pkg/ai/tool_authorization.go`
- Modify: `pkg/ai/tool_resource_execution.go`
- Modify: `pkg/ai/agent.go`
- Modify: `pkg/model/resource_history.go`
- Modify: `pkg/cluster/cluster_handler.go`
- Test: `pkg/handlers/resources/pod_handler_test.go`
- Test: `internal/load_test.go`

- [ ] **Step 1: Write the failing regression tests**

```go
// pkg/handlers/resources/pod_handler_test.go
func TestPodHandlerDoesNotRequireUserContext(t *testing.T) {
    gin.SetMode(gin.TestMode)
    w := httptest.NewRecorder()
    c, _ := gin.CreateTestContext(w)
    c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/pods/default", nil)
    // Inject cluster but NOT user — this is the key assertion
    c.Set("cluster", fakeClientSet("test-cluster"))

    handler := resources.NewGenericResourceHandler("pods", ...)
    handler.List(c)

    // Should return 200 or cluster-specific error, NOT panic on MustGet("user")
    assert.NotEqual(t, http.StatusInternalServerError, w.Code)
}
```

```go
// internal/load_test.go
func TestLoadDoesNotCallRBACSync(t *testing.T) {
    // After the change, calling Load() must not reference rbac.SyncNow channel
    // Verify by ensuring no import of pkg/rbac in internal/load.go
    // This is a compile-time check: if pkg/rbac is deleted and load.go still imports it, build fails.
    _ = Load  // compile check only
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./pkg/handlers/resources/... -run 'TestPodHandlerDoesNotRequireUserContext' -v`
Expected: FAIL or PANIC because `generic_resource_handler.go` and `pod_handler.go` still call `c.MustGet("user")`.

- [ ] **Step 3: Remove user/RBAC from retained handlers**

For each of the following handlers, apply the same pattern — remove `c.MustGet("user")` and all `rbac.*` calls. The access model is now: **valid cluster = access granted**.

**`pkg/handlers/logs_handler.go`** — remove lines 40, 48-49:
```go
// Remove:
// user := c.MustGet("user").(model.User)
// if !rbac.CanAccess(user, "pods", "log", cs.Name, namespace) {
//     _ = sendErrorMessage(ws, rbac.NoAccess(...))
//     return
// }
// The handler now just checks cs != nil and proceeds.
```

**`pkg/handlers/terminal_handler.go`** — remove lines 39, 47-51 (user + rbac.CanAccess check).

**`pkg/handlers/node_terminal_handler.go`** — remove lines 43, 49-51 (user + rbac.CanAccess check).

**`pkg/handlers/kubectl_terminal_handler.go`** — remove lines 40, 48-50 (user + rbac.UserHasRole check).

**`pkg/handlers/proxy_handler.go`** — remove lines 25, 33-35 (user + rbac.CanAccess check).

**`pkg/handlers/resource_apply_handler.go`** — remove lines 34, 54-57 (user + rbac.CanAccess check).

**`pkg/handlers/resources/generic_resource_handler.go`** — remove line 69 (`user := c.MustGet("user")`), remove any subsequent rbac checks.

**`pkg/handlers/resources/generic_resource_handler_list.go`** — remove line 102 (`user := c.MustGet("user")`), remove lines 115-118 (`rbac.CanAccessNamespace` namespace filter). All namespaces are now visible — the cluster's own Kubernetes RBAC will enforce access.

**`pkg/handlers/resources/pod_handler.go`** — remove line 260, 263-264 (`user := c.MustGet`, `rbac.CanAccess` exec check).

**`pkg/handlers/overview_handler.go`** — remove line 48 (`user := c.MustGet("user")`), remove any subsequent user-gating.

- [ ] **Step 4: Rewrite AI tool authorization to remove Kite RBAC**

In `pkg/ai/tool_authorization.go`, the `AuthorizeTool` function currently rejects the call if no Kite user is in context. On desktop, there is no user — **replace the entire authorization flow with a cluster-validity check**:

```go
// New AuthorizeTool — no user context required
func AuthorizeTool(c *gin.Context, cs *cluster.ClientSet, toolName string, args map[string]interface{}) (string, bool) {
    if c == nil {
        return "Error: authorization context is required", true
    }
    if cs == nil {
        return "Error: cluster client is required", true
    }
    // Desktop trust model: local user has full access.
    // requiredToolPermissions is retained for informational logging only (not enforcement).
    return "", false
}
```

Remove `currentUserFromGin` function and all imports of `pkg/rbac` and `pkgmodel "github.com/eryajf/kite-desktop/pkg/model"` from this file (model is no longer needed here).

In `pkg/ai/tool_resource_execution.go`:
- `executeCreateResource`, `executeUpdateResource`, `executePatchResource`, `executeDeleteResource` all accept a `user pkgmodel.User` parameter solely to call `recordResourceHistory`.
- Remove the `user` parameter from all four functions.
- Update `recordResourceHistory` signature to not require user, and set `OperatorID: desktopLocalUserID` (value `1`) as a fixed constant:

```go
const desktopLocalUserID = uint(1)

func recordResourceHistory(cs *cluster.ClientSet, kind, name, namespace, opType, resourceYAML, previousYAML string, success bool, err error) {
    errMsg := ""
    if err != nil {
        errMsg = err.Error()
    }
    history := pkgmodel.ResourceHistory{
        ClusterName:     cs.Name,
        ResourceType:    kind,
        ResourceName:    name,
        Namespace:       namespace,
        OperationType:   opType,
        OperationSource: "ai",
        ResourceYAML:    resourceYAML,
        PreviousYAML:    previousYAML,
        Success:         success,
        ErrorMessage:    errMsg,
        OperatorID:      desktopLocalUserID,
    }
    if dbErr := pkgmodel.DB.Create(&history).Error; dbErr != nil {
        klog.Errorf("Failed to create resource history: %v", dbErr)
    }
}
```

Update the four call sites in `tool_resource_execution.go` to drop the `user` argument.

In `pkg/ai/tool_authorization.go` `ExecuteTool` function: remove `user, _ := currentUserFromGin(c)` and the `user` argument in calls to the four execute functions.

- [ ] **Step 5: Clean up agent.go RBAC context injection**

In `pkg/ai/agent.go`, the `buildRBACOverview` function and its injection into `runtimeCtx.RBACOverview` / `runtimeCtx.AccountName` are Kite-RBAC-specific. Remove them:

```go
// Remove:
// func buildRBACOverview(user model.User) string { ... }

// In the function that builds runtimeCtx (around line 227-236):
// Remove:
// rawUser, ok := c.Get("user")
// user, ok := rawUser.(model.User)
// ctx.AccountName = user.Key()
// ctx.RBACOverview = buildRBACOverview(user)

// In PageContext struct (pkg/ai/agent.go ~line 108-109):
// Remove fields: AccountName string, RBACOverview string

// In the prompt builder (around line 247-256):
// Remove the AccountName and RBACOverview prompt injection block
```

Remove import of `pkg/rbac` and `pkg/model` from `agent.go` if they become unused after this change.

- [ ] **Step 6: Remove RBAC lifecycle from app startup**

In `internal/server/app.go`, remove the `rbac.InitRBAC()` call.

In `internal/load.go`, remove `rbac.SyncNow <- struct{}{}` and any import of `pkg/rbac`.

- [ ] **Step 7: Delete dead packages and handlers**

```bash
git rm -r pkg/auth/
git rm -r pkg/rbac/
git rm pkg/middleware/rbac.go pkg/middleware/rbac_test.go
git rm pkg/handlers/apikey_handler.go pkg/handlers/audit_handler.go
git rm pkg/model/oauth.go pkg/model/oauth_test.go pkg/model/ldap_setting_test.go
```

- [ ] **Step 8: Run tests to verify**

Run: `go build ./...`
Expected: PASS (compile check — any remaining import of deleted packages will surface here)

Run: `go test ./internal/... ./pkg/cluster/... ./pkg/handlers/... ./pkg/ai/... ./pkg/model/... -v`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add internal/ pkg/
git commit -m "refactor: remove kite auth and rbac from desktop runtime, clean up AI tool authorization"
```

---

### Task 7: 清理文档、文案和最终验证

**Files:**
- Modify: `docs/desktop-migration-plan.md`
- Modify: `docs/desktop-native-refactor-plan.md`
- Modify: `ui/src/i18n/locales/en.json`
- Modify: `ui/src/i18n/locales/zh.json`
- Modify: `Makefile` (if it has init/login-related commentary)

- [ ] **Step 1: Run repo-wide grep to confirm all legacy references are gone**

Run:
```bash
rg -n "/login|/setup|/api/auth|init_check|create_super_user|oauth-provider|ldap-setting|RequireAuth|RequireAdmin|RBACMiddleware|rbac\.CanAccess|rbac\.UserHasRole|rbac\.SyncNow|buildRBACOverview|MustGet.*user" \
  --glob '!docs/' \
  --glob '!*.md' \
  .
```
Expected: zero matches. If matches remain, fix them before proceeding.

- [ ] **Step 2: Verify i18n has no orphaned keys**

Run:
```bash
pnpm --dir ui exec vitest run --reporter=verbose 2>&1 | grep -i "missing\|unused"
```
Expected: no i18n warnings for removed keys.

- [ ] **Step 3: Update docs**

In `docs/desktop-migration-plan.md` and `docs/desktop-native-refactor-plan.md`, update any sections that describe the old login/init flow to reflect the new "direct entry" model. Remove references to `/login`, `/setup`, `RequireAuth`, Kite RBAC management.

- [ ] **Step 4: Run full test suite**

Run: `pnpm --dir ui run test`
Expected: PASS

Run: `go test ./...`
Expected: PASS

- [ ] **Step 5: Manual smoke test**

Run: `make dev`

Verify manually:
- Desktop app opens directly at `/` — no redirect to `/login` or `/setup`.
- With no clusters configured: app shell renders, sidebar renders, overview shows `NoClusterState` with a link to Settings.
- Add a cluster via Settings → Clusters.
- After cluster is added: overview loads, resource pages (pods, deployments, etc.) are accessible, logs and terminal work.
- Settings page shows only: Desktop, General, Clusters, Templates tabs.

- [ ] **Step 6: Commit**

```bash
git add docs/ ui/src/i18n/locales/en.json ui/src/i18n/locales/zh.json Makefile
git commit -m "docs: finalize desktop-only runtime model documentation"
```
