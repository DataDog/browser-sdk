import { display, ErrorSource, resetExperimentalFeatures, updateExperimentalFeatures } from '@datadog/browser-core'
import type { LogsMessage } from './logger'
import { HandlerType, Logger, STATUSES, StatusType } from './logger'
import type { Sender } from './sender'
import { createSender } from './sender'

describe('Logger', () => {
  let logger: Logger
  let sender: Sender
  let sendLogSpy: jasmine.Spy<(message: LogsMessage) => void>

  function getLoggedMessage(index: number) {
    return sendLogSpy.calls.argsFor(index)[0]
  }

  beforeEach(() => {
    sendLogSpy = jasmine.createSpy()
    sender = createSender(sendLogSpy)
    logger = new Logger(sender)
  })

  afterEach(() => {
    resetExperimentalFeatures()
  })

  describe('log methods', () => {
    it("'logger.log' should have info status by default", () => {
      logger.log('message')

      expect(getLoggedMessage(0).status).toEqual(StatusType.info)
    })

    it("'logger.log' should set 'logger' origin when ff forward-logs enabled", () => {
      updateExperimentalFeatures(['forward-logs'])
      logger.log('message')

      expect(getLoggedMessage(0).origin).toEqual(ErrorSource.LOGGER)
    })

    it("'logger.log' should not set 'logger' origin when ff forward-logs disabled", () => {
      logger.log('message')
      expect(getLoggedMessage(0).origin).not.toBeDefined()
    })

    it("'logger.log' message context can override the 'logger' origin", () => {
      updateExperimentalFeatures(['forward-logs'])
      logger.log('message', { origin: 'foo' })

      expect(getLoggedMessage(0).origin).toEqual('foo')
    })

    STATUSES.forEach((status) => {
      it(`'logger.${status}' should have ${status} status`, () => {
        logger[status]('message')
        expect(getLoggedMessage(0).status).toEqual(status)
      })
    })
  })

  describe('context', () => {
    it('should be added to the log event', () => {
      logger.setContext({ bar: 'foo' })
      logger.log('message')

      expect(getLoggedMessage(0).bar).toEqual('foo')
    })

    it('should be deep merged', () => {
      logger.setContext({ foo: { qix: 'qux' } })
      logger.log('message', { foo: { qux: 'qux' } })
      logger.log('message', { foo: { hello: 'hi' } })

      expect(getLoggedMessage(0).foo).toEqual({
        qix: 'qux',
        qux: 'qux',
      })
      expect(getLoggedMessage(1).foo).toEqual({
        hello: 'hi',
        qix: 'qux',
      })
    })
  })

  describe('level', () => {
    it('should be debug by default', () => {
      logger.debug('message')

      expect(sendLogSpy).toHaveBeenCalled()
    })

    it('should be configurable', () => {
      logger.setLevel(StatusType.info)

      logger.debug('message')

      expect(sendLogSpy).not.toHaveBeenCalled()
    })
  })

  describe('handler type', () => {
    beforeEach(() => {
      spyOn(display, 'log')
    })

    it('should be "http" by default', () => {
      logger.debug('message')

      expect(sendLogSpy).toHaveBeenCalled()
      expect(display.log).not.toHaveBeenCalled()
    })

    it('should be configurable to "console"', () => {
      logger.setHandler(HandlerType.console)
      logger.setContext({ foo: 'bar' })

      logger.error('message', { lorem: 'ipsum' })

      expect(sendLogSpy).not.toHaveBeenCalled()
      expect(display.log).toHaveBeenCalledWith('error: message', {
        error: { origin: 'logger' },
        foo: 'bar',
        lorem: 'ipsum',
      })
    })

    it('should be configurable to "silent"', () => {
      logger.setHandler(HandlerType.silent)

      logger.error('message')

      expect(sendLogSpy).not.toHaveBeenCalled()
      expect(display.log).not.toHaveBeenCalled()
    })

    it('should be configurable to "console" and "http"', () => {
      logger.setHandler([HandlerType.console, HandlerType.http])
      logger.setContext({ foo: 'bar' })

      logger.debug('message')

      expect(sendLogSpy).toHaveBeenCalled()
      expect(display.log).toHaveBeenCalled()
    })

    it('should be configurable to "silent" and "console"', () => {
      logger.setHandler([HandlerType.silent, HandlerType.console])
      logger.setContext({ foo: 'bar' })

      logger.debug('message')

      expect(sendLogSpy).not.toHaveBeenCalled()
      expect(display.log).toHaveBeenCalled()
    })
  })
})
