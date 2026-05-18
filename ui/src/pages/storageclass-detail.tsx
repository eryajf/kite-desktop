import type { PersistentVolume, PersistentVolumeClaim } from 'kubernetes-types/core/v1'
import { StorageClass } from 'kubernetes-types/storage/v1'
import { Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { useResources } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import {
  isDefaultStorageClass,
  setStorageClassDefault,
} from '@/components/editors/storage-edit-dialogs'
import { Badge } from '@/components/ui/badge'
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
  KeyValueList,
  StatusBadge,
  StorageResourceDetailShell,
} from './storage-detail-shared'

function StorageClassAssociations({
  storageClass,
}: {
  storageClass: StorageClass
}) {
  const { t } = useTranslation()
  const name = storageClass.metadata?.name || ''
  const { data: pvcs = [] } = useResources('persistentvolumeclaims')
  const { data: pvs = [] } = useResources('persistentvolumes')
  const relatedPVCs = pvcs.filter((pvc) => pvc.spec?.storageClassName === name)
  const relatedPVs = pvs.filter((pv) => pv.spec?.storageClassName === name)

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">{t('storageDetails.claims')}</h3>
        <Table containerClassName="border-b">
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead>{t('common.name')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead>{t('pvcs.capacity')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {relatedPVCs.length === 0 ? (
              <EmptyTableRow colSpan={3} />
            ) : (
              relatedPVCs.map((pvc: PersistentVolumeClaim) => (
                <TableRow key={pvc.metadata?.uid || `${pvc.metadata?.namespace}/${pvc.metadata?.name}`}>
                  <TableCell>
                    <Link
                      to={`/persistentvolumeclaims/${pvc.metadata?.namespace}/${pvc.metadata?.name}`}
                      className="app-link"
                    >
                      {pvc.metadata?.namespace}/{pvc.metadata?.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge phase={pvc.status?.phase} />
                  </TableCell>
                  <TableCell className="font-mono">
                    {pvc.status?.capacity?.storage ||
                      pvc.spec?.resources?.requests?.storage ||
                      '-'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">{t('storageDetails.volumes')}</h3>
        <Table containerClassName="border-b">
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead>{t('common.name')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead>{t('pvs.capacity')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {relatedPVs.length === 0 ? (
              <EmptyTableRow colSpan={3} />
            ) : (
              relatedPVs.map((pv: PersistentVolume) => (
                <TableRow key={pv.metadata?.uid || pv.metadata?.name}>
                  <TableCell>
                    <Link to={`/persistentvolumes/${pv.metadata?.name}`} className="app-link">
                      {pv.metadata?.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge phase={pv.status?.phase} />
                  </TableCell>
                  <TableCell className="font-mono">
                    {pv.spec?.capacity?.storage || '-'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  )
}

export function StorageClassDetail(props: { name: string }) {
  const { name } = props
  const { t } = useTranslation()

  const handleToggleDefault = async (
    storageClass: StorageClass,
    refresh: () => Promise<void>
  ) => {
    const nextDefault = !isDefaultStorageClass(storageClass)
    try {
      await setStorageClassDefault(storageClass, nextDefault)
      await refresh()
      toast.success(
        t(
          nextDefault
            ? 'storageEdit.setDefaultSuccess'
            : 'storageEdit.unsetDefaultSuccess',
          { name: storageClass.metadata?.name || '' }
        )
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('common.error'))
    }
  }

  return (
    <StorageResourceDetailShell
      resourceType="storageclasses"
      name={name}
      title="StorageClass"
      overviewTitle={t('storageDetails.storageClassInformation')}
      renderHeaderActions={(storageClass, refresh) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleToggleDefault(storageClass, refresh)}
        >
          <Star className="h-4 w-4" />
          {isDefaultStorageClass(storageClass)
            ? t('storageEdit.unsetDefaultAction')
            : t('storageEdit.setDefaultAction')}
        </Button>
      )}
      renderOverview={(storageClass) => (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <DetailField label={t('storageClasses.provisioner')} mono>
              {storageClass.provisioner || '-'}
            </DetailField>
            <DetailField label={t('storageClasses.defaultClass')}>
              <Badge variant={isDefaultStorageClass(storageClass) ? 'default' : 'outline'}>
                {isDefaultStorageClass(storageClass) ? t('common.yes') : t('common.no')}
              </Badge>
            </DetailField>
            <DetailField label={t('pvs.reclaimPolicy')}>
              {storageClass.reclaimPolicy || 'Delete'}
            </DetailField>
            <DetailField label={t('storageClasses.volumeBindingMode')}>
              {storageClass.volumeBindingMode || 'Immediate'}
            </DetailField>
            <DetailField label={t('storageClasses.allowExpansion')}>
              {storageClass.allowVolumeExpansion ? t('common.yes') : t('common.no')}
            </DetailField>
            <DetailField label={t('detail.fields.created')}>
              {formatDate(storageClass.metadata?.creationTimestamp || '')}
            </DetailField>
            <DetailField label={t('detail.fields.uid')} mono>
              {storageClass.metadata?.uid || '-'}
            </DetailField>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <DetailField label={t('storageClasses.parameters')}>
              <KeyValueList values={storageClass.parameters} />
            </DetailField>
            <DetailField label={t('storageClasses.mountOptions')}>
              {(storageClass.mountOptions || []).length > 0 ? (
                <div className="space-y-1">
                  {storageClass.mountOptions?.map((option) => (
                    <div key={option} className="font-mono text-sm">
                      {option}
                    </div>
                  ))}
                </div>
              ) : (
                '-'
              )}
            </DetailField>
          </div>
        </div>
      )}
      renderAssociations={(storageClass) => (
        <StorageClassAssociations storageClass={storageClass} />
      )}
    />
  )
}
