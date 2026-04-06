import { createRateLimiter } from './rateLimiter'

describe('createRateLimiter', () => {
  it('allows events under the limit', () => {
    const rateLimiter = createRateLimiter()
    for (let i = 0; i < 200; i++) {
      expect(rateLimiter.isLimitReached('error')).toBe(false)
    }
  })

  it('blocks events over the limit', () => {
    const rateLimiter = createRateLimiter()
    for (let i = 0; i < 200; i++) {
      rateLimiter.isLimitReached('error')
    }
    expect(rateLimiter.isLimitReached('error')).toBe(true)
  })

  it('tracks different statuses independently', () => {
    const rateLimiter = createRateLimiter()
    for (let i = 0; i < 200; i++) {
      rateLimiter.isLimitReached('error')
    }
    expect(rateLimiter.isLimitReached('error')).toBe(true)
    expect(rateLimiter.isLimitReached('warn')).toBe(false)
  })

  describe('time window reset', () => {
    beforeEach(() => {
      jasmine.clock().install()
      jasmine.clock().mockDate()
    })

    afterEach(() => {
      jasmine.clock().uninstall()
    })

    it('resets the limit after the time window', () => {
      const rateLimiter = createRateLimiter()
      for (let i = 0; i < 200; i++) {
        rateLimiter.isLimitReached('error')
      }
      expect(rateLimiter.isLimitReached('error')).toBe(true)

      jasmine.clock().tick(60001)

      expect(rateLimiter.isLimitReached('error')).toBe(false)
    })
  })

  it('respects a custom limit', () => {
    const rateLimiter = createRateLimiter(5)
    for (let i = 0; i < 5; i++) {
      expect(rateLimiter.isLimitReached('error')).toBe(false)
    }
    expect(rateLimiter.isLimitReached('error')).toBe(true)
  })
})
