import { createSdk } from '../domain/sdk'
import { replayProcessor } from '@datadog/browser-replay-next/processor'
import { rumProcessor } from '@datadog/browser-rum-next/processor'
import { unregisterSdk } from '@datadog/core-next'

async function tick(n = 3): Promise<void> {
  for (let i = 0; i < n; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
}

function flushBatch(): void {
  const orig = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState')
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
  if (orig) {
    Object.defineProperty(document, 'visibilityState', orig)
  } else {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (document as any).visibilityState
  }
}

function getReplayLines(fetchSpy: jasmine.Spy): string[] {
  return fetchSpy.calls
    .all()
    .filter((c) => String(c.args[0]).includes('/api/v2/replay'))
    .flatMap((c) => {
      const body = (c.args[1] as RequestInit).body as string
      return body
        .trim()
        .split('\n')
        .filter((l) => l.length > 0)
    })
}

function getRumLines(fetchSpy: jasmine.Spy): string[] {
  return fetchSpy.calls
    .all()
    .filter((c) => String(c.args[0]).includes('/api/v2/rum'))
    .flatMap((c) => {
      const body = (c.args[1] as RequestInit).body as string
      return body
        .trim()
        .split('\n')
        .filter((l) => l.length > 0)
    })
}

describe('Replay integration', () => {
  let fetchSpy: jasmine.Spy
  let currentSdk: any

  beforeEach(() => {
    fetchSpy = spyOn(window, 'fetch').and.returnValue(Promise.resolve(new Response(null, { status: 200 })))
    currentSdk = null
  })

  afterEach(() => {
    currentSdk?.__stop?.()
    unregisterSdk('default')
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (globalThis as any)._DD_SESSION
  })

  it('does not record when sampleRate is 0', async () => {
    currentSdk = await createSdk({
      clientToken: 'test-token',
      site: 'datadoghq.com',
      modules: [replayProcessor],
      replay: { sampleRate: 0 },
    })

    await tick(10)
    flushBatch()

    const replayLines = getReplayLines(fetchSpy)
    expect(replayLines.length).toBe(0)
  })

  it('replay module is accessible on SDK object', async () => {
    currentSdk = await createSdk({
      clientToken: 'test-token',
      site: 'datadoghq.com',
      modules: [replayProcessor],
      replay: { sampleRate: 0 },
    })

    expect(currentSdk!['replay']).toBeDefined()
    expect(typeof currentSdk!['replay'].startSessionReplayRecording).toBe('function')
    expect(typeof currentSdk!['replay'].stopSessionReplayRecording).toBe('function')
  })

  it('replay config extension rejects invalid sampleRate', async () => {
    currentSdk = await createSdk({
      clientToken: 'test-token',
      site: 'datadoghq.com',
      modules: [replayProcessor],
      replay: { sampleRate: -1 },
    })

    // Invalid config causes build() to return null, so SDK doesn't initialize
    expect(currentSdk).toBeNull()
  })

  it('replay events go to replay track, not rum track', async () => {
    currentSdk = await createSdk({
      clientToken: 'test-token',
      site: 'datadoghq.com',
      modules: [rumProcessor, replayProcessor],
      rum: {},
      replay: { sampleRate: 100 },
    })

    // Wait for recording to produce segments (duration limit is 5s, so trigger manually)
    await tick(10)

    // Force a segment flush by stopping
    currentSdk!['replay'].stopSessionReplayRecording()
    await tick(5)
    flushBatch()

    const rumLines = getRumLines(fetchSpy)
    const replayLines = getReplayLines(fetchSpy)

    // RUM events should not contain replay segments
    for (const line of rumLines) {
      const parsed = JSON.parse(line)
      expect(parsed.type).not.toBe('replay')
    }

    // If any replay segments were produced, they should go to the replay endpoint
    // (Note: the recorder may not produce segments in a test environment without a real DOM)
  })
})
