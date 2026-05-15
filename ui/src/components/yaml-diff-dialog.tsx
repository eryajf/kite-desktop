import { Suspense } from 'react'
import type { editor as monacoEditor } from 'monaco-editor'
import { useTranslation } from 'react-i18next'

import { MonacoDiffEditor } from '@/lib/monaco-loader'
import {
  defineMonacoBackgroundThemes,
  useMonacoBackgroundColor,
} from '@/lib/monaco-theme'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { useAppearance } from './appearance-provider'

interface YamlDiffDialogProps {
  open: boolean
  original: string
  modified: string
  isSaving?: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  onContinueEditing: () => void
}

export function YamlDiffDialog({
  open,
  original,
  modified,
  isSaving = false,
  onOpenChange,
  onConfirm,
  onContinueEditing,
}: YamlDiffDialogProps) {
  const { t } = useTranslation()
  const { actualTheme, colorTheme } = useAppearance()
  const themeMode = actualTheme === 'dark' ? 'dark' : 'light'
  const backgroundColor = useMonacoBackgroundColor(
    '--background',
    themeMode,
    colorTheme
  )

  const handleEditorDidMount = (editor: monacoEditor.IStandaloneDiffEditor) => {
    editor.updateOptions({ readOnly: true })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-6xl sm:!max-w-6xl max-h-[85vh] flex min-h-0 flex-col">
        <DialogHeader>
          <DialogTitle>{t('yamlEditor.diffTitle')}</DialogTitle>
          <DialogDescription>
            {t('yamlEditor.diffDescription')}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden rounded-md border">
          <Suspense
            fallback={
              <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
                {t('yamlEditor.loadingEditor')}
              </div>
            }
          >
            <MonacoDiffEditor
              key={`yaml-save-diff-${colorTheme}-${actualTheme}-${backgroundColor}`}
              height="60vh"
              language="yaml"
              beforeMount={(monaco) => {
                defineMonacoBackgroundThemes(monaco, {
                  darkThemeName: `custom-dark-${colorTheme}`,
                  lightThemeName: `custom-vs-${colorTheme}`,
                  backgroundColor,
                })
              }}
              theme={
                actualTheme === 'dark'
                  ? `custom-dark-${colorTheme}`
                  : `custom-vs-${colorTheme}`
              }
              original={original}
              modified={modified}
              onMount={handleEditorDidMount}
              options={{
                readOnly: true,
                minimap: { enabled: true },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                folding: true,
                lineNumbers: 'on',
                fontSize: 14,
                fontFamily:
                  "'Maple Mono',Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace",
                renderSideBySide: true,
                enableSplitViewResizing: true,
                renderOverviewRuler: true,
                overviewRulerBorder: true,
                overviewRulerLanes: 2,
                automaticLayout: true,
              }}
            />
          </Suspense>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onContinueEditing}
            disabled={isSaving}
          >
            {t('yamlEditor.continueEditing')}
          </Button>
          <Button type="button" onClick={onConfirm} disabled={isSaving}>
            {isSaving ? t('yamlEditor.saving') : t('yamlEditor.confirmSave')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
