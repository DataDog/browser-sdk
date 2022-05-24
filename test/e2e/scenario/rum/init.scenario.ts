import type { EventRegistry } from '../../lib/framework'
import { flushEvents, createTest } from '../../lib/framework'

describe('API calls and events around init', () => {
  createTest('should be associated to corresponding views when views are automatically tracked')
    .withRum()
    .withRumSlim()
    .withRumInit((configuration) => {
      window.DD_RUM!.addError('before manual view')
      window.DD_RUM!.addAction('before manual view')
      window.DD_RUM!.addTiming('before manual view')

      setTimeout(() => window.DD_RUM!.startView('manual view'), 10)

      setTimeout(() => {
        window.DD_RUM!.addError('after manual view')
        window.DD_RUM!.addAction('after manual view')
        window.DD_RUM!.addTiming('after manual view')
      }, 20)

      setTimeout(() => window.DD_RUM!.init(configuration), 30)
    })
    .run(async ({ serverEvents }) => {
      await flushEvents()

      const initialView = serverEvents.rumViews[0]
      expect(initialView.view.name).toBeUndefined()
      expect(initialView.view.custom_timings).toEqual({
        before_manual_view: jasmine.any(Number),
      })

      const manualView = serverEvents.rumViews[1]
      expect(manualView.view.name).toBe('manual view')
      expect(manualView.view.custom_timings).toEqual({
        after_manual_view: jasmine.any(Number),
      })

      const documentEvent = serverEvents.rumResources.find((event) => event.resource.type === 'document')!
      expect(documentEvent.view.id).toBe(initialView.view.id)

      expectToHaveErrors(
        serverEvents,
        { message: 'Provided "before manual view"', viewId: initialView.view.id },
        { message: 'Provided "after manual view"', viewId: manualView.view.id }
      )

      expectToHaveActions(
        serverEvents,
        { name: 'before manual view', viewId: initialView.view.id },
        { name: 'after manual view', viewId: manualView.view.id }
      )
    })

  createTest('should be associated to corresponding views when views are manually tracked')
    .withRum({ trackViewsManually: true })
    .withRumSlim()
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

      setTimeout(() => window.DD_RUM!.startView('manual view'), 30)

      setTimeout(() => {
        window.DD_RUM!.addError('after manual view')
        window.DD_RUM!.addAction('after manual view')
        window.DD_RUM!.addTiming('after manual view')
      }, 40)
    })
    .run(async ({ serverEvents }) => {
      await flushEvents()

      const initialView = serverEvents.rumViews[0]
      expect(initialView.view.name).toBe('manual view')
      expect(initialView.view.custom_timings).toEqual({
        before_init: jasmine.any(Number),
        before_manual_view: jasmine.any(Number),
        after_manual_view: jasmine.any(Number),
      })

      const documentEvent = serverEvents.rumResources.find((event) => event.resource.type === 'document')!
      expect(documentEvent.view.id).toBe(initialView.view.id)

      expectToHaveErrors(
        serverEvents,
        { message: 'Provided "before init"', viewId: initialView.view.id },
        { message: 'Provided "before manual view"', viewId: initialView.view.id },
        { message: 'Provided "after manual view"', viewId: initialView.view.id }
      )

      expectToHaveActions(
        serverEvents,
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
    .withRumSlim()
    .run(async ({ serverEvents }) => {
      await flushEvents()

      const initialView = serverEvents.rumViews[0]
      expect(initialView.context).toBeUndefined()
      const initialDocument = serverEvents.rumResources[0]
      expect(initialDocument.context).toEqual({ foo: 'bar' })
    })

  createTest('allows to replace non-view events context')
    .withRum({
      beforeSend(event) {
        event.context = { foo: 'bar' }
      },
    })
    .withRumSlim()
    .withRumInit((configuration) => {
      window.DD_RUM!.init(configuration)
      window.DD_RUM!.addRumGlobalContext('foo', 'baz')
      window.DD_RUM!.addRumGlobalContext('zig', 'zag')
    })
    .run(async ({ serverEvents }) => {
      await flushEvents()

      const initialView = serverEvents.rumViews[0]
      expect(initialView.context).toEqual({ foo: 'baz', zig: 'zag' })
      const initialDocument = serverEvents.rumResources[0]
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
