# Terminal Workspace Design

## Background

Resource terminals used to live inside detail-page tabs. When users switched
tabs or navigated away, React unmounted the terminal component, closing xterm
and its WebSocket. Because the Go terminal stream is directly bound to that
WebSocket, the Kubernetes exec or attach session ended as well.

This behavior made terminals fragile during normal debugging workflows.

## Decision

Kite Desktop now treats terminals as a global workspace instead of detail-page
content. Pod, workload, node, and kubectl entry points open sessions in a
bottom panel that is mounted above the main app content.

The workspace supports:

- multiple concurrent terminal sessions
- active-session switching
- bottom panel resize
- minimize without destroying sessions
- fullscreen mode
- explicit per-session close
- explicit close-all behavior

## Current Scope

This implementation keeps session lifetime on the frontend. A session remains
alive while its `Terminal` pane remains mounted inside the global workspace.
Inactive panes are hidden with CSS instead of unmounted.

The backend WebSocket contract is unchanged:

- Pod terminal: `/api/v1/terminal/:namespace/:podName/ws`
- Node terminal: `/api/v1/node-terminal/:nodeName/ws`
- kubectl terminal: `/api/v1/kubectl-terminal/ws`

Refreshing the app or losing the WebSocket still ends the underlying shell.
Recoverable backend sessions are intentionally left for a future backend
session broker.

## Main Files

- `ui/src/contexts/terminal-context.tsx`
- `ui/src/components/floating-terminal.tsx`
- `ui/src/components/terminal-launcher.tsx`
- `ui/src/components/terminal-content.tsx`

Resource pages should open terminals through `useTerminal().openSession(...)`
or `TerminalLauncher` rather than embedding `<Terminal />` directly in page
tabs.
