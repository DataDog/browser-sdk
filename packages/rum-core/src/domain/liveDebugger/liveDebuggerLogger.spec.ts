import { registerCleanupTask } from '@datadog/browser-core/test'
import { sendLiveDebuggerLog } from './liveDebuggerLogger'

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
})

