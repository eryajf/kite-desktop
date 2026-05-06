# Resource List Actions Design

## Background

The current shared React UI has started to mix several row action patterns:

- some pages rely mostly on row context menus
- some pages expose multiple action-oriented columns
- some pages still have no explicit row action entry at all
- some pages already have both inline field actions and row actions

This is especially visible across:

- compute-style resources such as Nodes, Deployments, Pods
- config-style resources such as ConfigMaps and Secrets
- storage-style resources such as PVCs and PVs
- network-style resources such as Services and Ingresses

The goal of this design is to define one global action model for resource lists, instead of continuing to decide action placement page by page.

## Goals

- make list interaction patterns consistent across the desktop product
- preserve desktop-native efficiency by keeping right-click as a first-class shortcut
- improve discoverability for users who do not naturally use right-click
- reduce action-column sprawl in wide tables
- separate field-level actions from row-level resource actions
- provide a reusable default for both specialized list pages and generic list pages

## Non-Goals

- redesign all list visuals in this document
- define every individual resource operation in detail
- replace detail pages as the main place for deep or high-risk workflows

## Recommended Model

Use a dual-entry model with one action source:

- row context menu is the desktop shortcut entry
- the rightmost `Actions` column with a `...` trigger is the explicit visible entry
- both entries must render the same menu items in the same order

This means the product should not treat right-click and `...` as two separate feature surfaces.

## Interaction Layers

All list interactions should be classified into four layers.

### 1. Data Display Layer

The table itself should primarily show resource information:

- name
- status
- readiness
- IP or host
- image summary
- quota or capacity
- timestamps
- resource-specific business fields

These columns exist to help scanning and comparing resources, not to host many actions.

### 2. Inline Field Actions

Inline actions are allowed only when they are strongly bound to a specific field value.

Good examples:

- copy image from an image value
- copy IP from an IP value
- click name to open the resource detail page
- click a related resource reference such as PVC -> PV or PV -> PVC

Bad examples:

- restart resource
- scale resource
- edit labels or annotations
- generic edit buttons that are not tied to the current field

Rule:

- inline actions are value-level actions
- if an action operates on the whole resource, it should move to the row action menu

### 3. Row-Level Actions

Row-level actions should live in both:

- right-click menu
- `...` actions column

Typical row-level actions:

- view YAML
- copy resource name
- copy namespace
- manage labels
- manage annotations
- scale
- restart
- edit
- open terminal
- cordon / uncordon / drain

Rule:

- right-click and `...` must stay identical
- this should be driven by one shared menu definition

### 4. Detail-Page Actions

Complex, high-risk, or context-heavy workflows should still keep first-class entry points on the detail page.

Examples:

- large YAML edits
- multi-step forms
- rollback history
- container editing
- terminal-heavy workflows
- destructive workflows that need more context

Rule:

- list pages can provide lightweight entry points
- detail pages remain the primary operation surface for deep workflows

## Global Rules

### Rule 1: Every list should support row actions

All resource lists should converge toward:

- a right-click row context menu
- a rightmost `Actions` column containing a `...` trigger

This includes generic list pages, not only high-touch pages.

### Rule 2: Only one explicit action column

The UI should avoid multiple dedicated action columns such as:

- Edit
- Labels
- Annotations
- More

Instead:

- keep at most one explicit action column
- place all resource-level actions behind `...`

### Rule 3: Inline actions must be rare and field-bound

Do not let inline actions become a second action system.

Inline is reserved for:

- copy current value
- navigate to related referenced resource
- open a field-scoped detail

### Rule 4: Use stable menu ordering

Every resource row menu should follow a predictable structure:

1. view actions
2. copy actions
3. metadata actions
4. operational actions
5. dangerous actions

Recommended examples:

1. `View YAML`
2. `Copy name`, `Copy namespace`, `Copy IP`
3. `Manage labels`, `Manage annotations`
4. `Scale`, `Restart`, `Edit`, `Open terminal`
5. `Delete`, `Drain`

### Rule 5: Specialized pages may extend, but not break, the model

A page may have resource-specific actions, but should not invent a separate placement strategy.

Example:

- Node lists can include `Cordon`, `Uncordon`, `Drain`
- Deployment lists can include `Scale`, `Restart`
- Config lists can include `Edit`

But all still follow:

- field-bound inline actions only
- row actions in `...` and right-click

## Resource Family Templates

### Compute Resources

Includes:

- Nodes
- Deployments
- Pods
- StatefulSets
- DaemonSets

Default guidance:

- inline:
  - name -> detail
  - copy image
  - copy IP
  - links to related resources
- row menu:
  - view YAML
  - copy name
  - copy namespace if namespace-scoped
  - manage labels
  - manage annotations
  - scale where supported
  - restart where supported
  - terminal where supported
  - node operations such as cordon / drain
- detail page:
  - logs
  - terminal
  - container editing
  - resource resizing
  - rollback and history

### Config Resources

Includes:

- ConfigMaps
- Secrets

Default guidance:

- inline:
  - name -> detail
  - optionally expose summarized key information as read-only display
- row menu:
  - view YAML
  - copy name
  - copy namespace
  - manage labels
  - manage annotations
  - edit
- detail page:
  - full key/value inspection
  - copy secret values
  - full edit workflows

### Storage Resources

Includes:

- PVCs
- PVs

Default guidance:

- inline:
  - name -> detail
  - linked claim or volume references
  - linked storage class references
- row menu:
  - view YAML
  - copy name
  - copy namespace for PVC
  - manage labels
  - manage annotations
- detail page:
  - full spec review
  - advanced reclaim or binding workflows if later introduced

Storage resources are usually relationship-heavy, not operation-heavy. Their lists should remain scan-friendly.

### Network Resources

Includes:

- Services
- Ingresses
- Gateways
- HTTPRoutes

Default guidance:

- inline:
  - name -> detail
  - copy ClusterIP / ExternalIP / host if useful
  - click related references
- row menu:
  - view YAML
  - copy name
  - copy namespace
  - manage labels
  - manage annotations
- detail page:
  - route inspection
  - service selectors and ports
  - advanced network debugging if later introduced

### Generic Resources

Includes:

- lists driven by `SimpleListPage`

Default guidance:

- columns:
  - name
  - created
  - actions
- row menu:
  - view YAML
  - copy name
  - copy namespace if namespace-scoped
  - manage labels
  - manage annotations

This acts as the global fallback so that un-specialized resources still feel consistent with the rest of the desktop app.

## Page-Level Recommendations

### 1. Deployments

Keep as core data columns:

- Name
- Ready
- Status
- Containers & Images
- Resource Limits
- Created

Keep as inline field action:

- image copy in the image summary

Move to row actions:

- View YAML
- Copy name
- Copy namespace
- Manage labels
- Manage annotations
- Scale deployment
- Restart deployment

Long-term recommendation:

- remove standalone Labels and Annotations action columns
- rely on `...` plus right-click for metadata operations

### 2. Namespaces

Keep as core data columns:

- Name
- Status
- Created
- CPU limit summary
- Memory limit summary

Move to row actions:

- Edit namespace / quota workflow entry
- Manage labels
- Manage annotations
- View YAML
- Copy name

Long-term recommendation:

- remove the standalone `Edit` column
- remove dedicated Labels and Annotations columns

### 3. Nodes

Keep current node data density:

- Name
- Status
- Roles
- Pods usage
- CPU
- Memory
- IP
- Version / kernel / OS as needed

Row actions:

- View YAML
- Copy name
- Copy IP
- Open terminal
- Cordon / Uncordon
- Drain

Long-term recommendation:

- do not add extra explicit action buttons
- add a standard `...` column that mirrors the existing right-click menu

### 4. Pods

Keep as core data columns:

- Name
- Ready
- Status
- Restarts
- CPU
- Memory
- Pod IP
- Node
- Created

Row actions:

- View YAML
- Copy name
- Copy namespace
- Copy Pod IP
- Logs if lightweight entry is desired
- Terminal if appropriate

### 5. Services

Keep as core data columns:

- Name
- Type
- ClusterIP
- ExternalIP
- Ports
- Created

Inline:

- copy ClusterIP or ExternalIP where helpful

Row actions:

- View YAML
- Copy name
- Copy namespace
- Copy ClusterIP
- Manage labels
- Manage annotations

### 6. ConfigMaps and Secrets

Keep as core data columns:

- Name
- Type for Secrets
- data key summary
- Created

Row actions:

- View YAML
- Copy name
- Copy namespace
- Manage labels
- Manage annotations
- Edit

### 7. PVCs and PVs

Keep as core data columns:

- Name
- Status
- Volume / Claim reference
- StorageClass
- Capacity
- Access modes
- Created

Inline:

- related resource links

Row actions:

- View YAML
- Copy name
- Copy namespace for PVC
- Manage labels
- Manage annotations

## Migration Strategy

### Phase 1: Establish the global action surface

Define shared product rules:

- every list should support row actions
- every list should expose a visible `...` action entry
- right-click and `...` are the same menu

### Phase 2: Standardize the highest-value pages

Priority order:

1. Deployments
2. Namespaces
3. Nodes
4. Pods
5. ConfigMaps and Secrets
6. PVCs and PVs
7. Services and Ingresses

### Phase 3: Remove action-column sprawl

Gradually migrate away from:

- standalone Edit columns
- standalone Labels columns
- standalone Annotations columns
- page-specific button columns that duplicate row menu operations

### Phase 4: Normalize generic resources

Update generic list pages so they also inherit:

- a standard actions column
- default row menus

This avoids a split between “premium” resource pages and “everything else”.

## Decision Heuristics

When deciding where a new action belongs, use these checks:

### Put it inline when

- the action operates on the exact visible field value
- it is low-risk and single-step
- removing it from the cell would make the field feel less useful

### Put it in `...` and right-click when

- the action applies to the whole resource row
- it is meaningful from a list context
- it should be discoverable and also fast for power users

### Keep it on the detail page when

- the workflow is multi-step
- the action needs more context
- the action is operationally risky
- the UI needs more space than a menu or lightweight dialog

## Known Gap

There is currently no clearly reusable shared editor for scheduling-specific settings such as affinity.

Implication:

- affinity should not be introduced into row menus until a reusable editor pattern exists
- once such an editor exists, it can be evaluated as a row-level action for compute resources

## Recommended Final State

The product should converge toward:

- data-first tables
- one explicit `...` actions column on the far right
- right-click as a first-class desktop shortcut
- rare and intentional inline micro-actions
- detail pages as the deep operation surface

This creates a predictable interaction model that works across compute, config, storage, network, and generic resources without forcing every list page to invent its own action strategy.
