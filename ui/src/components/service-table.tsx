import { useMemo } from 'react'
import { IconLoader } from '@tabler/icons-react'
import { Service } from 'kubernetes-types/core/v1'
import { useTranslation } from 'react-i18next'

import { Column, SimpleTable } from './simple-table'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

export function ServiceTable(props: {
  services?: Service[]
  isLoading?: boolean
}) {
  const { t } = useTranslation()
  const { services, isLoading } = props

  // Service table columns
  const serviceColumns = useMemo(
    (): Column<Service>[] => [
      {
        header: t('common.name'),
        accessor: (service: Service) => service.metadata?.name || '',
        cell: (value: unknown) => (
          <div className="font-medium">{value as string}</div>
        ),
      },
      {
        header: t('services.type'),
        accessor: (service: Service) => service.spec?.type || 'ClusterIP',
        cell: (value: unknown) => value as string,
      },
      {
        header: t('services.clusterIP'),
        accessor: (service: Service) => service.spec?.clusterIP || '-',
        cell: (value: unknown) => (
          <span className="font-mono text-sm text-muted-foreground">
            {value as string}
          </span>
        ),
      },
      {
        header: t('services.ports'),
        accessor: (service: Service) => service.spec?.ports || [],
        cell: (value: unknown) => {
          const ports = value as Array<{
            port?: number
            targetPort?: string | number
          }>
          const text =
            ports.map((port) => `${port.port}:${port.targetPort}`).join(', ') ||
            '-'
          return (
            <span className="font-mono text-sm text-muted-foreground">
              {text}
            </span>
          )
        },
      },
    ],
    [t]
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <IconLoader className="animate-spin mr-2" />
        {t('serviceTable.loading')}
      </div>
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('services.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <SimpleTable
          data={services || []}
          columns={serviceColumns}
          emptyMessage={t('serviceTable.empty')}
        />
      </CardContent>
    </Card>
  )
}
