// Extend Window interface for Jasmine compatibility
interface Window {
  global: typeof globalThis
  i: any
}
