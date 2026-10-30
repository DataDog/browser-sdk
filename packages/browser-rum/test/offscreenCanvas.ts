// Canvas recording needs OffscreenCanvas, which is missing on Firefox < 105 and Safari < 16.4.
export function skipIfOffscreenCanvasIsNotSupported() {
  if (typeof OffscreenCanvas === 'undefined') {
    pending('OffscreenCanvas is not supported')
  }
}
