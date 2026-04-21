import { registerCleanupTask } from '@datadog/browser-core/test'
import type { BrowserRecord } from '../../types'
import { RecordType, IncrementalSource, MouseInteractionType } from '../../types/sessionReplayConstants'
import type { BehavioralSignals } from './aiAgentBehavioralAnalyzer'
import {
  computeBehavioralDetection,
  createBehavioralAnalyzer,
  setAiAgentBehaviorCallback,
} from './aiAgentBehavioralAnalyzer'

function makeClickRecord(timestamp: number): BrowserRecord {
  return {
    type: RecordType.IncrementalSnapshot,
    timestamp,
    data: { source: IncrementalSource.MouseInteraction, type: MouseInteractionType.Click, id: 1, x: 0, y: 0 },
  } as unknown as BrowserRecord
}

function makeMouseMoveRecord(timestamp: number): BrowserRecord {
  return {
    type: RecordType.IncrementalSnapshot,
    timestamp,
    data: { source: IncrementalSource.MouseMove, positions: [] },
  } as unknown as BrowserRecord
}

function makeScrollRecord(timestamp: number): BrowserRecord {
  return {
    type: RecordType.IncrementalSnapshot,
    timestamp,
    data: { source: IncrementalSource.Scroll, id: 1, x: 0, y: 100 },
  } as unknown as BrowserRecord
}

function makeInputRecord(timestamp: number): BrowserRecord {
  return {
    type: RecordType.IncrementalSnapshot,
    timestamp,
    data: { source: IncrementalSource.Input, id: 1, text: 'a', isChecked: false },
  } as unknown as BrowserRecord
}

function makeContextMenuRecord(timestamp: number): BrowserRecord {
  return {
    type: RecordType.IncrementalSnapshot,
    timestamp,
    data: { source: IncrementalSource.MouseInteraction, type: MouseInteractionType.ContextMenu, id: 1, x: 0, y: 0 },
  } as unknown as BrowserRecord
}

function makeFullSnapshotRecord(timestamp: number): BrowserRecord {
  return {
    type: RecordType.FullSnapshot,
    timestamp,
    data: {},
  } as unknown as BrowserRecord
}

function baseSignals(overrides: Partial<BehavioralSignals> = {}): BehavioralSignals {
  return {
    mouseMoveCount: 0,
    clickCount: 0,
    scrollCount: 0,
    inputCount: 0,
    contextMenuCount: 0,
    clickTimestamps: [],
    ...overrides,
  }
}

describe('computeBehavioralDetection', () => {
  it('returns undefined when there are no clicks', () => {
    expect(computeBehavioralDetection(baseSignals({ inputCount: 20 }))).toBeUndefined()
  })

  it('detects low mouse-move-to-click ratio', () => {
    const signals = baseSignals({
      clickCount: 10,
      mouseMoveCount: 5,
      clickTimestamps: [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000],
    })
    expect(computeBehavioralDetection(signals)).toEqual({ detection_method: 'behavioral' })
  })

  it('does not detect when mouse-move-to-click ratio is sufficient', () => {
    const signals = baseSignals({
      clickCount: 10,
      mouseMoveCount: 25,
      clickTimestamps: [100, 300, 450, 700, 850, 1100, 1400, 1500, 1800, 2200],
    })
    expect(computeBehavioralDetection(signals)).toBeUndefined()
  })

  it('detects metronomic click timing (low CV)', () => {
    const timestamps: number[] = []
    for (let i = 0; i < 10; i++) {
      timestamps.push(1000 + i * 500)
    }
    const signals = baseSignals({
      clickCount: 10,
      mouseMoveCount: 30,
      clickTimestamps: timestamps,
    })
    expect(computeBehavioralDetection(signals)).toEqual({ detection_method: 'behavioral' })
  })

  it('does not detect when click timing has high variance', () => {
    const timestamps = [100, 350, 800, 900, 1500, 1550, 2300, 2400, 3500, 3600]
    const signals = baseSignals({
      clickCount: 10,
      mouseMoveCount: 30,
      clickTimestamps: timestamps,
    })
    expect(computeBehavioralDetection(signals)).toBeUndefined()
  })

  it('returns undefined when click count is below threshold', () => {
    const signals = baseSignals({
      clickCount: 5,
      mouseMoveCount: 0,
      clickTimestamps: [100, 200, 300, 400, 500],
    })
    expect(computeBehavioralDetection(signals)).toBeUndefined()
  })
})

describe('createBehavioralAnalyzer', () => {
  afterEach(() => {
    setAiAgentBehaviorCallback(undefined as any)
  })

  it('returns undefined when no callback is set', () => {
    expect(createBehavioralAnalyzer()).toBeUndefined()
  })

  it('counts mouse move records', () => {
    const callback = jasmine.createSpy()
    setAiAgentBehaviorCallback(callback)
    const analyzer = createBehavioralAnalyzer()!

    for (let i = 0; i < 5; i++) {
      analyzer.processRecord(makeMouseMoveRecord(1000 + i * 100))
    }
    expect(callback).not.toHaveBeenCalled()
  })

  it('counts click records and triggers analysis at threshold', () => {
    const callback = jasmine.createSpy()
    setAiAgentBehaviorCallback(callback)
    const analyzer = createBehavioralAnalyzer()!

    for (let i = 0; i < 10; i++) {
      analyzer.processRecord(makeClickRecord(1000 + i * 100))
    }
    expect(callback).toHaveBeenCalledWith({ detection_method: 'behavioral' })
  })

  it('counts input records towards total interactions', () => {
    const callback = jasmine.createSpy()
    setAiAgentBehaviorCallback(callback)
    const analyzer = createBehavioralAnalyzer()!

    for (let i = 0; i < 10; i++) {
      analyzer.processRecord(makeInputRecord(1000 + i * 100))
    }
    // No clicks → no detection
    expect(callback).not.toHaveBeenCalled()
  })

  it('counts scroll and context menu records', () => {
    const callback = jasmine.createSpy()
    setAiAgentBehaviorCallback(callback)
    const analyzer = createBehavioralAnalyzer()!

    analyzer.processRecord(makeScrollRecord(1000))
    analyzer.processRecord(makeContextMenuRecord(2000))
    expect(callback).not.toHaveBeenCalled()
  })

  it('ignores non-incremental-snapshot records', () => {
    const callback = jasmine.createSpy()
    setAiAgentBehaviorCallback(callback)
    const analyzer = createBehavioralAnalyzer()!

    for (let i = 0; i < 20; i++) {
      analyzer.processRecord(makeFullSnapshotRecord(1000 + i * 100))
    }
    expect(callback).not.toHaveBeenCalled()
  })

  it('does not call callback more than once after detection', () => {
    const callback = jasmine.createSpy()
    setAiAgentBehaviorCallback(callback)
    const analyzer = createBehavioralAnalyzer()!

    for (let i = 0; i < 20; i++) {
      analyzer.processRecord(makeClickRecord(1000 + i * 100))
    }
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('does not trigger detection when mouse moves are sufficient', () => {
    const callback = jasmine.createSpy()
    setAiAgentBehaviorCallback(callback)
    const analyzer = createBehavioralAnalyzer()!

    for (let i = 0; i < 30; i++) {
      analyzer.processRecord(makeMouseMoveRecord(1000 + i * 50))
    }
    const timestamps = [100, 350, 800, 900, 1500, 1550, 2300, 2400, 3500, 3600]
    for (let i = 0; i < 10; i++) {
      analyzer.processRecord(makeClickRecord(timestamps[i]))
    }
    expect(callback).not.toHaveBeenCalled()
  })
})
