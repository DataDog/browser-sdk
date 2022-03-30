import type { Context, TimeStamp } from '@datadog/browser-core'
import { noop, stopSessionManager } from '@datadog/browser-core'
import sinon from 'sinon'
import { deleteEventBridgeStub, initEventBridgeStub, stubEndpointBuilder } from '../../../core/test/specHelper'
import type { LogsConfiguration } from '../domain/configuration'
import { validateAndBuildLogsConfiguration } from '../domain/configuration'

import type { LogsMessage } from '../domain/logger'
import { StatusType } from '../domain/logger'
import type { LogsSessionManager } from '../domain/logsSessionManager'
import type { Sender } from '../domain/sender'
import { createSender } from '../domain/sender'
import { doStartLogs, startLogs as originalStartLogs } from './startLogs'

interface SentMessage extends LogsMessage {
  logger?: { name: string }
  view: {
    id?: string
    referrer?: string
    url: string
  }
}

function getLoggedMessage(server: sinon.SinonFakeServer, index: number) {
  return JSON.parse(server.requests[index].requestBody) as SentMessage
}
const FAKE_DATE = 123456
const SESSION_ID = 'session-id'

interface Rum {
  getInternalContext(startTime?: number): any | undefined
}
declare global {
  interface Window {
    DD_RUM?: Rum
  }
}

const DEFAULT_MESSAGE = { status: StatusType.info, message: 'message' }

describe('logs', () => {
  const initConfiguration = { clientToken: 'xxx', service: 'service' }
  let baseConfiguration: LogsConfiguration
  let sessionIsTracked: boolean
  let server: sinon.SinonFakeServer

  const sessionManager: LogsSessionManager = {
    findTrackedSession: () => (sessionIsTracked ? { id: SESSION_ID } : undefined),
  }
  const startLogs = ({
    configuration: configurationOverrides,
  }: { sender?: Sender; configuration?: Partial<LogsConfiguration> } = {}) => {
    const configuration = { ...baseConfiguration, ...configurationOverrides }
    const startLogs = doStartLogs(configuration, sessionManager, createSender(noop))
    return startLogs.send
  }

  beforeEach(() => {
    baseConfiguration = {
      ...validateAndBuildLogsConfiguration(initConfiguration)!,
      logsEndpointBuilder: stubEndpointBuilder('https://localhost/v1/input/log'),
      maxBatchSize: 1,
    }
    sessionIsTracked = true
    server = sinon.fakeServer.create()
  })

  afterEach(() => {
    server.restore()
    delete window.DD_RUM
    deleteEventBridgeStub()
    stopSessionManager()
  })

  describe('request', () => {
    it('should send the needed data', () => {
      const sendLog = startLogs()
      sendLog(
        { message: 'message', foo: 'bar', status: StatusType.warn },
        {
          date: FAKE_DATE,
          view: { referrer: document.referrer, url: window.location.href },
        }
      )

      expect(server.requests.length).toEqual(1)
      expect(server.requests[0].url).toContain(baseConfiguration.logsEndpointBuilder.build())
      expect(getLoggedMessage(server, 0)).toEqual({
        date: FAKE_DATE as TimeStamp,
        foo: 'bar',
        message: 'message',
        service: 'service',
        session_id: SESSION_ID,
        status: StatusType.warn,
        view: {
          referrer: document.referrer,
          url: window.location.href,
        },
      })
    })

    it('should all use the same batch', () => {
      const sendLog = startLogs({ configuration: { maxBatchSize: 3 } })
      sendLog(DEFAULT_MESSAGE, {})
      sendLog(DEFAULT_MESSAGE, {})
      sendLog(DEFAULT_MESSAGE, {})

      expect(server.requests.length).toEqual(1)
    })

    it('should send bridge event when bridge is present', () => {
      const sendSpy = spyOn(initEventBridgeStub(), 'send')

      const sendLog = startLogs()
      sendLog(DEFAULT_MESSAGE, {})

      expect(server.requests.length).toEqual(0)
      const [message] = sendSpy.calls.mostRecent().args
      const parsedMessage = JSON.parse(message)
      expect(parsedMessage).toEqual({
        eventType: 'log',
        event: jasmine.objectContaining({ message: 'message' }),
      })
    })
  })

  describe('sampling', () => {
    it('should be applied when event bridge is present', () => {
      const sendSpy = spyOn(initEventBridgeStub(), 'send')

      let configuration = { ...baseConfiguration, sampleRate: 0 }
      let { send } = originalStartLogs(configuration, createSender(noop))
      send(DEFAULT_MESSAGE, {})

      expect(sendSpy).not.toHaveBeenCalled()

      configuration = { ...baseConfiguration, sampleRate: 100 }
      ;({ send } = originalStartLogs(configuration, createSender(noop)))
      send(DEFAULT_MESSAGE, {})

      expect(sendSpy).toHaveBeenCalled()
    })
  })

  describe('logger sessionManager', () => {
    let sendLog: (message: LogsMessage, context: Context) => void

    beforeEach(() => {
      sendLog = startLogs()
    })

    it('when tracked should enable disable logging', () => {
      sendLog(DEFAULT_MESSAGE, {})
      expect(server.requests.length).toEqual(1)
    })

    it('when not tracked should disable logging', () => {
      sessionIsTracked = false
      sendLog(DEFAULT_MESSAGE, {})
      expect(server.requests.length).toEqual(0)
    })

    it('when type change should enable/disable existing loggers', () => {
      sendLog(DEFAULT_MESSAGE, {})
      expect(server.requests.length).toEqual(1)

      sessionIsTracked = false
      sendLog(DEFAULT_MESSAGE, {})
      expect(server.requests.length).toEqual(1)

      sessionIsTracked = true
      sendLog(DEFAULT_MESSAGE, {})
      expect(server.requests.length).toEqual(2)
    })
  })
})
