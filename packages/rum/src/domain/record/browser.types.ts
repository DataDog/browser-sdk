// TODO: remove this once typescript has been update to 4.8+
export type WithAdoptedStyleSheets = {
  adoptedStyleSheets: CSSStyleSheet[] | undefined
} & (Document | ShadowRoot)
