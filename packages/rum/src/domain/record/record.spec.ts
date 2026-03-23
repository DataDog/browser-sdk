import { DefaultPrivacyLevel, findLast, noop } from '@datadog/browser-core'
import type { RumConfiguration, ViewCreatedEvent } from '@datadog/browser-rum-core'
import { LifeCycle, LifeCycleEventType } from '@datadog/browser-rum-core'
import { createNewEvent, collectAsyncCalls, registerCleanupTask } from '@datadog/browser-core/test'
import { recordsPerFullSnapshot, createRumFrustrationEvent } from '../../../test'
import type {
  AddNodeChange,
  BrowserChangeRecord,
  BrowserIncrementalSnapshotRecord,
  BrowserMutationData,
  BrowserRecord,
  Change,
  ScrollData,
} from '../../types'
import { RecordType, IncrementalSource, ChangeType } from '../../types'
import { appendElement } from '../../../../rum-core/test'
import { getReplayStats } from '../replayStats'
import type { RecordAPI } from './record'
import { record } from './record'
import type { EmitRecordCallback } from './record.types'
import { createChangeDecoder } from './serialization'

describe('record', () => {
  let recordApi: RecordAPI
  let lifeCycle: LifeCycle
  let emitSpy: jasmine.Spy<EmitRecordCallback>
  const FAKE_VIEW_ID = '123'

  beforeEach(() => {
    emitSpy = jasmine.createSpy()

    registerCleanupTask(() => {
      recordApi?.stop()
    })
  })

  it('captures stylesheet rules', async () => {
    const styleElement = appendElement('<style></style>') as HTMLStyleElement

    startRecording()

    const styleSheet = styleElement.sheet as CSSStyleSheet
    const ruleIdx0 = styleSheet.insertRule('body { background: #000; }')
    const ruleIdx1 = styleSheet.insertRule('body { background: #111; }')
    styleSheet.deleteRule(ruleIdx1)
    setTimeout(() => {
      styleSheet.insertRule('body { color: #fff; }')
    }, 0)
    setTimeout(() => {
      styleSheet.deleteRule(ruleIdx0)
    }, 5)
    setTimeout(() => {
      styleSheet.insertRule('body { color: #ccc; }')
    }, 10)

    await collectAsyncCalls(emitSpy, recordsPerFullSnapshot() + 6)

    const records = getEmittedRecords()
    let i = 0

    expect(records[i++].type).toEqual(RecordType.Meta)
    expect(records[i++].type).toEqual(RecordType.Focus)
    expect(records[i++].type).toEqual(RecordType.Change)

    if (window.visualViewport) {
      expect(records[i++].type).toEqual(RecordType.VisualViewport)
    }

    expect(records[i].type).toEqual(RecordType.IncrementalSnapshot)
    expect((records[i++] as BrowserIncrementalSnapshotRecord).data).toEqual(
      jasmine.objectContaining({
        source: IncrementalSource.StyleSheetRule,
        adds: [{ rule: 'body { background: #000; }', index: undefined }],
      })
    )
    expect(records[i].type).toEqual(RecordType.IncrementalSnapshot)
    expect((records[i++] as BrowserIncrementalSnapshotRecord).data).toEqual(
      jasmine.objectContaining({
        source: IncrementalSource.StyleSheetRule,
        adds: [{ rule: 'body { background: #111; }', index: undefined }],
      })
    )
    expect(records[i].type).toEqual(RecordType.IncrementalSnapshot)
    expect((records[i++] as BrowserIncrementalSnapshotRecord).data).toEqual(
      jasmine.objectContaining({
        source: IncrementalSource.StyleSheetRule,
        removes: [{ index: 0 }],
      })
    )
    expect(records[i].type).toEqual(RecordType.IncrementalSnapshot)
    expect((records[i++] as BrowserIncrementalSnapshotRecord).data).toEqual(
      jasmine.objectContaining({
        source: IncrementalSource.StyleSheetRule,
        adds: [{ rule: 'body { color: #fff; }', index: undefined }],
      })
    )
    expect(records[i].type).toEqual(RecordType.IncrementalSnapshot)
    expect((records[i++] as BrowserIncrementalSnapshotRecord).data).toEqual(
      jasmine.objectContaining({
        source: IncrementalSource.StyleSheetRule,
        removes: [{ index: 0 }],
      })
    )
    expect(records[i].type).toEqual(RecordType.IncrementalSnapshot)
    expect((records[i++] as BrowserIncrementalSnapshotRecord).data).toEqual(
      jasmine.objectContaining({
        source: IncrementalSource.StyleSheetRule,
        adds: [{ rule: 'body { color: #ccc; }', index: undefined }],
      })
    )
  })

  it('flushes pending mutation records before taking a full snapshot', async () => {
    startRecording()

    appendElement('<hr/>')

    // trigger full snapshot by starting a new view
    newView()

    await collectAsyncCalls(emitSpy, 1 + 2 * recordsPerFullSnapshot())

    const records = getEmittedRecords()
    let i = 0

    expect(records[i++].type).toEqual(RecordType.Meta)
    expect(records[i++].type).toEqual(RecordType.Focus)
    expect(records[i++].type).toEqual(RecordType.Change)

    if (window.visualViewport) {
      expect(records[i++].type).toEqual(RecordType.VisualViewport)
    }
    expect(records[i].type).toEqual(RecordType.Change)
    expect((records[i++] as BrowserChangeRecord).data.map((change) => change[0])).toContain(ChangeType.AddNode)
    expect(records[i++].type).toEqual(RecordType.Meta)
    expect(records[i++].type).toEqual(RecordType.Focus)
    expect(records[i++].type).toEqual(RecordType.Change)
  })

  describe('Shadow dom', () => {
    it('should record a simple mutation inside a shadow root', () => {
      const element = appendElement('<hr class="toto" />', createShadow())
      startRecording()
      expect(getEmittedRecordCount()).toBe(recordsPerFullSnapshot())

      element.className = 'titi'

      recordApi.flushMutations()
      expect(getEmittedRecordCount()).toBe(recordsPerFullSnapshot() + 1)
      const [, ...attributeMutations] = getLastChangeOfType(ChangeType.Attribute, getEmittedRecords())
      expect(attributeMutations[0][1]).toEqual(['class', 'titi'])
    })

    it('should record a direct removal inside a shadow root', () => {
      const element = appendElement('<hr/>', createShadow())
      startRecording()
      expect(getEmittedRecordCount()).toBe(recordsPerFullSnapshot())

      element.remove()
      recordApi.flushMutations()
      expect(getEmittedRecordCount()).toBe(recordsPerFullSnapshot() + 1)

      const records = getEmittedRecords()
      const horizontalRuleId = findNodeId(records, (change) => change[1] === 'HR')
      const [, ...removeMutations] = getLastChangeOfType(ChangeType.RemoveNode, records)
      expect(removeMutations.length).toBe(1)
      expect(removeMutations[0]).toBe(horizontalRuleId)
    })

    it('should record a direct addition inside a shadow root', () => {
      const shadowRoot = createShadow()
      appendElement('<hr/>', shadowRoot)
      startRecording()
      expect(getEmittedRecordCount()).toBe(recordsPerFullSnapshot())

      appendElement('<span></span>', shadowRoot)
      recordApi.flushMutations()
      expect(getEmittedRecordCount()).toBe(recordsPerFullSnapshot() + 1)

      const records = getEmittedRecords()
      const [, ...addMutations] = getLastChangeOfType(ChangeType.AddNode, records)
      expect(addMutations.length).toBe(1)
      expect(addMutations[0][1]).toBe('SPAN')
    })

    it('should record mutation inside a shadow root added after the FS', () => {
      startRecording()
      expect(getEmittedRecordCount()).toBe(recordsPerFullSnapshot())

      // shadow DOM mutation
      const span = appendElement('<span class="toto"></span>', createShadow())
      recordApi.flushMutations()
      expect(getEmittedRecordCount()).toBe(recordsPerFullSnapshot() + 1)

      const [, ...addMutations] = getLastChangeOfType(ChangeType.AddNode, getEmittedRecords())
      expect(addMutations.length).toBe(3)
      expect(addMutations[0][1]).toBe('DIV')
      expect(addMutations[1][1]).toBe('#shadow-root')
      expect(addMutations[2][1]).toBe('SPAN')

      // inner mutation
      span.className = 'titi'
      recordApi.flushMutations()
      expect(getEmittedRecordCount()).toBe(recordsPerFullSnapshot() + 2)

      const [, ...attributeMutations] = getLastChangeOfType(ChangeType.Attribute, getEmittedRecords())
      expect(attributeMutations[0][1]).toEqual(['class', 'titi'])
    })

    it('should record the change event inside a shadow root', () => {
      const radio = appendElement('<input type="radio"/>', createShadow()) as HTMLInputElement
      startRecording()
      expect(getEmittedRecordCount()).toBe(recordsPerFullSnapshot())

      // inner mutation
      radio.checked = true
      radio.dispatchEvent(createNewEvent('change', { target: radio, composed: false }))

      recordApi.flushMutations()

      const innerMutationData = getLastIncrementalSnapshotData<BrowserMutationData & { isChecked: boolean }>(
        getEmittedRecords(),
        IncrementalSource.Input
      )
      expect(innerMutationData.isChecked).toBe(true)
    })

    it('should record the change event inside a shadow root only once, regardless if the DOM is serialized multiple times', () => {
      const radio = appendElement('<input type="radio"/>', createShadow()) as HTMLInputElement
      startRecording()

      // trigger full snapshot by starting a new view
      newView()

      radio.checked = true
      radio.dispatchEvent(createNewEvent('change', { target: radio, composed: false }))

      const inputRecords = getEmittedRecords().filter(
        (record) => record.type === RecordType.IncrementalSnapshot && record.data.source === IncrementalSource.Input
      )

      expect(inputRecords.length).toBe(1)
    })

    it('should record the scroll event inside a shadow root', () => {
      const div = appendElement('<div unique-selector="enabled"></div>', createShadow()) as HTMLDivElement
      startRecording()
      expect(getEmittedRecordCount()).toBe(recordsPerFullSnapshot())

      div.dispatchEvent(createNewEvent('scroll', { target: div, composed: false }))

      recordApi.flushMutations()

      const scrollRecords = getEmittedRecords().filter(
        (record) => record.type === RecordType.IncrementalSnapshot && record.data.source === IncrementalSource.Scroll
      )
      expect(scrollRecords.length).toBe(1)

      const records = getEmittedRecords()
      const scrollableNodeId = findNodeId(records, (change) => {
        const [, , ...attributes]: AddNodeChange = change
        return attributes.some(
          (attribute) => Array.isArray(attribute) && attribute[0] === 'unique-selector' && attribute[1] === 'enabled'
        )
      })

      const scrollData = getLastIncrementalSnapshotData<ScrollData>(getEmittedRecords(), IncrementalSource.Scroll)
      expect(scrollData.id).toBe(scrollableNodeId)
    })

    it('should clean the state once the shadow dom is removed to avoid memory leak', () => {
      const shadowRoot = createShadow()
      appendElement('<div class="toto"></div>', shadowRoot)
      startRecording()
      spyOn(recordApi.shadowRootsController, 'removeShadowRoot')

      expect(getEmittedRecordCount()).toBe(recordsPerFullSnapshot())
      expect(recordApi.shadowRootsController.removeShadowRoot).toHaveBeenCalledTimes(0)

      shadowRoot.host.remove()
      recordApi.flushMutations()
      expect(recordApi.shadowRootsController.removeShadowRoot).toHaveBeenCalledTimes(1)
      expect(getEmittedRecordCount()).toBe(recordsPerFullSnapshot() + 1)

      const records = getEmittedRecords()
      const [, ...removeMutations] = getLastChangeOfType(ChangeType.RemoveNode, records)
      expect(removeMutations.length).toBe(1)
    })

    it('should clean the state when both the parent and the shadow host is removed to avoid memory leak', () => {
      const host = appendElement(`
      <div id="grand-parent">
        <div id="parent">
          <div class="host" target></div>
        </div>
      </div>`)
      host.attachShadow({ mode: 'open' })
      const parent = host.parentElement!
      const grandParent = parent.parentElement!
      appendElement('<div></div>', host.shadowRoot!)

      startRecording()
      spyOn(recordApi.shadowRootsController, 'removeShadowRoot')
      expect(getEmittedRecordCount()).toBe(recordsPerFullSnapshot())
      expect(recordApi.shadowRootsController.removeShadowRoot).toHaveBeenCalledTimes(0)

      parent.remove()
      grandParent.remove()
      recordApi.flushMutations()
      expect(recordApi.shadowRootsController.removeShadowRoot).toHaveBeenCalledTimes(1)
      expect(getEmittedRecordCount()).toBe(recordsPerFullSnapshot() + 1)

      const records = getEmittedRecords()
      const [, ...removeMutations] = getLastChangeOfType(ChangeType.RemoveNode, records)
      expect(removeMutations.length).toBe(2)
    })

    function createShadow() {
      const host = appendElement('<div></div>')
      const shadowRoot = host.attachShadow({ mode: 'open' })
      return shadowRoot
    }
  })

  describe('updates record replay stats', () => {
    it('when recording new records', () => {
      startRecording()

      const records = getEmittedRecords()
      expect(getReplayStats(FAKE_VIEW_ID)?.records_count).toEqual(records.length)
    })
  })

  describe('should collect records', () => {
    let div: HTMLDivElement
    let input: HTMLInputElement
    let audio: HTMLAudioElement
    beforeEach(() => {
      div = appendElement('<div target></div>') as HTMLDivElement
      input = appendElement('<input target />') as HTMLInputElement
      audio = appendElement('<audio controls autoplay target></audio>') as HTMLAudioElement
      startRecording()
      emitSpy.calls.reset()
    })

    it('move', () => {
      document.body.dispatchEvent(createNewEvent('mousemove', { clientX: 1, clientY: 2 }))
      expect(getEmittedRecords()[0].type).toBe(RecordType.IncrementalSnapshot)
      expect((getEmittedRecords()[0] as BrowserIncrementalSnapshotRecord).data.source).toBe(IncrementalSource.MouseMove)
    })

    it('interaction', () => {
      document.body.dispatchEvent(createNewEvent('click', { clientX: 1, clientY: 2 }))
      expect((getEmittedRecords()[0] as BrowserIncrementalSnapshotRecord).data.source).toBe(
        IncrementalSource.MouseInteraction
      )
    })

    it('scroll', () => {
      div.dispatchEvent(createNewEvent('scroll', { target: div }))

      expect(getEmittedRecords()[0].type).toBe(RecordType.IncrementalSnapshot)
      expect((getEmittedRecords()[0] as BrowserIncrementalSnapshotRecord).data.source).toBe(IncrementalSource.Scroll)
    })

    it('viewport resize', () => {
      window.dispatchEvent(createNewEvent('resize'))

      expect(getEmittedRecords()[0].type).toBe(RecordType.IncrementalSnapshot)
      expect((getEmittedRecords()[0] as BrowserIncrementalSnapshotRecord).data.source).toBe(
        IncrementalSource.ViewportResize
      )
    })

    it('input', () => {
      input.value = 'newValue'
      input.dispatchEvent(createNewEvent('input', { target: input }))

      expect(getEmittedRecords()[0].type).toBe(RecordType.IncrementalSnapshot)
      expect((getEmittedRecords()[0] as BrowserIncrementalSnapshotRecord).data.source).toBe(IncrementalSource.Input)
    })

    it('media interaction', () => {
      audio.dispatchEvent(createNewEvent('play', { target: audio }))

      expect(getEmittedRecords()[0].type).toBe(RecordType.IncrementalSnapshot)
      expect((getEmittedRecords()[0] as BrowserIncrementalSnapshotRecord).data.source).toBe(
        IncrementalSource.MediaInteraction
      )
    })

    it('focus', () => {
      window.dispatchEvent(createNewEvent('blur'))

      expect(getEmittedRecords()[0].type).toBe(RecordType.Focus)
    })

    it('visual viewport resize', () => {
      if (!window.visualViewport) {
        pending('visualViewport not supported')
      }

      visualViewport!.dispatchEvent(createNewEvent('resize'))
      expect(getEmittedRecords()[0].type).toBe(RecordType.VisualViewport)
    })

    it('frustration', () => {
      lifeCycle.notify(
        LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
        createRumFrustrationEvent(new MouseEvent('pointerup'))
      )

      expect(getEmittedRecords()[0].type).toBe(RecordType.FrustrationRecord)
    })

    it('view end event', () => {
      lifeCycle.notify(LifeCycleEventType.VIEW_ENDED, {} as any)

      expect(getEmittedRecords()[0].type).toBe(RecordType.ViewEnd)
    })
  })

  function startRecording() {
    lifeCycle = new LifeCycle()
    recordApi = record({
      emitRecord: emitSpy,
      emitStats: noop,
      configuration: { defaultPrivacyLevel: DefaultPrivacyLevel.ALLOW } as RumConfiguration,
      lifeCycle,
      viewHistory: {
        findView: () => ({ id: FAKE_VIEW_ID, startClocks: {} }),
      } as any,
    })
  }

  function newView() {
    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
      startClocks: { relative: 0, timeStamp: 0 },
    } as ViewCreatedEvent)
  }

  function getEmittedRecordCount(): number {
    return emitSpy.calls.allArgs().length
  }

  function getEmittedRecords(): BrowserRecord[] {
    const changeDecoder = createChangeDecoder()

    const decodedRecords: BrowserRecord[] = []
    for (const [record] of emitSpy.calls.allArgs()) {
      if (record.type === RecordType.Change) {
        decodedRecords.push(changeDecoder.decode(record))
      } else {
        decodedRecords.push(record)
      }
    }

    return decodedRecords
  }
})

export function getLastIncrementalSnapshotData<T extends BrowserIncrementalSnapshotRecord['data']>(
  records: BrowserRecord[],
  source: IncrementalSource
): T {
  const record = findLast(
    records,
    (record): record is BrowserIncrementalSnapshotRecord & { data: T } =>
      record.type === RecordType.IncrementalSnapshot && record.data.source === source
  )
  expect(record).toBeTruthy(`Could not find IncrementalSnapshot/${source} in ${records.length} records`)
  return record!.data
}

function isChangeOfType<T extends ChangeType>(changeType: T, change: Change): change is Extract<Change, [T, ...any[]]> {
  return change[0] === changeType
}

export function getLastChangeOfType<T extends ChangeType>(
  changeType: T,
  records: BrowserRecord[]
): Extract<Change, [T, ...any[]]> {
  for (let i = records.length - 1; i >= 0; i--) {
    const record = records[i]
    if (record.type !== RecordType.Change) {
      continue
    }
    for (const change of record.data) {
      if (isChangeOfType(changeType, change)) {
        return change
      }
    }
  }
  throw new Error(`Could not find Change of type ${changeType} in ${records.length} records`)
}

function findNodeId(records: BrowserRecord[], predicate: (change: AddNodeChange) => boolean): number {
  for (const record of records) {
    if (record.type !== RecordType.Change) {
      continue
    }

    for (const change of record.data) {
      if (!isChangeOfType(ChangeType.AddNode, change)) {
        continue
      }

      const [, ...addMutations] = change
      return addMutations.findIndex(predicate)
    }
  }

  return -1
}
