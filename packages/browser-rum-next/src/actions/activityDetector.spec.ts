import { Pipeline } from '@datadog/core-next'
import { createActivityDetector, VALIDATION_DELAY, END_DELAY, MAX_DURATION } from './activityDetector'
import type { ActivityResult } from './activityDetector'

describe('createActivityDetector', () => {
  let pipeline: Pipeline<Record<string, unknown>>

  beforeEach(() => {
    jasmine.clock().install()
    pipeline = new Pipeline<Record<string, unknown>>()
    pipeline.seal()
  })

  afterEach(() => {
    jasmine.clock().uninstall()
  })

  it('reports hadActivity: false when no activity within validation delay', () => {
    let result: ActivityResult | undefined
    const detector = createActivityDetector(pipeline)
    detector.onComplete((r) => {
      result = r
    })

    jasmine.clock().tick(VALIDATION_DELAY)

    expect(result).toEqual({ hadActivity: false })
  })

  it('reports hadActivity: true when DOM mutation occurs', () => {
    let result: ActivityResult | undefined
    const detector = createActivityDetector(pipeline)
    detector.onComplete((r) => {
      result = r
    })

    pipeline.publish('resource:dom_mutation', {})

    jasmine.clock().tick(END_DELAY)

    expect(result).toBeDefined()
    expect(result!.hadActivity).toBe(true)
    expect(result!.endTime).toBeDefined()
  })

  it('reports hadActivity: true when network request occurs', () => {
    let result: ActivityResult | undefined
    const detector = createActivityDetector(pipeline)
    detector.onComplete((r) => {
      result = r
    })

    pipeline.publish('signal:network_request_start', {})
    pipeline.publish('resource:network_request', {})

    jasmine.clock().tick(END_DELAY)

    expect(result).toBeDefined()
    expect(result!.hadActivity).toBe(true)
  })

  it('waits for pending requests to complete before reporting', () => {
    let result: ActivityResult | undefined
    const detector = createActivityDetector(pipeline)
    detector.onComplete((r) => {
      result = r
    })

    pipeline.publish('signal:network_request_start', {})

    // Advance past end delay — should not complete because request is still pending
    jasmine.clock().tick(END_DELAY + 50)
    expect(result).toBeUndefined()

    // Complete the request
    pipeline.publish('resource:network_request', {})
    jasmine.clock().tick(END_DELAY)

    expect(result).toBeDefined()
    expect(result!.hadActivity).toBe(true)
  })

  it('forces completion after max duration', () => {
    let result: ActivityResult | undefined
    const detector = createActivityDetector(pipeline)
    detector.onComplete((r) => {
      result = r
    })

    // Start a request that never completes
    pipeline.publish('signal:network_request_start', {})

    jasmine.clock().tick(MAX_DURATION)

    expect(result).toBeDefined()
    expect(result!.hadActivity).toBe(true)
  })

  it('stop() cancels all timers and callback is never fired', () => {
    let result: ActivityResult | undefined
    const detector = createActivityDetector(pipeline)
    detector.onComplete((r) => {
      result = r
    })

    detector.stop()

    jasmine.clock().tick(MAX_DURATION)

    expect(result).toBeUndefined()
  })

  it('detects activity from performance resource entries', () => {
    let result: ActivityResult | undefined
    const detector = createActivityDetector(pipeline)
    detector.onComplete((r) => {
      result = r
    })

    pipeline.publish('resource:performance_entry', {})

    jasmine.clock().tick(END_DELAY)

    expect(result).toBeDefined()
    expect(result!.hadActivity).toBe(true)
    expect(result!.endTime).toBeDefined()
  })

  it('stop() unsubscribes from pipeline events', () => {
    let result: ActivityResult | undefined
    const detector = createActivityDetector(pipeline)
    detector.onComplete((r) => {
      result = r
    })

    detector.stop()

    // Even publishing events should not trigger anything
    pipeline.publish('resource:dom_mutation', {})
    jasmine.clock().tick(END_DELAY)

    expect(result).toBeUndefined()
  })
})
