import { test, expect } from '@playwright/test'
import { createTest } from '../lib/framework'

test.describe('user, account and global context', () => {
  createTest('should be included in all rum events')
    .withRum()
    .withRumInit((configuration) => {
      window.OO_RUM!.setUser({ id: '123', name: 'user' })
      window.OO_RUM!.setAccount({ id: '123', name: 'account' })
      window.OO_RUM!.setGlobalContext({ foo: 'bar' })

      window.OO_RUM!.init(configuration)
      window.OO_RUM!.addAction('foo')
      window.OO_RUM!.addDurationVital('foo', {
        startTime: Date.now(),
        duration: 100,
      })
    })
    .run(async ({ intakeRegistry, flushEvents }) => {
      await flushEvents()
      const events = intakeRegistry.rumEvents
      expect(events.length).toBeGreaterThan(0)

      events.forEach((event) => {
        expect(event.usr).toEqual({ id: '123', name: 'user', anonymous_id: expect.any(String) })
        expect(event.account).toEqual({ id: '123', name: 'account' })
        expect(event.context).toEqual({ foo: 'bar' })
      })
    })

  createTest('should be included in all logs')
    .withLogs()
    .withLogsInit((configuration) => {
      window.OO_LOGS!.setUser({ id: '123', name: 'user' })
      window.OO_LOGS!.setAccount({ id: '123', name: 'account' })
      window.OO_LOGS!.setGlobalContext({ foo: 'bar' })

      window.OO_LOGS!.init(configuration)
      window.OO_LOGS!.logger.log('hello')
      console.log('hello')
    })
    .run(async ({ intakeRegistry, flushEvents }) => {
      await flushEvents()
      const logs = intakeRegistry.logsEvents
      expect(logs.length).toBeGreaterThan(0)

      logs.forEach((event) => {
        expect(event.usr).toEqual({ id: '123', name: 'user', anonymous_id: expect.any(String) })
        expect(event.account).toEqual({ id: '123', name: 'account' })
        expect(event.foo).toEqual('bar')
      })
    })
})
