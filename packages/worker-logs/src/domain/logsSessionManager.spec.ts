import type { LogsConfiguration } from './configuration'
import { startLogsSessionManagerStub } from './logsSessionManager'

describe('worker-logs logger session stub', () => {
  it('isTracked is computed at each init and getId is always undefined', () => {
    const firstLogsSessionManager = startLogsSessionManagerStub({ sessionSampleRate: 100 } as LogsConfiguration)
    expect(firstLogsSessionManager.findTrackedSession()).toBeDefined()
    expect(firstLogsSessionManager.findTrackedSession()!.id).toBeUndefined()

    const secondLogsSessionManager = startLogsSessionManagerStub({ sessionSampleRate: 0 } as LogsConfiguration)
    expect(secondLogsSessionManager.findTrackedSession()).toBeUndefined()
  })
})
