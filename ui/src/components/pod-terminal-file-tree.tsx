import { useEffect, useRef, useState } from 'react'
import {
  IconArrowUp,
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconDownload,
  IconEdit,
  IconFile,
  IconFolder,
  IconFolderOpen,
  IconLoader,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  podDeleteFile,
  podDownloadFile,
  podListFiles,
  podReadFileContent,
  podUpdateFileContent,
  podUploadFile,
  usePodFiles,
} from '@/lib/api'
import { copyTextToClipboard } from '@/lib/desktop'
import { translateError } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

import { ErrorMessage } from './error-message'
import { RefreshButton } from './refresh-button'

interface PodTerminalFileTreeProps {
  clusterName?: string
  namespace?: string
  podName: string
  containerName: string
}

type FileTreeNode = NonNullable<ReturnType<typeof usePodFiles>['data']>[number]

interface DirectoryState {
  files?: FileTreeNode[]
  isLoading: boolean
  error?: unknown
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
  clusterName,
  namespace = '',
  podName,
  containerName,
}: PodTerminalFileTreeProps) {
  const { t } = useTranslation()
  const [currentPath, setCurrentPath] = useState('/')
  const [uploadDirectory, setUploadDirectory] = useState<string | null>(null)
  const [editingPath, setEditingPath] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isEditorLoading, setIsEditorLoading] = useState(false)
  const [isEditorSaving, setIsEditorSaving] = useState(false)
  const [deletePath, setDeletePath] = useState<string | null>(null)
  const [deleteIsDir, setDeleteIsDir] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    () => new Set(['/'])
  )
  const [directoryStates, setDirectoryStates] = useState<
    Record<string, DirectoryState>
  >({})
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const enabled = Boolean(namespace && podName && containerName)

  useEffect(() => {
    setCurrentPath('/')
    setExpandedPaths(new Set(['/']))
    setDirectoryStates({})
  }, [containerName, podName])

  const {
    data: files,
    isLoading,
    error,
    refetch,
  } = usePodFiles(
    namespace,
    podName,
    containerName,
    currentPath,
    clusterName ? { enabled, clusterName } : { enabled }
  )

  const handleNavigate = (path: string) => {
    setCurrentPath(path.startsWith('/') ? path : `/${path}`)
  }

  const buildRequestOptions = () =>
    clusterName ? { headers: { 'x-cluster-name': clusterName } } : undefined

  const refreshDirectory = async (path: string) => {
    setDirectoryStates((current) => ({
      ...current,
      [path]: {
        ...current[path],
        isLoading: true,
        error: undefined,
      },
    }))
    try {
      const nextFiles = await podListFiles(
        namespace,
        podName,
        containerName,
        path,
        buildRequestOptions()
      )
      setDirectoryStates((current) => ({
        ...current,
        [path]: {
          files: nextFiles,
          isLoading: false,
        },
      }))
    } catch (error) {
      setDirectoryStates((current) => ({
        ...current,
        [path]: {
          ...current[path],
          isLoading: false,
          error,
        },
      }))
    }
  }

  const refreshVisibleFiles = () => {
    void refetch()
    for (const path of expandedPaths) {
      if (path !== '/') {
        void refreshDirectory(path)
      }
    }
  }

  const handleRefreshTree = () => {
    setExpandedPaths(new Set(['/']))
    setDirectoryStates({})
    void refetch()
  }

  const handleToggleDirectory = (path: string) => {
    const isExpanded = expandedPaths.has(path)
    setExpandedPaths((current) => {
      const next = new Set(current)
      if (isExpanded) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })

    if (!isExpanded && path !== '/' && !directoryStates[path]?.files) {
      void refreshDirectory(path)
    }
  }

  const handleCopyPath = async (path: string) => {
    await copyTextToClipboard(path)
    toast.success(t('podFiles.pathCopied'))
  }

  const handleDownload = (path: string, isDirectory: boolean) => {
    podDownloadFile(namespace, podName, containerName, path, {
      clusterName,
      isDirectory,
    })
  }

  const handleOpenEditor = async (path: string) => {
    setEditingPath(path)
    setEditingContent('')
    setIsEditDialogOpen(true)
    setIsEditorLoading(true)
    try {
      const content = await podReadFileContent(
        namespace,
        podName,
        containerName,
        path,
        { clusterName }
      )
      setEditingContent(content)
    } catch (error) {
      toast.error(translateError(error, t))
      setIsEditDialogOpen(false)
    } finally {
      setIsEditorLoading(false)
    }
  }

  const handleSaveEditor = async () => {
    if (!editingPath) return
    setIsEditorSaving(true)
    try {
      await podUpdateFileContent(
        namespace,
        podName,
        containerName,
        editingPath,
        editingContent,
        { clusterName }
      )
      toast.success(t('podFiles.fileSaved'))
      setIsEditDialogOpen(false)
      refreshVisibleFiles()
    } catch (error) {
      toast.error(translateError(error, t))
    } finally {
      setIsEditorSaving(false)
    }
  }

  const handlePickUpload = (path: string) => {
    setUploadDirectory(path)
    uploadInputRef.current?.click()
  }

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !uploadDirectory) return
    try {
      await podUploadFile(
        namespace,
        podName,
        containerName,
        uploadDirectory,
        file,
        { clusterName }
      )
      toast.success(t('podFiles.uploadedSuccess', { name: file.name }))
      refreshVisibleFiles()
    } catch (error) {
      toast.error(translateError(error, t))
    } finally {
      event.target.value = ''
      setUploadDirectory(null)
    }
  }

  const handleConfirmDelete = async () => {
    if (!deletePath) return
    setIsDeleting(true)
    try {
      await podDeleteFile(namespace, podName, containerName, deletePath, {
        clusterName,
      })
      toast.success(
        deleteIsDir
          ? t('podFiles.directoryDeleted')
          : t('podFiles.fileDeleted')
      )
      setDeletePath(null)
      refreshVisibleFiles()
    } catch (error) {
      toast.error(translateError(error, t))
    } finally {
      setIsDeleting(false)
    }
  }

  const renderFileEntry = (
    file: FileTreeNode,
    parentPath: string,
    depth = 0
  ) => {
    const filePath = joinPath(parentPath, file.name)
    const isExpanded = expandedPaths.has(filePath)
    const directoryState = directoryStates[filePath]
    const icon = file.isDir ? (
      <IconFolder className="h-4 w-4 shrink-0 text-blue-500" />
    ) : (
      <IconFile className="h-4 w-4 shrink-0 text-muted-foreground" />
    )
    const content = file.isDir ? (
      <Button
        variant="ghost"
        className="h-auto w-full justify-start gap-2 px-2 py-1.5 text-left font-normal"
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        aria-label={t('podFiles.enterDirectory', {
          name: file.name,
        })}
        onClick={() => handleToggleDirectory(filePath)}
      >
        {isExpanded ? (
          <IconChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <IconChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        {icon}
        <span className="truncate font-mono text-sm">{file.name}</span>
      </Button>
    ) : (
      <div
        className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted/60"
        style={{ paddingLeft: `${depth * 14 + 28}px` }}
      >
        {icon}
        <span className="truncate font-mono">{file.name}</span>
      </div>
    )

    return (
      <ContextMenu key={file.name}>
        <ContextMenuTrigger asChild>{content}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => void handleCopyPath(filePath)}>
            <IconCopy className="h-4 w-4" />
            {t('podFiles.copyPath')}
          </ContextMenuItem>
          {!file.isDir ? (
            <ContextMenuItem onSelect={() => void handleOpenEditor(filePath)}>
              <IconEdit className="h-4 w-4" />
              {t('podFiles.edit')}
            </ContextMenuItem>
          ) : null}
          <ContextMenuItem onSelect={() => handleDownload(filePath, file.isDir)}>
            <IconDownload className="h-4 w-4" />
            {file.isDir
              ? t('podFiles.downloadDirectoryArchive')
              : t('podFiles.downloadFile')}
          </ContextMenuItem>
          {file.isDir ? (
            <ContextMenuItem onSelect={() => handlePickUpload(filePath)}>
              <IconUpload className="h-4 w-4" />
              {t('podFiles.upload')}
            </ContextMenuItem>
          ) : null}
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            onSelect={() => {
              setDeletePath(filePath)
              setDeleteIsDir(file.isDir)
            }}
          >
            <IconTrash className="h-4 w-4" />
            {t('podFiles.delete')}
          </ContextMenuItem>
        </ContextMenuContent>
        {file.isDir && isExpanded ? (
          <div className="space-y-1">
            {directoryState?.isLoading ? (
              <div
                className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground"
                style={{ paddingLeft: `${(depth + 1) * 14 + 28}px` }}
              >
                <IconLoader className="h-4 w-4 animate-spin" />
                {t('podFiles.loadingFiles')}
              </div>
            ) : directoryState?.error ? (
              <div
                className="px-2 py-1.5 text-sm text-destructive"
                style={{ paddingLeft: `${(depth + 1) * 14 + 28}px` }}
              >
                {translateError(directoryState.error, t)}
              </div>
            ) : directoryState?.files && directoryState.files.length > 0 ? (
              directoryState.files.map((child) =>
                renderFileEntry(child, filePath, depth + 1)
              )
            ) : (
              <div
                className="px-2 py-1.5 text-sm text-muted-foreground"
                style={{ paddingLeft: `${(depth + 1) * 14 + 28}px` }}
              >
                {t('podFiles.noFilesFound')}
              </div>
            )}
          </div>
        ) : null}
      </ContextMenu>
    )
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
          onClick={handleRefreshTree}
          disabled={!enabled}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <input
          ref={uploadInputRef}
          type="file"
          className="hidden"
          onChange={(event) => void handleUpload(event)}
        />
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
            {files.map((file) => renderFileEntry(file, currentPath))}
          </div>
        ) : (
          <div className="px-2 py-6 text-sm text-muted-foreground">
            {t('podFiles.noFilesFound')}
          </div>
        )}
      </div>
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="flex h-[80vh] max-h-[80vh] flex-col overflow-hidden sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t('podFiles.editFile')}</DialogTitle>
            <DialogDescription className="truncate font-mono">
              {editingPath}
            </DialogDescription>
          </DialogHeader>
          {isEditorLoading ? (
            <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
              <IconLoader className="h-4 w-4 animate-spin" />
              {t('podFiles.loadingFileContent')}
            </div>
          ) : (
            <Textarea
              value={editingContent}
              onChange={(event) => setEditingContent(event.target.value)}
              className="min-h-0 flex-1 resize-none font-mono text-sm"
            />
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
              disabled={isEditorSaving}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => void handleSaveEditor()}
              disabled={isEditorLoading || isEditorSaving}
            >
              {isEditorSaving ? (
                <IconLoader className="h-4 w-4 animate-spin" />
              ) : null}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deletePath)}
        onOpenChange={(open) => {
          if (!open) setDeletePath(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('podFiles.deleteConfirmTitle')}</DialogTitle>
            <DialogDescription>
              {t('podFiles.deleteConfirmDescription', {
                path: deletePath ?? '',
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeletePath(null)}
              disabled={isDeleting}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleConfirmDelete()}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <IconLoader className="h-4 w-4 animate-spin" />
              ) : null}
              {t('podFiles.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  )
}
