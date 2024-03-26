export type Tracker = { stop: () => void }

export type FlushableTracker = Tracker & { flush: () => void }
