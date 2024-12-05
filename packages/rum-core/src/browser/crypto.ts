export function getCrypto() {
  // TODO: remove msCrypto when IE11 support is dropped
  return window.crypto || (window as any).msCrypto
}
