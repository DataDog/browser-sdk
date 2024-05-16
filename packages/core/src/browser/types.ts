// Those types come from the official TypeScript DOM library, but are not included in our minimal
// supported TS version.
// https://github.com/microsoft/TypeScript/blob/13c374a868c926f6a907666a5599992c1351b773/src/lib/dom.generated.d.ts#L15399-L15418

export interface VisualViewportEventMap {
  resize: Event
  scroll: Event
}

export interface VisualViewport extends EventTarget {
  readonly height: number
  readonly offsetLeft: number
  readonly offsetTop: number
  onresize: ((this: VisualViewport, ev: Event) => any) | null
  onscroll: ((this: VisualViewport, ev: Event) => any) | null
  readonly pageLeft: number
  readonly pageTop: number
  readonly scale: number
  readonly width: number
  addEventListener<K extends keyof VisualViewportEventMap>(
    type: K,
    listener: (this: VisualViewport, ev: VisualViewportEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
  ): void
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void
  removeEventListener<K extends keyof VisualViewportEventMap>(
    type: K,
    listener: (this: VisualViewport, ev: VisualViewportEventMap[K]) => any,
    options?: boolean | EventListenerOptions
  ): void
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions
  ): void
}

export interface WeakRef<T extends object> {
  readonly [Symbol.toStringTag]: 'WeakRef'

  deref(): T | undefined
}

export interface WeakRefConstructor {
  readonly prototype: WeakRef<any>

  new <T extends object>(target: T): WeakRef<T>
}

// Those are native API types that are not official supported by TypeScript yet

export interface CookieStore extends EventTarget {}

export interface CookieStoreEventMap {
  change: CookieChangeEvent
}

export type CookieChangeItem = { name: string; value: string | undefined }

export type CookieChangeEvent = Event & {
  changed: CookieChangeItem[]
  deleted: CookieChangeItem[]
}

export interface CookieStore extends EventTarget {}
