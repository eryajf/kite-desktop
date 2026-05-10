# Directed Related Resources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every resource detail "Related" tab render reliably and show relationships in two groups: references and referenced by.

**Architecture:** Keep the existing `/related` endpoint as the single source for relationship discovery, but extend the response with direction metadata instead of letting the UI infer it. The frontend renders a reusable grouped related-resources view, so Deployment, Service, Ingress, ConfigMap, Secret, PVC, Pod, HPA, and future resource detail pages share one interaction model.

**Tech Stack:** Go Gin handlers, controller-runtime Kubernetes client, React 19, TanStack Query, Vitest, Go tests.

---

## Current Findings

The current related resources path is:

- Detail pages call `RelatedResourcesTable`.
- `RelatedResourcesTable` calls `useRelatedResources`.
- `useRelatedResources` fetches `GET /api/resources/:resource/:namespace/:name/related`.
- Backend route registration lives in `pkg/handlers/resources/handler.go`.
- Backend discovery lives in `pkg/handlers/resources/related_resources.go`.

The current white-screen risk is in `ui/src/components/related-resource-table.tsx`: if a related item has a type that the frontend does not recognize as a standard resource and the backend did not provide `apiVersion`, `getCRDResourcePath(rs.type, rs.apiVersion!, ...)` can crash because `apiVersion` is `undefined`.

The current product gap is that the backend returns a flat list:

```json
[
  {
    "type": "services",
    "name": "demo",
    "namespace": "default"
  }
]
```

This shape cannot distinguish:

- resources this object references, such as a Deployment using ConfigMaps, Secrets, PVCs
- resources that reference this object, such as Services, Ingresses, HPAs, ReplicaSets, Pods

## Relationship Semantics

Use two top-level UI groups everywhere:

- `references`: the current resource directly points to or consumes these resources.
- `referencedBy`: these resources point to, select, own, route to, scale, or consume the current resource.

For Deployment:

- `references`
  - ConfigMaps used by env, envFrom, and volumes
  - Secrets used by env, envFrom, imagePullSecrets, and volumes
  - PVCs used by volumes
  - ServiceAccount used by pod template
- `referencedBy`
  - ReplicaSets owned by the Deployment
  - Pods owned by those ReplicaSets
  - Services whose selectors match the Deployment pod selector
  - Endpoints or EndpointSlices backing those Services
  - Ingresses whose backend services point to those Services
  - HTTPRoutes whose backend refs point to those Services
  - HPAs whose scale target points to the Deployment

For Service:

- `references`
  - Pods selected by the Service
  - Endpoints and EndpointSlices for the Service
- `referencedBy`
  - Ingresses and HTTPRoutes using the Service as a backend

For ConfigMap, Secret, and PVC:

- `referencedBy`
  - Deployments, StatefulSets, DaemonSets, Jobs, CronJobs, and Pods that consume them

For Ingress and HTTPRoute:

- `references`
  - Services and backend resources defined by rules/default backends

For HPA:

- `references`
  - scale target workload

## Files

- Modify: `pkg/common/types.go`
  - Add direction/reason fields while keeping old fields backward-compatible.
- Modify: `pkg/handlers/resources/related_resources.go`
  - Return directed relationships and add Deployment inbound discovery for Services, Endpoints, Ingresses, HTTPRoutes, HPAs, ReplicaSets, and Pods.
- Modify: `pkg/handlers/resources/related_resources_test.go`
  - Cover direction grouping and Deployment relationship expectations.
- Modify: `pkg/handlers/resources/handler.go`
  - Add related route support for resource types that are currently registered but not exposed, such as `endpoints`, `endpointslices`, `replicasets`, `jobs`, and `cronjobs` if their detail pages should show related data.
- Modify: `ui/src/types/api.ts`
  - Add `RelatedResourceDirection`, optional `direction`, `reason`, and `group`.
  - Add `endpoints` and `endpointslices` to `ResourceType`.
- Modify: `ui/src/lib/k8s.ts`
  - Treat `endpoints`, `endpointslices`, `serviceaccounts`, `replicasets`, `horizontalpodautoscalers`, `gateways`, and `httproutes` as standard resources when applicable.
- Modify: `ui/src/components/related-resource-table.tsx`
  - Render two sections: references and referenced by.
  - Guard route creation when `apiVersion` is absent.
  - Show a disabled text row rather than crashing if a resource is not navigable.
- Create: `ui/src/components/related-resource-table.test.tsx`
  - Assert that unknown or incomplete related resources do not white-screen.
  - Assert that two groups render separately.

## Task 1: Frontend White-Screen Guard

**Files:**
- Modify: `ui/src/components/related-resource-table.tsx`
- Modify: `ui/src/types/api.ts`
- Modify: `ui/src/lib/k8s.ts`
- Create: `ui/src/components/related-resource-table.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `ui/src/components/related-resource-table.test.tsx` with cases for:

```tsx
vi.mock('@/lib/api', () => ({
  useRelatedResources: () => ({
    data: [
      { type: 'endpoints', name: 'demo', namespace: 'default' },
      { type: 'unknownwidgets', name: 'demo-widget', namespace: 'default' },
    ],
    isLoading: false,
  }),
}))
```

Expected assertions:

- `endpoints` renders as a clickable standard resource.
- `unknownwidgets` renders without throwing.
- no call path requires `apiVersion` when it is absent.

- [ ] **Step 2: Run failing test**

Run:

```bash
pnpm --dir ui exec vitest run src/components/related-resource-table.test.tsx
```

Expected: fail before the implementation because incomplete CRD-like related resources can crash route generation.

- [ ] **Step 3: Implement the guard**

In `RelatedResourceCell`, compute a nullable route:

```tsx
const path = useMemo(() => {
  if (isStandardK8sResource(rs.type)) {
    return `/${rs.type}/${rs.namespace ? `${rs.namespace}/` : ''}${rs.name}`
  }
  if (rs.apiVersion) {
    return getCRDResourcePath(rs.type, rs.apiVersion, rs.namespace, rs.name)
  }
  return undefined
}, [rs])
```

If `path` is missing, render the resource name as plain text with muted metadata and no dialog trigger.

- [ ] **Step 4: Extend standard frontend resource knowledge**

Add at least these to `ResourceType` and `isStandardK8sResource`:

```ts
| 'endpoints'
| 'endpointslices'
```

Also include existing registered resources that are missing from `isStandardK8sResource`, including `serviceaccounts`, `replicasets`, `horizontalpodautoscalers`, `gateways`, and `httproutes`.

- [ ] **Step 5: Verify**

Run:

```bash
pnpm --dir ui exec vitest run src/components/related-resource-table.test.tsx
pnpm --dir ui exec eslint src/components/related-resource-table.tsx src/components/related-resource-table.test.tsx src/types/api.ts src/lib/k8s.ts
```

Expected: pass.

## Task 2: Directed API Contract

**Files:**
- Modify: `pkg/common/types.go`
- Modify: `ui/src/types/api.ts`
- Modify: `ui/src/components/related-resource-table.tsx`
- Modify: `pkg/handlers/resources/related_resources_test.go`

- [ ] **Step 1: Extend backend type**

Change `common.RelatedResource` to:

```go
type RelatedResource struct {
	Type       string `json:"type"`
	APIVersion string `json:"apiVersion,omitempty"`
	Name       string `json:"name"`
	Namespace  string `json:"namespace,omitempty"`
	Direction  string `json:"direction,omitempty"`
	Reason     string `json:"reason,omitempty"`
}
```

Use direction values:

```go
const (
	RelatedDirectionReferences   = "references"
	RelatedDirectionReferencedBy = "referencedBy"
)
```

- [ ] **Step 2: Extend frontend type**

Change `RelatedResources` in `ui/src/types/api.ts`:

```ts
export type RelatedResourceDirection = 'references' | 'referencedBy'

export interface RelatedResources {
  type: ResourceType
  name: string
  namespace?: string
  apiVersion?: string
  direction?: RelatedResourceDirection
  reason?: string
}
```

- [ ] **Step 3: Keep backward compatibility**

In the UI, group items with missing direction into `references` for now, so existing backend responses continue to render:

```ts
const references = relatedResources.filter(
  (item) => item.direction !== 'referencedBy'
)
const referencedBy = relatedResources.filter(
  (item) => item.direction === 'referencedBy'
)
```

- [ ] **Step 4: Verify compatibility**

Run:

```bash
go test ./pkg/handlers/resources -run Test
pnpm --dir ui exec vitest run src/components/related-resource-table.test.tsx
```

Expected: pass.

## Task 3: Deployment Relationship Discovery

**Files:**
- Modify: `pkg/handlers/resources/related_resources.go`
- Modify: `pkg/handlers/resources/related_resources_test.go`

- [ ] **Step 1: Mark existing Deployment references**

When `podSpec` comes from Deployment, StatefulSet, DaemonSet, Job, CronJob, or Pod, resources from `discoverConfigs` should use:

```go
Direction: common.RelatedDirectionReferences,
Reason: "pod template reference",
```

- [ ] **Step 2: Mark Services as referencedBy**

`discoverServices` currently finds Services whose selector matches the workload selector. For workloads, set:

```go
Direction: common.RelatedDirectionReferencedBy,
Reason: "service selector matches workload pods",
```

- [ ] **Step 3: Add Deployment-owned ReplicaSets**

List ReplicaSets in the namespace with the Deployment selector and filter by owner reference UID/name. Add:

```go
common.RelatedResource{
  Type: "replicasets",
  Namespace: deployment.Namespace,
  Name: replicaSet.Name,
  Direction: common.RelatedDirectionReferencedBy,
  Reason: "owned by deployment",
}
```

- [ ] **Step 4: Add Deployment-owned Pods**

List Pods using the Deployment selector. Include Pods owned by Deployment-owned ReplicaSets. Add:

```go
Type: "pods",
Direction: common.RelatedDirectionReferencedBy,
Reason: "pod owned by deployment replica set",
```

- [ ] **Step 5: Add Endpoint and EndpointSlice relationships via Services**

For each related Service:

```go
Type: "endpoints",
Name: service.Name,
Namespace: service.Namespace,
Direction: common.RelatedDirectionReferencedBy,
Reason: "service endpoint for matching selector",
```

For EndpointSlices, list by label `kubernetes.io/service-name=<service name>`:

```go
Type: "endpointslices",
Name: endpointSlice.Name,
Namespace: endpointSlice.Namespace,
Direction: common.RelatedDirectionReferencedBy,
Reason: "endpoint slice for matching service",
```

- [ ] **Step 6: Add Ingress and HTTPRoute relationships via Services**

For each Service related to the Deployment, discover:

- Ingresses in the same namespace whose default backend or rule backend service name matches.
- HTTPRoutes whose backend ref points to the Service.

Mark both as:

```go
Direction: common.RelatedDirectionReferencedBy,
Reason: "routes traffic to matching service",
```

- [ ] **Step 7: Add HPA relationships**

List HPAs in the namespace and match:

```go
hpa.Spec.ScaleTargetRef.Kind == "Deployment"
hpa.Spec.ScaleTargetRef.Name == deployment.Name
```

Mark as:

```go
Direction: common.RelatedDirectionReferencedBy,
Reason: "scales deployment",
```

- [ ] **Step 8: Verify**

Add Go tests that construct representative Deployment, Service, Ingress, HPA, ConfigMap, Secret, PVC data and assert directions. Run:

```bash
go test ./pkg/handlers/resources -run 'TestDiscover|TestGet.*Related'
```

Expected: pass.

## Task 4: Grouped Related UI

**Files:**
- Modify: `ui/src/components/related-resource-table.tsx`
- Modify: `ui/src/i18n/locales/en.json`
- Modify: `ui/src/i18n/locales/zh.json`
- Modify: `ui/src/components/related-resource-table.test.tsx`

- [ ] **Step 1: Add i18n labels**

Add:

```json
{
  "relatedResources": {
    "references": "References",
    "referencedBy": "Referenced by",
    "reason": "Reason"
  }
}
```

Chinese:

```json
{
  "relatedResources": {
    "references": "引用",
    "referencedBy": "被引用",
    "reason": "关系"
  }
}
```

- [ ] **Step 2: Render two sections**

In `RelatedResourcesTable`, render a shared table section component twice:

```tsx
<RelatedResourcesSection
  title={t('relatedResources.references')}
  data={references}
  emptyMessage={t('relatedResources.empty')}
/>
<RelatedResourcesSection
  title={t('relatedResources.referencedBy')}
  data={referencedBy}
  emptyMessage={t('relatedResources.empty')}
/>
```

- [ ] **Step 3: Add reason column**

Add a third optional column:

```tsx
{
  header: t('relatedResources.reason'),
  accessor: (rs) => rs.reason || '-',
  cell: (value) => <span className="text-muted-foreground">{value as string}</span>,
}
```

- [ ] **Step 4: Verify**

Run:

```bash
pnpm --dir ui exec vitest run src/components/related-resource-table.test.tsx
pnpm --dir ui exec eslint src/components/related-resource-table.tsx src/components/related-resource-table.test.tsx src/i18n/locales/en.json src/i18n/locales/zh.json
```

Expected: pass.

## Task 5: Route Coverage and Regression Tests

**Files:**
- Modify: `pkg/handlers/resources/handler.go`
- Modify: `pkg/handlers/resources/related_resources_test.go`
- Modify: `ui/src/types/api.ts`
- Modify: `ui/src/lib/k8s.ts`

- [ ] **Step 1: Add route coverage for related-capable resources**

Expand `supportedRelatedResourceTypes` if relationship discovery supports them:

```go
supportedRelatedResourceTypes := []string{
  "pods",
  "deployments",
  "replicasets",
  "statefulsets",
  "daemonsets",
  "jobs",
  "cronjobs",
  "services",
  "endpoints",
  "endpointslices",
  "configmaps",
  "secrets",
  "persistentvolumeclaims",
  "httproutes",
  "horizontalpodautoscalers",
  "ingresses",
}
```

- [ ] **Step 2: Add tests for route-safe frontend types**

Assert that all backend route types used in related responses are included in frontend `ResourceType` and `isStandardK8sResource`.

- [ ] **Step 3: Run full focused verification**

Run:

```bash
go test ./pkg/handlers/resources
pnpm --dir ui exec vitest run src/components/related-resource-table.test.tsx
pnpm --dir ui exec eslint src/components/related-resource-table.tsx src/components/related-resource-table.test.tsx src/types/api.ts src/lib/k8s.ts
```

Expected: pass.

## Rollout Notes

This should be implemented in two deployable slices:

1. White-screen guard and frontend route/type coverage.
2. Directed backend contract and grouped UI.

The first slice is low-risk and should land first because it stabilizes the existing blank page. The second slice adds the product behavior and can be expanded resource by resource.

## Self-Review

Spec coverage:

- Deployment detail related tab white-screen risk is covered by Task 1.
- Universal "引用 / 被引用" grouping is covered by Tasks 2 and 4.
- Deployment relationships to Service, endpoints, ingress, and other resources are covered by Task 3.
- Future reuse across all related tabs is covered by the shared `RelatedResourcesTable` contract.

Placeholder scan:

- No task uses placeholder text for implementation behavior.

Type consistency:

- Backend uses `direction` values `references` and `referencedBy`.
- Frontend uses the same string union.
