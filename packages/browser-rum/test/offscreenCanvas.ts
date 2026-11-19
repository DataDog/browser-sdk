import type { TestContext } from 'vitest'

// Canvas recording needs OffscreenCanvas, which is missing on Firefox < 105 and Safari < 16.4.
export function skipIfOffscreenCanvasIsNotSupported(context: Pick<TestContext, 'skip'>) {
  if (typeof OffscreenCanvas === 'undefined') {
    context.skip('OffscreenCanvas is not supported')
  }
}
