import { ErrorSource, display, stopSessionManager, getCookie, SESSION_COOKIE_NAME } from '@datadog/browser-core'
import sinon from 'sinon'
import { cleanupSyntheticsWorkerValues, mockSyntheticsWorkerValues } from '../../../core/test/syntheticsWorkerValues'
import { deleteEventBridgeStub, initEventBridgeStub, stubEndpointBuilder } from '../../../core/test/specHelper'
import type { LogsConfiguration } from '../domain/configuration'
import { validateAndBuildLogsConfiguration } from '../domain/configuration'

import { HandlerType, Logger, StatusType } from '../domain/logger'
import type { startLoggerCollection } from '../domain/logsCollection/logger/loggerCollection'
import type { LogsEvent } from '../logsEvent.types'
import { startLogs } from './startLogs'

function getLoggedMessage(server: sinon.SinonFakeServer, index: number) {
  return JSON.parse(server.requests[index].requestBody) as LogsEvent
}

interface Rum {
  getInternalContext(startTime?: number): any | undefined
}
declare global {
  interface Window {
    DD_RUM?: Rum
    DD_RUM_SYNTHETICS?: Rum
  }
}

const DEFAULT_MESSAGE = { status: StatusType.info, message: 'message' }
const COMMON_CONTEXT = {
  view: { referrer: 'common_referrer', url: 'common_url' },
  context: {},
}

describe('logs', () => {
  const initConfiguration = { clientToken: 'xxx', service: 'service' }
  let baseConfiguration: LogsConfiguration
  let server: sinon.SinonFakeServer
  let handleLog: ReturnType<typeof startLoggerCollection>['handleLog']
  let logger: Logger
  let consoleLogSpy: jasmine.Spy
  let displayLogSpy: jasmine.Spy

  beforeEach(() => {
    baseConfiguration = {
      ...validateAndBuildLogsConfiguration(initConfiguration)!,
      logsEndpointBuilder: stubEndpointBuilder('https://localhost/v1/input/log'),
      batchMessagesLimit: 1,
    }
    logger = new Logger((...params) => handleLog(...params))
    server = sinon.fakeServer.create()
    consoleLogSpy = spyOn(console, 'log')
    displayLogSpy = spyOn(display, 'log')
  })

  afterEach(() => {
    server.restore()
    delete window.DD_RUM
    deleteEventBridgeStub()
    stopSessionManager()
  })

  describe('request', () => {
    it('should send the needed data', () => {
      ;({ handleLog: handleLog } = startLogs(baseConfiguration, () => COMMON_CONTEXT, logger))

      handleLog({ message: 'message', status: StatusType.warn, context: { foo: 'bar' } }, logger, COMMON_CONTEXT)

      expect(server.requests.length).toEqual(1)
      expect(server.requests[0].url).toContain(baseConfiguration.logsEndpointBuilder.build())
      expect(getLoggedMessage(server, 0)).toEqual({
        date: jasmine.any(Number),
        foo: 'bar',
        message: 'message',
        service: 'service',
        session_id: jasmine.any(String),
        status: StatusType.warn,
        view: {
          referrer: 'common_referrer',
          url: 'common_url',
        },
        origin: ErrorSource.LOGGER,
      })
    })

    it('should all use the same batch', () => {
      ;({ handleLog } = startLogs({ ...baseConfiguration, batchMessagesLimit: 3 }, () => COMMON_CONTEXT, logger))

      handleLog(DEFAULT_MESSAGE, logger)
      handleLog(DEFAULT_MESSAGE, logger)
      handleLog(DEFAULT_MESSAGE, logger)

      expect(server.requests.length).toEqual(1)
    })

    it('should send bridge event when bridge is present', () => {
      const sendSpy = spyOn(initEventBridgeStub(), 'send')
      ;({ handleLog: handleLog } = startLogs(baseConfiguration, () => COMMON_CONTEXT, logger))

      handleLog(DEFAULT_MESSAGE, logger)

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
      ;({ handleLog } = startLogs(configuration, () => COMMON_CONTEXT, logger))
      handleLog(DEFAULT_MESSAGE, logger)

      expect(sendSpy).not.toHaveBeenCalled()

      configuration = { ...baseConfiguration, sampleRate: 100 }
      ;({ handleLog } = startLogs(configuration, () => COMMON_CONTEXT, logger))
      handleLog(DEFAULT_MESSAGE, logger)

      expect(sendSpy).toHaveBeenCalled()
    })
  })

  it('should not print the log twice when console handler is enabled', () => {
    logger.setHandler([HandlerType.console])
    ;({ handleLog } = startLogs({ ...baseConfiguration, forwardConsoleLogs: ['log'] }, () => COMMON_CONTEXT, logger))

    /* eslint-disable-next-line no-console */
    console.log('foo', 'bar')

    expect(consoleLogSpy).toHaveBeenCalledTimes(1)
    expect(displayLogSpy).not.toHaveBeenCalled()
  })

  describe('logs session creation', () => {
    afterEach(() => {
      cleanupSyntheticsWorkerValues()
    })

    it('creates a session on normal conditions', () => {
      ;({ handleLog } = startLogs(baseConfiguration, () => COMMON_CONTEXT, logger))

      expect(getCookie(SESSION_COOKIE_NAME)).not.toBeUndefined()
    })

    it('does not create a session if event bridge is present', () => {
      initEventBridgeStub()
      ;({ handleLog } = startLogs(baseConfiguration, () => COMMON_CONTEXT, logger))

      expect(getCookie(SESSION_COOKIE_NAME)).toBeUndefined()
    })

    it('does not create a session if synthetics worker will inject RUM', () => {
      mockSyntheticsWorkerValues({ injectsRum: true })
      ;({ handleLog } = startLogs(baseConfiguration, () => COMMON_CONTEXT, logger))

      expect(getCookie(SESSION_COOKIE_NAME)).toBeUndefined()
    })
  })
})
