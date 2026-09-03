/* eslint-disable @typescript-eslint/unbound-method */
import { Observable } from '@datadog/browser-core'
import type { RumInternalApi, ViewEventHandle } from '../src/domain/internalApi/rumInternalApi.types'

/**
 * A fake RUM internal API for plugin tests: `startEvent` records view names and returns spy
 * handles (so specs can assert the view lifecycle), `addEvent` is a plain spy.
 */
export function createFakeInternalApi(): {
  internalApi: RumInternalApi
  addEvent: jasmine.Spy
  viewNames: string[]
  viewHandles: Array<{ update: jasmine.Spy; stop: jasmine.Spy; cancel: jasmine.Spy }>
} {
  const viewNames: string[] = []
  const viewHandles: Array<{ update: jasmine.Spy; stop: jasmine.Spy; cancel: jasmine.Spy }> = []
  const internalApi = {
    startEvent: jasmine
      .createSpy('startEvent')
      .and.callFake((options: { type: string; view?: { name?: string } }, _baggage?: unknown) => {
        viewNames.push(options.view?.name ?? '')
        const handle: ViewEventHandle = {
          current: () => ({ complete: false, event: options, baggage: {} }) as never,
          cancel: jasmine.createSpy('cancel'),
          update: jasmine.createSpy('update'),
          stop: jasmine.createSpy('stop'),
        }
        viewHandles.push(handle as never)
        return handle
      }),
    addEvent: jasmine.createSpy('addEvent'),
    registerHook: () => ({ stop: () => undefined }),
    notifications: new Observable(),
    findEvents: () => [],
    findSession: () => undefined,
    stop: () => undefined,
  } as unknown as RumInternalApi
  return { internalApi, addEvent: internalApi.addEvent as jasmine.Spy, viewNames, viewHandles }
}
