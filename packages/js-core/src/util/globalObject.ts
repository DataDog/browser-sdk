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
  /** Not available in Node.js. https://developer.mozilla.org/en-US/docs/Web/API/Navigator */
  navigator?: Navigator

  /** Not available in all browsers yet. https://developer.mozilla.org/en-US/docs/Web/API/CookieStore */
  cookieStore?: CookieStore

  /** Not available in all browsers yet. https://developer.mozilla.org/en-US/docs/Web/API/queueMicrotask */
  queueMicrotask?: typeof queueMicrotask

  /** Not available in all browsers yet. https://developer.mozilla.org/en-US/docs/Web/API/Profiler */
  Profiler?: ProfilerConstructor

  /** Not available in workers or SSR environments. https://developer.mozilla.org/en-US/docs/Web/API/Window */
  window?: Window
}

/** The global object for the current JS environment. */
// eslint-disable-next-line no-restricted-syntax
export const globalObject = globalThis as GlobalObject

/** True when the SDK is running inside a Web Worker. */
export const isWorkerEnvironment = 'WorkerGlobalScope' in globalObject

/**
 * The types below are either more accurate than what TypeScript's DOM lib provides, or not yet
 * available in the TypeScript version we currently support or require as minimum.
 * Only the properties actually used by the SDK are included.
 */

// Network Information API
// https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation

/** The physical type of the network connection. */
export type NetworkInterface = 'bluetooth' | 'cellular' | 'ethernet' | 'none' | 'wifi' | 'wimax' | 'other' | 'unknown'

/** The effective bandwidth class of the network connection. */
export type NetworkEffectiveType = 'slow-2g' | '2g' | '3g' | '4g'

/** Provides information about the device's network connection. */
export interface NetworkInformation {
  /** The physical connection type. */
  type?: NetworkInterface
  /** The effective connection type based on observed bandwidth. */
  effectiveType?: NetworkEffectiveType
  /** Whether the user has requested a reduced data usage mode. */
  saveData: boolean
}

/** Extends the standard Navigator with the Network Information API. */
export interface Navigator {
  /** Whether the browser is online. */
  onLine: boolean
  /** Network connection info; may be absent in some browsers. */
  connection?: NetworkInformation
}

// CookieStore API
// https://developer.mozilla.org/en-US/docs/Web/API/CookieStore

/** A single cookie's attributes. */
export interface CookieStoreItem {
  /** Cookie name. */
  name: string
  /** Cookie value. */
  value: string
  /** Restricts the cookie to the given domain. */
  domain?: string
  /** Restricts the cookie to the given path. */
  path?: string
  /** Expiry time as a Unix timestamp in milliseconds. */
  expires?: number
  /** Whether the cookie is restricted to HTTPS. */
  secure?: boolean
  /** Same-site policy. */
  sameSite?: 'strict' | 'lax' | 'none'
  /** Whether the cookie is partitioned (CHIPS). */
  partitioned?: boolean
}

/** Describes a cookie that was changed or deleted in a `CookieChangeEvent`. */
export interface CookieChangeItem {
  /** Cookie name. */
  name: string
  /** New value, or `undefined` if the cookie was deleted. */
  value: string | undefined
}

/** Fired when cookies are added, modified, or removed. */
export type CookieChangeEvent = Event & {
  /** Cookies that were added or modified. */
  changed: CookieChangeItem[]
  /** Cookies that were deleted. */
  deleted: CookieChangeItem[]
}

/** @internal */
export interface CookieStoreEventMap {
  change: CookieChangeEvent
}

/** Async, event-driven API for reading and writing cookies. */
export interface CookieStore extends EventTarget {
  /** Retrieves the cookie with the given name. */
  get(name: string): Promise<CookieStoreItem | null>
  /** Retrieves all cookies matching the given name, or all cookies if omitted. */
  getAll(name?: string): Promise<CookieStoreItem[]>
  /** Sets a cookie with the given attributes. */
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
  /** Deletes a cookie matching the given attributes. */
  delete(options: { name: string; domain?: string; path?: string; partitioned?: boolean }): Promise<void>
  /** Adds a typed listener for the given cookie store event. */
  addEventListener<K extends keyof CookieStoreEventMap>(
    type: K,
    listener: (ev: CookieStoreEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
  ): void
  /** @inheritdoc EventTarget.addEventListener */
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void
  /** Removes a typed listener for the given cookie store event. */
  removeEventListener<K extends keyof CookieStoreEventMap>(
    type: K,
    listener: (ev: CookieStoreEventMap[K]) => any,
    options?: boolean | EventListenerOptions
  ): void
  /** @inheritdoc EventTarget.removeEventListener */
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions
  ): void
}

// JS Self-Profiling API
// https://wicg.github.io/js-self-profiling/

/** A single frame (function call) captured in a profiler trace. */
export interface ProfilerFrame {
  /** Function name. */
  readonly name: string
  /** Index into `ProfilerTrace.resources`. */
  readonly resourceId?: number
  /** 1-based source line number. */
  readonly line?: number
  /** 1-based source column number. */
  readonly column?: number
}

/** A node in the profiler's call-stack tree. */
export interface ProfilerStack {
  /** Index of the parent stack node, if any. */
  readonly parentId?: number
  /** Index into `ProfilerTrace.frames`. */
  readonly frameId: number
}

/** A single time-stamped sample captured by the profiler. */
export interface ProfilerSample {
  /** Time in ms relative to the profiling session's time origin. */
  readonly timestamp: number
  /** Index into `ProfilerTrace.stacks`, if a stack was captured. */
  readonly stackId?: number
}

/** A script URL referenced by a profiler frame. */
export type ProfilerResource = string

/** The complete output of a profiling session. */
export interface ProfilerTrace {
  /** Script URLs referenced by frames. */
  readonly resources: ProfilerResource[]
  /** Function call frames. */
  readonly frames: ProfilerFrame[]
  /** Call-stack tree nodes. */
  readonly stacks: ProfilerStack[]
  /** Time-stamped samples. */
  readonly samples: ProfilerSample[]
}

/** Options passed when starting a profiler session. */
export interface ProfilerInitOptions {
  /** How often to sample, in ms. */
  readonly sampleInterval: number
  /** Maximum number of samples before the buffer-full event fires. */
  readonly maxBufferSize: number
}

/** Fired when the profiler's sample buffer is full. */
export interface SampleBufferFullEvent extends Event {
  /** The profiler that fired the event. */
  readonly target: Profiler
}

/** @internal */
interface ProfilerEventMap {
  samplebufferfull: SampleBufferFullEvent
}

/** A running JS Self-Profiling session. */
export interface Profiler extends EventTarget {
  /** The actual sample interval in ms (may differ from the requested value). */
  readonly sampleInterval: number
  /** Whether the profiler has been stopped. */
  readonly stopped: boolean
  /** Stops the profiler and returns the collected trace. */
  stop(): Promise<ProfilerTrace>
  /** Adds a typed listener for the given profiler event. */
  addEventListener<K extends keyof ProfilerEventMap>(
    type: K,
    listener: (ev: ProfilerEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
  ): void
  /** @inheritdoc EventTarget.addEventListener */
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void
  /** Removes a typed listener for the given profiler event. */
  removeEventListener<K extends keyof ProfilerEventMap>(
    type: K,
    listener: (ev: ProfilerEventMap[K]) => any,
    options?: boolean | EventListenerOptions
  ): void
  /** @inheritdoc EventTarget.removeEventListener */
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions
  ): void
}

/** Constructor for a JS Self-Profiling session. */
export interface ProfilerConstructor {
  /** Starts a new profiling session with the given options. */
  new (options: ProfilerInitOptions): Profiler
}
