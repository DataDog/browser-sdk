import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { registerCleanupTask } from '../../../../../../packages/browser-core/test'
import type { CatalogFlag } from './flagsRequests'
import type { FlagAuthState } from './useFlagAuth'
import { useOverriddenFlags } from './useOverriddenFlags'

// useOverriddenFlags only reads isConnected + site off the auth object.
const AUTH = { isConnected: true, site: 'datad0g.com' } as FlagAuthState

describe('useOverriddenFlags', () => {
  beforeEach(() => {
    // A still-valid stored token so getValidAccessToken resolves without a refresh; fetch is stubbed
    // per test to stand in for the by-key catalog lookups.
    const previousChrome = (globalThis as any).chrome
    const store: Record<string, unknown> = {
      flagsOAuthTokens: { accessToken: 'tok', expiresAt: Date.now() + 10 * 60_000 },
    }
    ;(globalThis as any).chrome = {
      storage: { session: { get: (key: string) => Promise.resolve({ [key]: store[key] }) } },
    }
    registerCleanupTask(() => {
      ;(globalThis as any).chrome = previousChrome
    })
  })

  // Mounts the hook in a throwaway component and exposes its latest return value.
  function mountHook(keys: string[]) {
    const container = document.createElement('div')
    const root = createRoot(container)
    let latest: CatalogFlag[] = []
    function Probe() {
      latest = useOverriddenFlags(AUTH, keys)
      return null
    }
    act(() => root.render(React.createElement(Probe)))
    registerCleanupTask(() => act(() => root.unmount()))
    return () => latest
  }

  // Let the effect's getValidAccessToken -> fetchFlagsByKeys -> setState chain settle and re-render.
  async function flush() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  it('fetches each overridden key by exact key and returns the resolved flags', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').and.callFake((input: RequestInfo | URL) => {
      const key = new URL(input as string).searchParams.get('key')
      return Promise.resolve(
        new Response(JSON.stringify({ data: [{ attributes: { key, name: `Name ${key}`, value_type: 'STRING' } }] }))
      )
    })

    const get = mountHook(['flag-a', 'flag-b'])
    await flush()

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(get().map((flag) => flag.key)).toEqual(jasmine.arrayWithExactContents(['flag-a', 'flag-b']))
  })

  it('does not fetch when there are no overridden keys', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch')
    const get = mountHook([])
    await flush()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(get()).toEqual([])
  })

  it('returns no flags when a key lookup fails (non-blocking)', async () => {
    // The failure is expected here; the hook logs it via console.error — swallow it so the CI
    // unexpected-error-log reporter doesn't flag the intentional log.
    spyOn(console, 'error')
    spyOn(globalThis, 'fetch').and.returnValue(
      Promise.resolve(new Response('nope', { status: 500, statusText: 'Server Error' }))
    )
    const get = mountHook(['flag-a'])
    await flush()
    expect(get()).toEqual([])
  })
})
