import type { ContextManager } from '../src/domain/context/contextManager'

export function mockContextManager() {
  return {
    getContext: () => ({}),
    setContext: jasmine.createSpy(),
    setContextProperty: jasmine.createSpy(),
    removeContextProperty: jasmine.createSpy(),
    clearContext: jasmine.createSpy(),
  } as unknown as ContextManager
}
