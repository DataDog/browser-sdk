/* eslint-disable no-console */
import type { Subscription } from '../tools/observable'
import { initConsoleObservable } from './consoleObservable'

// TODO cover other console APIs
describe('console error observable', () => {
  let consoleErrorStub: jasmine.Spy
  let consoleSubscription: Subscription
  let notifyError: jasmine.Spy

  beforeEach(() => {
    consoleErrorStub = spyOn(console, 'error')
    notifyError = jasmine.createSpy('notifyError')

    consoleSubscription = initConsoleObservable(['error']).subscribe(notifyError)
  })

  afterEach(() => {
    consoleSubscription.unsubscribe()
  })

  it('should keep original behavior', () => {
    console.error('foo', 'bar')

    expect(consoleErrorStub).toHaveBeenCalledWith('foo', 'bar')
  })

  it('should notify error', () => {
    console.error('foo', 'bar')

    expect(notifyError).toHaveBeenCalledWith({
      message: 'console error: foo bar',
      stack: undefined,
      handlingStack: jasmine.any(String),
      startClocks: jasmine.any(Object),
      status: 'error',
      source: 'console',
    })
  })

  it('should generate a handling stack', () => {
    function triggerError() {
      console.error('foo', 'bar')
    }
    triggerError()
    const consoleLog = notifyError.calls.mostRecent().args[0]
    expect(consoleLog.handlingStack).toMatch(/^Error:\s+at triggerError (.|\n)*$/)
  })

  it('should allow multiple callers', () => {
    const notifyOtherCaller = jasmine.createSpy('notifyOtherCaller')
    const otherConsoleSubscription = initConsoleObservable(['error']).subscribe(notifyOtherCaller)

    console.error('foo', 'bar')

    expect(notifyError).toHaveBeenCalledTimes(1)
    expect(notifyOtherCaller).toHaveBeenCalledTimes(1)

    otherConsoleSubscription.unsubscribe()
  })
})
