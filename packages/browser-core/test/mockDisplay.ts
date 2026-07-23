import type { Display } from '@datadog/js-core/util'

export function mockDisplay(): jasmine.SpyObj<Display> {
  return jasmine.createSpyObj<Display>('display', ['debug', 'log', 'info', 'warn', 'error'])
}
