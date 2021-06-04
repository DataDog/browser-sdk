import { createTest } from '../../lib/framework'
import { flushEvents } from '../../lib/helpers/sdk'

describe('before init API calls', () => {
  createTest('should be associated to corresponding views')
    .withRum({ enableExperimentalFeatures: ['view-renaming'] })
    .withRumInit((configuration) => {
      window.DD_RUM!.addError('before manual view')
      window.DD_RUM!.addAction('before manual view')
      window.DD_RUM!.addTiming('before manual view')

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-return
      setTimeout(() => (window.DD_RUM as any).startView('manual view'), 10)

      setTimeout(() => {
        window.DD_RUM!.addError('after manual view')
        window.DD_RUM!.addAction('after manual view')
        window.DD_RUM!.addTiming('after manual view')
      }, 20)

      setTimeout(() => window.DD_RUM!.init(configuration), 30)
    })
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

describe('beforeSend', () => {
  createTest('allows to edit non-view events context')
    .withRum({
      beforeSend(event) {
        event.context!.foo = 'bar'
      },
    })
    .run(async ({ events }) => {
      await flushEvents()

      const initialView = events.rumViews[0]
      expect(initialView.context).toBeUndefined()
      const initialDocument = events.rumResources[0]
      expect(initialDocument.context).toEqual({ foo: 'bar' })
    })
})
