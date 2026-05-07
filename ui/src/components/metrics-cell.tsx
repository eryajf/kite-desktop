import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { MetricsData } from '@/types/api'
import { cn, formatMemory } from '@/lib/utils'

import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

function formatCompactMemoryValue(value: number): string {
  const formatted = formatMemory(value)
  const match = formatted.match(/^(\d+(?:\.\d+)?)\s([A-Za-z]+)$/)

  if (!match) {
    return formatted
  }

  const numericValue = Number(match[1])
  if (!Number.isFinite(numericValue)) {
    return formatted
  }

  const digits = numericValue >= 100 ? 0 : 1

  return `${numericValue.toFixed(digits).replace(/\.0$/, '')} ${match[2]}`
}

function formatCpuCoreValue(value: number, coreUnitLabel: string): string {
  const cores = value / 1000

  if (!Number.isFinite(cores)) {
    return `- ${coreUnitLabel}`
  }

  if (cores >= 10) {
    return `${Math.round(cores)} ${coreUnitLabel}`
  }

  if (cores >= 1) {
    return `${Number(cores.toFixed(1))} ${coreUnitLabel}`
  }

  return `${Number(cores.toFixed(1))} ${coreUnitLabel}`
}

export function MetricCell({
  metrics,
  type,
  limitLabel = 'Limit',
  showPercentage = false,
  layout = 'inline',
  compactValue = false,
  cpuUnit = 'milli',
}: {
  metrics?: MetricsData
  type: 'cpu' | 'memory'
  limitLabel?: string // e.g., "Limit" or "Capacity"
  showPercentage?: boolean // Whether to show percentage in the display
  layout?: 'inline' | 'stacked'
  compactValue?: boolean
  cpuUnit?: 'milli' | 'cores'
}) {
  const { t } = useTranslation()
  const metricValue =
    type === 'cpu' ? metrics?.cpuUsage || 0 : metrics?.memoryUsage || 0

  const metricLimit = type === 'cpu' ? metrics?.cpuLimit : metrics?.memoryLimit

  const metricRequest =
    type === 'cpu' ? metrics?.cpuRequest : metrics?.memoryRequest

  const formatValue = useCallback(
    (val?: number) => {
      if (val === undefined || val === null) return '-'
      if (type === 'cpu') {
        return cpuUnit === 'cores'
          ? formatCpuCoreValue(val, t('metric.coreUnit', 'cores'))
          : `${val}m`
      }

      return compactValue ? formatCompactMemoryValue(val) : formatMemory(val)
    },
    [compactValue, cpuUnit, t, type]
  )

  return useMemo(() => {
    const percentage = metricLimit
      ? Math.min((metricValue / metricLimit) * 100, 100)
      : 0

    const requestPercentage =
      metricRequest && metricLimit
        ? Math.min((metricRequest / metricLimit) * 100, 100)
        : 0

    const getProgressColor = () => {
      if (percentage > 90) return 'bg-red-500'
      if (percentage > 60) return 'bg-yellow-500'
      return 'bg-blue-500'
    }

    const tooltipContent = (
      <TooltipContent>
        <div className="text-sm grid grid-cols-2 gap-x-3 gap-y-0.5 min-w-0">
          <span>{t('metric.usage')}:</span>
          <span className="text-right">{formatValue(metricValue)}</span>
          <span>{t('metric.request')}:</span>
          <span className="text-right">{formatValue(metricRequest)}</span>
          <span>{limitLabel}:</span>
          <span className="text-right">{formatValue(metricLimit)}</span>
        </div>
      </TooltipContent>
    )

    if (showPercentage) {
      if (layout === 'stacked') {
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="mx-auto flex min-w-[160px] max-w-[190px] flex-col gap-1.5 text-xs text-foreground transition-colors hover:text-primary">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-left font-medium tabular-nums">
                    {formatValue(metricValue)} / {formatValue(metricLimit)}
                  </span>
                  <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
                    {Math.round(percentage)}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted/80 ring-1 ring-border/50">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-300',
                      getProgressColor()
                    )}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            </TooltipTrigger>
            {tooltipContent}
          </Tooltip>
        )
      }

      const valueWidthClass = type === 'cpu' ? 'w-[104px]' : 'w-[148px]'
      const containerWidthClass =
        type === 'cpu'
          ? 'min-w-[220px] max-w-[260px]'
          : 'min-w-[260px] max-w-[320px]'

      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`mx-auto flex items-center gap-2 text-sm text-foreground transition-colors hover:text-primary ${containerWidthClass}`}
            >
              <span
                className={`${valueWidthClass} shrink-0 whitespace-nowrap text-right font-medium tabular-nums`}
              >
                {formatValue(metricValue)}/{formatValue(metricLimit)}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted/80 ring-1 ring-border/50">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${getProgressColor()}`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <span className="w-[42px] shrink-0 whitespace-nowrap text-left font-medium tabular-nums">
                {Math.round(percentage)}%
              </span>
            </div>
          </TooltipTrigger>
          {tooltipContent}
        </Tooltip>
      )
    }

    return (
      <div className="flex items-center justify-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="w-14 h-2 relative">
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${getProgressColor()}`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
              {metricRequest && metricLimit && (
                <div
                  className="absolute -top-0.5 h-3 flex items-center justify-center"
                  style={{
                    left: `${requestPercentage}%`,
                    transform: 'translateX(-50%)',
                  }}
                >
                  <div className="w-0.5 h-3 bg-muted-foreground dark:bg-gray-400 rounded-sm shadow-sm"></div>
                </div>
              )}
            </div>
          </TooltipTrigger>
          {tooltipContent}
        </Tooltip>
        <span
          className={`${type === 'cpu' ? 'w-[4ch]' : 'w-[10ch]'} text-right inline-block text-xs text-muted-foreground whitespace-nowrap tabular-nums`}
        >
          {formatValue(metricValue)}
          {showPercentage && metricLimit && metricValue > 0 && (
            <span className="hidden 2xl:inline text-[10px] opacity-70">
              ({percentage.toFixed(0)}%)
            </span>
          )}
        </span>
      </div>
    )
  }, [
    metricLimit,
    metricValue,
    metricRequest,
    formatValue,
    limitLabel,
    t,
    type,
    showPercentage,
    layout,
    cpuUnit,
  ])
}
