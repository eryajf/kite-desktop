import { Probe } from 'kubernetes-types/core/v1'
import { useTranslation } from 'react-i18next'

import {
  createProbeDraft,
  getProbeDraftType,
  ProbeDraftType,
  ValidationErrors,
} from '@/hooks/use-deployment-container-editor'

import { Input } from '../ui/input'
import { Label } from '../ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import { Switch } from '../ui/switch'
import { Textarea } from '../ui/textarea'

function parseProbeCommand(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function ProbeEditor(props: {
  title: string
  description: string
  probe?: Probe
  errorPrefix: string
  errors: ValidationErrors
  onChange: (probe?: Probe) => void
}) {
  const { title, description, probe, errorPrefix, errors, onChange } = props
  const { t } = useTranslation()
  const probeType = getProbeDraftType(probe)
  const httpGet = probe?.httpGet
  const tcpSocket = probe?.tcpSocket
  const execAction = probe?.exec

  const updateProbe = (updates: Partial<Probe>) => {
    if (!probe) {
      return
    }
    onChange({ ...probe, ...updates })
  }

  const errorFor = (path: string) => errors[`${errorPrefix}.${path}`]

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label className="text-sm font-medium">{title}</Label>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-3">
          <Label htmlFor={`${errorPrefix}-switch`}>
            {probe
              ? t('deploymentOverview.enabled')
              : t('deploymentOverview.disabled')}
          </Label>
          <Switch
            id={`${errorPrefix}-switch`}
            checked={!!probe}
            onCheckedChange={(checked) =>
              onChange(checked ? createProbeDraft('http', probe) : undefined)
            }
          />
        </div>
      </div>

      {!probe ? null : (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>{t('containerEditor.probes.probeType')}</Label>
            <Select
              value={probeType}
              onValueChange={(value) =>
                onChange(createProbeDraft(value as ProbeDraftType, probe))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="http">HTTP</SelectItem>
                <SelectItem value="tcp">TCP</SelectItem>
                <SelectItem value="exec">Exec</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {httpGet ? (
            <>
              <div className="space-y-2">
                <Label>{t('containerEditor.probes.path')}</Label>
                <Input
                  value={httpGet.path || ''}
                  onChange={(event) =>
                    updateProbe({
                      httpGet: {
                        ...httpGet,
                        port: httpGet.port ?? 80,
                        path: event.target.value,
                      },
                    })
                  }
                  placeholder="/healthz"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('containerEditor.probes.port')}</Label>
                <Input
                  value={String(httpGet.port ?? '')}
                  onChange={(event) =>
                    updateProbe({
                      httpGet: {
                        ...httpGet,
                        port: event.target.value,
                      },
                    })
                  }
                  placeholder="8080"
                />
                {errorFor('httpGet.port') ? (
                  <p className="text-xs text-destructive">
                    {errorFor('httpGet.port')}
                  </p>
                ) : null}
              </div>
            </>
          ) : null}

          {tcpSocket ? (
            <div className="space-y-2 md:col-span-2">
              <Label>{t('containerEditor.probes.port')}</Label>
              <Input
                value={String(tcpSocket.port ?? '')}
                onChange={(event) =>
                  updateProbe({
                    tcpSocket: {
                      ...tcpSocket,
                      port: event.target.value,
                    },
                  })
                }
                placeholder="8080"
              />
              {errorFor('tcpSocket.port') ? (
                <p className="text-xs text-destructive">
                  {errorFor('tcpSocket.port')}
                </p>
              ) : null}
            </div>
          ) : null}

          {execAction ? (
            <div className="space-y-2 md:col-span-2">
              <Label>{t('containerEditor.probes.command')}</Label>
              <Textarea
                rows={4}
                value={execAction.command?.join('\n') || ''}
                onChange={(event) =>
                  updateProbe({
                    exec: {
                      command: parseProbeCommand(event.target.value),
                    },
                  })
                }
                placeholder="curl\n-f\nhttp://127.0.0.1:8080/healthz"
              />
              {errorFor('exec.command') ? (
                <p className="text-xs text-destructive">
                  {errorFor('exec.command')}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>{t('containerEditor.probes.initialDelaySeconds')}</Label>
            <Input
              type="number"
              min="0"
              value={probe.initialDelaySeconds ?? 0}
              onChange={(event) =>
                updateProbe({
                  initialDelaySeconds: Number(event.target.value || 0),
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>{t('containerEditor.probes.periodSeconds')}</Label>
            <Input
              type="number"
              min="1"
              value={probe.periodSeconds ?? 10}
              onChange={(event) =>
                updateProbe({
                  periodSeconds: Number(event.target.value || 1),
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>{t('containerEditor.probes.timeoutSeconds')}</Label>
            <Input
              type="number"
              min="1"
              value={probe.timeoutSeconds ?? 1}
              onChange={(event) =>
                updateProbe({
                  timeoutSeconds: Number(event.target.value || 1),
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>{t('containerEditor.probes.successThreshold')}</Label>
            <Input
              type="number"
              min="1"
              value={probe.successThreshold ?? 1}
              onChange={(event) =>
                updateProbe({
                  successThreshold: Number(event.target.value || 1),
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>{t('containerEditor.probes.failureThreshold')}</Label>
            <Input
              type="number"
              min="1"
              value={probe.failureThreshold ?? 3}
              onChange={(event) =>
                updateProbe({
                  failureThreshold: Number(event.target.value || 1),
                })
              }
            />
          </div>
        </div>
      )}
    </div>
  )
}
