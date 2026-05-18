import type { PersistentVolume } from 'kubernetes-types/core/v1'
import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { formatDate } from '@/lib/utils'
import { PVReclaimPolicyDialog } from '@/components/editors/storage-edit-dialogs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

import {
  DetailField,
  StatusBadge,
  StorageResourceDetailShell,
} from './storage-detail-shared'

function getVolumeSource(pv: PersistentVolume) {
  const spec = pv.spec

  if (spec?.csi) {
    return {
      type: 'CSI',
      detail: spec.csi.driver || spec.csi.volumeHandle || '-',
    }
  }
  if (spec?.nfs) {
    return {
      type: 'NFS',
      detail: `${spec.nfs.server}:${spec.nfs.path}`,
    }
  }
  if (spec?.hostPath) {
    return {
      type: 'HostPath',
      detail: spec.hostPath.path,
    }
  }
  if (spec?.local) {
    return {
      type: 'Local',
      detail: spec.local.path,
    }
  }
  if (spec?.awsElasticBlockStore) {
    return {
      type: 'AWSElasticBlockStore',
      detail: spec.awsElasticBlockStore.volumeID,
    }
  }
  if (spec?.gcePersistentDisk) {
    return {
      type: 'GCEPersistentDisk',
      detail: spec.gcePersistentDisk.pdName,
    }
  }

  return {
    type: '-',
    detail: '-',
  }
}

export function PVDetail(props: { name: string }) {
  const { name } = props
  const { t } = useTranslation()
  const [reclaimPolicyPV, setReclaimPolicyPV] =
    useState<PersistentVolume | null>(null)

  return (
    <StorageResourceDetailShell
      resourceType="persistentvolumes"
      name={name}
      title="PV"
      overviewTitle={t('storageDetails.pvInformation')}
      renderHeaderActions={(pv, refresh) => (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setReclaimPolicyPV(pv)}
          >
            <RotateCcw className="h-4 w-4" />
            {t('storageEdit.reclaimPolicyAction')}
          </Button>
          <PVReclaimPolicyDialog
            open={Boolean(reclaimPolicyPV)}
            onOpenChange={(open) => {
              if (!open) {
                setReclaimPolicyPV(null)
              }
            }}
            pv={reclaimPolicyPV}
            onSuccess={refresh}
          />
        </>
      )}
      renderOverview={(pv) => {
        const source = getVolumeSource(pv)
        const claimRef = pv.spec?.claimRef
        const isReleasedRetain =
          pv.status?.phase === 'Released' &&
          pv.spec?.persistentVolumeReclaimPolicy === 'Retain'

        return (
          <div className="space-y-4">
            {isReleasedRetain ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {t('storageDetails.releasedRetainWarning')}
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <DetailField label={t('common.status')}>
                <StatusBadge phase={pv.status?.phase} />
              </DetailField>
              <DetailField label={t('pvs.capacity')} mono>
                {pv.spec?.capacity?.storage || '-'}
              </DetailField>
              <DetailField label={t('pvs.accessModes')}>
                {pv.spec?.accessModes?.join(', ') || '-'}
              </DetailField>
              <DetailField label={t('pvs.reclaimPolicy')}>
                {pv.spec?.persistentVolumeReclaimPolicy || '-'}
              </DetailField>
              <DetailField label={t('storageDetails.volumeMode')}>
                {pv.spec?.volumeMode || '-'}
              </DetailField>
              <DetailField label={t('pvs.storageClass')}>
                {pv.spec?.storageClassName ? (
                  <Link to={`/storageclasses/${pv.spec.storageClassName}`} className="app-link">
                    {pv.spec.storageClassName}
                  </Link>
                ) : (
                  '-'
                )}
              </DetailField>
              <DetailField label={t('pvs.claim')}>
                {claimRef?.namespace && claimRef.name ? (
                  <Link
                    to={`/persistentvolumeclaims/${claimRef.namespace}/${claimRef.name}`}
                    className="app-link"
                  >
                    {claimRef.namespace}/{claimRef.name}
                  </Link>
                ) : (
                  '-'
                )}
              </DetailField>
              <DetailField label={t('storageDetails.volumeSource')}>
                {source.type}
              </DetailField>
              <DetailField label={t('storageDetails.volumeSourceDetail')} mono>
                {source.detail}
              </DetailField>
              <DetailField label={t('storageDetails.nodeAffinity')}>
                {pv.spec?.nodeAffinity ? t('common.yes') : t('common.no')}
              </DetailField>
              <DetailField label={t('detail.fields.created')}>
                {formatDate(pv.metadata?.creationTimestamp || '')}
              </DetailField>
              <DetailField label={t('detail.fields.uid')} mono>
                {pv.metadata?.uid || '-'}
              </DetailField>
            </div>
          </div>
        )
      }}
    />
  )
}
