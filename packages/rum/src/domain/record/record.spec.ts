import { DefaultPrivacyLevel, isIE, updateExperimentalFeatures } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { LifeCycle } from '@datadog/browser-rum-core'
import type { Clock } from '../../../../core/test/specHelper'
import { createNewEvent } from '../../../../core/test/specHelper'
import { collectAsyncCalls, recordsPerFullSnapshot } from '../../../test/utils'
import type {
  BrowserIncrementalSnapshotRecord,
  BrowserMutationData,
  BrowserRecord,
  ElementNode,
  FocusRecord,
} from '../../types'
import { RecordType, IncrementalSource } from '../../types'
import type { RecordAPI } from './record'
import { record } from './record'

describe('record', () => {
  let sandbox: HTMLElement
  let recordApi: RecordAPI
  let emitSpy: jasmine.Spy<(record: BrowserRecord) => void>
  let waitEmitCalls: (expectedCallsCount: number, callback: () => void) => void
  let expectNoExtraEmitCalls: (done: () => void) => void
  let clock: Clock | undefined

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }

    emitSpy = jasmine.createSpy()
    ;({ waitAsyncCalls: waitEmitCalls, expectNoExtraAsyncCall: expectNoExtraEmitCalls } = collectAsyncCalls(emitSpy))
    sandbox = createDOMSandbox()
  })

  afterEach(() => {
    clock?.cleanup()
    sandbox.remove()
    recordApi?.stop()
  })

  it('captures stylesheet rules', (done) => {
    const styleElement = document.createElement('style')
    sandbox.appendChild(styleElement)

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

    waitEmitCalls(recordsPerFullSnapshot() + 6, () => {
      const records = getEmittedRecords()
      let i = 0

      expect(records[i++].type).toEqual(RecordType.Meta)
      expect(records[i++].type).toEqual(RecordType.Focus)
      expect(records[i++].type).toEqual(RecordType.FullSnapshot)

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

      expectNoExtraEmitCalls(done)
    })
  })

  it('flushes pending mutation records before taking a full snapshot', (done) => {
    startRecording()

    sandbox.appendChild(document.createElement('div'))

    recordApi.takeSubsequentFullSnapshot()

    waitEmitCalls(1 + 2 * recordsPerFullSnapshot(), () => {
      const records = getEmittedRecords()
      let i = 0

      expect(records[i++].type).toEqual(RecordType.Meta)
      expect(records[i++].type).toEqual(RecordType.Focus)
      expect(records[i++].type).toEqual(RecordType.FullSnapshot)

      if (window.visualViewport) {
        expect(records[i++].type).toEqual(RecordType.VisualViewport)
      }
      expect(records[i].type).toEqual(RecordType.IncrementalSnapshot)
      expect((records[i++] as BrowserIncrementalSnapshotRecord).data.source).toEqual(IncrementalSource.Mutation)
      expect(records[i++].type).toEqual(RecordType.Meta)
      expect(records[i++].type).toEqual(RecordType.Focus)
      expect(records[i++].type).toEqual(RecordType.FullSnapshot)

      expectNoExtraEmitCalls(done)
    })
  })

  describe('Focus records', () => {
    let hasFocus: boolean

    beforeEach(() => {
      hasFocus = true
      spyOn(Document.prototype, 'hasFocus').and.callFake(() => hasFocus)
    })

    it('adds an initial Focus record when starting to record', () => {
      startRecording()
      expect(getEmittedRecords()[1]).toEqual({
        type: RecordType.Focus,
        timestamp: jasmine.any(Number),
        data: {
          has_focus: true,
        },
      })
    })

    it('adds a Focus record on focus', () => {
      startRecording()
      emitSpy.calls.reset()

      window.dispatchEvent(createNewEvent('focus'))
      expect(getEmittedRecords()[0].type).toBe(RecordType.Focus)
    })

    it('adds a Focus record on blur', () => {
      startRecording()
      emitSpy.calls.reset()

      window.dispatchEvent(createNewEvent('blur'))
      expect(getEmittedRecords()[0].type).toBe(RecordType.Focus)
    })

    it('adds a Focus record on when taking a full snapshot', () => {
      startRecording()
      emitSpy.calls.reset()

      recordApi.takeSubsequentFullSnapshot()
      expect(getEmittedRecords()[1].type).toBe(RecordType.Focus)
    })

    it('set has_focus to true if the document has the focus', () => {
      hasFocus = true
      startRecording()
      expect((getEmittedRecords()[1] as FocusRecord).data.has_focus).toBe(true)
    })

    it("set has_focus to false if the document doesn't have the focus", () => {
      hasFocus = false
      startRecording()
      expect((getEmittedRecords()[1] as FocusRecord).data.has_focus).toBe(false)
    })
  })

  describe('Adding shadow dom', () => {
    let sandbox: HTMLElement

    beforeEach(() => {
      sandbox = document.createElement('div')
      sandbox.id = 'sandbox'
      document.body.appendChild(sandbox)
    })

    afterEach(() => {
      sandbox.remove()
    })

    it('should record mutation inside a shadow root', () => {
      updateExperimentalFeatures(['recordShadowDom'])
      startRecording()
      expect(getEmittedRecords().length).toBe(recordsPerFullSnapshot())

      // add shadow DOM
      const host = document.createElement('div')
      const shadowRoot = host.attachShadow({ mode: 'open' })
      const div = document.createElement('div')
      div.className = 'toto'
      shadowRoot.appendChild(div)
      sandbox.append(host)
      recordApi.flushMutations()
      expect(getEmittedRecords().length).toBe(recordsPerFullSnapshot() + 1)
      const hostMutation = getEmittedRecords()[recordsPerFullSnapshot()] as BrowserIncrementalSnapshotRecord
      expect(hostMutation.type).toBe(RecordType.IncrementalSnapshot)
      expect(hostMutation.data.source).toBe(IncrementalSource.Mutation)
      const hostMutationData = hostMutation.data as BrowserMutationData
      expect(hostMutationData.adds.length).toBe(1)
      const hostNode = hostMutationData.adds[0].node as ElementNode
      expect(hostNode.isShadowHost).toBe(true)

      // inner mutation
      div.className = 'titi'
      recordApi.flushMutations()
      expect(getEmittedRecords().length).toBe(recordsPerFullSnapshot() + 2)
      const innerMutation = getEmittedRecords()[recordsPerFullSnapshot() + 1] as BrowserIncrementalSnapshotRecord
      expect(innerMutation.type).toBe(RecordType.IncrementalSnapshot)
      expect(innerMutation.data.source).toBe(IncrementalSource.Mutation)
      const innerMutationData = innerMutation.data as BrowserMutationData
      expect(innerMutationData.attributes.length).toBe(1)
      expect(innerMutationData.attributes[0].attributes.class).toBe('titi')
    })

    it('should record the change event inside a shadow root', () => {
      updateExperimentalFeatures(['recordShadowDom'])
      startRecording()
      expect(getEmittedRecords().length).toBe(recordsPerFullSnapshot())

      // add shadow DOM
      const host = document.createElement('div')
      const shadowRoot = host.attachShadow({ mode: 'open' })
      const radio = document.createElement('input')
      radio.setAttribute('type', 'radio')
      shadowRoot.appendChild(radio)
      sandbox.append(host)
      recordApi.flushMutations()
      expect(getEmittedRecords().length).toBe(recordsPerFullSnapshot() + 1)
      const hostMutation = getEmittedRecords()[recordsPerFullSnapshot()] as BrowserIncrementalSnapshotRecord
      expect(hostMutation.type).toBe(RecordType.IncrementalSnapshot)
      expect(hostMutation.data.source).toBe(IncrementalSource.Mutation)
      const hostMutationData = hostMutation.data as BrowserMutationData
      expect(hostMutationData.adds.length).toBe(1)
      const hostNode = hostMutationData.adds[0].node as ElementNode
      expect(hostNode.isShadowHost).toBe(true)

      // inner mutation
      radio.checked = true
      radio.dispatchEvent(createNewEvent('change', { target: radio, composed: false }))
      recordApi.flushMutations()
      expect(getEmittedRecords().length).toBe(recordsPerFullSnapshot() + 2)
      const innerMutation = getEmittedRecords()[recordsPerFullSnapshot() + 1] as BrowserIncrementalSnapshotRecord
      expect(innerMutation.type).toBe(RecordType.IncrementalSnapshot)
      expect(innerMutation.data.source).toBe(IncrementalSource.Input)
      const innerMutationData = innerMutation.data as { isChecked: boolean }
      expect(innerMutationData.isChecked).toBe(true)
    })
  })

  function startRecording() {
    recordApi = record({
      emit: emitSpy,
      configuration: { defaultPrivacyLevel: DefaultPrivacyLevel.ALLOW } as RumConfiguration,
      lifeCycle: new LifeCycle(),
    })
  }

  function getEmittedRecords() {
    return emitSpy.calls.allArgs().map(([record]) => record)
  }
})

function createDOMSandbox() {
  const sandbox = document.createElement('div')
  sandbox.id = 'sandbox'
  document.body.appendChild(sandbox)
  return sandbox
}
