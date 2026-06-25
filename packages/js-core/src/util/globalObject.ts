/**
 * Represents the global object across JS environments (browser window, Web Worker, Node.js, ...).
 *
 * We extend `typeof globalThis` to inherit all standard globals, but override specific browser
 * APIs with our own definitions and make them optional so the type is valid in non-browser
 * environments where those APIs may not exist.
 *
 * The overridden types are either more accurate than what TypeScript's DOM lib provides, or not
 * yet available in the TypeScript version we currently support or require as minimum.
 * Only the properties actually used by the SDK are included.
 */
export interface GlobalObject extends Omit<
  // eslint-disable-next-line no-restricted-syntax
  typeof globalThis,
  'navigator' | 'queueMicrotask' | 'cookieStore' | 'Profiler' | 'window'
> {
  // navigator is not available in Node.js
  navigator?: Navigator

  // cookieStore is not available in all browsers yet
  cookieStore?: CookieStore

  // queueMicrotask is not available in all browsers yet
  queueMicrotask?: typeof queueMicrotask

  // Profiler is not available in all browsers yet
  Profiler?: ProfilerConstructor

  // window is not available in workers or SSR environments
  window?: Window
}

// eslint-disable-next-line no-restricted-syntax
export const globalObject = globalThis as GlobalObject

export const isWorkerEnvironment = 'WorkerGlobalScope' in globalObject


// Network Information API
// https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation
export type NetworkInterface = 'bluetooth' | 'cellular' | 'ethernet' | 'none' | 'wifi' | 'wimax' | 'other' | 'unknown'
export type EffectiveType = 'slow-2g' | '2g' | '3g' | '4g'

export interface NetworkInformation {
  type?: NetworkInterface
  effectiveType?: EffectiveType
  saveData: boolean
}

export interface Navigator {
  onLine: boolean
  connection?: NetworkInformation
}

// CookieStore API
// https://developer.mozilla.org/en-US/docs/Web/API/CookieStore
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

export interface CookieChangeItem {
  name: string
  value: string | undefined
}

export type CookieChangeEvent = Event & {
  changed: CookieChangeItem[]
  deleted: CookieChangeItem[]
}

export interface CookieStoreEventMap {
  change: CookieChangeEvent
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
  addEventListener<K extends keyof CookieStoreEventMap>(
    type: K,
    listener: (ev: CookieStoreEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
  ): void
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void
  removeEventListener<K extends keyof CookieStoreEventMap>(
    type: K,
    listener: (ev: CookieStoreEventMap[K]) => any,
    options?: boolean | EventListenerOptions
  ): void
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions
  ): void
}

// JS Self-Profiling API
// https://wicg.github.io/js-self-profiling/
export interface ProfilerFrame {
  readonly name: string
  readonly resourceId?: number
  readonly line?: number
  readonly column?: number
}

export interface ProfilerStack {
  readonly parentId?: number
  readonly frameId: number
}

export interface ProfilerSample {
  readonly timestamp: number
  readonly stackId?: number
}

export type ProfilerResource = string

export interface ProfilerTrace {
  readonly resources: ProfilerResource[]
  readonly frames: ProfilerFrame[]
  readonly stacks: ProfilerStack[]
  readonly samples: ProfilerSample[]
}

export interface ProfilerInitOptions {
  readonly sampleInterval: number
  readonly maxBufferSize: number
}

export interface SampleBufferFullEvent extends Event {
  readonly target: Profiler
}

interface ProfilerEventMap {
  samplebufferfull: SampleBufferFullEvent
}

export interface Profiler extends EventTarget {
  readonly sampleInterval: number
  readonly stopped: boolean
  stop(): Promise<ProfilerTrace>
  addEventListener<K extends keyof ProfilerEventMap>(
    type: K,
    listener: (ev: ProfilerEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
  ): void
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void
  removeEventListener<K extends keyof ProfilerEventMap>(
    type: K,
    listener: (ev: ProfilerEventMap[K]) => any,
    options?: boolean | EventListenerOptions
  ): void
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions
  ): void
}

export interface ProfilerConstructor {
  new (options: ProfilerInitOptions): Profiler
}
