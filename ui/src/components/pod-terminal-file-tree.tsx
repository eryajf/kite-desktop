import { useEffect, useState } from 'react'
import {
  IconArrowUp,
  IconFile,
  IconFolder,
  IconFolderOpen,
  IconLoader,
} from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'

import { usePodFiles } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { ErrorMessage } from './error-message'
import { RefreshButton } from './refresh-button'

interface PodTerminalFileTreeProps {
  namespace?: string
  podName: string
  containerName: string
}

function joinPath(currentPath: string, name: string) {
  return currentPath === '/' ? `/${name}` : `${currentPath}/${name}`
}

function getParentPath(currentPath: string) {
  if (currentPath === '/') {
    return '/'
  }

  const parts = currentPath.split('/').filter(Boolean)
  parts.pop()
  return parts.length > 0 ? `/${parts.join('/')}` : '/'
}

export function PodTerminalFileTree({
  namespace = '',
  podName,
  containerName,
}: PodTerminalFileTreeProps) {
  const { t } = useTranslation()
  const [currentPath, setCurrentPath] = useState('/')
  const enabled = Boolean(namespace && podName && containerName)

  useEffect(() => {
    setCurrentPath('/')
  }, [containerName, podName])

  const {
    data: files,
    isLoading,
    error,
    refetch,
  } = usePodFiles(namespace, podName, containerName, currentPath, { enabled })

  const handleNavigate = (path: string) => {
    setCurrentPath(path.startsWith('/') ? path : `/${path}`)
  }

  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-r bg-background">
      <div className="flex shrink-0 items-center gap-2 border-b p-3">
        <IconFolderOpen className="h-4 w-4 text-muted-foreground" />
        <Input
          value={currentPath}
          aria-label={t('podFiles.currentPath')}
          onChange={(event) => setCurrentPath(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              handleNavigate(currentPath)
            }
          }}
          className="h-8 font-mono text-sm"
        />
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('podFiles.goToParentDirectory')}
          onClick={() => handleNavigate(getParentPath(currentPath))}
          disabled={currentPath === '/'}
        >
          <IconArrowUp className="h-4 w-4" />
        </Button>
        <RefreshButton
          variant="ghost"
          size="icon"
          aria-label={t('podFiles.refreshFileList')}
          onClick={() => refetch()}
          disabled={!enabled}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {!enabled ? (
          <div className="px-2 py-6 text-sm text-muted-foreground">
            {t('terminalContent.fileTreeUnavailable')}
          </div>
        ) : error ? (
          <ErrorMessage
            resourceName="pod files"
            error={error}
            refetch={refetch}
          />
        ) : isLoading ? (
          <div className="flex items-center gap-2 px-2 py-6 text-sm text-muted-foreground">
            <IconLoader className="h-4 w-4 animate-spin" />
            {t('podFiles.loadingFiles')}
          </div>
        ) : files && files.length > 0 ? (
          <div className="space-y-1">
            {files.map((file) =>
              file.isDir ? (
                <Button
                  key={file.name}
                  variant="ghost"
                  className="h-auto w-full justify-start gap-2 px-2 py-1.5 text-left font-normal"
                  aria-label={t('podFiles.enterDirectory', {
                    name: file.name,
                  })}
                  onClick={() =>
                    handleNavigate(joinPath(currentPath, file.name))
                  }
                >
                  <IconFolder className="h-4 w-4 shrink-0 text-blue-500" />
                  <span className="truncate font-mono text-sm">
                    {file.name}
                  </span>
                </Button>
              ) : (
                <div
                  key={file.name}
                  className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground"
                >
                  <IconFile className="h-4 w-4 shrink-0" />
                  <span className="truncate font-mono">{file.name}</span>
                </div>
              )
            )}
          </div>
        ) : (
          <div className="px-2 py-6 text-sm text-muted-foreground">
            {t('podFiles.noFilesFound')}
          </div>
        )}
      </div>
    </aside>
  )
}
