import type { Context } from '@datadog/browser-core'
import { noop } from '@datadog/browser-core'
import type { LogsEvent } from '../logsEvent.types'
import { stubEndpointBuilder } from '../../../core/test/specHelper'
import { buildAssemble } from './assemble'
import type { LogsConfiguration } from './configuration'
import { validateAndBuildLogsConfiguration } from './configuration'
import type { LogsMessage } from './logger'
import { StatusType } from './logger'
import type { LogsSessionManager } from './logsSessionManager'

describe('assemble', () => {
  const initConfiguration = { clientToken: 'xxx', service: 'service' }
  const SESSION_ID = 'session-id'
  const DEFAULT_MESSAGE = { status: StatusType.info, message: 'message' }

  const sessionManager: LogsSessionManager = {
    findTrackedSession: () => (sessionIsTracked ? { id: SESSION_ID } : undefined),
  }

  let assemble: (message: LogsMessage, currentContext: Context) => Context | undefined
  let beforeSend: (event: LogsEvent) => void | boolean
  let baseConfiguration: LogsConfiguration
  let sessionIsTracked: boolean

  beforeEach(() => {
    sessionIsTracked = true
    baseConfiguration = {
      ...validateAndBuildLogsConfiguration(initConfiguration)!,
      logsEndpointBuilder: stubEndpointBuilder('https://localhost/v1/input/log'),
      maxBatchSize: 1,
    }
    beforeSend = noop
    assemble = buildAssemble(
      sessionManager,
      { ...baseConfiguration, beforeSend: (x: LogsEvent) => beforeSend(x) },
      noop
    )
    window.DD_RUM = {
      getInternalContext: noop,
    }
  })

  afterEach(() => {
    delete window.DD_RUM
  })

  it('should not assemble when sessionManager is not tracked', () => {
    sessionIsTracked = false

    expect(assemble(DEFAULT_MESSAGE, { foo: 'from-current-context' })).toBeUndefined()
  })

  it('should not assemble if beforeSend returned false', () => {
    beforeSend = () => false
    expect(assemble(DEFAULT_MESSAGE, { foo: 'from-current-context' })).toBeUndefined()
  })

  it('add default, current and RUM context to message', () => {
    spyOn(window.DD_RUM!, 'getInternalContext').and.returnValue({
      view: { url: 'http://from-rum-context.com', id: 'view-id' },
    })

    const assembledMessage = assemble(DEFAULT_MESSAGE, { foo: 'from-current-context' })

    expect(assembledMessage).toEqual({
      foo: 'from-current-context',
      message: DEFAULT_MESSAGE.message,
      service: 'service',
      session_id: SESSION_ID,
      status: DEFAULT_MESSAGE.status,
      view: { url: 'http://from-rum-context.com', id: 'view-id' },
    })
  })

  it('message context should take precedence over RUM context', () => {
    spyOn(window.DD_RUM!, 'getInternalContext').and.returnValue({ session_id: 'from-rum-context' })

    const assembledMessage = assemble({ ...DEFAULT_MESSAGE, session_id: 'from-message-context' }, {})

    expect(assembledMessage!.session_id).toBe('from-message-context')
  })

  it('RUM context should take precedence over current context', () => {
    spyOn(window.DD_RUM!, 'getInternalContext').and.returnValue({ session_id: 'from-rum-context' })

    const assembledMessage = assemble(DEFAULT_MESSAGE, { session_id: 'from-current-context' })

    expect(assembledMessage!.session_id).toBe('from-rum-context')
  })

  it('current context should take precedence over default context', () => {
    const assembledMessage = assemble(DEFAULT_MESSAGE, { service: 'from-current-context' })

    expect(assembledMessage!.service).toBe('from-current-context')
  })

  it('should allow modification of existing fields', () => {
    beforeSend = (event: LogsEvent) => {
      event.message = 'modified message'
      ;(event.service as any) = 'modified service'
    }

    const assembledMessage = assemble(DEFAULT_MESSAGE, {})

    expect(assembledMessage!.message).toBe('modified message')
    expect(assembledMessage!.service).toBe('modified service')
  })

  it('should allow adding new fields', () => {
    beforeSend = (event: LogsEvent) => {
      event.foo = 'bar'
    }

    const assembledMessage = assemble(DEFAULT_MESSAGE, {})

    expect(assembledMessage!.foo).toBe('bar')
  })
})
