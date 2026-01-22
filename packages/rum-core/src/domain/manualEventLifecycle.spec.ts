import { registerCleanupTask } from '@datadog/browser-core/test'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { createManualEventLifecycle } from './manualEventLifecycle'

describe('createManualEventLifecycle', () => {
  let lifeCycle: LifeCycle

  beforeEach(() => {
    lifeCycle = new LifeCycle()
  })

  describe('start', () => {
    it('should store data by key', () => {
      const lifecycle = createManualEventLifecycle<{ value: string }>(lifeCycle)
      registerCleanupTask(lifecycle.stopAll)

      lifecycle.start('key1', { value: 'data1' })

      expect(lifecycle.get('key1')).toEqual({ value: 'data1' })
    })

    it('should store multiple entries with different keys', () => {
      const lifecycle = createManualEventLifecycle<{ value: string }>(lifeCycle)
      registerCleanupTask(lifecycle.stopAll)

      lifecycle.start('key1', { value: 'data1' })
      lifecycle.start('key2', { value: 'data2' })

      expect(lifecycle.get('key1')).toEqual({ value: 'data1' })
      expect(lifecycle.get('key2')).toEqual({ value: 'data2' })
    })

    it('should overwrite existing data when starting with same key', () => {
      const lifecycle = createManualEventLifecycle<{ value: string }>(lifeCycle)
      registerCleanupTask(lifecycle.stopAll)

      lifecycle.start('key1', { value: 'original' })
      lifecycle.start('key1', { value: 'updated' })

      expect(lifecycle.get('key1')).toEqual({ value: 'updated' })
    })

    it('should call onDiscard when overwriting existing data', () => {
      const onDiscard = jasmine.createSpy('onDiscard')
      const lifecycle = createManualEventLifecycle<{ value: string }>(lifeCycle, onDiscard)
      registerCleanupTask(lifecycle.stopAll)

      const originalData = { value: 'original' }
      lifecycle.start('key1', originalData)
      lifecycle.start('key1', { value: 'updated' })

      expect(onDiscard).toHaveBeenCalledTimes(1)
      expect(onDiscard).toHaveBeenCalledWith(originalData)
    })
  })

  describe('get', () => {
    it('should return undefined for non-existent key', () => {
      const lifecycle = createManualEventLifecycle<{ value: string }>(lifeCycle)
      registerCleanupTask(lifecycle.stopAll)

      expect(lifecycle.get('non-existent')).toBeUndefined()
    })

    it('should return stored data for existing key', () => {
      const lifecycle = createManualEventLifecycle<{ value: string }>(lifeCycle)
      registerCleanupTask(lifecycle.stopAll)

      lifecycle.start('key1', { value: 'data1' })

      expect(lifecycle.get('key1')).toEqual({ value: 'data1' })
    })
  })

  describe('remove', () => {
    it('should remove and return data for existing key', () => {
      const lifecycle = createManualEventLifecycle<{ value: string }>(lifeCycle)
      registerCleanupTask(lifecycle.stopAll)

      lifecycle.start('key1', { value: 'data1' })
      const removed = lifecycle.remove('key1')

      expect(removed).toEqual({ value: 'data1' })
      expect(lifecycle.get('key1')).toBeUndefined()
    })

    it('should return undefined for non-existent key', () => {
      const lifecycle = createManualEventLifecycle<{ value: string }>(lifeCycle)
      registerCleanupTask(lifecycle.stopAll)

      const removed = lifecycle.remove('non-existent')

      expect(removed).toBeUndefined()
    })

    it('should not call onDiscard when removing', () => {
      const onDiscard = jasmine.createSpy('onDiscard')
      const lifecycle = createManualEventLifecycle<{ value: string }>(lifeCycle, onDiscard)
      registerCleanupTask(lifecycle.stopAll)

      lifecycle.start('key1', { value: 'data1' })
      lifecycle.remove('key1')

      expect(onDiscard).not.toHaveBeenCalled()
    })
  })

  describe('stopAll', () => {
    it('should clear all entries', () => {
      const lifecycle = createManualEventLifecycle<{ value: string }>(lifeCycle)
      registerCleanupTask(lifecycle.stopAll)

      lifecycle.start('key1', { value: 'data1' })
      lifecycle.start('key2', { value: 'data2' })
      lifecycle.stopAll()

      expect(lifecycle.get('key1')).toBeUndefined()
      expect(lifecycle.get('key2')).toBeUndefined()
    })

    it('should call onDiscard for each entry', () => {
      const onDiscard = jasmine.createSpy('onDiscard')
      const lifecycle = createManualEventLifecycle<{ value: string }>(lifeCycle, onDiscard)
      registerCleanupTask(lifecycle.stopAll)

      const data1 = { value: 'data1' }
      const data2 = { value: 'data2' }
      lifecycle.start('key1', data1)
      lifecycle.start('key2', data2)
      lifecycle.stopAll()

      expect(onDiscard).toHaveBeenCalledTimes(2)
      expect(onDiscard).toHaveBeenCalledWith(data1)
      expect(onDiscard).toHaveBeenCalledWith(data2)
    })
  })

  describe('SESSION_RENEWED handling', () => {
    it('should clear all entries on session renewal', () => {
      const lifecycle = createManualEventLifecycle<{ value: string }>(lifeCycle)
      registerCleanupTask(lifecycle.stopAll)

      lifecycle.start('key1', { value: 'data1' })
      lifecycle.start('key2', { value: 'data2' })

      lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

      expect(lifecycle.get('key1')).toBeUndefined()
      expect(lifecycle.get('key2')).toBeUndefined()
    })

    it('should call onDiscard for each entry on session renewal', () => {
      const onDiscard = jasmine.createSpy('onDiscard')
      const lifecycle = createManualEventLifecycle<{ value: string }>(lifeCycle, onDiscard)
      registerCleanupTask(lifecycle.stopAll)

      const data1 = { value: 'data1' }
      const data2 = { value: 'data2' }
      lifecycle.start('key1', data1)
      lifecycle.start('key2', data2)

      lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

      expect(onDiscard).toHaveBeenCalledTimes(2)
      expect(onDiscard).toHaveBeenCalledWith(data1)
      expect(onDiscard).toHaveBeenCalledWith(data2)
    })

    it('should allow new entries after session renewal', () => {
      const lifecycle = createManualEventLifecycle<{ value: string }>(lifeCycle)
      registerCleanupTask(lifecycle.stopAll)

      lifecycle.start('key1', { value: 'before-renewal' })
      lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
      lifecycle.start('key1', { value: 'after-renewal' })

      expect(lifecycle.get('key1')).toEqual({ value: 'after-renewal' })
    })
  })
})
