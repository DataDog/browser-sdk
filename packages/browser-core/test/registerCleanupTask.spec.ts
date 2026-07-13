import { afterAll, describe, expect, it } from 'vitest'
import { registerCleanupTask } from './registerCleanupTask'

describe('registerCleanupTask', () => {
  describe('when the current test is dynamically skipped', () => {
    let cleanupCompleted = false

    afterAll(() => {
      expect(cleanupCompleted).toBe(true)
    })

    it('runs and awaits its cleanup tasks', (ctx) => {
      registerCleanupTask(async () => {
        await Promise.resolve()
        cleanupCompleted = true
      })

      ctx.skip(true, 'exercise dynamic skip cleanup')
    })
  })
})
