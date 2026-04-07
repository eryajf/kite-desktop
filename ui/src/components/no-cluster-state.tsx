import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'

export function NoClusterState() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  return (
    <div className="flex min-h-[24rem] flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-muted/20 px-6 text-center">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">
          {t('cluster.emptyTitle', 'No cluster configured')}
        </h2>
        <p className="max-w-md text-sm text-muted-foreground">
          {t(
            'cluster.noCluster',
            'Please configure a cluster to start using Kite.'
          )}
        </p>
      </div>
      <Button
        variant="outline"
        onClick={() => navigate('/settings?tab=clusters')}
      >
        {t('cluster.goToSettings', 'Go to cluster settings')}
      </Button>
    </div>
  )
}
