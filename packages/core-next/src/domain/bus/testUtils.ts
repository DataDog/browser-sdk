import type { DecoratorFactory } from './types'

export function stubFactory(overrides: Partial<DecoratorFactory> & Pick<DecoratorFactory, 'name'>): DecoratorFactory {
  return {
    provides: [],
    requires: [],
    capabilities: { canDiscard: false },
    create: () => ({ decorate: async () => ({ status: 'skipped' as const }) }),
    ...overrides,
  }
}
