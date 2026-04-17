import { useState } from 'react'
import { DialogDescription } from '@radix-ui/react-dialog'
import { Deployment } from 'kubernetes-types/apps/v1'
import { Container } from 'kubernetes-types/core/v1'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'

import { useDeploymentContainerEditor } from '@/hooks/use-deployment-container-editor'

import {
  EnvironmentEditor,
  ImageEditor,
  ProbeGroupEditor,
  ResourceEditor,
  VolumeMountEditor,
  VolumeSourceEditor,
} from './editors'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'

interface BaseContainerEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface SimpleContainerEditDialogProps extends BaseContainerEditDialogProps {
  container: Container
  onSave: (updatedContainer: Container) => void
  mode?: 'container'
}

interface DeploymentContainerEditDialogProps extends BaseContainerEditDialogProps {
  mode: 'deployment'
  deployment: Deployment
  namespace: string
  initialContainerName?: string
  onSaveDeployment: (updatedDeployment: Deployment) => Promise<void> | void
}

type ContainerEditDialogProps =
  | SimpleContainerEditDialogProps
  | DeploymentContainerEditDialogProps

function cloneContainer(container: Container) {
  return JSON.parse(JSON.stringify(container)) as Container
}

export function ContainerEditDialog({
  mode = 'container',
  ...props
}: ContainerEditDialogProps) {
  const { open, onOpenChange } = props

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        mode === 'deployment' ? (
          <DeploymentContainerEditDialogContent
            {...(props as Omit<
              DeploymentContainerEditDialogProps,
              'open' | 'mode'
            >)}
          />
        ) : (
          <SimpleContainerEditDialogContent
            {...(props as Omit<SimpleContainerEditDialogProps, 'open' | 'mode'>)}
          />
        )
      ) : null}
    </Dialog>
  )
}

function SimpleContainerEditDialogContent({
  container,
  onOpenChange,
  onSave,
}: Omit<SimpleContainerEditDialogProps, 'open' | 'mode'>) {
  const { t } = useTranslation()
  const { namespace } = useParams()
  const [editedContainer, setEditedContainer] = useState<Container>(() =>
    cloneContainer(container)
  )

  const handleSave = () => {
    onSave(editedContainer)
    onOpenChange(false)
  }

  const handleUpdate = (updates: Partial<Container>) => {
    setEditedContainer((prev) => ({ ...prev, ...updates }))
  }

  return (
    <DialogContent className="!max-w-4xl max-h-[90vh] overflow-y-auto sm:!max-w-4xl">
      <DialogHeader>
        <DialogTitle>
          {t('containerEditor.title', { name: editedContainer.name })}
        </DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          {t('containerEditor.description')}
        </DialogDescription>
      </DialogHeader>
      <Tabs defaultValue="image" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="image">
            {t('containerEditor.tabs.image')}
          </TabsTrigger>
          <TabsTrigger value="resources">
            {t('containerEditor.tabs.resources')}
          </TabsTrigger>
          <TabsTrigger value="environment">
            {t('containerEditor.tabs.environment')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="image" className="space-y-4">
          <ImageEditor container={editedContainer} onUpdate={handleUpdate} />
        </TabsContent>

        <TabsContent value="resources" className="space-y-6">
          <ResourceEditor container={editedContainer} onUpdate={handleUpdate} />
        </TabsContent>

        <TabsContent value="environment" className="space-y-4">
          <EnvironmentEditor
            container={editedContainer}
            onUpdate={handleUpdate}
            namespace={namespace!}
          />
        </TabsContent>
      </Tabs>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {t('common.cancel')}
        </Button>
        <Button onClick={handleSave}>{t('containerEditor.saveChanges')}</Button>
      </DialogFooter>
    </DialogContent>
  )
}

function DeploymentContainerEditDialogContent({
  deployment,
  namespace,
  initialContainerName,
  onOpenChange,
  onSaveDeployment,
}: Omit<DeploymentContainerEditDialogProps, 'open' | 'mode'>) {
  const { t } = useTranslation()
  const [isSaving, setIsSaving] = useState(false)
  const {
    activeTab,
    containers,
    draftDeployment,
    hasTabErrors,
    isDirty,
    removeVolume,
    selectedContainer,
    selectedContainerIndex,
    selectedContainerName,
    setActiveTab,
    setSelectedContainerName,
    updateSelectedContainer,
    updateVolumes,
    validate,
    validationErrors,
    volumes,
  } = useDeploymentContainerEditor({
    deployment,
    open: true,
    initialContainerName,
  })

  const handleSave = async () => {
    const result = validate()
    if (!result.isValid) {
      if (Object.keys(result.errors).some((key) => key.includes('.image'))) {
        setActiveTab('image')
      } else if (
        Object.keys(result.errors).some((key) => key.includes('.resources.'))
      ) {
        setActiveTab('resources')
      } else if (
        Object.keys(result.errors).some(
          (key) => key.includes('.env.') || key.includes('.envFrom.')
        )
      ) {
        setActiveTab('environment')
      } else if (
        Object.keys(result.errors).some(
          (key) => key.includes('.volumeMounts.') || key.startsWith('volumes.')
        )
      ) {
        setActiveTab('mounts')
      } else {
        setActiveTab('probes')
      }
      return
    }

    setIsSaving(true)
    try {
      await onSaveDeployment(draftDeployment)
      onOpenChange(false)
    } finally {
      setIsSaving(false)
    }
  }

  const tabClassName = (hasErrors: boolean) =>
    hasErrors ? 'border-destructive/50 text-destructive' : undefined

  if (!selectedContainer) {
    return null
  }

  return (
    <DialogContent className="!max-w-5xl max-h-[90vh] overflow-y-auto sm:!max-w-5xl">
      <DialogHeader>
        <DialogTitle>
          {t('containerEditor.title', { name: selectedContainer.name })}
        </DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          {t('containerEditor.description')}
        </DialogDescription>
      </DialogHeader>
      {containers.length > 1 ? (
        <div className="space-y-2">
          <label className="text-sm font-medium">
            {t('containerEditor.containerSelector')}
          </label>
          <Select
            value={selectedContainerName}
            onValueChange={setSelectedContainerName}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {containers.map((container) => (
                <SelectItem key={container.name} value={container.name}>
                  {container.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <Tabs
        value={activeTab}
        onValueChange={(value) =>
          setActiveTab(
            value as 'image' | 'resources' | 'environment' | 'mounts' | 'probes'
          )
        }
        className="w-full"
      >
        <TabsList className="grid h-auto w-full grid-cols-2 md:grid-cols-5">
          <TabsTrigger
            value="image"
            className={tabClassName(hasTabErrors('image'))}
          >
            {t('containerEditor.tabs.image')}
          </TabsTrigger>
          <TabsTrigger
            value="resources"
            className={tabClassName(hasTabErrors('resources'))}
          >
            {t('containerEditor.tabs.resources')}
          </TabsTrigger>
          <TabsTrigger
            value="environment"
            className={tabClassName(hasTabErrors('environment'))}
          >
            {t('containerEditor.tabs.environment')}
          </TabsTrigger>
          <TabsTrigger
            value="mounts"
            className={tabClassName(hasTabErrors('mounts'))}
          >
            {t('containerEditor.tabs.mounts')}
          </TabsTrigger>
          <TabsTrigger
            value="probes"
            className={tabClassName(hasTabErrors('probes'))}
          >
            {t('containerEditor.tabs.probes')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="image" className="space-y-4">
          <ImageEditor
            key={`image-${selectedContainer.name}`}
            container={selectedContainer}
            onUpdate={updateSelectedContainer}
          />
          {validationErrors[`containers.${selectedContainerIndex}.image`] ? (
            <p className="text-sm text-destructive">
              {validationErrors[`containers.${selectedContainerIndex}.image`]}
            </p>
          ) : null}
        </TabsContent>

        <TabsContent value="resources" className="space-y-6">
          <ResourceEditor
            container={selectedContainer}
            onUpdate={updateSelectedContainer}
          />
        </TabsContent>

        <TabsContent value="environment" className="space-y-4">
          <EnvironmentEditor
            key={`env-${selectedContainer.name}`}
            container={selectedContainer}
            onUpdate={updateSelectedContainer}
            namespace={namespace}
          />
        </TabsContent>

        <TabsContent value="mounts" className="space-y-6">
          <VolumeMountEditor
            container={selectedContainer}
            containerIndex={selectedContainerIndex}
            availableVolumes={volumes.map((volume) => volume.name)}
            errors={validationErrors}
            onUpdate={updateSelectedContainer}
          />
          <VolumeSourceEditor
            namespace={namespace}
            volumes={volumes}
            errors={validationErrors}
            onUpdate={updateVolumes}
            onRemoveVolume={removeVolume}
          />
        </TabsContent>

        <TabsContent value="probes" className="space-y-4">
          <ProbeGroupEditor
            container={selectedContainer}
            containerIndex={selectedContainerIndex}
            errors={validationErrors}
            onUpdate={updateSelectedContainer}
          />
        </TabsContent>
      </Tabs>

      <DialogFooter className="items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {isDirty
            ? t('containerEditor.unsavedChanges')
            : t('containerEditor.noPendingChanges')}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving
              ? t('containerEditor.saving')
              : t('containerEditor.saveChanges')}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  )
}
