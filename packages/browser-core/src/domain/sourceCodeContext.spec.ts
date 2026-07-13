import { describe, expect, it } from 'vitest'
import { mockSourceCodeContext, startMockTelemetry } from '../../test'
import { buildDebugIdByUrl, getSourceCodeContext } from './sourceCodeContext'

const url = 'http://source-code-context-spec.example.com/file.js'
const otherUrl = 'http://source-code-context-spec.example.com/other.js'
const thirdUrl = 'http://source-code-context-spec.example.com/third.js'

// Context is keyed by the top frame URL of the stack
function makeStack(topFrameUrl: string) {
  return `Error: context
    at init (${topFrameUrl}:41:27)
    at HTMLButtonElement.onclick (http://source-code-context-spec.example.com/runtime.js:107:146)`
}

describe('buildDebugIdByUrl', () => {
  it('should return debug IDs for the requested URLs present in DD_SOURCE_CODE_CONTEXT', () => {
    mockSourceCodeContext({
      [makeStack(url)]: { ddDebugId: 'id-1' },
      [makeStack(otherUrl)]: { ddDebugId: 'id-2' },
      [makeStack(thirdUrl)]: { ddDebugId: 'id-3' },
    })

    expect(buildDebugIdByUrl([url, otherUrl])).toEqual([
      { url, id: 'id-1' },
      { url: otherUrl, id: 'id-2' },
    ])
  })

  it('should return undefined for a URL not in DD_SOURCE_CODE_CONTEXT', () => {
    expect(buildDebugIdByUrl([url])).toBeUndefined()
  })

  it('should omit URLs whose entry has no ddDebugId', () => {
    mockSourceCodeContext({ [makeStack(url)]: { service: 'my-service' } })

    expect(buildDebugIdByUrl([url])).toBeUndefined()
  })

  it('should only match the top frame URL, not deeper frames of the context stack', () => {
    mockSourceCodeContext({
      [`Error: ctx\n    at top (${url}:1:1)\n    at deeper (${otherUrl}:2:2)`]: { ddDebugId: 'id-1' },
    })

    expect(buildDebugIdByUrl([url])).toEqual([{ url, id: 'id-1' }])
    expect(buildDebugIdByUrl([otherUrl])).toBeUndefined()
  })

  it('should support late updates to DD_SOURCE_CODE_CONTEXT', () => {
    const mock = mockSourceCodeContext()

    // First call: context not yet set
    expect(buildDebugIdByUrl([url])).toBeUndefined()

    // Context added later
    mock.addEntry(makeStack(url), { service: 'late-service', ddDebugId: 'late-id' })

    expect(buildDebugIdByUrl([url])).toEqual([{ url, id: 'late-id' }])
  })

  it('should deduplicate repeated URLs', () => {
    mockSourceCodeContext({ [makeStack(url)]: { ddDebugId: 'id-1' } })

    expect(buildDebugIdByUrl([url, url])).toEqual([{ url, id: 'id-1' }])
  })
})

describe('getSourceCodeContext', () => {
  it('should return the full context entry for a known URL', () => {
    mockSourceCodeContext({ [makeStack(url)]: { service: 'svc', version: '2.0.0', ddDebugId: 'id-1' } })

    expect(getSourceCodeContext(url)).toEqual({ service: 'svc', version: '2.0.0', ddDebugId: 'id-1' })
  })

  it('should return undefined for an unknown URL', () => {
    expect(getSourceCodeContext(url)).toBeUndefined()
  })

  it('should ignore updates to an existing URL after it has been read', () => {
    const mock = mockSourceCodeContext({ [makeStack(url)]: { service: 'svc', version: '1.0.0' } })

    // First read caches the entry by its top frame URL
    expect(getSourceCodeContext(url)).toEqual({ service: 'svc', version: '1.0.0' })

    // A different stack resolving to the same top frame URL must not override the cached entry
    const otherStackSameTopUrl = `Error: context
    at init (${url}:41:27)
    at HTMLButtonElement.other (http://source-code-context-spec.example.com/other-runtime.js:1:1)`
    mock.addEntry(otherStackSameTopUrl, { service: 'updated-svc', version: '1.1.0' })

    expect(getSourceCodeContext(url)).toEqual({ service: 'svc', version: '1.0.0' })
  })
})

describe('source code context telemetry usage', () => {
  it('should report which fields are present when DD_SOURCE_CODE_CONTEXT is detected', async () => {
    const telemetry = startMockTelemetry()
    mockSourceCodeContext({
      [makeStack(url)]: { ddDebugId: 'id-1' },
      [makeStack(otherUrl)]: { service: 'svc' },
    })

    getSourceCodeContext(url)

    const events = await telemetry.getEvents()
    expect(events).toEqual([
      expect.objectContaining({
        type: 'usage',
        usage: { feature: 'source-code-context', use_debug_id: true, use_service: true, use_version: false },
      }),
    ])
  })

  it('should report usage only once even across multiple syncs', async () => {
    const telemetry = startMockTelemetry()
    mockSourceCodeContext({ [makeStack(url)]: { ddDebugId: 'id-1' } })

    getSourceCodeContext(url)
    getSourceCodeContext(otherUrl)

    const events = await telemetry.getEvents()
    expect(events.length).toBe(1)
  })

  it('should not report usage when DD_SOURCE_CODE_CONTEXT is absent', async () => {
    const telemetry = startMockTelemetry()

    getSourceCodeContext(url)

    expect(await telemetry.hasEvents()).toBe(false)
  })
})
