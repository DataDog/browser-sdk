import type { BrowserRecord } from '../../types'
import { RecordType, IncrementalSource, MouseInteractionType } from '../../types'
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

function makeTouchMoveRecord(timestamp: number): BrowserRecord {
  return {
    type: RecordType.IncrementalSnapshot,
    timestamp,
    data: { source: IncrementalSource.TouchMove, positions: [] },
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
    touchMoveCount: 0,
    clickCount: 0,
    scrollCount: 0,
    inputCount: 0,
    clickTimestamps: [],
    interactionTimestamps: [],
    ...overrides,
  }
}

describe('computeBehavioralDetection', () => {
  it('returns undefined when total interactions are below threshold', () => {
    expect(computeBehavioralDetection(baseSignals({ inputCount: 5 }))).toBeUndefined()
  })

  it('detects activity without any physical presence (inputs only)', () => {
    expect(computeBehavioralDetection(baseSignals({ inputCount: 10, interactionTimestamps: [] }))).toEqual(
      jasmine.objectContaining({ detection_method: 'behavioral' })
    )
  })

  it('detects activity without any physical presence (scrolls only)', () => {
    expect(computeBehavioralDetection(baseSignals({ scrollCount: 10, interactionTimestamps: [] }))).toEqual(
      jasmine.objectContaining({ detection_method: 'behavioral' })
    )
  })

  it('detects activity without any physical presence (mixed inputs and scrolls)', () => {
    expect(
      computeBehavioralDetection(baseSignals({ inputCount: 6, scrollCount: 5, interactionTimestamps: [] }))
    ).toEqual(jasmine.objectContaining({ detection_method: 'behavioral' }))
  })

  it('does not detect when mouse movement is present with inputs', () => {
    const signals = baseSignals({
      inputCount: 10,
      mouseMoveCount: 5,
      interactionTimestamps: [100, 350, 800, 900, 1500, 1550, 2300, 2400, 3500, 3600],
    })
    expect(computeBehavioralDetection(signals)).toBeUndefined()
  })

  it('does not detect when touch movement is present with inputs', () => {
    const signals = baseSignals({
      inputCount: 10,
      touchMoveCount: 3,
      interactionTimestamps: [100, 350, 800, 900, 1500, 1550, 2300, 2400, 3500, 3600],
    })
    expect(computeBehavioralDetection(signals)).toBeUndefined()
  })

  it('detects low mouse-move-to-click ratio', () => {
    const signals = baseSignals({
      clickCount: 10,
      mouseMoveCount: 5,
      clickTimestamps: [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000],
      interactionTimestamps: [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000],
    })
    expect(computeBehavioralDetection(signals)).toEqual(jasmine.objectContaining({ detection_method: 'behavioral' }))
  })

  it('does not detect when mouse-move-to-click ratio is sufficient', () => {
    const signals = baseSignals({
      clickCount: 10,
      mouseMoveCount: 25,
      clickTimestamps: [100, 300, 450, 700, 850, 1100, 1400, 1500, 1800, 2200],
      interactionTimestamps: [100, 300, 450, 700, 850, 1100, 1400, 1500, 1800, 2200],
    })
    expect(computeBehavioralDetection(signals)).toBeUndefined()
  })

  it('detects metronomic interaction timing', () => {
    const timestamps: number[] = []
    for (let i = 0; i < 10; i++) {
      timestamps.push(1000 + i * 500)
    }
    const signals = baseSignals({
      inputCount: 10,
      mouseMoveCount: 5,
      interactionTimestamps: timestamps,
    })
    expect(computeBehavioralDetection(signals)).toEqual(jasmine.objectContaining({ detection_method: 'behavioral' }))
  })

  it('does not detect when interaction timing has high variance', () => {
    const timestamps = [100, 350, 800, 900, 1500, 1550, 2300, 2400, 3500, 3600]
    const signals = baseSignals({
      inputCount: 10,
      mouseMoveCount: 5,
      interactionTimestamps: timestamps,
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

  it('detects programmatic inputs with no physical presence', () => {
    const callback = jasmine.createSpy()
    setAiAgentBehaviorCallback(callback)
    const analyzer = createBehavioralAnalyzer()!

    for (let i = 0; i < 10; i++) {
      analyzer.processRecord(makeInputRecord(1000 + i * 200))
    }
    expect(callback).toHaveBeenCalledWith(jasmine.objectContaining({ detection_method: 'behavioral' }))
  })

  it('detects programmatic scrolls with no physical presence', () => {
    const callback = jasmine.createSpy()
    setAiAgentBehaviorCallback(callback)
    const analyzer = createBehavioralAnalyzer()!

    for (let i = 0; i < 10; i++) {
      analyzer.processRecord(makeScrollRecord(1000 + i * 200))
    }
    expect(callback).toHaveBeenCalledWith(jasmine.objectContaining({ detection_method: 'behavioral' }))
  })

  it('does not detect when mouse moves accompany inputs', () => {
    const callback = jasmine.createSpy()
    setAiAgentBehaviorCallback(callback)
    const analyzer = createBehavioralAnalyzer()!

    const irregularTimestamps = [100, 350, 800, 900, 1500, 1550, 2300, 2400, 3500, 3600]
    for (let i = 0; i < 10; i++) {
      analyzer.processRecord(makeMouseMoveRecord(irregularTimestamps[i] - 50))
      analyzer.processRecord(makeInputRecord(irregularTimestamps[i]))
    }
    expect(callback).not.toHaveBeenCalled()
  })

  it('does not detect when touch moves accompany inputs', () => {
    const callback = jasmine.createSpy()
    setAiAgentBehaviorCallback(callback)
    const analyzer = createBehavioralAnalyzer()!

    const irregularTimestamps = [100, 350, 800, 900, 1500, 1550, 2300, 2400, 3500, 3600]
    for (let i = 0; i < 10; i++) {
      analyzer.processRecord(makeTouchMoveRecord(irregularTimestamps[i] - 50))
      analyzer.processRecord(makeInputRecord(irregularTimestamps[i]))
    }
    expect(callback).not.toHaveBeenCalled()
  })

  it('detects clicks with no mouse movement', () => {
    const callback = jasmine.createSpy()
    setAiAgentBehaviorCallback(callback)
    const analyzer = createBehavioralAnalyzer()!

    for (let i = 0; i < 10; i++) {
      analyzer.processRecord(makeClickRecord(1000 + i * 100))
    }
    expect(callback).toHaveBeenCalledWith(jasmine.objectContaining({ detection_method: 'behavioral' }))
  })

  it('does not trigger detection when mouse moves are sufficient for clicks', () => {
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
      analyzer.processRecord(makeInputRecord(1000 + i * 100))
    }
    expect(callback).toHaveBeenCalledTimes(1)
  })
})
