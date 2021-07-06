import { createTest, EventRegistry } from '../../lib/framework'
import { flushEvents } from '../../lib/helpers/sdk'

describe('API calls and events around init', () => {
  createTest('should be associated to corresponding views when views are automatically tracked')
    .withRum()
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

      expectToHaveErrors(
        events,
        { message: 'Provided "before manual view"', viewId: initialView.view.id },
        { message: 'Provided "after manual view"', viewId: manualView.view.id }
      )

      expectToHaveActions(
        events,
        { name: 'before manual view', viewId: initialView.view.id },
        { name: 'after manual view', viewId: manualView.view.id }
      )
    })

  createTest('should be associated to corresponding views when views are manually tracked')
    .withRum({ trackViewsManually: true })
    .withRumInit((configuration) => {
      window.DD_RUM!.addError('before init')
      window.DD_RUM!.addAction('before init')
      window.DD_RUM!.addTiming('before init')

      setTimeout(() => window.DD_RUM!.init(configuration), 10)

      setTimeout(() => {
        window.DD_RUM!.addError('before manual view')
        window.DD_RUM!.addAction('before manual view')
        window.DD_RUM!.addTiming('before manual view')
      }, 20)

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-return
      setTimeout(() => (window.DD_RUM as any).startView('manual view'), 30)

      setTimeout(() => {
        window.DD_RUM!.addError('after manual view')
        window.DD_RUM!.addAction('after manual view')
        window.DD_RUM!.addTiming('after manual view')
      }, 40)
    })
    .run(async ({ events }) => {
      await flushEvents()

      const initialView = events.rumViews[0]
      expect(initialView.view.name).toBe('manual view')
      expect(initialView.view.custom_timings).toEqual({
        before_init: jasmine.any(Number),
        before_manual_view: jasmine.any(Number),
        after_manual_view: jasmine.any(Number),
      })

      const documentEvent = events.rumResources.find((event) => event.resource.type === 'document')!
      expect(documentEvent.view.id).toBe(initialView.view.id)

      expectToHaveErrors(
        events,
        { message: 'Provided "before init"', viewId: initialView.view.id },
        { message: 'Provided "before manual view"', viewId: initialView.view.id },
        { message: 'Provided "after manual view"', viewId: initialView.view.id }
      )

      expectToHaveActions(
        events,
        { name: 'before init', viewId: initialView.view.id },
        { name: 'before manual view', viewId: initialView.view.id },
        { name: 'after manual view', viewId: initialView.view.id }
      )
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

  createTest('allows to replace non-view events context')
    .withRum({
      beforeSend(event) {
        event.context = { foo: 'bar' }
      },
    })
    .withRumInit((configuration) => {
      window.DD_RUM!.init(configuration)
      window.DD_RUM!.addRumGlobalContext('foo', 'baz')
      window.DD_RUM!.addRumGlobalContext('zig', 'zag')
    })
    .run(async ({ events }) => {
      await flushEvents()

      const initialView = events.rumViews[0]
      expect(initialView.context).toEqual({ foo: 'baz', zig: 'zag' })
      const initialDocument = events.rumResources[0]
      expect(initialDocument.context).toEqual({ foo: 'bar' })
    })
})

function expectToHaveErrors(events: EventRegistry, ...errors: Array<{ message: string; viewId: string }>) {
  expect(events.rumErrors.length).toBe(errors.length)
  for (let i = 0; i < errors.length; i++) {
    const registryError = events.rumErrors[i]
    const expectedError = errors[i]
    expect(registryError.error.message).toBe(expectedError.message)
    expect(registryError.view.id).toBe(expectedError.viewId)
  }
}

function expectToHaveActions(events: EventRegistry, ...actions: Array<{ name: string; viewId: string }>) {
  expect(events.rumActions.length).toBe(actions.length)
  for (let i = 0; i < actions.length; i++) {
    const registryAction = events.rumActions[i]
    const expectedAction = actions[i]
    expect(registryAction.action.target!.name).toBe(expectedAction.name)
    expect(registryAction.view.id).toBe(expectedAction.viewId)
  }
}
