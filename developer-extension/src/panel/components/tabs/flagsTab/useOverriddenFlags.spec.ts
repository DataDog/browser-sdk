import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { registerCleanupTask } from '../../../../../../packages/browser-core/test'
import type { FlagAuthState } from './useFlagAuth'
import { useOverriddenFlags, type OverriddenFlagsState } from './useOverriddenFlags'

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
    let latest: OverriddenFlagsState = { flags: [], missingKeys: new Set() }
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
    expect(get().flags.map((flag) => flag.key)).toEqual(jasmine.arrayWithExactContents(['flag-a', 'flag-b']))
    expect(get().missingKeys.size).toBe(0)
  })

  it('reports a key the catalog has no match for as missing', async () => {
    spyOn(globalThis, 'fetch').and.callFake((input: RequestInfo | URL) => {
      const key = new URL(input as string).searchParams.get('key')
      const data = key === 'gone' ? [] : [{ attributes: { key, name: `Name ${key}`, value_type: 'STRING' } }]
      return Promise.resolve(new Response(JSON.stringify({ data })))
    })

    const get = mountHook(['flag-a', 'gone'])
    await flush()

    expect(get().flags.map((flag) => flag.key)).toEqual(['flag-a'])
    expect(Array.from(get().missingKeys)).toEqual(['gone'])
  })

  it('does not fetch when there are no overridden keys', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch')
    const get = mountHook([])
    await flush()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(get().flags).toEqual([])
  })

  it('does not report a key as missing when its lookup failed', async () => {
    spyOn(globalThis, 'fetch').and.returnValue(
      Promise.resolve(new Response('nope', { status: 500, statusText: 'Server Error' }))
    )
    const get = mountHook(['flag-a'])
    await flush()
    expect(get().flags).toEqual([])
    expect(get().missingKeys.size).toBe(0)
  })
})
