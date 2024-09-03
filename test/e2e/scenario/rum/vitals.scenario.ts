import { createTest, flushEvents } from '../../lib/framework'

describe('vital collection', () => {
  createTest('send custom duration vital')
    .withRum()
    .run(async ({ intakeRegistry }) => {
      await browser.executeAsync((done) => {
        const vital = window.DD_RUM!.startDurationVital('foo')
        setTimeout(() => {
          window.DD_RUM!.stopDurationVital(vital)
          done()
        }, 5)
      })
      await flushEvents()

      expect(intakeRegistry.rumVitalEvents.length).toBe(1)
      expect(intakeRegistry.rumVitalEvents[0].vital.name).toEqual('foo')
      expect(intakeRegistry.rumVitalEvents[0].vital.duration).toEqual(jasmine.any(Number))
    })
})
