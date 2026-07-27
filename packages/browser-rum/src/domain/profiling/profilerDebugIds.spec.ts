import { mockSourceCodeContext } from '@datadog/browser-core/test'
import { buildProfilerDebugIds } from './profilerDebugIds'

describe('buildProfilerDebugIds', () => {
  it('should resolve matching resources to { resourceId, debugId }', () => {
    const url = 'http://example.com/resource1.js'
    mockSourceCodeContext({ [`Error: ctx\n    at fn (${url}:1:1)`]: { ddDebugId: 'debug-id-1' } })

    expect(buildProfilerDebugIds([url])).toEqual([{ resourceId: 0, debugId: 'debug-id-1' }])
  })

  it('should skip resources with no debug ID', () => {
    const matched = 'http://example.com/resource1.js'
    const unmatched = 'http://example.com/resource2.js'
    mockSourceCodeContext({ [`Error: ctx\n    at fn (${matched}:1:1)`]: { ddDebugId: 'debug-id-1' } })

    expect(buildProfilerDebugIds([unmatched, matched])).toEqual([{ resourceId: 1, debugId: 'debug-id-1' }])
  })

  it('should preserve resource indices when some resources are unmatched', () => {
    const first = 'http://example.com/resource1.js'
    const second = 'http://example.com/resource2.js'
    const third = 'http://example.com/resource3.js'
    mockSourceCodeContext({
      [`Error: ctx\n    at fn (${first}:1:1)`]: { ddDebugId: 'debug-id-1' },
      [`Error: ctx\n    at fn (${third}:1:1)`]: { ddDebugId: 'debug-id-3' },
    })

    expect(buildProfilerDebugIds([first, second, third])).toEqual([
      { resourceId: 0, debugId: 'debug-id-1' },
      { resourceId: 2, debugId: 'debug-id-3' },
    ])
  })

  it('should return undefined when nothing resolves', () => {
    expect(buildProfilerDebugIds(['http://example.com/resource1.js'])).toBeUndefined()
  })

  it('should return undefined for an empty resources array', () => {
    expect(buildProfilerDebugIds([])).toBeUndefined()
  })
})
