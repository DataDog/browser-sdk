import type { Probe } from './probes'

export function createProbe(overrides: Partial<Probe> = {}): Probe {
  return {
    id: 'test-probe',
    version: 0,
    type: 'LOG_PROBE',
    where: { typeName: 'test.js', methodName: 'testMethod' },
    template: 'Test message',
    captureSnapshot: true,
    capture: { maxReferenceDepth: 3 },
    sampling: { snapshotsPerSecond: 1 },
    evaluateAt: 'EXIT',
    ...overrides,
  }
}
