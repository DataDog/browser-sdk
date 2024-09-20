import type { IntakeRegistry } from '../../lib/framework'
import { flushEvents, createTest } from '../../lib/framework'
import { withBrowserLogs } from '../../lib/helpers/browser'

describe('API calls and events around init', () => {
  createTest('should display a console log when calling init without configuration')
    .withRum()
    .withRumInit(() => {
      ;(window.DD_RUM! as unknown as { init(): void }).init()
    })
    .run(async () => {
      await withBrowserLogs((logs) => {
        expect(logs.length).toBe(1)
        expect(logs[0].message).toEqual(jasmine.stringContaining('Datadog Browser SDK'))
        expect(logs[0].message).toEqual(jasmine.stringContaining('Missing configuration'))
      })
    })

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
    .run(async ({ intakeRegistry }) => {
      await flushEvents()

      const initialView = intakeRegistry.rumViewEvents[0]
      expect(initialView.view.name).toBeUndefined()
      expect(initialView.view.custom_timings).toEqual({
        before_manual_view: jasmine.any(Number),
      })

      const manualView = intakeRegistry.rumViewEvents[1]
      expect(manualView.view.name).toBe('manual view')
      expect(manualView.view.custom_timings).toEqual({
        after_manual_view: jasmine.any(Number),
      })

      const documentEvent = intakeRegistry.rumResourceEvents.find((event) => event.resource.type === 'document')!
      expect(documentEvent.view.id).toBe(initialView.view.id)

      expectToHaveErrors(
        intakeRegistry,
        { message: 'Provided "before manual view"', viewId: initialView.view.id },
        { message: 'Provided "after manual view"', viewId: manualView.view.id }
      )

      expectToHaveActions(
        intakeRegistry,
        { name: 'before manual view', viewId: initialView.view.id },
        { name: 'after manual view', viewId: manualView.view.id }
      )
    })

  createTest('should be associated to corresponding views when views are manually tracked')
    .withRum({ trackViewsManually: true, enableExperimentalFeatures: ['update_view_name'] })
    .withRumSlim()
    .withRumInit((configuration) => {
      window.DD_RUM!.addError('before init')
      window.DD_RUM!.addAction('before init')
      window.DD_RUM!.addTiming('before init')
      // global.updateViewName('before init') TODO uncomment when the api is not behind a ff anymore

      setTimeout(() => window.DD_RUM!.init(configuration), 10)
      setTimeout(() => {
        window.DD_RUM!.addError('before manual view')
        window.DD_RUM!.addAction('before manual view')
        window.DD_RUM!.addTiming('before manual view')
        // global.updateViewName('before manual view') TODO uncomment when the api is not behind a ff anymore
      }, 20)

      setTimeout(() => window.DD_RUM!.startView('manual view'), 30)

      setTimeout(() => {
        window.DD_RUM!.addError('after manual view')
        window.DD_RUM!.addAction('after manual view')
        window.DD_RUM!.addTiming('after manual view')
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        ;(window.DD_RUM as any).updateViewName('after manual view')
      }, 40)
    })
    .run(async ({ intakeRegistry }) => {
      await flushEvents()

      const initialView = intakeRegistry.rumViewEvents[0]
      expect(initialView.view.name).toBe('after manual view')
      expect(initialView.view.custom_timings).toEqual({
        before_init: jasmine.any(Number),
        before_manual_view: jasmine.any(Number),
        after_manual_view: jasmine.any(Number),
      })

      const documentEvent = intakeRegistry.rumResourceEvents.find((event) => event.resource.type === 'document')!
      expect(documentEvent.view.id).toBe(initialView.view.id)

      expectToHaveErrors(
        intakeRegistry,
        { message: 'Provided "before init"', viewId: initialView.view.id },
        { message: 'Provided "before manual view"', viewId: initialView.view.id },
        { message: 'Provided "after manual view"', viewId: initialView.view.id }
      )

      expectToHaveActions(
        intakeRegistry,
        { name: 'before init', viewId: initialView.view.id },
        { name: 'before manual view', viewId: initialView.view.id },
        { name: 'after manual view', viewId: initialView.view.id, viewName: 'after manual view' }
      )
    })

  createTest('should be able to set view context')
    .withRum({ enableExperimentalFeatures: ['view_specific_context'] })
    .withRumSlim()
    .withRumInit((configuration) => {
      window.DD_RUM!.init(configuration)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      ;(window.DD_RUM as any).setViewContext({ foo: 'bar' })
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      ;(window.DD_RUM as any).setViewContextProperty('bar', 'foo')
    })
    .run(async ({ intakeRegistry }) => {
      await flushEvents()

      const initialView = intakeRegistry.rumViewEvents[0]
      expect(initialView.context).toEqual(jasmine.objectContaining({ foo: 'bar', bar: 'foo' }))
    })
})

describe('beforeSend', () => {
  createTest('allows to edit events context with feature flag')
    .withRum({
      enableExperimentalFeatures: ['view_specific_context'],
      beforeSend: (event: any) => {
        event.context!.foo = 'bar'
        return true
      },
    })
    .withRumSlim()
    .run(async ({ intakeRegistry }) => {
      await flushEvents()

      const initialView = intakeRegistry.rumViewEvents[0]
      expect(initialView.context).toEqual(jasmine.objectContaining({ foo: 'bar' }))
      const initialDocument = intakeRegistry.rumResourceEvents[0]
      expect(initialDocument.context).toEqual(jasmine.objectContaining({ foo: 'bar' }))
    })

  createTest('allows to replace events context')
    .withRum({
      enableExperimentalFeatures: ['view_specific_context'],
      beforeSend: (event) => {
        event.context = { foo: 'bar' }
        return true
      },
    })
    .withRumSlim()
    .withRumInit((configuration) => {
      window.DD_RUM!.init(configuration)
      window.DD_RUM!.setGlobalContextProperty('foo', 'baz')
      window.DD_RUM!.setGlobalContextProperty('zig', 'zag')
    })
    .run(async ({ intakeRegistry }) => {
      await flushEvents()

      const initialView = intakeRegistry.rumViewEvents[0]
      expect(initialView.context).toEqual(jasmine.objectContaining({ foo: 'bar' }))
      const initialDocument = intakeRegistry.rumResourceEvents[0]
      expect(initialDocument.context).toEqual(jasmine.objectContaining({ foo: 'bar' }))
    })
})

function expectToHaveErrors(events: IntakeRegistry, ...errors: Array<{ message: string; viewId: string }>) {
  expect(events.rumErrorEvents.length).toBe(errors.length)
  for (let i = 0; i < errors.length; i++) {
    const registryError = events.rumErrorEvents[i]
    const expectedError = errors[i]
    expect(registryError.error.message).toBe(expectedError.message)
    expect(registryError.view.id).toBe(expectedError.viewId)
  }
}

function expectToHaveActions(
  events: IntakeRegistry,
  ...actions: Array<{ name: string; viewId: string; viewName?: string }>
) {
  expect(events.rumActionEvents.length).toBe(actions.length)
  for (let i = 0; i < actions.length; i++) {
    const registryAction = events.rumActionEvents[i]
    const expectedAction = actions[i]
    expect(registryAction.action.target!.name).toBe(expectedAction.name)
    expect(registryAction.view.id).toBe(expectedAction.viewId)
    if (i === 0 && expectedAction.viewName) {
      expect(registryAction.view.name).toBe(expectedAction.viewName)
    }
  }
}
