interface ResourceTimingEntry {
  name: string
  entryType: 'resource'
  startTime: number
  duration: number
  initiatorType: string
  transferSize: number
  encodedBodySize: number
  decodedBodySize: number
  responseStatus: number
  renderBlockingStatus?: string
  deliveryType?: string
  nextHopProtocol?: string
  redirectStart: number
  redirectEnd: number
  domainLookupStart: number
  domainLookupEnd: number
  connectStart: number
  connectEnd: number
  secureConnectionStart: number
  requestStart: number
  responseStart: number
  responseEnd: number
}

interface LongTaskEntry {
  entryType: 'longtask'
  startTime: number
  duration: number
}

interface LongAnimationFrameEntry {
  entryType: 'long-animation-frame'
  startTime: number
  duration: number
  blockingDuration: number
  renderStart: number
  styleAndLayoutStart: number
  firstUIEventTimestamp: number
  scripts: LongAnimationFrameScript[]
}

interface LongAnimationFrameScript {
  sourceURL: string
  sourceFunctionName: string
  invoker: string
  invokerType: string
  duration: number
  executionStart: number
  pauseDuration: number
  forcedStyleAndLayoutDuration: number
  windowAttribution: string
}

export type {
  ResourceTimingEntry,
  LongTaskEntry,
  LongAnimationFrameEntry,
  LongAnimationFrameScript,
}
