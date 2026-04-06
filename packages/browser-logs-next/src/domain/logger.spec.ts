import { HandlerType, Logger, LogsMessage, StatusType } from './logger'

describe('Logger', () => {
  let handleLog: jasmine.Spy
  let logger: Logger

  beforeEach(() => {
    handleLog = jasmine.createSpy('handleLog')
    logger = new Logger(handleLog)
  })

  describe('getName', () => {
    it('returns the default name when none is provided', () => {
      expect(logger.getName()).toBe('default')
    })

    it('returns the name passed to the constructor', () => {
      const named = new Logger(handleLog, 'my-logger')
      expect(named.getName()).toBe('my-logger')
    })
  })

  describe('log', () => {
    it('calls handleLog with the message and status', () => {
      logger.log('hello', undefined, StatusType.info)

      expect(handleLog).toHaveBeenCalledOnceWith(
        jasmine.objectContaining({ message: 'hello', status: StatusType.info }),
        logger
      )
    })

    it('calls handleLog with status "error" when logging an error', () => {
      logger.log('oops', undefined, StatusType.error)

      expect(handleLog).toHaveBeenCalledOnceWith(jasmine.objectContaining({ status: StatusType.error }), logger)
    })

    it('defaults to status "info" when no status is given', () => {
      logger.log('msg')

      expect(handleLog).toHaveBeenCalledOnceWith(jasmine.objectContaining({ status: StatusType.info }), logger)
    })

    it('merges logger context and message context', () => {
      logger.setContext({ fromLogger: true })
      logger.log('msg', { fromMessage: true })

      expect(handleLog).toHaveBeenCalledOnceWith(
        jasmine.objectContaining({ context: { fromLogger: true, fromMessage: true } }),
        logger
      )
    })

    it('message context overrides logger context for same key', () => {
      logger.setContext({ key: 'logger-value' })
      logger.log('msg', { key: 'message-value' })

      expect(handleLog).toHaveBeenCalledOnceWith(
        jasmine.objectContaining({ context: { key: 'message-value' } }),
        logger
      )
    })
  })

  describe('level filtering', () => {
    it('drops messages below the current level', () => {
      logger.setLevel(StatusType.warn)
      logger.log('msg', undefined, StatusType.debug)

      expect(handleLog).not.toHaveBeenCalled()
    })

    it('allows messages at or above the current level', () => {
      logger.setLevel(StatusType.warn)
      logger.log('msg', undefined, StatusType.warn)
      logger.log('msg', undefined, StatusType.error)

      expect(handleLog).toHaveBeenCalledTimes(2)
    })
  })

  describe('convenience methods', () => {
    const statuses: StatusType[] = [
      StatusType.ok,
      StatusType.debug,
      StatusType.info,
      StatusType.notice,
      StatusType.warn,
      StatusType.error,
      StatusType.critical,
      StatusType.alert,
      StatusType.emerg,
    ]

    beforeEach(() => {
      // Set level to ok so no messages get filtered
      logger.setLevel(StatusType.ok)
    })

    for (const status of statuses) {
      it(`${status}() calls log with status "${status}"`, () => {
        ;(logger as any)[status]('test message')

        expect(handleLog).toHaveBeenCalledWith(jasmine.objectContaining({ status }), logger)

        handleLog.calls.reset()
      })
    }
  })

  describe('handler routing', () => {
    describe('http handler', () => {
      beforeEach(() => {
        logger.setHandler(HandlerType.http)
      })

      it('calls handleLog when handler is http', () => {
        logger.log('msg')

        expect(handleLog).toHaveBeenCalledTimes(1)
      })
    })

    describe('console handler', () => {
      let consoleLogSpy: jasmine.Spy
      let consoleWarnSpy: jasmine.Spy
      let consoleErrorSpy: jasmine.Spy
      let consoleDebugSpy: jasmine.Spy

      beforeEach(() => {
        logger.setHandler(HandlerType.console)
        logger.setLevel(StatusType.ok)
        consoleLogSpy = spyOn(console, 'log')
        consoleWarnSpy = spyOn(console, 'warn')
        consoleErrorSpy = spyOn(console, 'error')
        consoleDebugSpy = spyOn(console, 'debug')
      })

      it('does not call handleLog when handler is console', () => {
        logger.log('msg')

        expect(handleLog).not.toHaveBeenCalled()
      })

      it('uses console.log for info status', () => {
        logger.log('msg', undefined, StatusType.info)

        expect(consoleLogSpy).toHaveBeenCalled()
      })

      it('uses console.debug for debug status', () => {
        logger.log('msg', undefined, StatusType.debug)

        expect(consoleDebugSpy).toHaveBeenCalled()
      })

      it('uses console.warn for warn status', () => {
        logger.log('msg', undefined, StatusType.warn)

        expect(consoleWarnSpy).toHaveBeenCalled()
      })

      it('uses console.warn for notice status', () => {
        logger.log('msg', undefined, StatusType.notice)

        expect(consoleWarnSpy).toHaveBeenCalled()
      })

      it('uses console.error for error status', () => {
        logger.log('msg', undefined, StatusType.error)

        expect(consoleErrorSpy).toHaveBeenCalled()
      })

      it('uses console.error for critical status', () => {
        logger.log('msg', undefined, StatusType.critical)

        expect(consoleErrorSpy).toHaveBeenCalled()
      })

      it('uses console.error for alert status', () => {
        logger.log('msg', undefined, StatusType.alert)

        expect(consoleErrorSpy).toHaveBeenCalled()
      })

      it('uses console.error for emerg status', () => {
        logger.log('msg', undefined, StatusType.emerg)

        expect(consoleErrorSpy).toHaveBeenCalled()
      })
    })

    describe('silent handler', () => {
      beforeEach(() => {
        logger.setHandler(HandlerType.silent)
        spyOn(console, 'log')
        spyOn(console, 'warn')
        spyOn(console, 'error')
        spyOn(console, 'debug')
      })

      it('does not call handleLog when handler is silent', () => {
        logger.log('msg')

        expect(handleLog).not.toHaveBeenCalled()
      })

      it('does not write to console when handler is silent', () => {
        logger.log('msg')

        expect(console.log).not.toHaveBeenCalled()
        expect(console.warn).not.toHaveBeenCalled()
        expect(console.error).not.toHaveBeenCalled()
        expect(console.debug).not.toHaveBeenCalled()
      })
    })

    describe('multiple handlers', () => {
      it('calls handleLog and writes to console when handlers are [http, console]', () => {
        const consoleLogSpy = spyOn(console, 'log')
        logger.setHandler([HandlerType.http, HandlerType.console])
        logger.log('msg', undefined, StatusType.info)

        expect(handleLog).toHaveBeenCalledTimes(1)
        expect(consoleLogSpy).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('context management', () => {
    it('setContext replaces the entire context', () => {
      logger.setContext({ a: 1 })
      logger.setContext({ b: 2 })

      expect(logger.getContext()).toEqual({ b: 2 })
    })

    it('getContext returns a copy', () => {
      logger.setContext({ a: 1 })
      const ctx = logger.getContext()
      ctx['extra'] = 'mutated'

      expect(logger.getContext()).toEqual({ a: 1 })
    })

    it('setContextProperty adds a key', () => {
      logger.setContextProperty('foo', 'bar')

      expect(logger.getContext()).toEqual({ foo: 'bar' })
    })

    it('removeContextProperty deletes a key', () => {
      logger.setContext({ a: 1, b: 2 })
      logger.removeContextProperty('a')

      expect(logger.getContext()).toEqual({ b: 2 })
    })

    it('clearContext removes all keys', () => {
      logger.setContext({ a: 1, b: 2 })
      logger.clearContext()

      expect(logger.getContext()).toEqual({})
    })

    it('context is included in the LogsMessage', () => {
      logger.setContext({ env: 'test' })
      logger.log('msg')

      const sent: LogsMessage = handleLog.calls.mostRecent().args[0]
      expect(sent.context).toEqual(jasmine.objectContaining({ env: 'test' }))
    })
  })

  describe('tag management', () => {
    it('addTag stores a key-only tag', () => {
      logger.addTag('service')

      expect(logger.getTags()).toEqual(['service'])
    })

    it('addTag stores a key:value tag', () => {
      logger.addTag('env', 'prod')

      expect(logger.getTags()).toEqual(['env:prod'])
    })

    it('removeTagsWithKey removes matching tags', () => {
      logger.addTag('env', 'prod')
      logger.addTag('env', 'staging')
      logger.addTag('service')
      logger.removeTagsWithKey('env')

      expect(logger.getTags()).not.toContain(jasmine.stringMatching(/^env/))
      expect(logger.getTags()).toContain('service')
    })

    it('getTags returns a copy', () => {
      logger.addTag('a')
      const tags = logger.getTags()
      tags.push('injected')

      expect(logger.getTags()).toEqual(['a'])
    })
  })

  describe('setHandler / getHandler', () => {
    it('returns the handler set via setHandler', () => {
      logger.setHandler(HandlerType.console)

      expect(logger.getHandler()).toBe(HandlerType.console)
    })

    it('returns an array when multiple handlers are set', () => {
      logger.setHandler([HandlerType.http, HandlerType.console])

      expect(logger.getHandler()).toEqual([HandlerType.http, HandlerType.console])
    })
  })

  describe('setLevel / getLevel', () => {
    it('returns the level set via setLevel', () => {
      logger.setLevel(StatusType.error)

      expect(logger.getLevel()).toBe(StatusType.error)
    })

    it('dynamically changes filtering after setLevel', () => {
      logger.setLevel(StatusType.error)
      logger.log('dropped', undefined, StatusType.info)
      expect(handleLog).not.toHaveBeenCalled()

      logger.setLevel(StatusType.info)
      logger.log('allowed', undefined, StatusType.info)
      expect(handleLog).toHaveBeenCalledTimes(1)
    })
  })
})
