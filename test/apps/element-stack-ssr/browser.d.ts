export {}

declare global {
  interface HTMLElement {
    dd_element_stack?: string
  }
  interface Window {
    DD_RUM: { attachElementStack(element: Element): void }
    registerPrototypeSource(stack: string | undefined, service: string): void
    prototypeEvents: Array<{ service?: string; version?: string; elementStack?: string; name?: string }>
  }
}
