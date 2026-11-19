import { describe, expect, it } from 'vitest'
import { TIMEOUT_ERROR_MESSAGE } from '@datadog/browser-core'
import { createFakeAnalytics, pageViewedEvent } from '../../test/mockShopifyAnalytics'
import { waitForPageViewedEvent } from './shopifyAnalytics'

describe('waitForPageViewedEvent', () => {
  it('resolves with the page_viewed event once it is emitted', async () => {
    const { analytics, emit } = createFakeAnalytics()
    const event = pageViewedEvent('https://shop.example/checkout')

    const result = waitForPageViewedEvent(analytics)
    emit('page_viewed', event)

    await expect(result).resolves.toEqual(event)
  })

  it('rejects with a timeout error if no page_viewed event fires before the timeout', async () => {
    const { analytics } = createFakeAnalytics()

    await expect(waitForPageViewedEvent(analytics, { timeout: 0 })).rejects.toThrow(TIMEOUT_ERROR_MESSAGE)
  })

  it('resolves rather than timing out if the page_viewed event fires before the timeout elapses', async () => {
    const { analytics, emit } = createFakeAnalytics()
    const event = pageViewedEvent('https://shop.example/checkout')

    const result = waitForPageViewedEvent(analytics, { timeout: 1000 })
    emit('page_viewed', event)

    await expect(result).resolves.toEqual(event)
  })
})
