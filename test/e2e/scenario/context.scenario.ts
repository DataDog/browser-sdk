import { test, expect } from '@playwright/test'
import { createTest } from '../lib/framework'

test.describe('user, account and global context', () => {
  createTest('should be included in all rum events')
    .withRum()
    .withRumInit((configuration) => {
      window.DD_RUM!.setUser({ id: '123', name: 'user' })
      window.DD_RUM!.setAccount({ id: '123', name: 'account' })
      window.DD_RUM!.setGlobalContext({ foo: 'bar' })

      window.DD_RUM!.init(configuration)
      window.DD_RUM!.addAction('foo')
      window.DD_RUM!.addDurationVital('foo', {
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
      window.DD_LOGS!.setUser({ id: '123', name: 'user' })
      window.DD_LOGS!.setAccount({ id: '123', name: 'account' })
      window.DD_LOGS!.setGlobalContext({ foo: 'bar' })

      window.DD_LOGS!.init(configuration)
      window.DD_LOGS!.logger.log('hello')
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
