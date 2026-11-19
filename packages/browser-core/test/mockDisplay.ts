import { vi } from 'vitest'
import type { Mocked } from 'vitest'
import type { Display } from '@datadog/js-core/util'

export function mockDisplay(): Mocked<Display> {
  return { debug: vi.fn(), log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}
