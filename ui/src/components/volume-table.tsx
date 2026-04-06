import { Container, Volume } from 'kubernetes-types/core/v1'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Column, SimpleTable } from '@/components/simple-table'

interface VolumeTableProps {
  namespace: string
  volumes?: Volume[]
  containers?: Container[]
  isLoading?: boolean
}

interface VolumeTableData {
  name: string
  type: string
  details: React.ReactNode
  mounts: string
}

export function VolumeTable({
  namespace,
  volumes,
  containers,
  isLoading,
}: VolumeTableProps) {
  const { t } = useTranslation()
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('detail.tabs.volumes')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <span className="text-muted-foreground">
              {t('volumeTable.loading')}
            </span>
          </div>
        </CardContent>
      </Card>
    )
  }

  const getVolumeType = (volume: Volume): string => {
    const keys = Object.keys(volume).filter((key) => key !== 'name')
    return keys[0] || t('volumeTable.unknown')
  }

  const getVolumeDetails = (volume: Volume): React.ReactNode => {
    if (volume.persistentVolumeClaim) {
      return (
        <Link
          to={`/persistentvolumeclaims/${namespace}/${volume.persistentVolumeClaim.claimName}`}
          className="app-link"
        >
          {volume.persistentVolumeClaim.claimName}
        </Link>
      )
    }
    if (volume.configMap) {
      return (
        <Link
          to={`/configmaps/${namespace}/${volume.configMap.name}`}
          className="app-link"
        >
          {volume.configMap.name || t('volumeTable.na')}
        </Link>
      )
    }
    if (volume.secret) {
      return (
        <Link
          to={`/secrets/${namespace}/${volume.secret.secretName}`}
          className="app-link"
        >
          {volume.secret.secretName || t('volumeTable.na')}
        </Link>
      )
    }
    if (volume.hostPath) {
      return (
        <span className="text-sm text-muted-foreground font-mono">
          {volume.hostPath.path || t('volumeTable.na')}
        </span>
      )
    }
    if (volume.emptyDir) {
      const medium = volume.emptyDir.medium || t('volumeTable.defaultMedium')
      const sizeLimit = volume.emptyDir.sizeLimit
      return (
        <span className="text-sm text-muted-foreground">
          {`${medium}${sizeLimit ? `, ${t('volumeTable.size')}: ${sizeLimit}` : ''}`}
        </span>
      )
    }
    return <span className="text-sm text-muted-foreground">{t('volumeTable.na')}</span>
  }

  const getVolumeMounts = (volume: Volume): string => {
    const mounts: string[] = []

    containers?.forEach((container) => {
      container.volumeMounts?.forEach((mount) => {
        if (mount.name === volume.name) {
          const mountInfo = `${container.name}:${mount.mountPath}`
          const readOnly = mount.readOnly ? ' (RO)' : ''
          mounts.push(mountInfo + readOnly)
        }
      })
    })

    return mounts.length > 0 ? mounts.join(', ') : t('volumeTable.noMounts')
  }

  const tableData: VolumeTableData[] =
    volumes?.map((volume) => ({
      name: volume.name,
      type: getVolumeType(volume),
      details: getVolumeDetails(volume),
      mounts: getVolumeMounts(volume),
    })) || []

  const columns: Column<VolumeTableData>[] = [
    {
      header: t('common.name'),
      accessor: (item) => item.name,
      cell: (value) => <span className="font-medium">{value as string}</span>,
      align: 'left',
    },
    {
      header: t('common.type', 'Type'),
      accessor: (item) => item.type,
      cell: (value) => (
        <Badge variant="outline" className="text-xs">
          {value as string}
        </Badge>
      ),
    },
    {
      header: t('volumeTable.details'),
      accessor: (item) => item.details,
      cell: (value) => value as React.ReactNode,
    },
    {
      header: t('volumeTable.volumeMounts'),
      accessor: (item) => item.mounts,
      align: 'left',
      cell: (value) => {
        const mounts = value as string
        if (mounts === t('volumeTable.noMounts')) {
          return <span className="text-muted-foreground">{mounts}</span>
        }

        const mountList = mounts.split(', ')
        return (
          <div className="space-y-1">
            {mountList.map((mount, index) => {
              const isReadOnly = mount.includes(' (RO)')
              const cleanMount = mount.replace(' (RO)', '')
              const [container, path] = cleanMount.split(':')

              return (
                <div key={index} className="flex items-center gap-2 text-xs">
                  <span className="font-medium font-mono">{container}</span>
                  <span>→</span>
                  <span className="text-muted-foreground font-mono">
                    {path}
                  </span>
                  {isReadOnly && (
                    <Badge variant="secondary" className="text-xs">
                      RO
                    </Badge>
                  )}
                </div>
              )
            })}
          </div>
        )
      },
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('detail.tabs.volumes')}</CardTitle>
      </CardHeader>
      <CardContent>
        <SimpleTable
          data={tableData}
          columns={columns}
          emptyMessage={t('volumeTable.empty')}
          pagination={{
            enabled: tableData.length > 10,
            pageSize: 10,
            showPageInfo: true,
          }}
        />
      </CardContent>
    </Card>
  )
}
