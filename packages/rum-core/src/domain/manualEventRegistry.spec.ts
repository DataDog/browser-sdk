import type { Duration } from '@datadog/browser-core'
import { clocksNow } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { mockClock, registerCleanupTask } from '@datadog/browser-core/test'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { createManualEventLifecycle } from './manualEventRegistry'

describe('createManualEventLifecycle', () => {
  let lifeCycle: LifeCycle
  let clock: Clock

  beforeEach(() => {
    clock = mockClock()
    lifeCycle = new LifeCycle()
  })

  describe('add', () => {
    it('should store data by key', () => {
      const lifecycle = createManualEventLifecycle<{ value: string }>(lifeCycle)
      registerCleanupTask(lifecycle.stopAll)

      const startClocks = clocksNow()
      lifecycle.add('key1', startClocks, { value: 'data1' })

      const stopClocks = clocksNow()
      const removed = lifecycle.remove('key1', stopClocks, {})
      expect(removed).toEqual(jasmine.objectContaining({ value: 'data1' }))
    })

    it('should store multiple entries with different keys', () => {
      const lifecycle = createManualEventLifecycle<{ value: string }>(lifeCycle)
      registerCleanupTask(lifecycle.stopAll)

      const startClocks = clocksNow()
      lifecycle.add('key1', startClocks, { value: 'data1' })
      lifecycle.add('key2', startClocks, { value: 'data2' })

      const stopClocks = clocksNow()
      const removed1 = lifecycle.remove('key1', stopClocks, {})
      const removed2 = lifecycle.remove('key2', stopClocks, {})

      expect(removed1).toEqual(jasmine.objectContaining({ value: 'data1' }))
      expect(removed2).toEqual(jasmine.objectContaining({ value: 'data2' }))
    })

    it('should overwrite existing data when adding with same key', () => {
      const lifecycle = createManualEventLifecycle<{ value: string }>(lifeCycle)
      registerCleanupTask(lifecycle.stopAll)

      const startClocks = clocksNow()
      lifecycle.add('key1', startClocks, { value: 'original' })
      lifecycle.add('key1', startClocks, { value: 'updated' })

      const stopClocks = clocksNow()
      const removed = lifecycle.remove('key1', stopClocks, {})
      expect(removed).toEqual(jasmine.objectContaining({ value: 'updated' }))
    })

    it('should call onDiscard when overwriting existing data', () => {
      const onDiscard = jasmine.createSpy('onDiscard')
      const lifecycle = createManualEventLifecycle<{ value: string }>(lifeCycle, onDiscard)
      registerCleanupTask(lifecycle.stopAll)

      const startClocks = clocksNow()
      const originalData = { value: 'original' }
      lifecycle.add('key1', startClocks, originalData)
      lifecycle.add('key1', startClocks, { value: 'updated' })

      expect(onDiscard).toHaveBeenCalledTimes(1)
      expect(onDiscard).toHaveBeenCalledWith(originalData)
    })
  })

  describe('remove', () => {
    it('should remove and return data for existing key', () => {
      const lifecycle = createManualEventLifecycle<{ value: string }>(lifeCycle)
      registerCleanupTask(lifecycle.stopAll)

      const startClocks = clocksNow()
      lifecycle.add('key1', startClocks, { value: 'data1' })

      const stopClocks = clocksNow()
      const removed = lifecycle.remove('key1', stopClocks, {})
      expect(removed).toEqual(jasmine.objectContaining({ value: 'data1' }))

      const removedAgain = lifecycle.remove('key1', stopClocks, {})
      expect(removedAgain).toBeUndefined()
    })

    it('should return undefined for non-existent key', () => {
      const lifecycle = createManualEventLifecycle<{ value: string }>(lifeCycle)
      registerCleanupTask(lifecycle.stopAll)

      const stopClocks = clocksNow()
      const removed = lifecycle.remove('non-existent', stopClocks, {})

      expect(removed).toBeUndefined()
    })

    it('should not call onDiscard when removing', () => {
      const onDiscard = jasmine.createSpy('onDiscard')
      const lifecycle = createManualEventLifecycle<{ value: string }>(lifeCycle, onDiscard)
      registerCleanupTask(lifecycle.stopAll)

      const startClocks = clocksNow()
      lifecycle.add('key1', startClocks, { value: 'data1' })

      const stopClocks = clocksNow()
      lifecycle.remove('key1', stopClocks, {})

      expect(onDiscard).not.toHaveBeenCalled()
    })

    it('should compute duration between add and remove and include startClocks', () => {
      const lifecycle = createManualEventLifecycle<{ value: string }>(lifeCycle)
      registerCleanupTask(lifecycle.stopAll)

      const startClocks = clocksNow()
      lifecycle.add('key1', startClocks, { value: 'data1' })

      clock.tick(500)

      const stopClocks = clocksNow()
      const removed = lifecycle.remove('key1', stopClocks, {})

      expect(removed?.duration).toBe(500 as Duration)
      expect(removed?.startClocks).toBe(startClocks)
    })

    it('should combine start data with stop data', () => {
      const lifecycle = createManualEventLifecycle<{ value: string; extra?: string }>(lifeCycle)
      registerCleanupTask(lifecycle.stopAll)

      const startClocks = clocksNow()
      lifecycle.add('key1', startClocks, { value: 'data1' })

      const stopClocks = clocksNow()
      const removed = lifecycle.remove('key1', stopClocks, { extra: 'additional' })

      expect(removed).toEqual(
        jasmine.objectContaining({
          value: 'data1',
          extra: 'additional',
        })
      )
    })

    it('should override start data with stop data on conflict', () => {
      const lifecycle = createManualEventLifecycle<{ value: string }>(lifeCycle)
      registerCleanupTask(lifecycle.stopAll)

      const startClocks = clocksNow()
      lifecycle.add('key1', startClocks, { value: 'original' })

      const stopClocks = clocksNow()
      const removed = lifecycle.remove('key1', stopClocks, { value: 'overridden' })

      expect(removed?.value).toBe('overridden')
    })
  })

  describe('stop', () => {
    it('should clear all entries', () => {
      const lifecycle = createManualEventLifecycle<{ value: string }>(lifeCycle)
      registerCleanupTask(lifecycle.stopAll)

      const startClocks = clocksNow()
      lifecycle.add('key1', startClocks, { value: 'data1' })
      lifecycle.add('key2', startClocks, { value: 'data2' })
      lifecycle.stopAll()

      const stopClocks = clocksNow()
      expect(lifecycle.remove('key1', stopClocks, {})).toBeUndefined()
      expect(lifecycle.remove('key2', stopClocks, {})).toBeUndefined()
    })

    it('should call onDiscard for each entry', () => {
      const onDiscard = jasmine.createSpy('onDiscard')
      const lifecycle = createManualEventLifecycle<{ value: string }>(lifeCycle, onDiscard)
      registerCleanupTask(lifecycle.stopAll)

      const startClocks = clocksNow()
      const data1 = { value: 'data1' }
      const data2 = { value: 'data2' }
      lifecycle.add('key1', startClocks, data1)
      lifecycle.add('key2', startClocks, data2)
      lifecycle.stopAll()

      expect(onDiscard).toHaveBeenCalledTimes(2)
      expect(onDiscard).toHaveBeenCalledWith(data1)
      expect(onDiscard).toHaveBeenCalledWith(data2)
    })
  })

  describe('SESSION_RENEWED handling', () => {
    it('should clear all entries on session renewal and call onDiscard for each entry', () => {
      const onDiscard = jasmine.createSpy('onDiscard')
      const lifecycle = createManualEventLifecycle<{ value: string }>(lifeCycle, onDiscard)
      registerCleanupTask(lifecycle.stopAll)

      const startClocks = clocksNow()
      lifecycle.add('key1', startClocks, { value: 'data1' })
      lifecycle.add('key2', startClocks, { value: 'data2' })

      lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

      const stopClocks = clocksNow()
      expect(lifecycle.remove('key1', stopClocks, {})).toBeUndefined()
      expect(lifecycle.remove('key2', stopClocks, {})).toBeUndefined()
      expect(onDiscard).toHaveBeenCalledTimes(2)
      expect(onDiscard).toHaveBeenCalledWith({ value: 'data1' })
      expect(onDiscard).toHaveBeenCalledWith({ value: 'data2' })
    })

    it('should allow new entries after session renewal', () => {
      const lifecycle = createManualEventLifecycle<{ value: string }>(lifeCycle)
      registerCleanupTask(lifecycle.stopAll)

      const startClocks = clocksNow()
      lifecycle.add('key1', startClocks, { value: 'before-renewal' })
      lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

      const newStartClocks = clocksNow()
      lifecycle.add('key1', newStartClocks, { value: 'after-renewal' })

      const stopClocks = clocksNow()
      const removed = lifecycle.remove('key1', stopClocks, {})
      expect(removed).toEqual(jasmine.objectContaining({ value: 'after-renewal' }))
    })
  })
})
