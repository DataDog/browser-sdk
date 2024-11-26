export function getCrypto() {
  return window.crypto || (window as any).msCrypto
}
