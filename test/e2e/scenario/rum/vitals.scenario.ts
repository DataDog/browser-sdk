import { createTest, flushEvents } from '../../lib/framework'

describe('vital collection', () => {
  createTest('send custom duration vital')
    .withRum()
    .run(async ({ intakeRegistry }) => {
      await browser.executeAsync((done) => {
        window.DD_RUM!.startDurationVital('foo')
        setTimeout(() => {
          window.DD_RUM!.stopDurationVital('foo')
          done()
        }, 5)
      })
      await flushEvents()

      expect(intakeRegistry.rumVitalEvents.length).toBe(1)
      expect(intakeRegistry.rumVitalEvents[0].vital.name).toEqual('foo')
      expect(intakeRegistry.rumVitalEvents[0].vital.custom).toEqual({ foo: jasmine.any(Number) })
    })
})
