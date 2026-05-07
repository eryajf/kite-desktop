import type { Namespace } from 'kubernetes-types/core/v1'

import {
  type MetadataType,
  ResourceMetadataDialog,
} from './resource-metadata-dialog'

export function NamespaceMetadataDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  namespace: Namespace | null
  type: MetadataType
}) {
  const { open, onOpenChange, namespace, type } = props

  return (
    <ResourceMetadataDialog
      open={open}
      onOpenChange={onOpenChange}
      resourceType="namespaces"
      resource={namespace}
      type={type}
      titleKey={`namespaceMetadataDialog.${type}Title`}
      descriptionKey={`namespaceMetadataDialog.${type}Description`}
      successKey="namespaceMetadataDialog.success"
    />
  )
}
