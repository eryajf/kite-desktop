import { useState } from 'react'
import {
  Container,
  ContainerState,
  ContainerStatus,
} from 'kubernetes-types/core/v1'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn, formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

const sectionLabelClassName =
  'text-balance text-xs font-medium text-muted-foreground uppercase'
const bodyTextClassName = 'text-sm text-pretty'

function renderState(state: ContainerState, t: (key: string, options?: Record<string, unknown>) => string) {
  if (state.running) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="default" className="bg-green-600">
          {t('containerInfo.running')}
        </Badge>
        {state.running.startedAt && (
          <span className="text-xs text-muted-foreground">
            {t('containerInfo.since', {
              time: formatDate(state.running.startedAt),
            })}
          </span>
        )}
      </div>
    )
  }
  if (state.waiting) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="secondary">{t('containerInfo.waiting')}</Badge>
        {state.waiting.reason && (
          <span className={bodyTextClassName}>{state.waiting.reason}</span>
        )}
        {state.waiting.message && (
          <span className="text-xs text-muted-foreground text-pretty">
            {state.waiting.message}
          </span>
        )}
      </div>
    )
  }
  if (state.terminated) {
    return (
      <div className="flex items-center gap-2">
        <Badge
          variant={state.terminated.exitCode === 0 ? 'default' : 'destructive'}
          className="tabular-nums"
        >
          {t('containerInfo.terminatedExit', {
            code: state.terminated.exitCode,
          })}
        </Badge>
        {state.terminated.reason && (
          <span className={bodyTextClassName}>{state.terminated.reason}</span>
        )}
        {state.terminated.finishedAt && (
          <span className="text-xs text-muted-foreground">
            {t('containerInfo.finished', {
              time: formatDate(state.terminated.finishedAt),
            })}
          </span>
        )}
      </div>
    )
  }
  return null
}

export function ContainerInfoCard({
  container,
  status,
  init,
}: {
  container: Container
  status?: ContainerStatus
  init?: boolean
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  const hasMore =
    (container.ports && container.ports.length > 0) ||
    (container.env && container.env.length > 0) ||
    (container.envFrom && container.envFrom.length > 0) ||
    (container.volumeMounts && container.volumeMounts.length > 0) ||
    !!(container.resources?.requests || container.resources?.limits) ||
    !!(
      container.livenessProbe ||
      container.readinessProbe ||
      container.startupProbe
    ) ||
    !!(status?.imageID || status?.containerID)

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-muted/30 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="default" className="font-medium">
            {container.name}
          </Badge>
          {init && container.restartPolicy !== 'Always' && (
            <Badge variant="outline" className="text-xs">
              {t('containerInfo.init')}
            </Badge>
          )}
          {init && container.restartPolicy === 'Always' && (
            <Badge variant="secondary" className="text-xs">
              {t('containerInfo.sidecar')}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {status && (
            <Badge variant={status.ready ? 'default' : 'secondary'}>
              {status.ready
                ? t('containerInfo.ready')
                : t('containerInfo.notReady')}
            </Badge>
          )}
          {status && status.restartCount > 0 && (
            <Badge variant="destructive" className="tabular-nums">
              {t('containerInfo.restarts', { count: status.restartCount })}
            </Badge>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-4">
        {/* Image row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className={sectionLabelClassName}>
              {t('containerInfo.image')}
            </Label>
            <p className="text-sm font-mono mt-1 break-all">
              {container.image}
            </p>
          </div>
          <div>
            <Label className={sectionLabelClassName}>
              {t('containerInfo.imagePullPolicy')}
            </Label>
            <p className={cn(bodyTextClassName, 'mt-1')}>
              {container.imagePullPolicy || 'IfNotPresent'}
            </p>
          </div>
          {container.workingDir && (
            <div>
              <Label className={sectionLabelClassName}>
                {t('containerInfo.workingDirectory')}
              </Label>
              <p className="text-sm font-mono mt-1">{container.workingDir}</p>
            </div>
          )}
          {(container.stdin || container.tty) && (
            <div>
              <Label className={sectionLabelClassName}>
                {t('containerInfo.ttyStdin')}
              </Label>
              <div className="flex gap-2 mt-1">
                {container.tty && (
                  <Badge variant="outline" className="text-xs">
                    TTY
                  </Badge>
                )}
                {container.stdin && (
                  <Badge variant="outline" className="text-xs">
                    Stdin
                  </Badge>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Command */}
        {container.command && container.command.length > 0 && (
          <div>
            <Label className={sectionLabelClassName}>
              {t('containerInfo.command')}
            </Label>
            <div className="mt-1 bg-muted rounded px-3 py-2">
              {container.command.map((part, i) => (
                <div
                  key={i}
                  className="text-sm font-mono break-all whitespace-pre-wrap"
                >
                  {part}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Args */}
        {container.args && container.args.length > 0 && (
          <div>
            <Label className={sectionLabelClassName}>
              {t('containerInfo.args')}
            </Label>
            <div className="mt-1 bg-muted rounded px-3 py-2">
              {container.args.map((part, i) => (
                <div
                  key={i}
                  className="text-sm font-mono break-all whitespace-pre-wrap"
                >
                  {part}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* State */}
        {status?.state && (
          <div>
            <Label className={sectionLabelClassName}>
              {t('containerInfo.state')}
            </Label>
            <div className="mt-1">{renderState(status.state, t)}</div>
          </div>
        )}

        {/* Toggle */}
        {hasMore && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-7 text-xs text-muted-foreground"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? (
              <>
                <ChevronDown className="size-3 mr-1" />
                {t('containerInfo.showLess')}
              </>
            ) : (
              <>
                <ChevronRight className="size-3 mr-1" />
                {t('containerInfo.showMore')}
              </>
            )}
          </Button>
        )}

        {expanded && (
          <div className="space-y-4">
            {/* Ports */}
            {container.ports && container.ports.length > 0 && (
              <div className="border-t pt-3">
                <Label className={sectionLabelClassName}>
                  {t('containerInfo.ports')}
                </Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {container.ports.map((port, i) => (
                    <div key={i} className="flex items-center gap-1 text-sm">
                      <Badge
                        variant="secondary"
                        className="text-xs font-mono tabular-nums"
                      >
                        {port.containerPort}
                      </Badge>
                      {port.protocol && (
                        <span className="text-xs text-muted-foreground">
                          {port.protocol}
                        </span>
                      )}
                      {port.name && (
                        <span className="text-xs text-muted-foreground">
                          ({port.name})
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Environment Variables */}
            {((container.env && container.env.length > 0) ||
              (container.envFrom && container.envFrom.length > 0)) && (
              <div className="border-t pt-3">
                <Label className={sectionLabelClassName}>
                  {t('containerInfo.environmentVariables')}
                  {container.env && container.env.length > 0 && (
                    <span className="ml-1 tabular-nums normal-case">
                      ({container.env.length})
                    </span>
                  )}
                </Label>
                <div className="mt-2 space-y-1">
                  {container.envFrom && container.envFrom.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {container.envFrom.map((src, i) => (
                        <div key={i} className="flex items-center gap-1">
                          {src.configMapRef && (
                            <Badge
                              variant="outline"
                              className="text-xs bg-blue-50 dark:bg-blue-950"
                            >
                              {t('containerInfo.configMap')}: {src.configMapRef.name}
                              {src.prefix &&
                                ` (${t('containerInfo.prefix')}: ${src.prefix})`}
                            </Badge>
                          )}
                          {src.secretRef && (
                            <Badge
                              variant="outline"
                              className="text-xs bg-green-50 dark:bg-green-950"
                            >
                              {t('containerInfo.secret')}: {src.secretRef.name}
                              {src.prefix &&
                                ` (${t('containerInfo.prefix')}: ${src.prefix})`}
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {container.env &&
                    container.env.map((envVar, i) => (
                      <div
                        key={i}
                        className="text-xs font-mono flex gap-1 flex-wrap"
                      >
                        <span className="text-blue-600 dark:text-blue-400">
                          {envVar.name}
                        </span>
                        {envVar.value !== undefined && (
                          <>
                            <span className="text-muted-foreground">=</span>
                            <span className="text-muted-foreground break-all">
                              {envVar.value}
                            </span>
                          </>
                        )}
                        {envVar.valueFrom && (
                          <span className="text-orange-600 dark:text-orange-400">
                            = ({t('containerInfo.from')}{' '}
                            {envVar.valueFrom.secretKeyRef
                              ? `secret:${envVar.valueFrom.secretKeyRef.name}/${envVar.valueFrom.secretKeyRef.key}`
                              : envVar.valueFrom.configMapKeyRef
                                ? `configmap:${envVar.valueFrom.configMapKeyRef.name}/${envVar.valueFrom.configMapKeyRef.key}`
                                : envVar.valueFrom.fieldRef
                                  ? `field:${envVar.valueFrom.fieldRef.fieldPath}`
                                  : envVar.valueFrom.resourceFieldRef
                                    ? `resource:${envVar.valueFrom.resourceFieldRef.resource}`
                                    : t('containerInfo.ref')}
                            )
                          </span>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Volume Mounts */}
            {container.volumeMounts && container.volumeMounts.length > 0 && (
              <div className="border-t pt-3">
                <Label className={sectionLabelClassName}>
                  {t('containerInfo.volumeMounts')} (
                  <span className="tabular-nums">
                    {container.volumeMounts.length}
                  </span>
                  )
                </Label>
                <div className="mt-2 space-y-1">
                  {container.volumeMounts.map((mount, i) => (
                    <div
                      key={i}
                      className="flex flex-wrap items-center gap-2 text-xs"
                    >
                      <Badge variant="outline" className="text-xs font-mono">
                        {mount.name}
                      </Badge>
                      <span className="font-mono text-muted-foreground">
                        {mount.mountPath}
                      </span>
                      {mount.subPath && (
                        <span className="text-muted-foreground">
                          {t('containerInfo.subPath')}: {mount.subPath}
                        </span>
                      )}
                      {mount.readOnly && (
                        <Badge variant="secondary" className="text-xs">
                          RO
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Resources */}
            {container.resources &&
              (container.resources.requests || container.resources.limits) && (
                <div className="border-t pt-3">
                  <Label className={sectionLabelClassName}>
                    {t('containerInfo.resources')}
                  </Label>
                  <div className="mt-2 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                    {container.resources.requests && (
                      <div>
                        <div className="text-xs font-medium text-green-600 dark:text-green-400 mb-1">
                          {t('monitoring.requests')}
                        </div>
                        {container.resources.requests.cpu && (
                          <div className="flex gap-2 text-xs">
                            <span className="text-muted-foreground">CPU:</span>
                            <span className="font-mono tabular-nums">
                              {container.resources.requests.cpu}
                            </span>
                          </div>
                        )}
                        {container.resources.requests.memory && (
                          <div className="flex gap-2 text-xs">
                            <span className="text-muted-foreground">
                              {t('detail.fields.memory')}:
                            </span>
                            <span className="font-mono tabular-nums">
                              {container.resources.requests.memory}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    {container.resources.limits && (
                      <div>
                        <div className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">
                          {t('monitoring.limits')}
                        </div>
                        {container.resources.limits.cpu && (
                          <div className="flex gap-2 text-xs">
                            <span className="text-muted-foreground">CPU:</span>
                            <span className="font-mono tabular-nums">
                              {container.resources.limits.cpu}
                            </span>
                          </div>
                        )}
                        {container.resources.limits.memory && (
                          <div className="flex gap-2 text-xs">
                            <span className="text-muted-foreground">
                              {t('detail.fields.memory')}:
                            </span>
                            <span className="font-mono tabular-nums">
                              {container.resources.limits.memory}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

            {/* Health Probes */}
            {(container.livenessProbe ||
              container.readinessProbe ||
              container.startupProbe) && (
              <div className="border-t pt-3">
                <Label className={sectionLabelClassName}>
                  {t('containerInfo.healthChecks')}
                </Label>
                <div className="mt-2 space-y-1">
                  {[
                    {
                      label: t('containerInfo.liveness'),
                      probe: container.livenessProbe,
                      color: 'bg-green-50 dark:bg-green-950',
                    },
                    {
                      label: t('containerInfo.readiness'),
                      probe: container.readinessProbe,
                      color: 'bg-blue-50 dark:bg-blue-950',
                    },
                    {
                      label: t('containerInfo.startup'),
                      probe: container.startupProbe,
                      color: 'bg-yellow-50 dark:bg-yellow-950',
                    },
                  ]
                    .filter((p) => p.probe)
                    .map(({ label, probe, color }) => (
                      <div
                        key={label}
                        className="flex items-center gap-2 text-xs"
                      >
                        <Badge
                          variant="outline"
                          className={cn('text-xs', color)}
                        >
                          {label}
                        </Badge>
                        <span className="text-muted-foreground">
                          {probe!.httpGet
                            ? `HTTP ${probe!.httpGet.path || '/'} :${probe!.httpGet.port}`
                            : probe!.tcpSocket
                              ? `TCP :${probe!.tcpSocket.port}`
                              : probe!.exec
                                ? `Exec: ${probe!.exec.command?.join(' ')}`
                                : t('containerInfo.custom')}
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          ({t('containerInfo.initial')}: {probe!.initialDelaySeconds ?? 0}s, {t('containerInfo.period')}:{' '}
                          {probe!.periodSeconds ?? 10}s)
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Image ID + Container ID */}
            {(status?.imageID || status?.containerID) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t">
                {status.imageID && (
                  <div>
                    <Label className={sectionLabelClassName}>
                      {t('containerInfo.imageId')}
                    </Label>
                    <p className="text-xs font-mono mt-1 text-muted-foreground break-all">
                      {status.imageID}
                    </p>
                  </div>
                )}
                {status.containerID && (
                  <div>
                    <Label className={sectionLabelClassName}>
                      {t('containerInfo.containerId')}
                    </Label>
                    <p className="text-xs font-mono mt-1 text-muted-foreground break-all">
                      {status.containerID}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
