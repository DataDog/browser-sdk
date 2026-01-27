import { registerCleanupTask } from '@datadog/browser-core/test'
import { sendLiveDebuggerLog, liveDebug } from './liveDebuggerLogger'

describe('liveDebuggerLogger', () => {
  let originalDDLogs: any
  let mockLogger: any

  beforeEach(() => {
    mockLogger = {
      info: jasmine.createSpy('info'),
      error: jasmine.createSpy('error'),
      warn: jasmine.createSpy('warn'),
    }
    originalDDLogs = (window as any).DD_LOGS
    ;(window as any).DD_LOGS = {
      logger: mockLogger,
    }
  })

  afterEach(() => {
    ;(window as any).DD_LOGS = originalDDLogs
  })

  describe('sendLiveDebuggerLog', () => {
    it('should send log event when DD_LOGS is available', () => {
      const data = { key: 'test-key', value: true, id: 'test-id' }

      sendLiveDebuggerLog(data)

      expect(mockLogger.info).toHaveBeenCalledWith('Live Debugger event', data)
    })

    it('should handle when DD_LOGS is not available', () => {
      ;(window as any).DD_LOGS = undefined

      expect(() => {
        sendLiveDebuggerLog({ key: 'test-key', value: true })
      }).not.toThrow()
    })

    it('should handle when DD_LOGS.logger is not available', () => {
      ;(window as any).DD_LOGS = {}

      expect(() => {
        sendLiveDebuggerLog({ key: 'test-key', value: true })
      }).not.toThrow()
    })

    it('should send log with correct data structure', () => {
      const data = {
        key: 'remote-config-key',
        value: false,
        id: 'debugger-id-123',
        timestamp: Date.now(),
      }

      sendLiveDebuggerLog(data)

      expect(mockLogger.info).toHaveBeenCalledWith('Live Debugger event', data)
    })
  })

  describe('liveDebug', () => {
    let mockSendRawLog: jasmine.Spy
    let mockGetInitConfiguration: jasmine.Spy

    beforeEach(() => {
      mockSendRawLog = jasmine.createSpy('sendRawLog')
      mockGetInitConfiguration = jasmine.createSpy('getInitConfiguration').and.returnValue({ service: 'test-service' })
      ;(window as any).DD_LOGS = {
        sendRawLog: mockSendRawLog,
        getInitConfiguration: mockGetInitConfiguration,
      }
      // Mock window.location.hostname
      Object.defineProperty(window, 'location', {
        value: { hostname: 'test-hostname' },
        writable: true,
      })
    })

    it('should send log when DD_LOGS.sendRawLog is available', () => {
      liveDebug('test message', { name: 'test-logger' }, { version: '1.0' }, { captures: [] })

      expect(mockSendRawLog).toHaveBeenCalledTimes(1)
      const payload = mockSendRawLog.calls.mostRecent().args[0]
      expect(payload.message).toBe('test message')
      expect(payload.logger).toEqual({ name: 'test-logger' })
      expect(payload.dd).toEqual({ version: '1.0' })
      expect(payload.debugger).toEqual({ snapshot: { captures: [] } })
    })

    it('should handle when DD_LOGS is not available', () => {
      ;(window as any).DD_LOGS = undefined

      expect(() => {
        liveDebug('test message')
      }).not.toThrow()
      expect(mockSendRawLog).not.toHaveBeenCalled()
    })

    it('should handle when sendRawLog is not available', () => {
      ;(window as any).DD_LOGS = {
        getInitConfiguration: mockGetInitConfiguration,
      }

      expect(() => {
        liveDebug('test message')
      }).not.toThrow()
      expect(mockSendRawLog).not.toHaveBeenCalled()
    })

    it('should construct payload with correct structure matching dd-trace-js', () => {
      liveDebug('test message', { name: 'logger' }, { version: '1.0' }, { snapshot: 'data' })

      expect(mockSendRawLog).toHaveBeenCalledTimes(1)
      const payload = mockSendRawLog.calls.mostRecent().args[0]
      expect(payload.ddsource).toBe('dd_debugger')
      expect(payload.hostname).toBe('test-hostname')
      expect(payload.service).toBe('test-service')
      expect(payload.message).toBe('test message')
      expect(payload.logger).toEqual({ name: 'logger' })
      expect(payload.dd).toEqual({ version: '1.0' })
      expect(payload.debugger).toEqual({ snapshot: { snapshot: 'data' } })
      expect(payload.date).toBeDefined()
      expect(payload.status).toBe('info')
      expect(payload.origin).toBeDefined()
    })

    it('should truncate message to 8KB if needed', () => {
      const longMessage = 'a'.repeat(9 * 1024) // 9KB message
      liveDebug(longMessage)

      expect(mockSendRawLog).toHaveBeenCalledTimes(1)
      const payload = mockSendRawLog.calls.mostRecent().args[0]
      expect(payload.message.length).toBe(8 * 1024 + 1) // 8KB + '…'
      expect(payload.message.endsWith('…')).toBe(true)
    })

    it('should include all parameters (message, logger, dd, snapshot)', () => {
      const message = 'test message'
      const logger = { name: 'test-logger', level: 'info' }
      const dd = { version: '1.0', env: 'prod' }
      const snapshot = { captures: [{ id: '1' }] }

      liveDebug(message, logger, dd, snapshot)

      expect(mockSendRawLog).toHaveBeenCalledTimes(1)
      const payload = mockSendRawLog.calls.mostRecent().args[0]
      expect(payload.message).toBe(message)
      expect(payload.logger).toBe(logger)
      expect(payload.dd).toBe(dd)
      expect(payload.debugger).toEqual({ snapshot })
    })

    it('should handle empty message', () => {
      liveDebug(undefined, { name: 'logger' }, {}, {})

      expect(mockSendRawLog).toHaveBeenCalledTimes(1)
      const payload = mockSendRawLog.calls.mostRecent().args[0]
      expect(payload.message).toBe('')
    })

    it('should not include service if not available in config', () => {
      mockGetInitConfiguration.and.returnValue({})
      liveDebug('test message')

      expect(mockSendRawLog).toHaveBeenCalledTimes(1)
      const payload = mockSendRawLog.calls.mostRecent().args[0]
      expect(payload.service).toBeUndefined()
    })

    it('should handle when getInitConfiguration is not available', () => {
      ;(window as any).DD_LOGS = {
        sendRawLog: mockSendRawLog,
      }
      liveDebug('test message')

      expect(mockSendRawLog).toHaveBeenCalledTimes(1)
      const payload = mockSendRawLog.calls.mostRecent().args[0]
      expect(payload.service).toBeUndefined()
    })
  })
})


