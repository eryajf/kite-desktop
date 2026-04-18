import { useNavigation } from '@/contexts/navigation-context'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

export function NavigationControls() {
  const { t } = useTranslation()
  const { canGoBack, canGoForward, goBack, goForward } = useNavigation()

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={goBack}
        disabled={!canGoBack}
        aria-label={t('common.back', 'Back')}
        title={t('common.back', 'Back')}
        className="size-8 rounded-md text-muted-foreground hover:text-foreground disabled:text-muted-foreground/40 disabled:opacity-100"
      >
        <ArrowLeft className="h-4 w-4" />
        <span className="sr-only">Back</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={goForward}
        disabled={!canGoForward}
        aria-label={t('common.forward', 'Forward')}
        title={t('common.forward', 'Forward')}
        className="size-8 rounded-md text-muted-foreground hover:text-foreground disabled:text-muted-foreground/40 disabled:opacity-100"
      >
        <ArrowRight className="h-4 w-4" />
        <span className="sr-only">Forward</span>
      </Button>
    </div>
  )
}
