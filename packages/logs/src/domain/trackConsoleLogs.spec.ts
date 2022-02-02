/* eslint-disable no-console */
import { trackConsoleLogs } from './trackConsoleLogs'
;(['log', 'info', 'warn', 'debug'] as const).forEach((status) => {
  describe(`console ${status} tracker`, () => {
    let consoleLogStub: jasmine.Spy
    let notifyLog: jasmine.Spy
    let stopTracking: () => void

    beforeEach(() => {
      consoleLogStub = spyOn(console, status)
      notifyLog = jasmine.createSpy('notifyLog')
      ;({ stop: stopTracking } = trackConsoleLogs([status], notifyLog))
    })

    afterEach(() => {
      stopTracking()
    })

    it('should keep original behavior', () => {
      console[status]('foo', 'bar')
      expect(consoleLogStub).toHaveBeenCalledWith('foo', 'bar')
    })

    it(`should notify ${status}`, () => {
      console[status]('foo', 'bar')
      const reportedStatus = status === 'log' ? 'info' : status

      expect(notifyLog).toHaveBeenCalledWith({
        message: `console ${status}: foo bar`,
        startClocks: jasmine.any(Object),
        status: reportedStatus,
      })
    })

    it('should stringify object parameters', () => {
      console[status]('Hello', { foo: 'bar' })
      const [{ message }] = notifyLog.calls.mostRecent().args

      expect(message).toEqual(`console ${status}: Hello {\n  "foo": "bar"\n}`)
    })

    it('should format error instance', () => {
      console[status](new TypeError('hello'))
      const [{ message }] = notifyLog.calls.mostRecent().args

      expect(message).toBe(`console ${status}: TypeError: hello`)
    })
  })
})
