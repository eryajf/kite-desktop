import { act, renderHook } from '@testing-library/react'
import { Deployment } from 'kubernetes-types/apps/v1'
import { describe, expect, it } from 'vitest'

import {
  createProbeDraft,
  useDeploymentContainerEditor,
} from './use-deployment-container-editor'

const deployment = {
  apiVersion: 'apps/v1',
  kind: 'Deployment',
  metadata: {
    name: 'web',
    namespace: 'default',
  },
  spec: {
    replicas: 2,
    selector: {
      matchLabels: {
        app: 'web',
      },
    },
    template: {
      metadata: {
        labels: {
          app: 'web',
        },
      },
      spec: {
        volumes: [
          {
            name: 'config',
            configMap: {
              name: 'web-config',
            },
          },
        ],
        containers: [
          {
            name: 'api',
            image: 'nginx:1.0',
            volumeMounts: [
              {
                name: 'config',
                mountPath: '/app/config',
              },
            ],
          },
          {
            name: 'worker',
            image: 'busybox:1.0',
          },
        ],
      },
    },
  },
} as Deployment

describe('useDeploymentContainerEditor', () => {
  it('keeps multi-container edits isolated to the selected container', () => {
    const { result } = renderHook(() =>
      useDeploymentContainerEditor({
        deployment,
        open: true,
        initialContainerName: 'api',
      })
    )

    act(() => {
      result.current.updateSelectedContainer({ image: 'nginx:1.1' })
    })

    act(() => {
      result.current.setSelectedContainerName('worker')
    })

    act(() => {
      result.current.updateSelectedContainer({
        env: [{ name: 'MODE', value: 'jobs' }],
      })
    })

    const containers =
      result.current.draftDeployment.spec?.template?.spec?.containers
    expect(containers?.[0].image).toBe('nginx:1.1')
    expect(containers?.[0].env).toBeUndefined()
    expect(containers?.[1].image).toBe('busybox:1.0')
    expect(containers?.[1].env?.[0]).toEqual({
      name: 'MODE',
      value: 'jobs',
    })
  })

  it('blocks deleting a referenced volume', () => {
    const { result } = renderHook(() =>
      useDeploymentContainerEditor({
        deployment,
        open: true,
        initialContainerName: 'api',
      })
    )

    const removeResult = result.current.removeVolume('config')

    expect(removeResult.ok).toBe(false)
    if (!removeResult.ok) {
      expect(removeResult.volumeName).toBe('config')
      expect(removeResult.referencedBy).toEqual(['api'])
    }
  })

  it('switches probe types without keeping incompatible fields', () => {
    const httpProbe = createProbeDraft('http', {
      httpGet: {
        path: '/healthz',
        port: 8080,
      },
    })

    const tcpProbe = createProbeDraft('tcp', httpProbe)
    const execProbe = createProbeDraft('exec', tcpProbe)

    expect(tcpProbe.httpGet).toBeUndefined()
    expect(tcpProbe.tcpSocket?.port).toBe(80)
    expect(execProbe.tcpSocket).toBeUndefined()
    expect(execProbe.exec?.command).toEqual(['/bin/sh', '-c', 'true'])
  })
})
