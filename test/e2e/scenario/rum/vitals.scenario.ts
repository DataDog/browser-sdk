import { createTest, flushEvents } from '../../lib/framework'

describe('vital collection', () => {
  createTest('send custom duration vital')
    .withRum({
      enableExperimentalFeatures: ['custom_vitals'],
    })
    .run(async ({ intakeRegistry }) => {
      await browser.executeAsync((done) => {
        // TODO remove cast and unsafe calls when removing the flag
        const global = window.DD_RUM! as any
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        const vital = global.startDurationVital('foo')
        setTimeout(() => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          global.stopDurationVital(vital)
          done()
        }, 5)
      })
      await flushEvents()

      expect(intakeRegistry.rumVitalEvents.length).toBe(1)
      expect(intakeRegistry.rumVitalEvents[0].vital.name).toEqual('foo')
      expect(intakeRegistry.rumVitalEvents[0].vital.duration).toEqual(jasmine.any(Number))
    })
})
