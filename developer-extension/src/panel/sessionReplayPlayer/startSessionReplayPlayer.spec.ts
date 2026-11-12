import { IncrementalSource, RecordType } from '@datadog/browser-rum/src/types'
import type { BrowserRecord, BrowserSegmentMetadata } from '@datadog/browser-rum/src/types'
import { registerCleanupTask } from '../../../../packages/browser-core/test'
import { DEV_REPLAY_SANDBOX_ORIGIN, DEV_REPLAY_SANDBOX_URL } from '../../common/packagesUrlConstants'
import { onBackgroundMessage } from '../backgroundScriptConnection'
import type { MessageBridgeDownRecords, MessageBridgeUp, StaticFrameContext } from './sessionReplayPlayer.types'
import { MessageBridgeUpLogLevel, MessageBridgeUpType } from './sessionReplayPlayer.types'
import type { SessionReplayPlayerState } from './startSessionReplayPlayer'
import { startSessionReplayPlayer } from './startSessionReplayPlayer'

const META_RECORD: BrowserRecord = {
  type: RecordType.Meta,
  timestamp: 1,
  data: { href: 'https://example.com', width: 800, height: 600 },
}

const SCROLL_RECORD: BrowserRecord = {
  type: RecordType.IncrementalSnapshot,
  timestamp: 2,
  data: { source: IncrementalSource.Scroll, id: 1, x: 0, y: 10 },
}

const MOUSE_MOVE_RECORD: BrowserRecord = {
  type: RecordType.IncrementalSnapshot,
  timestamp: 3,
  data: { source: IncrementalSource.MouseMove, positions: [{ x: 1, y: 2, id: 1, timeOffset: 0 }] },
}

describe('startSessionReplayPlayer', () => {
  let iframe: HTMLIFrameElement
  let sandboxUrls: string[]
  let postMessageSpy: jasmine.Spy
  let playerStates: SessionReplayPlayerState[]
  let abortController: AbortController

  beforeEach(() => {
    iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    sandboxUrls = []
    // Record the sandbox URL instead of loading the sandbox.
    spyOnProperty(iframe, 'src', 'set').and.callFake((url: string) => {
      sandboxUrls.push(url)
    })
    postMessageSpy = spyOn(iframe.contentWindow!, 'postMessage')
    playerStates = []
    abortController = new AbortController()

    registerCleanupTask(() => {
      abortController.abort()
      iframe.remove()
    })
  })

  function startPlayer({ useDevReplaySandbox = true, excludeMouseMovements = false } = {}) {
    return startSessionReplayPlayer({
      iframe,
      setPlayerState: (state) => playerStates.push(state),
      useDevReplaySandbox,
      excludeMouseMovements,
      signal: abortController.signal,
    })
  }

  // The player locates the sandbox and handles its `ready` message asynchronously.
  function waitForNextTask() {
    return new Promise((resolve) => setTimeout(resolve))
  }

  function getSandboxId() {
    const staticContext = new URL(sandboxUrls.at(-1)!).searchParams.get('staticContext')!
    return (JSON.parse(staticContext) as StaticFrameContext).sandboxId
  }

  function receiveSandboxMessage(
    data: MessageBridgeUp,
    origin = DEV_REPLAY_SANDBOX_ORIGIN,
    source: MessageEventSource | null = iframe.contentWindow
  ) {
    window.dispatchEvent(new MessageEvent('message', { data, origin, source }))
  }

  function receiveReady(sandboxId = getSandboxId()) {
    receiveSandboxMessage({ type: MessageBridgeUpType.READY, sandboxId })
  }

  function receiveRecord(record: BrowserRecord) {
    onBackgroundMessage.notify({
      type: 'sdk-message',
      message: { type: 'record', payload: { record, segment: {} as BrowserSegmentMetadata } },
    })
  }

  function getSentRecords() {
    return postMessageSpy.calls.allArgs().map(([message]) => (message as MessageBridgeDownRecords).record)
  }

  it('loads the sandbox with its static context', async () => {
    startPlayer()
    await waitForNextTask()

    const url = new URL(sandboxUrls.at(-1)!)
    expect(`${url.origin}${url.pathname}`).toBe(DEV_REPLAY_SANDBOX_URL)
    expect(JSON.parse(url.searchParams.get('staticContext')!)).toEqual({
      sandboxId: jasmine.any(String),
      origin: location.origin,
      featureFlags: { rum_session_replay_iframe_interactive: true, rum_session_replay_disregard_origin: true },
    })
  })

  it('waits for a full snapshot when the sandbox is ready', async () => {
    startPlayer()
    expect(playerStates).toEqual([{ status: 'loading', recordCount: 0, excludeMouseMovements: false }])

    await waitForNextTask()
    receiveReady()
    await waitForNextTask()

    expect(playerStates.at(-1)!.status).toBe('waiting-for-full-snapshot')

    receiveRecord(SCROLL_RECORD)
    expect(getSentRecords()).toEqual([])

    receiveRecord(META_RECORD)
    expect(playerStates.at(-1)!.status).toBe('ready')
    expect(getSentRecords()).toEqual([jasmine.objectContaining({ type: RecordType.Meta, orderId: 1 })])
  })

  it('sends the records received while the sandbox loads once it is ready', async () => {
    startPlayer()
    receiveRecord(META_RECORD)
    receiveRecord(SCROLL_RECORD)
    expect(playerStates.at(-1)).toEqual({ status: 'loading', recordCount: 2, excludeMouseMovements: false })

    await waitForNextTask()
    receiveReady()
    await waitForNextTask()

    expect(getSentRecords()).toEqual([
      jasmine.objectContaining({ type: RecordType.Meta, orderId: 1 }),
      jasmine.objectContaining({ type: RecordType.IncrementalSnapshot, orderId: 2 }),
    ])
    expect(postMessageSpy.calls.argsFor(0)[1]).toBe(DEV_REPLAY_SANDBOX_ORIGIN)
    expect(playerStates.at(-1)).toEqual({ status: 'ready', recordCount: 2, excludeMouseMovements: false })
  })

  it('keeps playing after a new full snapshot resets the buffer', async () => {
    startPlayer()
    receiveRecord(META_RECORD)
    receiveRecord(SCROLL_RECORD)
    await waitForNextTask()
    receiveReady()
    await waitForNextTask()

    receiveRecord(META_RECORD)
    receiveRecord(SCROLL_RECORD)

    expect(getSentRecords()).toEqual([
      jasmine.objectContaining({ type: RecordType.Meta, orderId: 1 }),
      jasmine.objectContaining({ type: RecordType.IncrementalSnapshot, orderId: 2 }),
      jasmine.objectContaining({ type: RecordType.Meta, orderId: 3 }),
      jasmine.objectContaining({ type: RecordType.IncrementalSnapshot, orderId: 4 }),
    ])
    expect(playerStates.at(-1)).toEqual({ status: 'ready', recordCount: 2, excludeMouseMovements: false })
  })

  it('excludes mouse movements from the start when the option is set', () => {
    startPlayer({ excludeMouseMovements: true })
    expect(playerStates).toEqual([{ status: 'loading', recordCount: 0, excludeMouseMovements: true }])

    receiveRecord(META_RECORD)
    receiveRecord(MOUSE_MOVE_RECORD)
    expect(playerStates.at(-1)!.recordCount).toBe(1)
  })

  it('returns the records and excludes mouse movements while the sandbox loads', () => {
    const player = startPlayer()
    receiveRecord(META_RECORD)
    expect(player.getRecords()).toEqual([META_RECORD])

    player.setExcludeMouseMovements(true)
    receiveRecord(MOUSE_MOVE_RECORD)
    expect(player.getRecords()).toEqual([META_RECORD])
    expect(playerStates.at(-1)).toEqual({ status: 'loading', recordCount: 1, excludeMouseMovements: true })
  })

  it('ignores the messages of other sandboxes', async () => {
    startPlayer()
    await waitForNextTask()
    const ready: MessageBridgeUp = { type: MessageBridgeUpType.READY, sandboxId: getSandboxId() }

    receiveReady('another-sandbox-id')
    receiveSandboxMessage(ready, 'https://example.com')
    receiveSandboxMessage(ready, DEV_REPLAY_SANDBOX_ORIGIN, window)
    await waitForNextTask()

    expect(playerStates.at(-1)!.status).toBe('loading')
  })

  it('relays the sandbox logs until the signal is aborted', async () => {
    const consoleLogSpy = spyOn(console, 'log')
    startPlayer()
    await waitForNextTask()
    const log: MessageBridgeUp = {
      type: MessageBridgeUpType.LOG,
      level: MessageBridgeUpLogLevel.LOG,
      message: 'hello',
      sandboxId: getSandboxId(),
    }

    receiveSandboxMessage(log)
    expect(consoleLogSpy).toHaveBeenCalledOnceWith(jasmine.any(String), '[sandbox]', 'hello')

    abortController.abort()
    receiveSandboxMessage(log)
    expect(consoleLogSpy).toHaveBeenCalledTimes(1)
  })

  it('reports an error, and keeps buffering the records, when the sandbox cannot be located', async () => {
    spyOn(globalThis, 'fetch').and.resolveTo(new Response('', { status: 503 }))
    const consoleErrorSpy = spyOn(console, 'error')

    const player = startPlayer({ useDevReplaySandbox: false })
    await waitForNextTask()

    expect(playerStates.at(-1)!.status).toBe('error')
    expect(consoleErrorSpy).toHaveBeenCalledOnceWith(
      jasmine.any(String),
      '[startSessionReplayPlayer]',
      'While loading the replay sandbox:',
      jasmine.any(Error)
    )
    expect(sandboxUrls).toEqual([])

    receiveRecord(META_RECORD)
    expect(player.getRecords()).toEqual([META_RECORD])
    expect(playerStates.at(-1)).toEqual({ status: 'error', recordCount: 1, excludeMouseMovements: false })
  })

  it('does not load the sandbox when aborted while locating it', async () => {
    spyOn(globalThis, 'fetch').and.callFake(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init!.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        })
    )

    startPlayer({ useDevReplaySandbox: false })
    abortController.abort()
    await waitForNextTask()

    expect(sandboxUrls).toEqual([])
    expect(playerStates.map(({ status }) => status)).toEqual(['loading'])
  })

  it('stops when aborted while waiting for the sandbox', async () => {
    startPlayer()
    await waitForNextTask()

    abortController.abort()
    await waitForNextTask()

    const stateCount = playerStates.length
    receiveReady()
    receiveRecord(META_RECORD)
    await waitForNextTask()
    expect(playerStates.length).toBe(stateCount)
    expect(postMessageSpy).not.toHaveBeenCalled()
  })

  it('stops replaying when aborted after the sandbox is ready', async () => {
    startPlayer()
    await waitForNextTask()
    receiveReady()
    await waitForNextTask()

    abortController.abort()

    const stateCount = playerStates.length
    receiveRecord(META_RECORD)
    expect(playerStates.length).toBe(stateCount)
    expect(postMessageSpy).not.toHaveBeenCalled()
  })
})
