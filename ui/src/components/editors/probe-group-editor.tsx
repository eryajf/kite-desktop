import { Container } from 'kubernetes-types/core/v1'
import { useTranslation } from 'react-i18next'

import { ValidationErrors } from '@/hooks/use-deployment-container-editor'

import { ProbeEditor } from './probe-editor'

export function ProbeGroupEditor(props: {
  container: Container
  containerIndex: number
  errors: ValidationErrors
  onUpdate: (updates: Partial<Container>) => void
}) {
  const { container, containerIndex, errors, onUpdate } = props
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      <ProbeEditor
        title={t('containerEditor.probes.liveness')}
        description={t('containerEditor.probes.livenessHint')}
        probe={container.livenessProbe}
        errorPrefix={`containers.${containerIndex}.livenessProbe`}
        errors={errors}
        onChange={(probe) => onUpdate({ livenessProbe: probe })}
      />
      <ProbeEditor
        title={t('containerEditor.probes.readiness')}
        description={t('containerEditor.probes.readinessHint')}
        probe={container.readinessProbe}
        errorPrefix={`containers.${containerIndex}.readinessProbe`}
        errors={errors}
        onChange={(probe) => onUpdate({ readinessProbe: probe })}
      />
      <ProbeEditor
        title={t('containerEditor.probes.startup')}
        description={t('containerEditor.probes.startupHint')}
        probe={container.startupProbe}
        errorPrefix={`containers.${containerIndex}.startupProbe`}
        errors={errors}
        onChange={(probe) => onUpdate({ startupProbe: probe })}
      />
    </div>
  )
}
