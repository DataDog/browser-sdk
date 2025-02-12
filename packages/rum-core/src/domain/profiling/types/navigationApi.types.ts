// Define types for the new Navigation API
// https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API

interface NavigationEventMap {
    navigate: NavigateEvent;
}

export interface Navigation extends EventTarget {
    addEventListener<K extends keyof NavigationEventMap>(
        type: K,
        listener: (this: Navigation, ev: NavigationEventMap[K]) => any,
        options?: boolean | AddEventListenerOptions,
    ): void;
    addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
    ): void;
    removeEventListener<K extends keyof NavigationEventMap>(
        type: K,
        listener: (this: Navigation, ev: NavigationEventMap[K]) => any,
        options?: boolean | EventListenerOptions,
    ): void;
    removeEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | EventListenerOptions,
    ): void;
}

export interface NavigationDestination {
    id: string;
    index: number;
    key: string;
    sameDocument: boolean;
    url: URL;
    // There is more, but we don't need it for profiling
}

export interface NavigationHistoryEntry extends EventTarget {
    id: string;
    index: number;
    key: string;
    sameDocument: boolean;
    url: URL;
    // There is more, but we don't need it for profiling
}

export interface NavigateEvent extends Event {
    destination: NavigationDestination;
    navigationType: 'push' | 'reload' | 'replace' | 'traverse';
    // There is more, but we don't need it for profiling
}
