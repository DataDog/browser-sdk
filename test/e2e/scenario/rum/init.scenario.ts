/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import { createTest, bundleSetup } from '../../lib/framework'
import { asyncSetup } from '../../lib/framework/pageSetups'
import { flushEvents } from '../../lib/helpers/sdk'

describe('before init API calls', () => {
  createTest('should be associated to corresponding views')
    .withRum({ enableExperimentalFeatures: ['view-renaming'] })
    .withRumInit((options) => {
      ;(window.DD_RUM as any).addError('before manual view')
      ;(window.DD_RUM as any).addAction('before manual view')
      ;(window.DD_RUM as any).addTiming('before manual view')

      setTimeout(() => (window.DD_RUM as any).startView('manual view'), 10)

      setTimeout(() => {
        ;(window.DD_RUM as any).addError('after manual view')
        ;(window.DD_RUM as any).addAction('after manual view')
        ;(window.DD_RUM as any).addTiming('after manual view')
      }, 20)

      setTimeout(() => (window.DD_RUM as any).init(options), 30)
    })
    .withSetup(bundleSetup, 'bundle')
    .withSetup(asyncSetup, 'async')
    .run(async ({ events }) => {
      await flushEvents()

      const initialView = events.rumViews[0]
      expect(initialView.view.name).toBeUndefined()
      expect(initialView.view.custom_timings).toEqual({
        before_manual_view: jasmine.any(Number),
      })

      const manualView = events.rumViews[1]
      expect(manualView.view.name).toBe('manual view')
      expect(manualView.view.custom_timings).toEqual({
        after_manual_view: jasmine.any(Number),
      })

      const documentEvent = events.rumResources.find((event) => event.resource.type === 'document')!
      expect(documentEvent.view.id).toBe(initialView.view.id)

      const beforeManualViewError = events.rumErrors[0]
      expect(beforeManualViewError.error.message).toBe('Provided "before manual view"')
      expect(beforeManualViewError.view.id).toBe(initialView.view.id)

      const afterManualViewError = events.rumErrors[1]
      expect(afterManualViewError.error.message).toBe('Provided "after manual view"')
      expect(afterManualViewError.view.id).toBe(manualView.view.id)

      const beforeManualViewAction = events.rumActions[0]
      expect(beforeManualViewAction.action.target!.name).toBe('before manual view')
      expect(beforeManualViewAction.view.id).toBe(initialView.view.id)

      const afterManualViewAction = events.rumActions[1]
      expect(afterManualViewAction.action.target!.name).toBe('after manual view')
      expect(afterManualViewAction.view.id).toBe(manualView.view.id)
    })
})
