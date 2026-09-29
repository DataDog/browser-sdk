import { vi } from 'vitest'
import type { Mocked } from 'vitest'
import type { Display } from '@datadog/js-core/util'

export function mockDisplay(): Mocked<Display> {
  return {
    debug: vi.fn<Display['debug']>(),
    log: vi.fn<Display['log']>(),
    info: vi.fn<Display['info']>(),
    warn: vi.fn<Display['warn']>(),
    error: vi.fn<Display['error']>(),
  }
}
