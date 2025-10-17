import { vi } from 'vitest'
import type { ContextManager } from '../src/domain/context/contextManager'

export function mockContextManager() {
  return {
    getContext: () => ({}),
    setContext: vi.fn(),
    setContextProperty: vi.fn(),
    removeContextProperty: vi.fn(),
    clearContext: vi.fn(),
  } as unknown as ContextManager
}
