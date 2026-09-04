/* eslint-disable @typescript-eslint/unbound-method */
import { Observable } from '@datadog/browser-core'
import type { EventHandle, RumInternalApi } from '../src/domain/internalApi/rumInternalApi.types'

/**
 * A fake RUM internal API for plugin tests: `startEvent` records view names and returns spy
 * handles (so specs can assert view updates and stops), `addEvent` is a plain spy.
 *
 * v3 (plan-v3.md): view handles expose `current()` / `update()` / `stop()` / `cancel()` (one
 * handle family, consumer-owned stops), and open views are findable through `findEvents({ open:
 * true })` with their live handle — so `startViewSuperseding` (the consumer-side supersede
 * policy) works in specs.
 */
export function createFakeInternalApi(): {
  internalApi: RumInternalApi
  addEvent: jasmine.Spy
  viewNames: string[]
  viewHandles: Array<{ update: jasmine.Spy; stop: jasmine.Spy }>
} {
  const viewNames: string[] = []
  const viewHandles: Array<{ update: jasmine.Spy; stop: jasmine.Spy }> = []
  // The started views, as open history entries (completed by handle.stop(), so findEvents({
  // open: true }) only returns the open ones, like the real event history)
  const viewEntries: Array<{ complete: boolean; event: unknown; handle?: unknown }> = []

  const internalApi = {
    startEvent: jasmine
      .createSpy('startEvent')
      .and.callFake((options: { type: string; view?: { name?: string } }, _baggage?: unknown) => {
        if (options.type === 'view') {
          viewNames.push(options.view?.name ?? '')
          const entry: { complete: boolean; event: unknown; handle?: unknown } = {
            complete: false,
            event: options,
          }
          const updateSpy = jasmine.createSpy('update')
          const stopSpy = jasmine.createSpy('stop').and.callFake(() => {
            entry.complete = true
          })
          const handle: EventHandle<'view'> = {
            current: () => entry as never,
            update: updateSpy,
            cancel: jasmine.createSpy('cancel'),
            stop: stopSpy,
          }
          entry.handle = handle
          viewHandles.push({ update: updateSpy, stop: stopSpy })
          viewEntries.push(entry)
          return handle
        }
        return {
          current: () => ({ complete: false, event: options }) as never,
          update: jasmine.createSpy('update'),
          cancel: jasmine.createSpy('cancel'),
          stop: jasmine.createSpy('stop'),
        }
      }),
    addEvent: jasmine.createSpy('addEvent'),
    registerHook: () => ({ stop: () => undefined }),
    notifications: new Observable(),
    findEvents: jasmine
      .createSpy('findEvents')
      .and.callFake((query?: { open?: boolean }) =>
        query?.open ? viewEntries.filter((entry) => !entry.complete) : viewEntries
      ),
    findSession: () => undefined,
    stop: () => undefined,
  } as unknown as RumInternalApi
  return { internalApi, addEvent: internalApi.addEvent as jasmine.Spy, viewNames, viewHandles }
}
