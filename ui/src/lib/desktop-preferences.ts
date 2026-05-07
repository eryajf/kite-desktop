import {
  getResourceTablePreference,
  getUIPreference,
  getViewerPreference,
  getWorkspacePreference,
  saveResourceTablePreference,
  saveUIPreference,
  saveViewerPreference,
  saveWorkspacePreference,
  type ResourceTablePreferencePayload,
  type UIPreferencePayload,
  type ViewerPreferencePayload,
  type WorkspacePreferencePayload,
} from '@/lib/api/admin'

const CURRENT_CLUSTER_STORAGE_KEY = 'current-cluster'
const RECENT_CLUSTERS_STORAGE_KEY = 'recent-clusters'

let workspacePreferenceCache: WorkspacePreferencePayload | null = null
let resourceTablePreferenceCache: ResourceTablePreferencePayload | null = null
let viewerPreferenceCache: ViewerPreferencePayload | null = null
let uiPreferenceCache: UIPreferencePayload | null = null

export function getDefaultWorkspacePreference(): WorkspacePreferencePayload {
  return {
    currentCluster: '',
    recentClusters: [],
    selectedNamespaceByCluster: {},
  }
}

export function getDefaultResourceTablePreference(): ResourceTablePreferencePayload {
  return {
    columnVisibilityByCluster: {},
  }
}

export function getDefaultViewerPreference(): ViewerPreferencePayload {
  return {
    logViewer: {
      theme: 'classic',
      tailLines: 100,
      wordWrap: true,
      showLineNumbers: false,
      fontSize: 14,
    },
    terminal: {
      theme: 'classic',
      cursorStyle: 'bar',
      fontSize: 14,
    },
  }
}

export function getDefaultUIPreference(): UIPreferencePayload {
  return {
    settingsHintDismissed: false,
  }
}

function normalizeWorkspacePreference(
  payload?: Partial<WorkspacePreferencePayload>
): WorkspacePreferencePayload {
  const defaults = getDefaultWorkspacePreference()
  return {
    currentCluster: payload?.currentCluster || defaults.currentCluster,
    recentClusters: Array.isArray(payload?.recentClusters)
      ? payload.recentClusters.filter((item): item is string => typeof item === 'string')
      : defaults.recentClusters,
    selectedNamespaceByCluster:
      payload?.selectedNamespaceByCluster &&
      typeof payload.selectedNamespaceByCluster === 'object'
        ? payload.selectedNamespaceByCluster
        : defaults.selectedNamespaceByCluster,
  }
}

function normalizeResourceTablePreference(
  payload?: Partial<ResourceTablePreferencePayload>
): ResourceTablePreferencePayload {
  return {
    columnVisibilityByCluster:
      payload?.columnVisibilityByCluster &&
      typeof payload.columnVisibilityByCluster === 'object'
        ? payload.columnVisibilityByCluster
        : {},
  }
}

function normalizeViewerPreference(
  payload?: Partial<ViewerPreferencePayload>
): ViewerPreferencePayload {
  const defaults = getDefaultViewerPreference()
  return {
    logViewer: {
      ...defaults.logViewer,
      ...payload?.logViewer,
    },
    terminal: {
      ...defaults.terminal,
      ...payload?.terminal,
    },
  }
}

function normalizeUIPreference(
  payload?: Partial<UIPreferencePayload>
): UIPreferencePayload {
  return {
    settingsHintDismissed:
      payload?.settingsHintDismissed ?? getDefaultUIPreference().settingsHintDismissed,
  }
}

export function applyWorkspacePreferenceToLocalStorage(
  preference: WorkspacePreferencePayload
) {
  if (preference.currentCluster) {
    localStorage.setItem(CURRENT_CLUSTER_STORAGE_KEY, preference.currentCluster)
  }
  if (preference.recentClusters.length > 0) {
    localStorage.setItem(
      RECENT_CLUSTERS_STORAGE_KEY,
      JSON.stringify(preference.recentClusters)
    )
  }
  Object.entries(preference.selectedNamespaceByCluster).forEach(
    ([clusterName, namespace]) => {
      if (!clusterName) {
        return
      }
      localStorage.setItem(`${clusterName}selectedNamespace`, namespace)
    }
  )
}

export async function loadWorkspacePreference() {
  if (workspacePreferenceCache) {
    return workspacePreferenceCache
  }

  const preference = normalizeWorkspacePreference(await getWorkspacePreference())
  workspacePreferenceCache = preference
  applyWorkspacePreferenceToLocalStorage(preference)
  return preference
}

export async function updateWorkspacePreference(
  updater: (current: WorkspacePreferencePayload) => WorkspacePreferencePayload
) {
  const current = workspacePreferenceCache || (await loadWorkspacePreference())
  const next = normalizeWorkspacePreference(updater(current))
  workspacePreferenceCache = next
  applyWorkspacePreferenceToLocalStorage(next)
  await saveWorkspacePreference(next)
  return next
}

export async function loadResourceTablePreference() {
  if (resourceTablePreferenceCache) {
    return resourceTablePreferenceCache
  }

  const preference = normalizeResourceTablePreference(
    await getResourceTablePreference()
  )
  resourceTablePreferenceCache = preference
  return preference
}

export async function updateResourceTablePreference(
  updater: (
    current: ResourceTablePreferencePayload
  ) => ResourceTablePreferencePayload
) {
  const current =
    resourceTablePreferenceCache || (await loadResourceTablePreference())
  const next = normalizeResourceTablePreference(updater(current))
  resourceTablePreferenceCache = next
  await saveResourceTablePreference(next)
  return next
}

export async function loadViewerPreference() {
  if (viewerPreferenceCache) {
    return viewerPreferenceCache
  }

  const preference = normalizeViewerPreference(await getViewerPreference())
  viewerPreferenceCache = preference
  return preference
}

export async function updateViewerPreference(
  updater: (current: ViewerPreferencePayload) => ViewerPreferencePayload
) {
  const current = viewerPreferenceCache || (await loadViewerPreference())
  const next = normalizeViewerPreference(updater(current))
  viewerPreferenceCache = next
  await saveViewerPreference(next)
  return next
}

export async function loadUIPreference() {
  if (uiPreferenceCache) {
    return uiPreferenceCache
  }

  const preference = normalizeUIPreference(await getUIPreference())
  uiPreferenceCache = preference
  return preference
}

export async function updateUIPreference(
  updater: (current: UIPreferencePayload) => UIPreferencePayload
) {
  const current = uiPreferenceCache || (await loadUIPreference())
  const next = normalizeUIPreference(updater(current))
  uiPreferenceCache = next
  await saveUIPreference(next)
  return next
}
