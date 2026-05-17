import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { Link } from 'react-router-dom'
import { IconLoader, IconTrash } from '@tabler/icons-react'
import type { Secret, Service, ServicePort } from 'kubernetes-types/core/v1'
import type {
  Ingress,
  IngressBackend,
  IngressClass,
} from 'kubernetes-types/networking/v1'
import * as yaml from 'js-yaml'
import { CircleHelp, ExternalLink, Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { trackResourceAction } from '@/lib/analytics'
import { updateResource, useResource, useResources } from '@/lib/api'
import { openURL } from '@/lib/desktop'
import { cn, formatDate, translateError } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/popover'
import { ResponsiveTabs } from '@/components/ui/responsive-tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { DescribeDialog } from '@/components/describe-dialog'
import { ErrorMessage } from '@/components/error-message'
import { EventTable } from '@/components/event-table'
import { LabelsAnno } from '@/components/lables-anno'
import { RefreshButton } from '@/components/refresh-button'
import { RelatedResourcesTable } from '@/components/related-resource-table'
import { ResourceDeleteConfirmationDialog } from '@/components/resource-delete-confirmation-dialog'
import { ResourceHistoryTable } from '@/components/resource-history-table'
import { YamlEditor } from '@/components/yaml-editor'

interface IngressRouteRow {
  id: string
  path: string
  pathType: string
  serviceName: string
  servicePort: string
  serviceLink?: string
  url?: string
}

interface IngressHostRouteGroup {
  host: string
  tlsSecret: string
  routes: IngressRouteRow[]
  editable?: boolean
}

interface EditableIngressRoute {
  id: string
  path: string
  pathType: string
  serviceName: string
  servicePort: string
  isNew?: boolean
}

type EditableIngressRouteField = keyof Pick<
  EditableIngressRoute,
  'path' | 'pathType' | 'serviceName' | 'servicePort'
>

interface EditableIngressHostGroup {
  id: string
  host: string
  tlsSecret: string
  routes: EditableIngressRoute[]
}

interface EditableKeyValueItem {
  id: string
  key: string
  value: string
}

interface EditableIngressTlsItem {
  id: string
  host: string
  secretName: string
}

interface ComboboxOption {
  value: string
  label?: string
  description?: string
  ports?: ComboboxOption[]
}

let editItemId = 0

function nextEditItemId(prefix: string) {
  editItemId += 1
  return `${prefix}-${editItemId}`
}

function formatServiceBackend(backend?: IngressBackend) {
  const serviceParts = getBackendServiceParts(backend)
  return serviceParts.servicePort === '-'
    ? serviceParts.serviceName
    : `${serviceParts.serviceName}:${serviceParts.servicePort}`
}

function getBackendServiceParts(backend?: IngressBackend) {
  const service = backend?.service

  if (!service) {
    return {
      serviceName: backend?.resource?.name || '-',
      servicePort: '-',
      isService: false,
    }
  }

  const port = service.port?.number ?? service.port?.name ?? '-'
  return {
    serviceName: service.name || '-',
    servicePort: String(port),
    isService: Boolean(service.name),
  }
}

function formatDefaultBackend(ingress: Ingress) {
  return formatServiceBackend(ingress.spec?.defaultBackend)
}

function parseServicePort(port?: string) {
  const trimmed = port?.trim()

  if (!trimmed) {
    return { number: 80 }
  }

  const portNumber = Number(trimmed)
  if (Number.isInteger(portNumber) && portNumber > 0) {
    return { number: portNumber }
  }

  return { name: trimmed }
}

function createEmptyRoute(isNew = true): EditableIngressRoute {
  return {
    id: nextEditItemId('route'),
    path: '/',
    pathType: 'Prefix',
    serviceName: '',
    servicePort: '',
    isNew,
  }
}

function createEmptyHostGroup(): EditableIngressHostGroup {
  return {
    id: nextEditItemId('host'),
    host: '',
    tlsSecret: '',
    routes: [createEmptyRoute()],
  }
}

function createEmptyTlsItem(): EditableIngressTlsItem {
  return {
    id: nextEditItemId('tls'),
    host: '',
    secretName: '',
  }
}

function keyValueItemsFromRecord(
  record?: Record<string, string>
): EditableKeyValueItem[] {
  return Object.entries(record || {}).map(([key, value]) => ({
    id: nextEditItemId('metadata'),
    key,
    value,
  }))
}

function keyValueItemsToRecord(items: EditableKeyValueItem[]) {
  return items.reduce<Record<string, string>>((result, item) => {
    const key = item.key.trim()
    if (!key) {
      return result
    }

    result[key] = item.value
    return result
  }, {})
}

function editableTlsItemsFromIngress(ingress: Ingress): EditableIngressTlsItem[] {
  return (ingress.spec?.tls || []).flatMap((tls) => {
    const hosts = tls.hosts?.length ? tls.hosts : ['']

    return hosts.map((host) => ({
      id: nextEditItemId('tls'),
      host,
      secretName: tls.secretName || '',
    }))
  })
}

function editableGroupsFromIngress(ingress: Ingress): EditableIngressHostGroup[] {
  const groups = (ingress.spec?.rules || []).map((rule) => ({
    id: nextEditItemId('host'),
    host: rule.host || '',
    tlsSecret: '',
    routes:
      rule.http?.paths?.map((path) => {
        const service = path.backend.service
        const servicePort = service?.port?.number ?? service?.port?.name ?? ''

        return {
          id: nextEditItemId('route'),
          path: path.path || '/',
          pathType: path.pathType || 'Prefix',
          serviceName: service?.name || path.backend.resource?.name || '',
          servicePort: String(servicePort),
          isNew: false,
        }
      }) || [createEmptyRoute(false)],
  }))

  return groups.length > 0 ? groups : [createEmptyHostGroup()]
}

function getLoadBalancerAddresses(ingress: Ingress) {
  return (ingress.status?.loadBalancer?.ingress || [])
    .map((item) => item.ip || item.hostname)
    .filter((address): address is string => Boolean(address))
}

function buildTlsSecretByHost(ingress: Ingress) {
  const tlsSecretByHost = new Map<string, string>()

  for (const tls of ingress.spec?.tls || []) {
    for (const host of tls.hosts || []) {
      tlsSecretByHost.set(host, tls.secretName || '-')
    }
  }

  return tlsSecretByHost
}

function buildIngressRouteUrl(
  host: string,
  path: string,
  tlsSecretByHost: Map<string, string>
) {
  if (!host || host === '*' || host.includes('*') || path === '-') {
    return undefined
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const protocol = tlsSecretByHost.has(host) ? 'https' : 'http'
  return `${protocol}://${host}${normalizedPath}`
}

function buildIngressRouteGroups(
  ingress: Ingress,
  existingServiceNames: Set<string>
): IngressHostRouteGroup[] {
  const tlsSecretByHost = buildTlsSecretByHost(ingress)
  const groups: IngressHostRouteGroup[] = []
  const namespace = ingress.metadata?.namespace

  for (const rule of ingress.spec?.rules || []) {
    const host = rule.host || '*'
    const paths = rule.http?.paths || []
    const routes: IngressRouteRow[] = []

    if (paths.length === 0) {
      routes.push({
        id: `${host}-empty`,
        path: '-',
        pathType: '-',
        serviceName: '-',
        servicePort: '-',
      })
    } else {
      paths.forEach((path, index) => {
        const backendService = getBackendServiceParts(path.backend)
        routes.push({
          id: `${host}-${path.path || '/'}-${index}`,
          path: path.path || '/',
          pathType: path.pathType || '-',
          serviceName: backendService.serviceName,
          servicePort: backendService.servicePort,
          serviceLink:
            namespace &&
            backendService.isService &&
            existingServiceNames.has(backendService.serviceName)
              ? `/services/${namespace}/${backendService.serviceName}`
              : undefined,
          url: buildIngressRouteUrl(host, path.path || '/', tlsSecretByHost),
        })
      })
    }

    groups.push({
      host,
      tlsSecret: tlsSecretByHost.get(host) || '-',
      routes,
      editable: true,
    })
  }

  return groups
}

function buildDefaultBackendGroup(
  ingress: Ingress,
  existingServiceNames: Set<string>
): IngressHostRouteGroup | null {
  if (!ingress.spec?.defaultBackend) {
    return null
  }

  const backendService = getBackendServiceParts(ingress.spec.defaultBackend)
  const namespace = ingress.metadata?.namespace

  return {
    host: '*',
    tlsSecret: '-',
    editable: false,
    routes: [
      {
        id: 'default-backend',
        path: '/',
        pathType: '-',
        serviceName: backendService.serviceName,
        servicePort: backendService.servicePort,
        serviceLink:
          namespace &&
          backendService.isService &&
          existingServiceNames.has(backendService.serviceName)
            ? `/services/${namespace}/${backendService.serviceName}`
            : undefined,
      },
    ],
  }
}

function formatServicePortOption(port: ServicePort): ComboboxOption {
  const portValue = String(port.port)
  const portLabel = port.name ? `${port.name}:${port.port}` : portValue
  const descriptionParts = [
    port.protocol || 'TCP',
    port.targetPort ? `target ${port.targetPort}` : '',
  ].filter(Boolean)

  return {
    value: portValue,
    label: portLabel,
    description: descriptionParts.join(' / '),
  }
}

function serviceToOption(service: Service): ComboboxOption | null {
  const serviceName = service.metadata?.name

  if (!serviceName) {
    return null
  }

  const ports = (service.spec?.ports || []).map(formatServicePortOption)
  return {
    value: serviceName,
    label: serviceName,
    description:
      ports.length > 0
        ? ports.map((port) => port.label || port.value).join(', ')
        : undefined,
    ports,
  }
}

function secretToOption(secret: Secret): ComboboxOption | null {
  const secretName = secret.metadata?.name

  if (!secretName) {
    return null
  }

  return {
    value: secretName,
    label: secretName,
    description: secret.type,
  }
}

function ingressClassToOption(ingressClass: IngressClass): ComboboxOption | null {
  const ingressClassName = ingressClass.metadata?.name

  if (!ingressClassName) {
    return null
  }

  return {
    value: ingressClassName,
    label: ingressClassName,
    description: ingressClass.spec?.controller,
  }
}

function toComboboxOptions<T>(
  items: T[] | undefined,
  mapper: (item: T) => ComboboxOption | null
) {
  return (items || []).map(mapper).filter((item): item is ComboboxOption =>
    Boolean(item)
  )
}

function FieldHelp({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CircleHelp className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="start"
        sideOffset={6}
        className="max-w-80 bg-muted px-3 py-2 text-left text-foreground shadow-lg"
      >
        <div className="text-xs leading-relaxed">{children}</div>
      </TooltipContent>
    </Tooltip>
  )
}

function FieldLabel({
  children,
  help,
  helpLabel,
}: {
  children: ReactNode
  help?: ReactNode
  helpLabel?: string
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Label>{children}</Label>
      {help ? (
        <FieldHelp label={helpLabel || String(children)}>{help}</FieldHelp>
      ) : null}
    </div>
  )
}

function HostRouteGroup({
  group,
  onEditHost,
}: {
  group: IngressHostRouteGroup
  onEditHost?: (host: string) => void
}) {
  const { t } = useTranslation()
  const handleOpenRoute = (url: string) => {
    void openURL(url)
  }

  return (
    <div className="rounded-md border">
      <div className="flex flex-col gap-2 border-b bg-muted/30 px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-xs text-muted-foreground">
            {t('ingresses.host', 'Host')}
          </div>
          <div className="break-all font-mono text-sm font-semibold">
            {group.host}
          </div>
        </div>
        <div className="text-left md:text-right">
          <div className="text-xs text-muted-foreground">
            {t('ingresses.tlsSecret', 'TLS secret')}
          </div>
          <div className="break-all font-mono text-sm">{group.tlsSecret}</div>
        </div>
        {group.editable && onEditHost ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onEditHost(group.host)}
          >
            <Pencil className="h-4 w-4" />
            {t('ingresses.editHostRoutes', 'Edit routes')}
          </Button>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('ingresses.path', 'Path')}</TableHead>
              <TableHead>{t('ingresses.pathType', 'Path type')}</TableHead>
              <TableHead>{t('ingresses.serviceName', 'Service name')}</TableHead>
              <TableHead>{t('ingresses.servicePort', 'Service port')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.routes.map((route) => (
              <TableRow key={route.id}>
                <TableCell className="font-mono text-sm">
                  {route.url ? (
                    <button
                      type="button"
                      className="inline-flex max-w-[320px] items-center gap-1.5 text-left text-primary hover:underline"
                      title={route.url}
                      onClick={() => handleOpenRoute(route.url!)}
                    >
                      <span className="truncate">{route.path}</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      <span className="sr-only">
                        {t('ingresses.openRoute', 'Open route')}
                      </span>
                    </button>
                  ) : (
                    route.path
                  )}
                </TableCell>
                <TableCell>{route.pathType}</TableCell>
                <TableCell className="font-mono text-sm">
                  {route.serviceLink ? (
                    <Link
                      to={route.serviceLink}
                      className="app-link inline-flex max-w-[280px]"
                    >
                      <span className="truncate">{route.serviceName}</span>
                    </Link>
                  ) : (
                    route.serviceName
                  )}
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {route.servicePort}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function IngressRoutesTable({
  ingress,
  onEditHost,
  existingServiceNames,
}: {
  ingress: Ingress
  onEditHost?: (host: string) => void
  existingServiceNames: Set<string>
}) {
  const { t } = useTranslation()
  const groups = useMemo(() => {
    const routeGroups = buildIngressRouteGroups(ingress, existingServiceNames)
    const defaultBackendGroup = buildDefaultBackendGroup(
      ingress,
      existingServiceNames
    )

    return defaultBackendGroup ? [...routeGroups, defaultBackendGroup] : routeGroups
  }, [existingServiceNames, ingress])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('ingresses.routes', 'Routes')}</CardTitle>
      </CardHeader>
      <CardContent>
        {groups.length > 0 ? (
          <div className="space-y-4">
            {groups.map((group, index) => (
              <HostRouteGroup
                key={`${group.host}-${group.tlsSecret}-${index}`}
                group={group}
                onEditHost={onEditHost}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-md border py-8 text-center text-sm text-muted-foreground">
            {t('ingresses.noRoutes', 'No routes')}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function SearchableFreeformInput({
  value,
  onChange,
  options,
  label,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  options: ComboboxOption[]
  label: string
  placeholder?: string
}) {
  const { t } = useTranslation()
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null
  )
  const [isOpen, setIsOpen] = useState(false)
  const [shouldFilterOptions, setShouldFilterOptions] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const normalizedOptions = useMemo(() => {
    const seen = new Set<string>()
    return options.filter((option) => {
      if (!option.value || seen.has(option.value)) {
        return false
      }
      seen.add(option.value)
      return true
    })
  }, [options])
  const visibleOptions = useMemo(() => {
    if (!shouldFilterOptions || !value.trim()) {
      return normalizedOptions
    }

    const query = value.trim().toLowerCase()
    return normalizedOptions.filter((option) =>
      [option.value, option.label, option.description]
        .filter(Boolean)
        .some((text) => text?.toLowerCase().includes(query))
    )
  }, [normalizedOptions, shouldFilterOptions, value])

  const openFullOptionList = () => {
    setShouldFilterOptions(false)
    setHighlightedIndex(0)
    setIsOpen(normalizedOptions.length > 0)
  }

  const selectOption = (option: ComboboxOption) => {
    onChange(option.value)
    setIsOpen(false)
    setShouldFilterOptions(false)
    setHighlightedIndex(0)
  }

  return (
    <div ref={setPortalContainer} className="min-w-0">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverAnchor asChild>
          <Input
            aria-label={label}
            value={value}
            placeholder={placeholder || label}
            role="combobox"
            aria-expanded={isOpen}
            onFocus={openFullOptionList}
            onClick={openFullOptionList}
            onChange={(event) => {
              onChange(event.target.value)
              setShouldFilterOptions(true)
              setIsOpen(normalizedOptions.length > 0)
              setHighlightedIndex(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setIsOpen(normalizedOptions.length > 0)
                setHighlightedIndex((current) =>
                  visibleOptions.length === 0
                    ? 0
                    : Math.min(current + 1, visibleOptions.length - 1)
                )
                return
              }

              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setIsOpen(normalizedOptions.length > 0)
                setHighlightedIndex((current) =>
                  visibleOptions.length === 0 ? 0 : Math.max(current - 1, 0)
                )
                return
              }

              if (event.key === 'Enter') {
                event.preventDefault()
                if (isOpen && visibleOptions[highlightedIndex]) {
                  selectOption(visibleOptions[highlightedIndex])
                }
                return
              }

              if (event.key === 'Escape') {
                event.preventDefault()
                setIsOpen(false)
              }
            }}
          />
        </PopoverAnchor>
        <PopoverContent
          align="start"
          side="bottom"
          collisionPadding={16}
          avoidCollisions
          portalContainer={portalContainer}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onWheelCapture={(event) => event.stopPropagation()}
          className="max-h-[min(18rem,var(--radix-popover-content-available-height))] w-[var(--radix-popover-trigger-width)] overflow-y-auto p-1"
        >
          <div className="space-y-1">
            {visibleOptions.length > 0 ? (
              visibleOptions.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  className={`flex w-full min-w-0 flex-col rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground ${
                    index === highlightedIndex
                      ? 'bg-accent text-accent-foreground'
                      : ''
                  }`}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => selectOption(option)}
                >
                  <span className="truncate">
                    {option.label || option.value}
                  </span>
                  {option.description ? (
                    <span className="truncate text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  ) : null}
                </button>
              ))
            ) : (
              <div className="px-2 py-3 text-center text-sm text-muted-foreground">
                {t('ingresses.noOptions', 'No options found')}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

function KeyValueEditor({
  title,
  addLabel,
  keyLabel,
  valueLabel,
  items,
  onChange,
}: {
  title: string
  addLabel: string
  keyLabel: string
  valueLabel: string
  items: EditableKeyValueItem[]
  onChange: (items: EditableKeyValueItem[]) => void
}) {
  const { t } = useTranslation()

  const updateItem = (
    itemId: string,
    field: 'key' | 'value',
    value: string
  ) => {
    onChange(
      items.map((item) =>
        item.id === itemId ? { ...item, [field]: value } : item
      )
    )
  }

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange([
              { id: nextEditItemId('metadata'), key: '', value: '' },
              ...items,
            ])
          }
        >
          <Plus className="h-4 w-4" />
          {addLabel}
        </Button>
      </div>
      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('resourceMetadataDialog.empty', 'No entries yet')}
          </p>
        ) : null}
        {items.map((item) => (
          <div key={item.id} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
            <Input
              aria-label={keyLabel}
              value={item.key}
              placeholder={t('common.key', 'Key')}
              onChange={(event) => updateItem(item.id, 'key', event.target.value)}
            />
            <Input
              aria-label={valueLabel}
              value={item.value}
              placeholder={t('common.value', 'Value')}
              onChange={(event) =>
                updateItem(item.id, 'value', event.target.value)
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t('common.remove', 'Remove')}
              onClick={() => onChange(items.filter((entry) => entry.id !== item.id))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}

function IngressConfigEditor({
  ingress,
  onSave,
  isSaving,
  serviceOptions,
  secretOptions,
  ingressClassOptions,
  focusHost,
}: {
  ingress: Ingress
  onSave: (ingress: Ingress) => Promise<boolean>
  isSaving: boolean
  serviceOptions: ComboboxOption[]
  secretOptions: ComboboxOption[]
  ingressClassOptions: ComboboxOption[]
  focusHost?: string | null
}) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState('rules')
  const [ingressClassName, setIngressClassName] = useState(
    ingress.spec?.ingressClassName || ''
  )
  const [hostGroups, setHostGroups] = useState<EditableIngressHostGroup[]>(() =>
    editableGroupsFromIngress(ingress)
  )
  const hostGroupRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const lastScrolledFocusHostRef = useRef<string | null>(null)
  const [tlsItems, setTlsItems] = useState<EditableIngressTlsItem[]>(() =>
    editableTlsItemsFromIngress(ingress)
  )
  const [pendingIngress, setPendingIngress] = useState<Ingress | null>(null)
  const [isSaveConfirmOpen, setIsSaveConfirmOpen] = useState(false)
  const [labels, setLabels] = useState<EditableKeyValueItem[]>(() =>
    keyValueItemsFromRecord(ingress.metadata?.labels)
  )
  const [annotations, setAnnotations] = useState<EditableKeyValueItem[]>(() =>
    keyValueItemsFromRecord(ingress.metadata?.annotations)
  )

  useEffect(() => {
    setActiveTab('rules')
    setIngressClassName(ingress.spec?.ingressClassName || '')
    setHostGroups(editableGroupsFromIngress(ingress))
    setTlsItems(editableTlsItemsFromIngress(ingress))
    setLabels(keyValueItemsFromRecord(ingress.metadata?.labels))
    setAnnotations(keyValueItemsFromRecord(ingress.metadata?.annotations))
    lastScrolledFocusHostRef.current = null
  }, [focusHost, ingress])

  useEffect(() => {
    if (
      !focusHost ||
      activeTab !== 'rules' ||
      lastScrolledFocusHostRef.current === focusHost
    ) {
      return
    }

    const timer = window.setTimeout(() => {
      hostGroupRefs.current[focusHost]?.scrollIntoView({
        block: 'center',
        behavior: 'smooth',
      })
      lastScrolledFocusHostRef.current = focusHost
    }, 0)

    return () => window.clearTimeout(timer)
  }, [activeTab, focusHost, hostGroups])

  const updateHostGroup = (
    groupId: string,
    updater: (group: EditableIngressHostGroup) => EditableIngressHostGroup
  ) => {
    setHostGroups((current) =>
      current.map((group) => (group.id === groupId ? updater(group) : group))
    )
  }

  const updateRoute = (
    groupId: string,
    routeId: string,
    field: EditableIngressRouteField,
    value: string
  ) => {
    updateHostGroup(groupId, (group) => ({
      ...group,
      routes: group.routes.map((route) =>
        route.id === routeId ? { ...route, [field]: value } : route
      ),
    }))
  }

  const updateTlsItem = (
    tlsId: string,
    field: keyof Omit<EditableIngressTlsItem, 'id'>,
    value: string
  ) => {
    setTlsItems((current) =>
      current.map((item) =>
        item.id === tlsId ? { ...item, [field]: value } : item
      )
    )
  }

  const buildUpdatedIngress = (): Ingress => {
    const validGroups = hostGroups
      .map((group) => ({
        ...group,
        host: group.host.trim(),
        tlsSecret: group.tlsSecret.trim(),
        routes: group.routes.filter((route) => route.serviceName.trim()),
      }))
      .filter((group) => group.host || group.routes.length > 0)

    const rules = validGroups.map((group) => ({
      host: group.host || undefined,
      http: {
        paths: group.routes.map((route) => ({
          path: route.path.trim() || '/',
          pathType: route.pathType || 'Prefix',
          backend: {
            service: {
              name: route.serviceName.trim(),
              port: parseServicePort(route.servicePort),
            },
          },
        })),
      },
    }))

    const tls = tlsItems
      .map((item) => ({
        host: item.host.trim(),
        secretName: item.secretName.trim(),
      }))
      .filter((item) => item.host && item.secretName)
      .map((item) => ({
        hosts: [item.host],
        secretName: item.secretName,
      }))

    return {
      ...ingress,
      metadata: {
        ...(ingress.metadata || {}),
        labels: keyValueItemsToRecord(labels),
        annotations: keyValueItemsToRecord(annotations),
      },
      spec: {
        ...(ingress.spec || {}),
        ingressClassName: ingressClassName.trim() || undefined,
        rules,
        tls,
      },
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPendingIngress(buildUpdatedIngress())
    setIsSaveConfirmOpen(true)
  }

  const handleConfirmSave = async () => {
    if (!pendingIngress) {
      return
    }

    const saved = await onSave(pendingIngress)
    if (saved) {
      setIsSaveConfirmOpen(false)
      setPendingIngress(null)
    }
  }

  const getServicePortOptions = useMemo(
    () => (serviceName: string) => {
      const service = serviceOptions.find(
        (service) => service.value === serviceName
      )
      return service?.ports || []
    },
    [serviceOptions]
  )

  useEffect(() => {
    setHostGroups((current) => {
      let changed = false
      const nextGroups = current.map((group) => ({
        ...group,
        routes: group.routes.map((route) => {
          if (!route.serviceName || route.servicePort) {
            return route
          }

          const firstPort = getServicePortOptions(route.serviceName)[0]?.value
          if (firstPort) {
            changed = true
          }
          return firstPort ? { ...route, servicePort: firstPort } : route
        }),
      }))

      return changed ? nextGroups : current
    })
  }, [hostGroups, getServicePortOptions])

  const selectServiceForRoute = (
    groupId: string,
    route: EditableIngressRoute,
    serviceName: string
  ) => {
    const portOptions = getServicePortOptions(serviceName)
    updateHostGroup(groupId, (group) => ({
      ...group,
      routes: group.routes.map((item) =>
        item.id === route.id
          ? {
              ...item,
              serviceName,
              servicePort: item.servicePort || portOptions[0]?.value || '',
            }
          : item
      ),
    }))
  }

  return (
    <form
      data-testid="ingress-edit-form"
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      onSubmit={handleSubmit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
        }
      }}
    >
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="min-h-0 flex-1 overflow-hidden"
      >
        <TabsList className="mb-4 grid w-full grid-cols-4">
          <TabsTrigger value="rules">
            {t('ingresses.rulesTab', 'Rules')}
          </TabsTrigger>
          <TabsTrigger value="tls">
            {t('ingresses.certificatesTab', 'Certificates')}
          </TabsTrigger>
          <TabsTrigger value="class">
            {t('ingresses.ingressClass')}
          </TabsTrigger>
          <TabsTrigger value="metadata">
            {t('ingresses.metadataSettings', 'Metadata')}
          </TabsTrigger>
        </TabsList>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <TabsContent value="rules" className="mt-0 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-semibold">
                  {t('ingresses.hostGroups', 'Host groups')}
                </h3>
                <FieldHelp
                  label={t('ingresses.hostGroupsHelpLabel')}
                >
                  {t('ingresses.hostGroupsHelp')}
                </FieldHelp>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setHostGroups((current) => [createEmptyHostGroup(), ...current])
                }
              >
                <Plus className="h-4 w-4" />
                {t('ingresses.addHost', 'Add host')}
              </Button>
            </div>

            {hostGroups.map((group) => (
              <div
                key={group.id}
                ref={(node) => {
                  if (group.host) {
                    hostGroupRefs.current[group.host] = node
                  }
                }}
                className={cn(
                  'space-y-4 rounded-md border p-4',
                  focusHost === group.host && 'border-primary bg-primary/5'
                )}
              >
                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <div className="space-y-2">
                    <Label>{t('ingresses.host', 'Host')}</Label>
                    <Input
                      aria-label={t('ingresses.host', 'Host')}
                      value={group.host}
                      onChange={(event) =>
                        updateHostGroup(group.id, (current) => ({
                          ...current,
                          host: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t('ingresses.removeHost', 'Remove host')}
                      onClick={() =>
                        setHostGroups((current) =>
                          current.filter((item) => item.id !== group.id)
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <Label>{t('ingresses.routes', 'Routes')}</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        updateHostGroup(group.id, (current) => ({
                          ...current,
                          routes: [createEmptyRoute(), ...current.routes],
                        }))
                      }
                    >
                      <Plus className="h-4 w-4" />
                      {t('ingresses.addRoute', 'Add route')}
                    </Button>
                  </div>

                  {group.routes.map((route) => (
                    <div
                      key={route.id}
                      className="grid gap-2 md:grid-cols-[1fr_140px_1fr_120px_auto]"
                    >
                      <div className="space-y-1.5">
                        <FieldLabel
                          help={route.isNew ? t('ingresses.pathHelp') : undefined}
                          helpLabel={t('ingresses.pathHelpLabel')}
                        >
                          {t('ingresses.path', 'Path')}
                        </FieldLabel>
                        <Input
                          aria-label={t('ingresses.path', 'Path')}
                          value={route.path}
                          onChange={(event) =>
                            updateRoute(
                              group.id,
                              route.id,
                              'path',
                              event.target.value
                            )
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <FieldLabel
                          help={
                            route.isNew
                              ? t('ingresses.pathTypeHelp')
                              : undefined
                          }
                          helpLabel={t('ingresses.pathTypeHelpLabel')}
                        >
                          {t('ingresses.pathType', 'Path type')}
                        </FieldLabel>
                        <Select
                          value={route.pathType}
                          onValueChange={(value) =>
                            updateRoute(group.id, route.id, 'pathType', value)
                          }
                        >
                          <SelectTrigger
                            aria-label={t('ingresses.pathType', 'Path type')}
                            className="w-full"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Prefix">Prefix</SelectItem>
                            <SelectItem value="Exact">Exact</SelectItem>
                            <SelectItem value="ImplementationSpecific">
                              ImplementationSpecific
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <FieldLabel
                          help={
                            route.isNew
                              ? t('ingresses.serviceNameHelp')
                              : undefined
                          }
                          helpLabel={t('ingresses.serviceNameHelpLabel')}
                        >
                          {t('ingresses.serviceName', 'Service name')}
                        </FieldLabel>
                        <SearchableFreeformInput
                          label={t('ingresses.serviceName', 'Service name')}
                          value={route.serviceName}
                          placeholder={t('ingresses.serviceName', 'Service name')}
                          options={serviceOptions}
                          onChange={(value) =>
                            selectServiceForRoute(group.id, route, value)
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <FieldLabel
                          help={
                            route.isNew
                              ? t('ingresses.servicePortHelp')
                              : undefined
                          }
                          helpLabel={t('ingresses.servicePortHelpLabel')}
                        >
                          {t('ingresses.servicePort', 'Service port')}
                        </FieldLabel>
                        <SearchableFreeformInput
                          label={t('ingresses.servicePort', 'Service port')}
                          value={route.servicePort}
                          placeholder={t('ingresses.servicePort', 'Service port')}
                          options={getServicePortOptions(route.serviceName)}
                          onChange={(event) =>
                            updateRoute(
                              group.id,
                              route.id,
                              'servicePort',
                              event
                            )
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="self-end"
                        aria-label={t('ingresses.removeRoute', 'Remove route')}
                        onClick={() =>
                          updateHostGroup(group.id, (current) => ({
                            ...current,
                            routes: current.routes.filter(
                              (item) => item.id !== route.id
                            ),
                          }))
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="tls" className="mt-0 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-semibold">
                  {t('ingresses.tlsSettings', 'TLS settings')}
                </h3>
                <FieldHelp
                  label={t('ingresses.tlsSettingsHelpLabel')}
                >
                  {t('ingresses.tlsSettingsHelp')}
                </FieldHelp>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setTlsItems((current) => [createEmptyTlsItem(), ...current])
                }
              >
                <Plus className="h-4 w-4" />
                {t('ingresses.addCertificate', 'Add certificate')}
              </Button>
            </div>
            {tlsItems.length === 0 ? (
              <div className="rounded-md border py-8 text-center text-sm text-muted-foreground">
                {t('ingresses.noCertificates', 'No certificates configured')}
              </div>
            ) : null}
            <div className="space-y-3">
              {tlsItems.map((tls) => (
                <div
                  key={tls.id}
                  className="grid gap-3 rounded-md border p-4 md:grid-cols-[1fr_1fr_auto]"
                >
                  <div className="space-y-2">
                    <FieldLabel
                      help={t('ingresses.tlsHostHelp')}
                      helpLabel={t('ingresses.tlsHostHelpLabel')}
                    >
                      {t('ingresses.host', 'Host')}
                    </FieldLabel>
                    <Input
                      aria-label={t('ingresses.host', 'Host')}
                      value={tls.host}
                      onChange={(event) =>
                        updateTlsItem(tls.id, 'host', event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <FieldLabel
                      help={t('ingresses.tlsSecretHelp')}
                      helpLabel={t('ingresses.tlsSecretHelpLabel')}
                    >
                      {t('ingresses.tlsSecret', 'TLS secret')}
                    </FieldLabel>
                    <SearchableFreeformInput
                      label={t('ingresses.tlsSecret', 'TLS secret')}
                      value={tls.secretName}
                      options={secretOptions}
                      onChange={(value) =>
                        updateTlsItem(tls.id, 'secretName', value)
                      }
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t(
                        'ingresses.removeCertificate',
                        'Remove certificate'
                      )}
                      onClick={() =>
                        setTlsItems((current) =>
                          current.filter((item) => item.id !== tls.id)
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="class" className="mt-0">
            <section className="space-y-4">
              <div className="grid gap-4 rounded-md border bg-muted/20 p-4 md:grid-cols-[minmax(0,1fr)_minmax(20rem,28rem)] md:items-center">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      {t('ingresses.ingressClass')}
                      <FieldHelp
                        label={t('ingresses.ingressClassHelpLabel')}
                      >
                        {t('ingresses.ingressClassHelp')}
                      </FieldHelp>
                    </span>
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {ingressClassOptions.length > 0
                      ? t('ingresses.ingressClassOptionCount', {
                          count: ingressClassOptions.length,
                        })
                      : t(
                          'ingresses.noIngressClassOptions',
                          'No IngressClass options found in this cluster'
                        )}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ingress-class-name" className="sr-only">
                    {t('ingresses.ingressClass')}
                  </Label>
                  <SearchableFreeformInput
                    label={t('ingresses.ingressClass')}
                    value={ingressClassName}
                    onChange={setIngressClassName}
                    options={ingressClassOptions}
                  />
                </div>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="metadata" className="mt-0">
            <div className="grid gap-4 lg:grid-cols-2">
              <KeyValueEditor
                title={t('detail.fields.labels')}
                addLabel={t('ingresses.addLabel', 'Add label')}
                keyLabel={t('ingresses.labelKey', 'Label key')}
                valueLabel={t('ingresses.labelValue', 'Label value')}
                items={labels}
                onChange={setLabels}
              />
              <KeyValueEditor
                title={t('detail.fields.annotations')}
                addLabel={t('ingresses.addAnnotation', 'Add annotation')}
                keyLabel={t('ingresses.annotationKey', 'Annotation key')}
                valueLabel={t('ingresses.annotationValue', 'Annotation value')}
                items={annotations}
                onChange={setAnnotations}
              />
            </div>
          </TabsContent>
        </div>
      </Tabs>

      <div className="mt-4 flex shrink-0 justify-end border-t pt-4">
        <Button type="submit" disabled={isSaving}>
          <Save className="h-4 w-4" />
          {isSaving
            ? t('common.saving', 'Saving')
            : t('ingresses.saveConfig', 'Save config')}
        </Button>
      </div>
      <Dialog open={isSaveConfirmOpen} onOpenChange={setIsSaveConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('ingresses.confirmSaveConfigTitle', 'Confirm save')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'ingresses.confirmSaveConfigDescription',
                'This will update the Ingress configuration in the cluster. Please confirm the edited rules, certificates, IngressClass, labels, and annotations are correct.'
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsSaveConfirmOpen(false)}
              disabled={isSaving}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="button" onClick={handleConfirmSave} disabled={isSaving}>
              {isSaving
                ? t('common.saving', 'Saving')
                : t('ingresses.confirmSaveConfig', 'Confirm save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  )
}

export function IngressDetail(props: { name: string; namespace?: string }) {
  const { namespace, name } = props
  const [yamlContent, setYamlContent] = useState('')
  const [isSavingYaml, setIsSavingYaml] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingHost, setEditingHost] = useState<string | null>(null)
  const { t } = useTranslation()

  const {
    data,
    isLoading,
    isError,
    error,
    refetch: handleRefresh,
  } = useResource('ingresses', name, namespace)
  const { data: services = [] } = useResources('services', namespace)
  const { data: secrets = [] } = useResources('secrets', namespace)
  const { data: ingressClasses = [] } = useResources('ingressclasses', undefined)
  const existingServiceNames = useMemo(
    () =>
      new Set(
        services
          .map((service) => service.metadata?.name)
          .filter((serviceName): serviceName is string => Boolean(serviceName))
      ),
    [services]
  )

  useEffect(() => {
    if (data) {
      setYamlContent(yaml.dump(data, { indent: 2 }))
    }
  }, [data])

  const handleSaveYaml = async (content: Ingress) => {
    setIsSavingYaml(true)
    try {
      await updateResource('ingresses', name, namespace, content)
      trackResourceAction('ingresses', 'yaml_save', {
        result: 'success',
      })
      toast.success('YAML saved successfully')
      await handleRefresh()
      setIsEditDialogOpen(false)
      return true
    } catch (error) {
      trackResourceAction('ingresses', 'yaml_save', {
        result: 'error',
      })
      toast.error(translateError(error, t))
      return false
    } finally {
      setIsSavingYaml(false)
    }
  }

  const handleSaveConfig = async (content: Ingress) => {
    setIsSavingYaml(true)
    try {
      await updateResource('ingresses', name, namespace, content)
      trackResourceAction('ingresses', 'config_save', {
        result: 'success',
      })
      toast.success(
        t('ingresses.configSaveSuccess', 'Ingress config saved successfully')
      )
      await handleRefresh()
      setIsEditDialogOpen(false)
      return true
    } catch (error) {
      trackResourceAction('ingresses', 'config_save', {
        result: 'error',
      })
      toast.error(translateError(error, t))
      return false
    } finally {
      setIsSavingYaml(false)
    }
  }

  const handleManualRefresh = async () => {
    trackResourceAction('ingresses', 'refresh')
    setRefreshKey((prev) => prev + 1)
    await handleRefresh()
  }

  const openEditDialog = (host?: string | null) => {
    setEditingHost(host || null)
    setIsEditDialogOpen(true)
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center gap-2">
              <IconLoader className="animate-spin" />
              <span>{t('detail.status.loading', { resource: 'ingress' })}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <ErrorMessage
        resourceName="ingress"
        error={error}
        refetch={handleRefresh}
      />
    )
  }

  const loadBalancerAddresses = getLoadBalancerAddresses(data)
  const serviceOptions = toComboboxOptions(services, serviceToOption)
  const secretOptions = toComboboxOptions(secrets, secretToOption)
  const ingressClassOptions = toComboboxOptions(
    ingressClasses,
    ingressClassToOption
  )

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-bold">{name}</h1>
          {namespace && (
            <p className="text-muted-foreground">
              {t('detail.fields.namespace')}:{' '}
              <span className="font-medium">{namespace}</span>
            </p>
          )}
        </div>
        <div className="flex w-full flex-wrap gap-2 md:w-auto md:justify-end">
          <RefreshButton
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
          >
            {t('detail.buttons.refresh')}
          </RefreshButton>
          <DescribeDialog
            resourceType="ingresses"
            namespace={namespace}
            name={name}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => openEditDialog()}
          >
            <Pencil className="h-4 w-4" />
            {t('ingresses.editConfig', 'Edit config')}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setIsDeleteDialogOpen(true)}
          >
            <IconTrash className="w-4 h-4" />
            {t('detail.buttons.delete')}
          </Button>
        </div>
      </div>

      <ResponsiveTabs
        tabs={[
          {
            value: 'overview',
            label: t('detail.tabs.overview'),
            content: (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {t('detail.sections.resourceInformation')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t('detail.fields.created')}
                        </Label>
                        <p className="text-sm">
                          {formatDate(data.metadata?.creationTimestamp || '')}
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t('detail.fields.uid')}
                        </Label>
                        <p className="text-sm font-mono">
                          {data.metadata?.uid || t('detail.fields.na')}
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t('ingresses.ingressClass')}
                        </Label>
                        <p className="text-sm">
                          {data.spec?.ingressClassName || t('detail.fields.na')}
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t('ingresses.loadBalancer')}
                        </Label>
                        <p className="break-all text-sm font-mono">
                          {loadBalancerAddresses.length > 0
                            ? loadBalancerAddresses.join(', ')
                            : t('detail.fields.na')}
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {t('ingresses.defaultBackend', 'Default backend')}
                        </Label>
                        <p className="text-sm font-mono">
                          {formatDefaultBackend(data)}
                        </p>
                      </div>
                    </div>
                    <LabelsAnno
                      labels={data.metadata?.labels || {}}
                      annotations={data.metadata?.annotations || {}}
                    />
                  </CardContent>
                </Card>
                <IngressRoutesTable
                  ingress={data}
                  onEditHost={openEditDialog}
                  existingServiceNames={existingServiceNames}
                />
              </div>
            ),
          },
          {
            value: 'yaml',
            label: t('detail.tabs.yaml'),
            content: (
              <div className="space-y-4">
                <YamlEditor<'ingresses'>
                  key={refreshKey}
                  value={yamlContent}
                  title={t('yamlEditor.title')}
                  onSave={handleSaveYaml}
                  onChange={setYamlContent}
                  isSaving={isSavingYaml}
                />
              </div>
            ),
          },
          {
            value: 'Related',
            label: t('detail.tabs.related'),
            content: (
              <RelatedResourcesTable
                resource="ingresses"
                name={name}
                namespace={namespace}
              />
            ),
          },
          {
            value: 'events',
            label: t('detail.tabs.events'),
            content: (
              <EventTable resource="ingresses" namespace={namespace} name={name} />
            ),
          },
          {
            value: 'history',
            label: t('detail.tabs.history'),
            content: (
              <ResourceHistoryTable
                resourceType="ingresses"
                name={name}
                namespace={namespace}
                currentResource={data}
              />
            ),
          },
        ]}
      />

      <Dialog
        open={isEditDialogOpen}
        onOpenChange={(open) => {
          setIsEditDialogOpen(open)
          if (!open) {
            setEditingHost(null)
          }
        }}
      >
        <DialogContent className="flex max-h-[86vh] !max-w-6xl flex-col sm:!max-w-6xl">
          <DialogHeader>
            <DialogTitle>{t('ingresses.editConfig', 'Edit config')}</DialogTitle>
            <DialogDescription>
              {t(
                'ingresses.editConfigDescription',
                'Edit host routes, TLS, labels, and annotations for this Ingress.'
              )}
            </DialogDescription>
          </DialogHeader>
          <IngressConfigEditor
            ingress={data}
            onSave={handleSaveConfig}
            isSaving={isSavingYaml}
            serviceOptions={serviceOptions}
            secretOptions={secretOptions}
            ingressClassOptions={ingressClassOptions}
            focusHost={editingHost}
          />
        </DialogContent>
      </Dialog>

      <ResourceDeleteConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        resourceName={name}
        resourceType="ingresses"
        namespace={namespace}
        confirmationValue={t('deleteConfirmation.confirmDeleteKeyword')}
      />
    </div>
  )
}
