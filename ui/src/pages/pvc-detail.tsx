import type { PersistentVolumeClaim, Pod } from 'kubernetes-types/core/v1'
import { useState } from 'react'
import { Maximize2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { useResources } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { PVCResizeDialog } from '@/components/editors/storage-edit-dialogs'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import {
  DetailField,
  EmptyTableRow,
  StatusBadge,
  StorageResourceDetailShell,
} from './storage-detail-shared'

function podUsesPVC(pod: Pod, pvcName: string) {
  return (pod.spec?.volumes || []).some(
    (volume) => volume.persistentVolumeClaim?.claimName === pvcName
  )
}

function PVCConsumers({
  namespace,
  pvc,
}: {
  namespace: string
  pvc: PersistentVolumeClaim
}) {
  const { t } = useTranslation()
  const { data: pods = [] } = useResources('pods', namespace)
  const consumers = pods.filter((pod) => podUsesPVC(pod, pvc.metadata?.name || ''))

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">{t('storageDetails.consumingPods')}</h3>
      <Table containerClassName="border-b">
        <TableHeader className="bg-muted">
          <TableRow>
            <TableHead>{t('common.name')}</TableHead>
            <TableHead>{t('detail.fields.namespace')}</TableHead>
            <TableHead>{t('detail.fields.created')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {consumers.length === 0 ? (
            <EmptyTableRow colSpan={3} />
          ) : (
            consumers.map((pod) => (
              <TableRow key={pod.metadata?.uid || pod.metadata?.name}>
                <TableCell>
                  <Link
                    to={`/pods/${pod.metadata?.namespace}/${pod.metadata?.name}`}
                    className="app-link"
                  >
                    {pod.metadata?.name}
                  </Link>
                </TableCell>
                <TableCell>{pod.metadata?.namespace || '-'}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {pod.metadata?.creationTimestamp
                    ? formatDate(pod.metadata.creationTimestamp)
                    : '-'}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

export function PVCDetail(props: { namespace: string; name: string }) {
  const { name, namespace } = props
  const { t } = useTranslation()
  const [resizePVC, setResizePVC] = useState<PersistentVolumeClaim | null>(null)

  return (
    <>
      <StorageResourceDetailShell
        resourceType="persistentvolumeclaims"
        namespace={namespace}
        name={name}
        title="PVC"
        overviewTitle={t('storageDetails.pvcInformation')}
        renderHeaderActions={(pvc, refresh) => (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setResizePVC(pvc)}
            >
              <Maximize2 className="h-4 w-4" />
              {t('storageEdit.resizePVCAction')}
            </Button>
            <PVCResizeDialog
              open={Boolean(resizePVC)}
              onOpenChange={(open) => {
                if (!open) {
                  setResizePVC(null)
                }
              }}
              pvc={resizePVC}
              onSuccess={refresh}
            />
          </>
        )}
        renderOverview={(pvc) => (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <DetailField label={t('common.status')}>
              <StatusBadge phase={pvc.status?.phase} />
            </DetailField>
            <DetailField label={t('pvcs.capacity')} mono>
              {pvc.status?.capacity?.storage ||
                pvc.spec?.resources?.requests?.storage ||
                '-'}
            </DetailField>
            <DetailField label={t('storageDetails.requestedStorage')} mono>
              {pvc.spec?.resources?.requests?.storage || '-'}
            </DetailField>
            <DetailField label={t('pvcs.accessModes')}>
              {pvc.spec?.accessModes?.join(', ') || '-'}
            </DetailField>
            <DetailField label={t('storageDetails.volumeMode')}>
              {pvc.spec?.volumeMode || '-'}
            </DetailField>
            <DetailField label={t('pvcs.volume')}>
              {pvc.spec?.volumeName ? (
                <Link to={`/persistentvolumes/${pvc.spec.volumeName}`} className="app-link">
                  {pvc.spec.volumeName}
                </Link>
              ) : (
                '-'
              )}
            </DetailField>
            <DetailField label={t('pvcs.storageClass')}>
              {pvc.spec?.storageClassName ? (
                <Link to={`/storageclasses/${pvc.spec.storageClassName}`} className="app-link">
                  {pvc.spec.storageClassName}
                </Link>
              ) : (
                '-'
              )}
            </DetailField>
            <DetailField label={t('detail.fields.created')}>
              {formatDate(pvc.metadata?.creationTimestamp || '')}
            </DetailField>
            <DetailField label={t('detail.fields.uid')} mono>
              {pvc.metadata?.uid || '-'}
            </DetailField>
          </div>
        )}
        renderAssociations={(pvc) => <PVCConsumers namespace={namespace} pvc={pvc} />}
      />
    </>
  )
}
