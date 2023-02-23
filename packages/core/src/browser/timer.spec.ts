import { stubZoneJs } from '../../test/stubZoneJs'
import type { Clock } from '../../test/specHelper'
import { mockClock } from '../../test/specHelper'
import { noop } from '../tools/utils'
import { resetMonitor, startMonitorErrorCollection } from '../tools/monitor'
import { setTimeout, clearTimeout } from './timer'

describe('setTimeout', () => {
  let clock: Clock
  let zoneJsStub: ReturnType<typeof stubZoneJs>

  beforeEach(() => {
    clock = mockClock()
    zoneJsStub = stubZoneJs()
  })

  afterEach(() => {
    zoneJsStub.restore()
    clock.cleanup()
    resetMonitor()
  })

  it('executes the callback asynchronously', () => {
    const spy = jasmine.createSpy()
    setTimeout(spy)
    expect(spy).not.toHaveBeenCalled()
    clock.tick(0)
    expect(spy).toHaveBeenCalledOnceWith()
  })

  it('schedules an timeout task', () => {
    const spy = jasmine.createSpy()
    setTimeout(spy)
    expect(spy).not.toHaveBeenCalled()
    clock.tick(0)
    expect(spy).toHaveBeenCalledOnceWith()
  })

  it('does not use the Zone.js setTimeout function', () => {
    const zoneJsSetTimeoutSpy = jasmine.createSpy()
    zoneJsStub.replaceProperty(window, 'setTimeout', zoneJsSetTimeoutSpy)

    setTimeout(noop)
    clock.tick(0)

    expect(zoneJsSetTimeoutSpy).not.toHaveBeenCalled()
  })

  it('monitors the callback', () => {
    const onMonitorErrorCollectedSpy = jasmine.createSpy()
    startMonitorErrorCollection(onMonitorErrorCollectedSpy)

    setTimeout(() => {
      throw new Error('foo')
    })
    clock.tick(0)

    expect(onMonitorErrorCollectedSpy).toHaveBeenCalledOnceWith(new Error('foo'))
  })

  it('can be canceled by using `clearTimeout`', () => {
    const spy = jasmine.createSpy()
    const timeoutId = setTimeout(spy)
    clearTimeout(timeoutId)
    clock.tick(0)
    expect(spy).not.toHaveBeenCalled()
  })
})
