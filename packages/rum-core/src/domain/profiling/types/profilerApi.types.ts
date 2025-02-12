// Define types for the new Profiler API
// https://wicg.github.io/js-self-profiling/

export interface ProfilerFrame {
    /** A function instance name. */
    readonly name: string;
    /** Index in the trace.resources array. */
    readonly resourceId?: number;
    /** 1-based index of the line. */
    readonly line?: number;
    /** 1-based index of the column. */
    readonly column?: number;
}

export interface ProfilerStack {
    /** Index in the trace.stacks array. */
    readonly parentId?: number;
    /** Index in the trace.frames array. */
    readonly frameId: number;
}

export interface ProfilerSample {
    /** High resolution time relative to the profiling session's time origin. */
    readonly timestamp: number;
    /** Index in the trace.stacks array. */
    readonly stackId?: number;
}

export type ProfilerResource = string;

export interface ProfilerTrace {
    /** An array of profiler resources. */
    readonly resources: ProfilerResource[];
    /** An array of profiler frames. */
    readonly frames: ProfilerFrame[];
    /** An array of profiler stacks. */
    readonly stacks: ProfilerStack[];
    /** An array of profiler samples. */
    readonly samples: ProfilerSample[];
}

export interface ProfilerInitOptions {
    /** Sample interval in ms. */
    readonly sampleInterval: number;
    /** Max buffer size in number of samples. */
    readonly maxBufferSize: number;
}

export interface Profiler extends EventTarget {
    /** Sample interval in ms. */
    readonly sampleInterval: number;
    /** True if profiler is stopped. */
    readonly stopped: boolean;

    // eslint-disable-next-line @typescript-eslint/no-misused-new
    new (options: ProfilerInitOptions): Profiler;
    stop(): Promise<ProfilerTrace>;

    addEventListener<K extends keyof ProfilerEventMap>(
        type: K,
        listener: (this: typeof globalThis, ev: ProfilerEventMap[K]) => any,
        options?: boolean | AddEventListenerOptions,
    ): void;
    addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
    ): void;
    removeEventListener<K extends keyof ProfilerEventMap>(
        type: K,
        listener: (this: typeof globalThis, ev: ProfilerEventMap[K]) => any,
        options?: boolean | EventListenerOptions,
    ): void;
    removeEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | EventListenerOptions,
    ): void;
}

interface ProfilerEventMap {
    samplebufferfull: SampleBufferFullEvent;
}

export interface SampleBufferFullEvent extends Event {
    readonly target: Profiler;
}
