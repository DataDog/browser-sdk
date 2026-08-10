import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { registerCleanupTask } from '../../../../../../packages/browser-core/test'
import { useInspectedPageOverrides } from './useInspectedPageOverrides'

type EvalImpl = (code: string, callback: (result: unknown, exceptionInfo?: unknown) => void) => void

// Mounts the hook with a stubbed inspected window + webNavigation, exposing the hook's latest return
// value and (when `captureNav`) a way to fire the captured top-frame navigation events. `eval` lets a
// test drive the inspected-window read however it needs — a fixed result, a time-varying marker, or a
// failure. Navigation listeners are captured only when a test needs to fire them (`captureNav`),
// otherwise they're inert stubs.
function mountHook({ eval: evalImpl, captureNav = false }: { eval: EvalImpl; captureNav?: boolean }) {
  const listeners: Record<string, Array<(details: { tabId: number; frameId: number }) => void>> = {}
  const event = (name: string) =>
    captureNav
      ? {
          addListener: (cb: (details: { tabId: number; frameId: number }) => void) => (listeners[name] ??= []).push(cb),
          removeListener: () => undefined,
        }
      : { addListener: () => undefined, removeListener: () => undefined }
  const previousChrome = (globalThis as any).chrome
  ;(globalThis as any).chrome = {
    devtools: { inspectedWindow: { tabId: 1, eval: evalImpl, reload: () => undefined } },
    webNavigation: {
      onBeforeNavigate: event('before'),
      onCompleted: event('completed'),
      onErrorOccurred: event('error'),
    },
  }

  const container = document.createElement('div')
  const root = createRoot(container)
  let latest: ReturnType<typeof useInspectedPageOverrides>
  function Probe() {
    latest = useInspectedPageOverrides()
    return null
  }
  act(() => root.render(React.createElement(Probe)))
  registerCleanupTask(() => {
    act(() => root.unmount())
    ;(globalThis as any).chrome = previousChrome
  })

  return {
    get: () => latest,
    fireNav: (name: string, details: { tabId: number; frameId: number } = { tabId: 1, frameId: 0 }) =>
      act(() => (listeners[name] ?? []).forEach((cb) => cb(details))),
  }
}

describe('useInspectedPageOverrides lifecycle', () => {
  // Adapter for the fixed-result reads these lifecycle tests use; nav events are captured so the tests
  // can fire them.
  const mountWithResult = (result: { overrides: unknown; devtoolsEnabled: boolean }) =>
    mountHook({ eval: (_code, callback) => callback(result), captureNav: true })

  // Let the settle's readFlagState -> setState microtasks flush and re-render.
  async function flush() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  it('starts loading, then becomes ready with the page overrides + marker', async () => {
    const hook = mountWithResult({ overrides: { 'flag-a': { type: 'BOOLEAN', value: true } }, devtoolsEnabled: true })
    expect(hook.get().status).toBe('loading')

    await flush()
    expect(hook.get().status).toBe('ready')
    expect(hook.get().devtoolsEnabled).toBe(true)
    expect(hook.get().overrides).toEqual({ 'flag-a': { type: 'BOOLEAN', value: true } })
  })

  it('returns to loading on a top-frame navigation and blocks writes', async () => {
    const hook = mountWithResult({ overrides: {}, devtoolsEnabled: true })
    await flush()
    expect(hook.get().status).toBe('ready')

    hook.fireNav('before')
    expect(hook.get().status).toBe('loading')
    await expectAsync(hook.get().setOverride('f', { type: 'BOOLEAN', value: true })).toBeRejectedWithError(
      /still loading/
    )
  })

  it('re-reads and returns to ready once the navigation completes', async () => {
    const hook = mountWithResult({ overrides: {}, devtoolsEnabled: true })
    await flush()
    hook.fireNav('before')
    expect(hook.get().status).toBe('loading')

    hook.fireNav('completed')
    await flush()
    expect(hook.get().status).toBe('ready')
    expect(hook.get().devtoolsEnabled).toBe(true)
  })

  it('ignores navigations in subframes', async () => {
    const hook = mountWithResult({ overrides: {}, devtoolsEnabled: true })
    await flush()
    hook.fireNav('before', { tabId: 1, frameId: 1 })
    expect(hook.get().status).toBe('ready')
  })
})

describe('useInspectedPageOverrides settle window', () => {
  beforeEach(() => {
    jasmine.clock().install()
    registerCleanupTask(() => jasmine.clock().uninstall())
  })

  // Flush the read chain (readFlagState → settle callback → setState).
  async function flushReads() {
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  // Fire the next settle tick's scheduled setTimeout, then flush its read.
  async function advanceTick() {
    act(() => jasmine.clock().tick(250))
    await flushReads()
  }

  it('keeps status out of ready (warning hidden) until the marker appears, then goes ready — no flash', async () => {
    let devtoolsEnabled = false
    const { get } = mountHook({ eval: (_code, callback) => callback({ overrides: {}, devtoolsEnabled }) })

    await flushReads()
    expect(get().status).toBe('loading')
    await advanceTick()
    expect(get().status).toBe('loading') // marker still absent — the "not detected" warning never shows

    devtoolsEnabled = true
    await advanceTick()
    expect(get().status).toBe('ready')
    expect(get().devtoolsEnabled).toBe(true)
  })

  it('declares the wrapper absent (ready, devtoolsEnabled=false) after the settle window elapses', async () => {
    const { get } = mountHook({ eval: (_code, callback) => callback({ overrides: {}, devtoolsEnabled: false }) })

    await flushReads()
    // Advance past the window (SETTLE_TIMEOUT_MS / SETTLE_INTERVAL_MS = 10 ticks).
    for (let i = 0; i < 12; i++) {
      await advanceTick()
    }
    expect(get().status).toBe('ready')
    expect(get().devtoolsEnabled).toBe(false)
  })

  it('ends in error when reads keep failing through the settle window', async () => {
    // readFlagState logs the eval failure via console.error — suppress so the CI reporter is happy.
    spyOn(console, 'error')
    const { get } = mountHook({
      eval: (_code, callback) => callback(undefined, { isError: true, code: 'E', description: 'busy' }),
    })

    await flushReads()
    for (let i = 0; i < 12; i++) {
      await advanceTick()
    }
    expect(get().status).toBe('error')
    expect(get().error).toBeTruthy()
  })

  it('keeps the last good state (not error) when only the final read fails', async () => {
    spyOn(console, 'error')
    let fail = false
    const { get } = mountHook({
      eval: (_code, callback) =>
        fail
          ? callback(undefined, { isError: true, code: 'E', description: 'busy' })
          : callback({ overrides: { 'flag-a': { type: 'BOOLEAN', value: true } }, devtoolsEnabled: false }),
    })

    // A good read populates overrides…
    await flushReads()
    await advanceTick()
    expect(get().overrides).toEqual({ 'flag-a': { type: 'BOOLEAN', value: true } })

    // …then reads start failing and the window elapses: last good state is kept, not discarded to error.
    fail = true
    for (let i = 0; i < 12; i++) {
      await advanceTick()
    }
    expect(get().status).toBe('ready')
    expect(get().overrides).toEqual({ 'flag-a': { type: 'BOOLEAN', value: true } })
  })

  it('clears a stale devtoolsEnabled from a prior settle when the final read fails', async () => {
    spyOn(console, 'error')
    let devtoolsEnabled = true
    let fail = false
    const { get, fireNav } = mountHook({
      eval: (_code, callback) =>
        fail
          ? callback(undefined, { isError: true, code: 'E', description: 'busy' })
          : callback({ overrides: {}, devtoolsEnabled }),
      captureNav: true,
    })

    // First settle detects the wrapper.
    await flushReads()
    expect(get().devtoolsEnabled).toBe(true)

    // The page navigates to one without the wrapper: the new settle reads devtoolsEnabled=false, then
    // reads start failing before the window elapses. The final "last good state" must reflect the new
    // page (false), not the stale true carried over from the first settle.
    devtoolsEnabled = false
    fireNav('completed')
    await flushReads()
    fail = true
    for (let i = 0; i < 12; i++) {
      await advanceTick()
    }
    expect(get().status).toBe('ready')
    expect(get().devtoolsEnabled).toBe(false)
  })
})
