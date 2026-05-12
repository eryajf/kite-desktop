import type { Container } from 'kubernetes-types/core/v1'
import { useTranslation } from 'react-i18next'

import { aggregateContainerResources } from '@/lib/k8s'
import { Badge } from '@/components/ui/badge'

const cpuUnits: Record<string, number> = {
  n: 1e-9,
  u: 1e-6,
  m: 1e-3,
  '': 1,
  k: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  P: 1e15,
  E: 1e18,
}

const binaryMemoryUnits: Record<string, number> = {
  Ki: 1024,
  Mi: 1024 ** 2,
  Gi: 1024 ** 3,
  Ti: 1024 ** 4,
  Pi: 1024 ** 5,
  Ei: 1024 ** 6,
}

const decimalMemoryUnits: Record<string, number> = {
  '': 1,
  K: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  P: 1e15,
  E: 1e18,
}

function trimTrailingZeros(value: number, fractionDigits: number) {
  return value.toFixed(fractionDigits).replace(/\.?0+$/, '')
}

function formatCpuAsCores(value?: string, coreUnitLabel = '核') {
  if (!value) {
    return undefined
  }

  const match = value.trim().match(/^([+-]?\d+(?:\.\d+)?)(n|u|m|k|M|G|T|P|E)?$/)
  if (!match) {
    return value
  }

  const amount = Number(match[1])
  const suffix = match[2] ?? ''
  const multiplier = cpuUnits[suffix]
  if (Number.isNaN(amount) || multiplier === undefined) {
    return value
  }

  const cores = amount * multiplier
  return `${trimTrailingZeros(cores, 1)} ${coreUnitLabel}`
}

function formatMemoryAsGi(value?: string) {
  if (!value) {
    return undefined
  }

  const match = value
    .trim()
    .match(/^([+-]?\d+(?:\.\d+)?)(Ki|Mi|Gi|Ti|Pi|Ei|K|M|G|T|P|E)?$/)
  if (!match) {
    return value
  }

  const amount = Number(match[1])
  const suffix = match[2] ?? ''
  if (Number.isNaN(amount)) {
    return value
  }

  const bytes =
    suffix in binaryMemoryUnits
      ? amount * binaryMemoryUnits[suffix]
      : amount * (decimalMemoryUnits[suffix] ?? 1)

  const gibibytes = bytes / binaryMemoryUnits.Gi
  return `${trimTrailingZeros(gibibytes, 1)}Gi`
}

export function ResourceLimitsSummary(props: { containers?: Container[] }) {
  const { t } = useTranslation()
  const { containers } = props
  const limits = aggregateContainerResources(containers).limits
  const formattedCpu = formatCpuAsCores(
    limits.cpu,
    t('namespaceEditDialog.unitCpuCore', '核')
  )
  const formattedMemory = formatMemoryAsGi(limits.memory)

  if (!formattedCpu && !formattedMemory) {
    return <span className="text-sm text-muted-foreground">-</span>
  }

  return (
    <div className="flex flex-nowrap items-center gap-1.5 whitespace-nowrap">
      {formattedCpu ? (
        <Badge
          variant="secondary"
          className="h-6 shrink-0 rounded-full px-2.5 font-mono tabular-nums whitespace-nowrap"
        >
          <span className="text-muted-foreground">CPU:</span>
          <span className="sr-only"> </span>
          <span className="text-foreground">{formattedCpu}</span>
        </Badge>
      ) : null}
      {formattedMemory ? (
        <Badge
          variant="secondary"
          className="h-6 shrink-0 rounded-full px-2.5 font-mono tabular-nums whitespace-nowrap"
        >
          <span className="text-muted-foreground">Memory:</span>
          <span className="sr-only"> </span>
          <span className="text-foreground">{formattedMemory}</span>
        </Badge>
      ) : null}
    </div>
  )
}
