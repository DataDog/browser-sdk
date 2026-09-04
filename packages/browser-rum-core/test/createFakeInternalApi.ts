/* eslint-disable @typescript-eslint/unbound-method */
import { Observable } from '@datadog/browser-core'
import type { RumInternalApi, ViewEventHandle } from '../src/domain/internalApi/rumInternalApi.types'

/**
 * A fake RUM internal API for plugin tests: `startEvent` records view names and returns spy
 * handles (so specs can assert view updates), `addEvent` is a plain spy.
 *
 * v2 (plan-v2.md): view handles only expose `current()` and `update()` — endings (supersede,
 * expiry) are owned by the real internal API, so there is nothing to fake for them.
 */
export function createFakeInternalApi(): {
  internalApi: RumInternalApi
  addEvent: jasmine.Spy
  viewNames: string[]
  viewHandles: Array<{ update: jasmine.Spy }>
} {
  const viewNames: string[] = []
  const viewHandles: Array<{ update: jasmine.Spy }> = []
  const internalApi = {
    startEvent: jasmine
      .createSpy('startEvent')
      .and.callFake((options: { type: string; view?: { name?: string } }, _baggage?: unknown) => {
        viewNames.push(options.view?.name ?? '')
        const handle: ViewEventHandle = {
          current: () => ({ complete: false, event: options, baggage: {} }) as never,
          update: jasmine.createSpy('update'),
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
