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

export interface CookieStoreItem {
  name: string
  value: string
  domain?: string
  path?: string
  expires?: number
  secure?: boolean
  sameSite?: 'strict' | 'lax' | 'none'
  partitioned?: boolean
}

export interface CookieStore extends EventTarget {
  get(name: string): Promise<CookieStoreItem | null>
  getAll(name?: string): Promise<CookieStoreItem[]>
  set(options: {
    name: string
    value: string
    expires?: number | Date
    domain?: string
    path?: string
    secure?: boolean
    sameSite?: 'strict' | 'lax' | 'none'
    partitioned?: boolean
  }): Promise<void>
  delete(options: { name: string; domain?: string; path?: string; partitioned?: boolean }): Promise<void>
}

export interface CookieStoreEventMap {
  change: CookieChangeEvent
}

export interface CookieChangeItem {
  name: string
  value: string | undefined
}

export type CookieChangeEvent = Event & {
  changed: CookieChangeItem[]
  deleted: CookieChangeItem[]
}

export type NetworkInterface = 'bluetooth' | 'cellular' | 'ethernet' | 'none' | 'wifi' | 'wimax' | 'other' | 'unknown'
export type EffectiveType = 'slow-2g' | '2g' | '3g' | '4g'

export interface BrowserNavigator extends Navigator {
  connection?: NetworkInformation
}

export interface NetworkInformation {
  type?: NetworkInterface
  effectiveType?: EffectiveType
  saveData: boolean
}

// Types for the JS Self-Profiling API
// https://wicg.github.io/js-self-profiling/

export interface ProfilerFrame {
  /** A function instance name. */
  readonly name: string
  /** Index in the trace.resources array. */
  readonly resourceId?: number
  /** 1-based index of the line. */
  readonly line?: number
  /** 1-based index of the column. */
  readonly column?: number
}

export interface ProfilerStack {
  /** Index in the trace.stacks array. */
  readonly parentId?: number
  /** Index in the trace.frames array. */
  readonly frameId: number
}

export interface ProfilerSample {
  /** High resolution time relative to the profiling session's time origin. */
  readonly timestamp: number
  /** Index in the trace.stacks array. */
  readonly stackId?: number
}

export type ProfilerResource = string

export interface ProfilerTrace {
  /** An array of profiler resources. */
  readonly resources: ProfilerResource[]
  /** An array of profiler frames. */
  readonly frames: ProfilerFrame[]
  /** An array of profiler stacks. */
  readonly stacks: ProfilerStack[]
  /** An array of profiler samples. */
  readonly samples: ProfilerSample[]
}

export interface ProfilerInitOptions {
  /** Sample interval in ms. */
  readonly sampleInterval: number
  /** Max buffer size in number of samples. */
  readonly maxBufferSize: number
}

export interface ProfilerConstructor {
  new (options: ProfilerInitOptions): Profiler
}

export interface Profiler extends EventTarget {
  /** Sample interval in ms. */
  readonly sampleInterval: number
  /** True if profiler is stopped. */
  readonly stopped: boolean

  stop(): Promise<ProfilerTrace>

  addEventListener<K extends keyof ProfilerEventMap>(
    type: K,
    listener: (this: typeof globalThis, ev: ProfilerEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
  ): void
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void
  removeEventListener<K extends keyof ProfilerEventMap>(
    type: K,
    listener: (this: typeof globalThis, ev: ProfilerEventMap[K]) => any,
    options?: boolean | EventListenerOptions
  ): void
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions
  ): void
}

interface ProfilerEventMap {
  samplebufferfull: SampleBufferFullEvent
}

export interface SampleBufferFullEvent extends Event {
  readonly target: Profiler
}
