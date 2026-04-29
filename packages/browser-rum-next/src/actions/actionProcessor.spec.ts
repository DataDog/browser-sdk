import { Pipeline } from '@datadog/core-next'
import { startActionProcessor } from './actionProcessor'

async function tick() {
  return new Promise((r) => setTimeout(r, 0))
}

describe('startActionProcessor', () => {
  let pipeline: Pipeline<Record<string, unknown>>
  let actions: Record<string, unknown>[]

  beforeEach(() => {
    pipeline = new Pipeline<Record<string, unknown>>()
    actions = []
    pipeline.subscribe('observation:action', (e) => actions.push(e as Record<string, unknown>))
    startActionProcessor(pipeline)
    pipeline.seal()
  })

  describe('manual actions', () => {
    it('addAction publishes observation:action immediately', async () => {
      pipeline.publish('action:add_action', { name: 'checkout' })
      await tick()
      expect(actions.length).toBe(1)
      expect((actions[0].action as any).type).toBe('custom')
      expect((actions[0].action as any).target.name).toBe('checkout')
    })

    it('addAction with explicit type uses that type', async () => {
      pipeline.publish('action:add_action', { name: 'swipe-left', type: 'swipe' })
      await tick()
      expect(actions.length).toBe(1)
      expect((actions[0].action as any).type).toBe('swipe')
    })

    it('addAction includes view.in_foreground', async () => {
      pipeline.publish('action:add_action', { name: 'checkout' })
      await tick()
      expect(typeof (actions[0] as any).view.in_foreground).toBe('boolean')
    })

    it('addAction includes context when provided', async () => {
      pipeline.publish('action:add_action', { name: 'buy', context: { item: 'shoes' } })
      await tick()
      expect(actions.length).toBe(1)
      expect((actions[0] as any).context).toEqual({ item: 'shoes' })
    })

    it('addAction does not include context when not provided', async () => {
      pipeline.publish('action:add_action', { name: 'checkout' })
      await tick()
      expect((actions[0] as any).context).toBeUndefined()
    })

    it('addAction includes required action fields', async () => {
      pipeline.publish('action:add_action', { name: 'checkout' })
      await tick()
      const action = actions[0].action as any
      expect(action.id).toBeDefined()
      expect(action.type).toBe('custom')
      expect(action.target).toEqual({ name: 'checkout' })
      expect(action.error).toEqual({ count: 0 })
      expect(action.long_task).toEqual({ count: 0 })
      expect(action.resource).toEqual({ count: 0 })
    })

    it('startAction + stopAction publishes with duration', async () => {
      pipeline.publish('action:start_action', { name: 'upload' })
      pipeline.publish('action:stop_action', { name: 'upload' })
      await tick()
      expect(actions.length).toBe(1)
      const action = actions[0].action as any
      expect(action.type).toBe('custom')
      expect(action.target.name).toBe('upload')
      expect(action.loading_time).toBeDefined()
      expect(typeof action.loading_time).toBe('number')
    })

    it('stopAction without matching start is ignored', async () => {
      pipeline.publish('action:stop_action', { name: 'unknown' })
      await tick()
      expect(actions.length).toBe(0)
    })

    it('startAction + stopAction with actionKey uses the key', async () => {
      pipeline.publish('action:start_action', { name: 'upload', actionKey: 'upload-key' })
      pipeline.publish('action:stop_action', { name: 'upload', actionKey: 'upload-key' })
      await tick()
      expect(actions.length).toBe(1)
      expect((actions[0].action as any).target.name).toBe('upload-key')
    })

    it('stopAction includes context when provided', async () => {
      pipeline.publish('action:start_action', { name: 'upload' })
      pipeline.publish('action:stop_action', { name: 'upload', context: { fileSize: 1024 } })
      await tick()
      expect((actions[0] as any).context).toEqual({ fileSize: 1024 })
    })

    it('multiple addActions each publish independently', async () => {
      pipeline.publish('action:add_action', { name: 'first' })
      pipeline.publish('action:add_action', { name: 'second' })
      await tick()
      expect(actions.length).toBe(2)
      expect((actions[0].action as any).target.name).toBe('first')
      expect((actions[1].action as any).target.name).toBe('second')
    })
  })

  describe('click actions', () => {
    function makeClickEvent(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
      return {
        name: 'Click',
        nameSource: 'text_content',
        targetSelector: 'div.card',
        targetWidth: 200,
        targetHeight: 100,
        positionX: 100,
        positionY: 50,
        pointerUpDelay: 10,
        startTime: performance.now(),
        startDate: Date.now(),
        ...overrides,
      }
    }

    it('click with no activity produces dead click frustration', (done) => {
      jasmine.clock().install()

      pipeline.publish('action:click', makeClickEvent())

      // Advance past validation delay (100ms) → hadActivity: false
      jasmine.clock().tick(150)

      // Advance past click chain timeout (1000ms)
      jasmine.clock().tick(1100)

      setTimeout(() => {
        expect(actions.length).toBe(1)
        const action = actions[0].action as any
        expect(action.type).toBe('click')
        expect(action.frustration).toBeDefined()
        expect(action.frustration.type).toContain('dead_click')
        jasmine.clock().uninstall()
        done()
      }, 0)
      jasmine.clock().tick(1)
    })

    it('click with activity produces action without dead_click', (done) => {
      jasmine.clock().install()

      pipeline.publish('action:click', makeClickEvent({ name: 'Submit', targetSelector: 'button.submit' }))

      // Simulate network activity
      pipeline.publish('signal:network_request_start', { url: '/api', method: 'POST' })
      jasmine.clock().tick(50)
      pipeline.publish('resource:network_request', {
        url: '/api',
        method: 'POST',
        status: 200,
        isAborted: false,
        startTime: 0,
        startDate: 0,
        duration: 50,
      })

      // Wait for end delay (100ms) + chain timeout (1000ms)
      jasmine.clock().tick(1200)

      setTimeout(() => {
        expect(actions.length).toBe(1)
        const action = actions[0].action as any
        expect(action.type).toBe('click')
        expect(action.target.name).toBe('Submit')
        expect(action.loading_time).toBeDefined()
        // No dead_click since there was activity
        expect(action.frustration?.type).not.toContain('dead_click')
        jasmine.clock().uninstall()
        done()
      }, 0)
      jasmine.clock().tick(1)
    })

    it('click action includes required fields', (done) => {
      jasmine.clock().install()

      pipeline.publish('action:click', makeClickEvent())
      jasmine.clock().tick(150)
      jasmine.clock().tick(1100)

      setTimeout(() => {
        expect(actions.length).toBe(1)
        const obs = actions[0]
        expect(obs.type).toBe('action')
        expect(obs.date).toBeDefined()
        const action = obs.action as any
        expect(action.id).toBeDefined()
        expect(action.type).toBe('click')
        expect(action.target).toBeDefined()
        expect(action.error).toEqual({ count: 0 })
        expect(action.long_task).toEqual({ count: 0 })
        expect(action.resource).toEqual({ count: 0 })

        const dd = obs._dd as any
        expect(dd.action.target.selector).toBe('div.card')
        expect(dd.action.position).toEqual({ x: 100, y: 50 })
        jasmine.clock().uninstall()
        done()
      }, 0)
      jasmine.clock().tick(1)
    })

    it('three clicks on the same target produce rage_click', (done) => {
      jasmine.clock().install()

      const now = performance.now()
      // Publish 3 clicks in quick succession on the same target
      pipeline.publish('action:click', makeClickEvent({ startTime: now }))
      jasmine.clock().tick(50)
      pipeline.publish('action:click', makeClickEvent({ startTime: now + 50 }))
      jasmine.clock().tick(50)
      pipeline.publish('action:click', makeClickEvent({ startTime: now + 100 }))

      // Advance past validation + chain timeout
      jasmine.clock().tick(1300)

      setTimeout(() => {
        // Rage click: 3 clicks → collapsed to 1 action
        expect(actions.length).toBe(1)
        const action = actions[0].action as any
        expect(action.frustration).toBeDefined()
        expect(action.frustration.type).toContain('rage_click')
        jasmine.clock().uninstall()
        done()
      }, 0)
      jasmine.clock().tick(1)
    })

    it('addAction publishes custom action type', async () => {
      pipeline.publish('action:add_action', { name: 'test' })
      await tick()
      expect((actions[0].action as any).type).toBe('custom')
    })

    it('click action includes view.in_foreground', (done) => {
      jasmine.clock().install()

      pipeline.publish('action:click', {
        name: 'Click',
        nameSource: 'text_content',
        targetSelector: 'button',
        targetWidth: 100,
        targetHeight: 40,
        positionX: 50,
        positionY: 20,
        pointerUpDelay: 5,
        startTime: performance.now(),
        startDate: Date.now(),
      })

      jasmine.clock().tick(150)
      jasmine.clock().tick(1100)

      setTimeout(() => {
        expect(actions.length).toBe(1)
        expect(typeof (actions[0] as any).view.in_foreground).toBe('boolean')
        jasmine.clock().uninstall()
        done()
      }, 0)
      jasmine.clock().tick(1)
    })
  })
})
