// TODO: remove this once typescript has been update to 4.8+
declare global {
  interface ShadowRoot {
    adoptedStyleSheets: CSSStyleSheet[] | undefined
  }

  interface Document {
    adoptedStyleSheets: CSSStyleSheet[] | undefined
  }
}

export {}
