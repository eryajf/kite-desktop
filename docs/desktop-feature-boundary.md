# Desktop Feature Boundary

## Goal

This document defines which product behaviors differ between `desktop-local` and browser/server runtime.

## Desktop-Local Runtime

Desktop runtime is intended to behave as a local single-user tool.

### Enabled

- embedded loopback backend
- native menu
- system tray
- single instance behavior
- native file open/save dialogs
- native clipboard bridge
- open config directory
- open logs directory
- window hide/focus/quit host actions
- local desktop user injected by backend

### Hidden or Reduced

- OAuth login entrypoints
- LDAP/password login entrypoints
- RBAC management tabs
- user management tabs
- API key management tabs

### Interaction Rules

- close window hides the main window instead of immediately terminating the app
- same-origin desktop links may open in child windows
- download actions should prefer native save flow
- settings should expose local desktop information and host paths

## Server/Web Runtime

Server mode keeps the browser-first auth and navigation model.

### Enabled

- OAuth login
- credential login
- RBAC management
- user management
- API key management
- browser navigation and standard web redirects

### Not Assumed

- no system tray
- no native save dialog
- no native path reveal
- no desktop-local user injection

## Engineering Rule

When behavior differs by runtime:

1. Decide it at the runtime service or backend runtime layer.
2. Do not spread ad-hoc browser checks across page components.
3. Prefer capability checks from `/api/desktop/status` for host-only actions.
