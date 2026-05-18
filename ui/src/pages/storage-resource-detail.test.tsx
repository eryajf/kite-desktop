import { render, screen } from '@testing-library/react'
import type {
  PersistentVolume,
  PersistentVolumeClaim,
  Pod,
} from 'kubernetes-types/core/v1'
import type { StorageClass } from 'kubernetes-types/storage/v1'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PVDetail } from './pv-detail'
import { PVCDetail } from './pvc-detail'
import { StorageClassDetail } from './storageclass-detail'

const mockUseResource = vi.fn()
const mockUseResources = vi.fn()
const mockUpdateResource = vi.fn()
const mockT = (key: string) => key
const mockResponsiveTabs = vi.fn()

function renderPVCDetail() {
  return render(
    <MemoryRouter>
      <PVCDetail namespace="default" name="data-web-0" />
    </MemoryRouter>
  )
}

function renderPVDetail() {
  return render(
    <MemoryRouter>
      <PVDetail name="pv-data-web-0" />
    </MemoryRouter>
  )
}

function renderStorageClassDetail() {
  return render(
    <MemoryRouter>
      <StorageClassDetail name="fast-ssd" />
    </MemoryRouter>
  )
}

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>()

  return {
    ...actual,
    useTranslation: () => ({
      t: mockT,
    }),
  }
})

vi.mock('@/lib/api', () => ({
  useResource: (...args: unknown[]) => mockUseResource(...args),
  useResources: (...args: unknown[]) => mockUseResources(...args),
  updateResource: (...args: unknown[]) => mockUpdateResource(...args),
}))

vi.mock('@/components/ui/responsive-tabs', () => ({
  ResponsiveTabs: ({
    tabs,
  }: {
    tabs: { value: string; label: string; content: React.ReactNode }[]
  }) => {
    mockResponsiveTabs(tabs)
    return (
      <div>
        {tabs.map((tab) => (
          <section key={tab.value}>{tab.content}</section>
        ))}
      </div>
    )
  },
}))

vi.mock('@/components/refresh-button', () => ({
  RefreshButton: ({ children }: { children: React.ReactNode }) => (
    <button>{children}</button>
  ),
}))

vi.mock('@/components/describe-dialog', () => ({
  DescribeDialog: () => <button>describe</button>,
}))

vi.mock('@/components/yaml-editor', () => ({
  YamlEditor: () => <div>yaml-editor</div>,
}))

vi.mock('@/components/related-resource-table', () => ({
  RelatedResourcesTable: () => <div>related-resources</div>,
}))

vi.mock('@/components/event-table', () => ({
  EventTable: () => <div>events</div>,
}))

vi.mock('@/components/resource-history-table', () => ({
  ResourceHistoryTable: () => <div>history</div>,
}))

vi.mock('@/components/resource-delete-confirmation-dialog', () => ({
  ResourceDeleteConfirmationDialog: () => null,
}))

describe('storage resource details', () => {
  beforeEach(() => {
    mockUseResource.mockReset()
    mockUseResources.mockReset()
    mockUpdateResource.mockReset()
    mockResponsiveTabs.mockReset()
    mockUpdateResource.mockResolvedValue(undefined)
    mockUseResources.mockReturnValue({
      data: [],
      isLoading: false,
    })
  })

  it('shows pvc binding, capacity, and consuming pods', () => {
    const pvc = {
      metadata: {
        name: 'data-web-0',
        namespace: 'default',
        creationTimestamp: '2026-05-09T13:52:32.000Z',
      },
      spec: {
        storageClassName: 'fast-ssd',
        volumeName: 'pv-data-web-0',
        volumeMode: 'Filesystem',
        accessModes: ['ReadWriteOnce'],
        resources: {
          requests: {
            storage: '20Gi',
          },
        },
      },
      status: {
        phase: 'Bound',
        capacity: {
          storage: '20Gi',
        },
      },
    } as PersistentVolumeClaim
    const pod = {
      metadata: {
        name: 'web-0',
        namespace: 'default',
      },
      spec: {
        volumes: [
          {
            name: 'data',
            persistentVolumeClaim: {
              claimName: 'data-web-0',
            },
          },
        ],
      },
    } as Pod

    mockUseResource.mockReturnValue({
      data: pvc,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })
    mockUseResources.mockImplementation((resource: string) => ({
      data: resource === 'pods' ? [pod] : [],
      isLoading: false,
    }))

    renderPVCDetail()

    expect(screen.getByText('storageDetails.pvcInformation')).toBeInTheDocument()
    expect(screen.getByText('Bound')).toBeInTheDocument()
    expect(screen.getAllByText('20Gi')).toHaveLength(2)
    expect(screen.getByText('ReadWriteOnce')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'pv-data-web-0' })).toHaveAttribute(
      'href',
      '/persistentvolumes/pv-data-web-0'
    )
    expect(screen.getByRole('link', { name: 'fast-ssd' })).toHaveAttribute(
      'href',
      '/storageclasses/fast-ssd'
    )
    expect(screen.getByRole('link', { name: 'web-0' })).toHaveAttribute(
      'href',
      '/pods/default/web-0'
    )
    expect(mockResponsiveTabs.mock.calls[0][0].map((tab: { value: string }) => tab.value)).toEqual([
      'overview',
      'yaml',
      'Related',
      'events',
      'history',
    ])
  })

  it('shows pv binding, source type, and reclaim risk', () => {
    const pv = {
      metadata: {
        name: 'pv-data-web-0',
        creationTimestamp: '2026-05-09T13:52:32.000Z',
      },
      spec: {
        storageClassName: 'fast-ssd',
        persistentVolumeReclaimPolicy: 'Retain',
        volumeMode: 'Filesystem',
        accessModes: ['ReadWriteOnce'],
        capacity: {
          storage: '20Gi',
        },
        claimRef: {
          namespace: 'default',
          name: 'data-web-0',
        },
        csi: {
          driver: 'ebs.csi.aws.com',
          volumeHandle: 'vol-123',
        },
      },
      status: {
        phase: 'Released',
      },
    } as PersistentVolume

    mockUseResource.mockReturnValue({
      data: pv,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })

    renderPVDetail()

    expect(screen.getByText('storageDetails.pvInformation')).toBeInTheDocument()
    expect(screen.getByText('Released')).toBeInTheDocument()
    expect(screen.getByText('Retain')).toBeInTheDocument()
    expect(screen.getByText('storageDetails.releasedRetainWarning')).toBeInTheDocument()
    expect(screen.getByText('CSI')).toBeInTheDocument()
    expect(screen.getByText('ebs.csi.aws.com')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'default/data-web-0' })).toHaveAttribute(
      'href',
      '/persistentvolumeclaims/default/data-web-0'
    )
  })

  it('shows storage class policy and linked pvcs and pvs', () => {
    const storageClass = {
      metadata: {
        name: 'fast-ssd',
        annotations: {
          'storageclass.kubernetes.io/is-default-class': 'true',
        },
        creationTimestamp: '2026-05-09T13:52:32.000Z',
      },
      provisioner: 'ebs.csi.aws.com',
      reclaimPolicy: 'Delete',
      volumeBindingMode: 'WaitForFirstConsumer',
      allowVolumeExpansion: true,
      parameters: {
        type: 'gp3',
      },
      mountOptions: ['discard'],
    } as StorageClass
    const pvc = {
      metadata: {
        name: 'data-web-0',
        namespace: 'default',
      },
      spec: {
        storageClassName: 'fast-ssd',
      },
      status: {
        phase: 'Bound',
      },
    } as PersistentVolumeClaim
    const pv = {
      metadata: {
        name: 'pv-data-web-0',
      },
      spec: {
        storageClassName: 'fast-ssd',
      },
      status: {
        phase: 'Bound',
      },
    } as PersistentVolume

    mockUseResource.mockReturnValue({
      data: storageClass,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })
    mockUseResources.mockImplementation((resource: string) => ({
      data:
        resource === 'persistentvolumeclaims'
          ? [pvc]
          : resource === 'persistentvolumes'
            ? [pv]
            : [],
      isLoading: false,
    }))

    renderStorageClassDetail()

    expect(screen.getByText('storageDetails.storageClassInformation')).toBeInTheDocument()
    expect(screen.getByText('ebs.csi.aws.com')).toBeInTheDocument()
    expect(screen.getByText('WaitForFirstConsumer')).toBeInTheDocument()
    expect(screen.getAllByText('common.yes')).toHaveLength(2)
    expect(screen.getByText('type=gp3')).toBeInTheDocument()
    expect(screen.getByText('discard')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'default/data-web-0' })).toHaveAttribute(
      'href',
      '/persistentvolumeclaims/default/data-web-0'
    )
    expect(screen.getByRole('link', { name: 'pv-data-web-0' })).toHaveAttribute(
      'href',
      '/persistentvolumes/pv-data-web-0'
    )
  })
})
