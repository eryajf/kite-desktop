import { useEffect, useState } from 'react'
import {
  Container,
  EnvFromSource,
  EnvVar,
  EnvVarSource,
} from 'kubernetes-types/core/v1'
import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ConfigMapSelector } from '../selector/configmap-selector'
import { SecretSelector } from '../selector/secret-selector'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import { Separator } from '../ui/separator'

interface EnvironmentEditorProps {
  container: Container
  namespace: string
  onUpdate: (updates: Partial<Container>) => void
}

export function EnvironmentEditor({
  container,
  namespace,
  onUpdate,
}: EnvironmentEditorProps) {
  const { t } = useTranslation()
  const [envVars, setEnvVars] = useState<EnvVar[]>(() => container.env || [])
  const [envFromSources, setEnvFromSources] = useState<EnvFromSource[]>(
    () => container.envFrom || []
  )

  useEffect(() => {
    setEnvVars(container.env || [])
    setEnvFromSources(container.envFrom || [])
  }, [container])

  const addEnvVar = () => {
    const newEnvVars = [...envVars, { name: '', value: '' }]
    setEnvVars(newEnvVars)
    // Don't filter out empty names immediately, let user fill them in
    onUpdate({ env: newEnvVars })
  }

  const removeEnvVar = (index: number) => {
    const newEnvVars = envVars.filter((_, i) => i !== index)
    setEnvVars(newEnvVars)
    onUpdate({
      env: newEnvVars.filter(
        (env) =>
          env.name.trim() !== '' || env.value?.trim() !== '' || env.valueFrom
      ),
    })
  }

  const updateEnvVar = (
    index: number,
    field: 'name' | 'value',
    value: string
  ) => {
    const newEnvVars = envVars.map((env, i) =>
      i === index ? { ...env, [field]: value } : env
    )
    setEnvVars(newEnvVars)
    // Only filter out completely empty entries (both name and value empty)
    onUpdate({
      env: newEnvVars.filter(
        (env) =>
          env.name.trim() !== '' || env.value?.trim() !== '' || env.valueFrom
      ),
    })
  }

  const updateEnvVarType = (index: number, type: 'value' | 'valueFrom') => {
    const newEnvVars = envVars.map((env, i) => {
      if (i === index) {
        if (type === 'value') {
          // Remove valueFrom and ensure value is set
          const newEnv: EnvVar = {
            name: env.name,
            value: env.value || '',
          }
          return newEnv
        } else {
          // Remove value and set default valueFrom
          const newEnv: EnvVar = {
            name: env.name,
            valueFrom: env.valueFrom || {
              secretKeyRef: { name: '', key: '' },
            },
          }
          return newEnv
        }
      }
      return env
    })
    setEnvVars(newEnvVars)
    onUpdate({
      env: newEnvVars.filter(
        (env) =>
          env.name.trim() !== '' || env.value?.trim() !== '' || env.valueFrom
      ),
    })
  }

  const updateValueFrom = (
    index: number,
    type: 'secretKeyRef' | 'configMapKeyRef' | 'fieldRef' | 'resourceFieldRef',
    field: string,
    value: string
  ) => {
    const newEnvVars = envVars.map((env, i) => {
      if (i === index && env.valueFrom) {
        const newValueFrom = { ...env.valueFrom }

        // Clear other types when switching
        if (type === 'secretKeyRef') {
          delete newValueFrom.configMapKeyRef
          delete newValueFrom.fieldRef
          delete newValueFrom.resourceFieldRef
          newValueFrom.secretKeyRef = {
            name: newValueFrom.secretKeyRef?.name || '',
            key: newValueFrom.secretKeyRef?.key || '',
            [field]: value,
          }
        } else if (type === 'configMapKeyRef') {
          delete newValueFrom.secretKeyRef
          delete newValueFrom.fieldRef
          delete newValueFrom.resourceFieldRef
          newValueFrom.configMapKeyRef = {
            name: newValueFrom.configMapKeyRef?.name || '',
            key: newValueFrom.configMapKeyRef?.key || '',
            [field]: value,
          }
        } else if (type === 'fieldRef') {
          delete newValueFrom.secretKeyRef
          delete newValueFrom.configMapKeyRef
          delete newValueFrom.resourceFieldRef
          newValueFrom.fieldRef = {
            fieldPath: newValueFrom.fieldRef?.fieldPath || '',
            [field]: value,
          }
        } else if (type === 'resourceFieldRef') {
          delete newValueFrom.secretKeyRef
          delete newValueFrom.configMapKeyRef
          delete newValueFrom.fieldRef
          newValueFrom.resourceFieldRef = {
            resource: newValueFrom.resourceFieldRef?.resource || '',
            containerName: newValueFrom.resourceFieldRef?.containerName,
            [field]: value,
          }
        }

        return { ...env, valueFrom: newValueFrom }
      }
      return env
    })
    setEnvVars(newEnvVars)
    onUpdate({
      env: newEnvVars.filter(
        (env) =>
          env.name.trim() !== '' || env.value?.trim() !== '' || env.valueFrom
      ),
    })
  }

  const updateValueFromType = (
    index: number,
    type: 'secretKeyRef' | 'configMapKeyRef' | 'fieldRef' | 'resourceFieldRef'
  ) => {
    const newEnvVars = envVars.map((env, i) => {
      if (i === index && env.valueFrom) {
        const newValueFrom: EnvVarSource = {}

        if (type === 'secretKeyRef') {
          newValueFrom.secretKeyRef = { name: '', key: '' }
        } else if (type === 'configMapKeyRef') {
          newValueFrom.configMapKeyRef = { name: '', key: '' }
        } else if (type === 'fieldRef') {
          newValueFrom.fieldRef = { fieldPath: '' }
        } else if (type === 'resourceFieldRef') {
          newValueFrom.resourceFieldRef = { resource: '' }
        }

        return { ...env, valueFrom: newValueFrom }
      }
      return env
    })
    setEnvVars(newEnvVars)
    onUpdate({
      env: newEnvVars.filter(
        (env) =>
          env.name.trim() !== '' || env.value?.trim() !== '' || env.valueFrom
      ),
    })
  }

  // EnvFrom management functions
  const addEnvFromSource = () => {
    const newEnvFromSources = [
      ...envFromSources,
      { configMapRef: { name: '' } },
    ]
    setEnvFromSources(newEnvFromSources)
    onUpdate({
      envFrom: newEnvFromSources.filter(
        (source) =>
          source.configMapRef?.name?.trim() !== '' ||
          source.secretRef?.name?.trim() !== ''
      ),
    })
  }

  const removeEnvFromSource = (index: number) => {
    const newEnvFromSources = envFromSources.filter((_, i) => i !== index)
    setEnvFromSources(newEnvFromSources)
    onUpdate({
      envFrom: newEnvFromSources.filter(
        (source) =>
          source.configMapRef?.name?.trim() !== '' ||
          source.secretRef?.name?.trim() !== ''
      ),
    })
  }

  const updateEnvFromSource = (
    index: number,
    type: 'configMapRef' | 'secretRef',
    field: string,
    value: string
  ) => {
    const newEnvFromSources = envFromSources.map((source, i) => {
      if (i === index) {
        if (field === 'prefix') {
          return {
            ...source,
            prefix: value || undefined,
          }
        }

        if (type === 'configMapRef') {
          return {
            ...source,
            secretRef: undefined,
            configMapRef: {
              ...source.configMapRef,
              [field]: value,
            },
          }
        } else {
          return {
            ...source,
            configMapRef: undefined,
            secretRef: {
              ...source.secretRef,
              [field]: value,
            },
          }
        }
      }
      return source
    })
    setEnvFromSources(newEnvFromSources)
    onUpdate({
      envFrom: newEnvFromSources.filter(
        (source) =>
          source.configMapRef?.name?.trim() !== '' ||
          source.secretRef?.name?.trim() !== ''
      ),
    })
  }

  const updateEnvFromSourceType = (
    index: number,
    type: 'configMapRef' | 'secretRef'
  ) => {
    const newEnvFromSources = envFromSources.map((source, i) => {
      if (i === index) {
        if (type === 'configMapRef') {
          return { configMapRef: { name: '' } }
        } else {
          return { secretRef: { name: '' } }
        }
      }
      return source
    })
    setEnvFromSources(newEnvFromSources)
    onUpdate({
      envFrom: newEnvFromSources.filter(
        (source) =>
          source.configMapRef?.name?.trim() !== '' ||
          source.secretRef?.name?.trim() !== ''
      ),
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">
          {t('environmentEditor.variables')}
        </Label>
        <Button onClick={addEnvVar} size="sm" variant="outline">
          <Plus className="h-4 w-4 mr-1" />
          {t('environmentEditor.addVariable')}
        </Button>
      </div>

      <div className="space-y-3 max-h-[500px] overflow-y-auto">
        {envVars.map((env, index) => (
          <div
            key={index}
            className="flex items-start gap-2 p-3 border rounded-lg"
          >
            <div className="flex-1 space-y-2">
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-2">
                <div className="lg:col-span-1">
                  <Label className="text-xs text-muted-foreground">
                    {t('common.name')}
                  </Label>
                  <Input
                    placeholder={t('environmentEditor.variableNamePlaceholder')}
                    value={env.name}
                    onChange={(e) =>
                      updateEnvVar(index, 'name', e.target.value)
                    }
                    className="text-sm"
                  />
                </div>
                <div className="lg:col-span-1">
                  <Label className="text-xs text-muted-foreground">
                    {t('common.type', 'Type')}
                  </Label>
                  <Select
                    value={env.valueFrom ? 'valueFrom' : 'value'}
                    onValueChange={(value) =>
                      updateEnvVarType(index, value as 'value' | 'valueFrom')
                    }
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="value">
                        {t('environmentEditor.directValue')}
                      </SelectItem>
                      <SelectItem value="valueFrom">
                        {t('environmentEditor.valueFrom')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="lg:col-span-2">
                  {env.valueFrom ? (
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">
                        {t('environmentEditor.source')}
                      </Label>
                      <Select
                        value={
                          env.valueFrom.secretKeyRef
                            ? 'secretKeyRef'
                            : env.valueFrom.configMapKeyRef
                              ? 'configMapKeyRef'
                              : env.valueFrom.fieldRef
                                ? 'fieldRef'
                                : env.valueFrom.resourceFieldRef
                                  ? 'resourceFieldRef'
                                  : ''
                        }
                        onValueChange={(value) =>
                          updateValueFromType(
                            index,
                            value as
                              | 'secretKeyRef'
                              | 'configMapKeyRef'
                              | 'fieldRef'
                              | 'resourceFieldRef'
                          )
                        }
                      >
                        <SelectTrigger className="text-sm">
                          <SelectValue
                            placeholder={t(
                              'environmentEditor.selectSourceType'
                            )}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="secretKeyRef">
                            {t('containerInfo.secret')}
                          </SelectItem>
                          <SelectItem value="configMapKeyRef">
                            {t('containerInfo.configMap')}
                          </SelectItem>
                          <SelectItem value="fieldRef">
                            {t('environmentEditor.fieldReference')}
                          </SelectItem>
                          <SelectItem value="resourceFieldRef">
                            {t('environmentEditor.resourceField')}
                          </SelectItem>
                        </SelectContent>
                      </Select>

                      {env.valueFrom.secretKeyRef && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <div className="min-w-0">
                            <Label className="text-xs text-muted-foreground">
                              {t('environmentEditor.secretName')}
                            </Label>
                            <SecretSelector
                              selectedSecret={
                                env.valueFrom.secretKeyRef.name || ''
                              }
                              onSecretChange={(value) =>
                                updateValueFrom(
                                  index,
                                  'secretKeyRef',
                                  'name',
                                  value
                                )
                              }
                              namespace={namespace}
                              placeholder={t('environmentEditor.selectSecret')}
                              className="text-sm w-full"
                              avoidHelmSecrets
                            />
                          </div>
                          <div className="min-w-0">
                            <Label className="text-xs text-muted-foreground">
                              {t('environmentEditor.key')}
                            </Label>
                            <Input
                              placeholder={t('environmentEditor.keyPlaceholder')}
                              value={env.valueFrom.secretKeyRef.key}
                              onChange={(e) =>
                                updateValueFrom(
                                  index,
                                  'secretKeyRef',
                                  'key',
                                  e.target.value
                                )
                              }
                              className="text-sm w-full"
                            />
                          </div>
                        </div>
                      )}

                      {env.valueFrom.configMapKeyRef && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <div className="min-w-0">
                            <Label className="text-xs text-muted-foreground">
                              {t('environmentEditor.configMapName')}
                            </Label>
                            <ConfigMapSelector
                              selectedConfigMap={
                                env.valueFrom.configMapKeyRef.name || ''
                              }
                              onConfigMapChange={(value) =>
                                updateValueFrom(
                                  index,
                                  'configMapKeyRef',
                                  'name',
                                  value
                                )
                              }
                              namespace={namespace}
                              placeholder={t(
                                'environmentEditor.selectConfigMap'
                              )}
                              className="text-sm w-full"
                            />
                          </div>
                          <div className="min-w-0">
                            <Label className="text-xs text-muted-foreground">
                              {t('environmentEditor.key')}
                            </Label>
                            <Input
                              placeholder={t('environmentEditor.keyPlaceholder')}
                              value={env.valueFrom.configMapKeyRef.key}
                              onChange={(e) =>
                                updateValueFrom(
                                  index,
                                  'configMapKeyRef',
                                  'key',
                                  e.target.value
                                )
                              }
                              className="text-sm w-full"
                            />
                          </div>
                        </div>
                      )}

                      {env.valueFrom.fieldRef && (
                        <div>
                          <Label className="text-xs text-muted-foreground">
                            {t('environmentEditor.fieldPath')}
                          </Label>
                          <Input
                            placeholder="metadata.name"
                            value={env.valueFrom.fieldRef.fieldPath}
                            onChange={(e) =>
                              updateValueFrom(
                                index,
                                'fieldRef',
                                'fieldPath',
                                e.target.value
                              )
                            }
                            className="text-sm"
                          />
                        </div>
                      )}

                      {env.valueFrom.resourceFieldRef && (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <div>
                            <Label className="text-xs text-muted-foreground">
                              {t('environmentEditor.resource')}
                            </Label>
                            <Input
                              placeholder="requests.cpu"
                              value={env.valueFrom.resourceFieldRef.resource}
                              onChange={(e) =>
                                updateValueFrom(
                                  index,
                                  'resourceFieldRef',
                                  'resource',
                                  e.target.value
                                )
                              }
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">
                              {t('environmentEditor.containerName')}
                            </Label>
                            <Input
                              placeholder="container-name"
                              value={
                                env.valueFrom.resourceFieldRef.containerName ||
                                ''
                              }
                              onChange={(e) =>
                                updateValueFrom(
                                  index,
                                  'resourceFieldRef',
                                  'containerName',
                                  e.target.value
                                )
                              }
                              className="text-sm"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        {t('environmentEditor.value')}
                      </Label>
                      <Input
                        placeholder={t('environmentEditor.variableValuePlaceholder')}
                        value={env.value || ''}
                        onChange={(e) =>
                          updateEnvVar(index, 'value', e.target.value)
                        }
                        className="text-sm"
                      />
                    </div>
                  )}
                </div>
              </div>
              {env.value && env.value.length > 50 && (
                <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded border">
                  <span className="font-medium">
                    {t('environmentEditor.fullValue')}
                  </span>
                  <div className="mt-1  break-all">{env.value}</div>
                </div>
              )}
            </div>
            <Button
              onClick={() => removeEnvVar(index)}
              size="sm"
              variant="ghost"
              className="text-red-500 hover:text-red-700 mt-5"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}

        {envVars.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            {t('environmentEditor.emptyVariables')}
          </div>
        )}
      </div>

      <Separator />

      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">
          {t('environmentEditor.environmentFrom')}
        </Label>
        <Button onClick={addEnvFromSource} size="sm" variant="outline">
          <Plus className="h-4 w-4 mr-1" />
          {t('environmentEditor.addSource')}
        </Button>
      </div>

      <div className="space-y-3 max-h-[500px] overflow-y-auto">
        {envFromSources.map((source, index) => (
          <div
            key={index}
            className="flex items-start gap-2 p-3 border rounded-lg"
          >
            <div className="flex-1 space-y-2">
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-2">
                <div className="lg:col-span-1">
                  <Label className="text-xs text-muted-foreground">
                    {t('common.type', 'Type')}
                  </Label>
                  <Select
                    value={source.configMapRef ? 'configMapRef' : 'secretRef'}
                    onValueChange={(value) =>
                      updateEnvFromSourceType(
                        index,
                        value as 'configMapRef' | 'secretRef'
                      )
                    }
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="configMapRef">
                        {t('containerInfo.configMap')}
                      </SelectItem>
                      <SelectItem value="secretRef">
                        {t('containerInfo.secret')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="lg:col-span-2 min-w-0">
                  <Label className="text-xs text-muted-foreground">
                    {source.configMapRef
                      ? t('environmentEditor.configMapName')
                      : t('environmentEditor.secretName')}
                  </Label>
                  {source.configMapRef ? (
                    <ConfigMapSelector
                      selectedConfigMap={source.configMapRef.name || ''}
                      onConfigMapChange={(value) =>
                        updateEnvFromSource(
                          index,
                          'configMapRef',
                          'name',
                          value
                        )
                      }
                      namespace={namespace}
                      placeholder={t('environmentEditor.selectConfigMap')}
                      className="text-sm w-full"
                    />
                  ) : (
                    <SecretSelector
                      selectedSecret={source.secretRef?.name || ''}
                      onSecretChange={(value) =>
                        updateEnvFromSource(index, 'secretRef', 'name', value)
                      }
                      namespace={namespace}
                      placeholder={t('environmentEditor.selectSecret')}
                      className="text-sm w-full"
                      avoidHelmSecrets
                    />
                  )}
                </div>
                <div className="lg:col-span-1 min-w-0">
                  <Label className="text-xs text-muted-foreground">
                    {t('environmentEditor.prefixOptional')}
                  </Label>
                  <Input
                    placeholder="PREFIX_"
                    value={source.prefix || ''}
                    onChange={(e) =>
                      updateEnvFromSource(
                        index,
                        source.configMapRef ? 'configMapRef' : 'secretRef',
                        'prefix',
                        e.target.value
                      )
                    }
                    className="text-sm w-full"
                  />
                </div>
              </div>
            </div>
            <Button
              onClick={() => removeEnvFromSource(index)}
              size="sm"
              variant="ghost"
              className="text-red-500 hover:text-red-700 mt-5"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}

        {envFromSources.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            {t('environmentEditor.emptySources')}
          </div>
        )}
      </div>
    </div>
  )
}
