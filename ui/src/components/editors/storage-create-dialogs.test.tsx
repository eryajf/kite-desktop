import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { StorageClass } from 'kubernetes-types/storage/v1'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { StorageClassCreateDialog } from './storage-create-dialogs'

const mockCreateResource = vi.fn()
const mockOnOpenChange = vi.fn()
const mockOnSuccess = vi.fn()

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  }
})

vi.mock('@/lib/api', () => ({
  createResource: (...args: unknown[]) => mockCreateResource(...args),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

function selectStorageClassTemplate(label: string) {
  fireEvent.click(
    screen.getByRole('combobox', { name: 'storageCreate.templateLabel' })
  )
  const listbox = screen.getByRole('listbox')
  fireEvent.click(within(listbox).getByText(label))
}

describe('StorageClassCreateDialog', () => {
  beforeEach(() => {
    mockCreateResource.mockReset()
    mockOnOpenChange.mockReset()
    mockOnSuccess.mockReset()
    mockCreateResource.mockImplementation(
      async (_resource: string, _namespace: string | undefined, body: StorageClass) =>
        body
    )
  })

  it('prefills AWS EBS template and submits expected StorageClass', async () => {
    render(
      <StorageClassCreateDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onSuccess={mockOnSuccess}
      />
    )

    selectStorageClassTemplate('storageCreate.template.awsEbs')

    expect(screen.getByDisplayValue('aws-ebs-gp3')).toBeInTheDocument()
    expect(screen.getByDisplayValue('ebs.csi.aws.com')).toBeInTheDocument()
    expect(screen.getByDisplayValue(/type=gp3/)).toBeInTheDocument()
    expect(screen.getByDisplayValue(/encrypted=true/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'common.create' }))

    await waitFor(() => {
      expect(mockCreateResource).toHaveBeenCalledWith(
        'storageclasses',
        undefined,
        expect.objectContaining({
          metadata: expect.objectContaining({
            name: 'aws-ebs-gp3',
          }),
          provisioner: 'ebs.csi.aws.com',
          reclaimPolicy: 'Delete',
          volumeBindingMode: 'WaitForFirstConsumer',
          allowVolumeExpansion: true,
          parameters: expect.objectContaining({
            type: 'gp3',
            encrypted: 'true',
            'csi.storage.k8s.io/fstype': 'ext4',
          }),
        })
      )
    })
    expect(mockOnOpenChange).toHaveBeenCalledWith(false)
    expect(mockOnSuccess).toHaveBeenCalled()
  })

  it('adds EKS Auto Mode topology parameter for the auto EBS template', async () => {
    render(
      <StorageClassCreateDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onSuccess={mockOnSuccess}
      />
    )

    selectStorageClassTemplate('storageCreate.template.awsEksAutoEbs')
    fireEvent.click(screen.getByRole('button', { name: 'common.create' }))

    await waitFor(() => {
      expect(mockCreateResource).toHaveBeenCalledWith(
        'storageclasses',
        undefined,
        expect.objectContaining({
          provisioner: 'ebs.csi.eks.amazonaws.com',
          parameters: expect.objectContaining({
            allowedTopologies: 'eks.amazonaws.com/compute-type=auto',
          }),
        })
      )
    })
  })
})
