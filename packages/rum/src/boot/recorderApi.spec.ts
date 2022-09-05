import { isIE, noop } from '@datadog/browser-core'
import type { RecorderApi, ViewContexts, LifeCycle, RumConfiguration } from '@datadog/browser-rum-core'
import { LifeCycleEventType } from '@datadog/browser-rum-core'
import { createNewEvent, deleteEventBridgeStub, initEventBridgeStub } from '../../../core/test/specHelper'
import type { RumSessionManagerMock } from '../../../rum-core/test/mockRumSessionManager'
import { createRumSessionManagerMock } from '../../../rum-core/test/mockRumSessionManager'
import type { TestSetupBuilder } from '../../../rum-core/test/specHelper'
import { setup } from '../../../rum-core/test/specHelper'
import type { DeflateWorker, startDeflateWorker } from '../domain/segmentCollection'
import type { StartRecording } from './recorderApi'
import { makeRecorderApi } from './recorderApi'

describe('makeRecorderApi', () => {
  let setupBuilder: TestSetupBuilder
  let recorderApi: RecorderApi
  let startRecordingSpy: jasmine.Spy<StartRecording>
  let stopRecordingSpy: jasmine.Spy<() => void>
  let startDeflateWorkerSpy: jasmine.Spy<typeof startDeflateWorker>
  const FAKE_WORKER = {} as DeflateWorker

  function startDeflateWorkerWith(worker?: DeflateWorker) {
    if (!startDeflateWorkerSpy) {
      startDeflateWorkerSpy = jasmine.createSpy<typeof startDeflateWorker>('startDeflateWorker')
    }
    startDeflateWorkerSpy.and.callFake((callback) => callback(worker))
  }

  function callLastRegisteredInitialisationCallback() {
    startDeflateWorkerSpy.calls.mostRecent().args[0](FAKE_WORKER)
  }

  function stopDeflateWorker() {
    startDeflateWorkerSpy.and.callFake(noop)
  }

  let rumInit: () => void

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }
    setupBuilder = setup().beforeBuild(({ lifeCycle, sessionManager }) => {
      stopRecordingSpy = jasmine.createSpy('stopRecording')
      startRecordingSpy = jasmine.createSpy('startRecording').and.callFake(() => ({
        stop: stopRecordingSpy,
      }))

      startDeflateWorkerWith(FAKE_WORKER)
      recorderApi = makeRecorderApi(startRecordingSpy, startDeflateWorkerSpy)
      rumInit = () => {
        recorderApi.onRumStart(lifeCycle, {} as RumConfiguration, sessionManager, {} as ViewContexts)
      }
    })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  describe('boot', () => {
    it('does not start recording when init() is called', () => {
      setupBuilder.build()
      expect(startRecordingSpy).not.toHaveBeenCalled()
      rumInit()
      expect(startRecordingSpy).not.toHaveBeenCalled()
    })

    it('does not start recording after the DOM is loaded', () => {
      setupBuilder.build()
      const { triggerOnDomLoaded } = mockDocumentReadyState()
      rumInit()
      expect(startRecordingSpy).not.toHaveBeenCalled()
      triggerOnDomLoaded()
      expect(startRecordingSpy).not.toHaveBeenCalled()
    })
  })

  describe('startSessionReplayRecording()', () => {
    it('ignores calls while recording is already started', () => {
      setupBuilder.build()
      rumInit()
      recorderApi.start()
      recorderApi.start()
      recorderApi.start()
      expect(startRecordingSpy).toHaveBeenCalledTimes(1)
    })

    it('starts recording if called before init()', () => {
      setupBuilder.build()
      recorderApi.start()
      rumInit()
      expect(startRecordingSpy).toHaveBeenCalled()
    })

    it('does not start recording multiple times if restarted before the DOM is loaded', () => {
      setupBuilder.build()
      const { triggerOnDomLoaded } = mockDocumentReadyState()
      rumInit()
      recorderApi.start()
      recorderApi.stop()
      recorderApi.start()
      triggerOnDomLoaded()
      expect(startRecordingSpy).toHaveBeenCalledTimes(1)
    })

    it('ignores calls if the session is not tracked', () => {
      setupBuilder.withSessionManager(createRumSessionManagerMock().setNotTracked()).build()
      rumInit()
      recorderApi.start()
      expect(startRecordingSpy).not.toHaveBeenCalled()
    })

    it('ignores calls if the session plan is LITE', () => {
      setupBuilder.withSessionManager(createRumSessionManagerMock().setLitePlan()).build()
      rumInit()
      recorderApi.start()
      expect(startRecordingSpy).not.toHaveBeenCalled()
    })

    it('do not start recording if worker fails to be instantiated', () => {
      setupBuilder.build()
      rumInit()
      startDeflateWorkerWith(undefined)
      recorderApi.start()
      expect(startRecordingSpy).not.toHaveBeenCalled()
    })

    it('does not start recording multiple times if restarted before worker is initialized', () => {
      setupBuilder.build()
      rumInit()
      stopDeflateWorker()
      recorderApi.start()
      recorderApi.stop()

      callLastRegisteredInitialisationCallback()
      recorderApi.start()
      callLastRegisteredInitialisationCallback()
      expect(startRecordingSpy).toHaveBeenCalledTimes(1)
    })

    describe('if event bridge present', () => {
      beforeEach(() => {
        initEventBridgeStub()
      })

      afterEach(() => {
        deleteEventBridgeStub()
      })

      it('does not start recording', () => {
        setupBuilder.build()
        recorderApi.start()
        rumInit()
        expect(startRecordingSpy).not.toHaveBeenCalled()
      })
    })

    describe('if browser is not supported', () => {
      let originalArrayFrom: typeof Array['from']

      beforeEach(() => {
        originalArrayFrom = Array.from
        delete (Array as any).from
      })

      afterEach(() => {
        Array.from = originalArrayFrom
      })

      it('does not start recording', () => {
        setupBuilder.build()
        recorderApi.start()
        rumInit()
        expect(startRecordingSpy).not.toHaveBeenCalled()
      })
    })
  })

  describe('stopSessionReplayRecording()', () => {
    it('ignores calls while recording is already stopped', () => {
      setupBuilder.build()
      rumInit()
      recorderApi.start()
      recorderApi.stop()
      recorderApi.stop()
      recorderApi.stop()
      expect(stopRecordingSpy).toHaveBeenCalledTimes(1)
    })

    it('does not start recording if called before init()', () => {
      setupBuilder.build()
      recorderApi.start()
      recorderApi.stop()
      rumInit()
      expect(startRecordingSpy).not.toHaveBeenCalled()
    })

    it('prevents recording to start when the DOM is loaded', () => {
      setupBuilder.build()
      const { triggerOnDomLoaded } = mockDocumentReadyState()
      rumInit()
      recorderApi.start()
      recorderApi.stop()
      triggerOnDomLoaded()
      expect(startRecordingSpy).not.toHaveBeenCalled()
    })
  })

  describe('when session renewal change the session plan', () => {
    let sessionManager: RumSessionManagerMock
    let lifeCycle: LifeCycle
    beforeEach(() => {
      sessionManager = createRumSessionManagerMock()
      setupBuilder.withSessionManager(sessionManager)
      ;({ lifeCycle } = setupBuilder.build())
      rumInit()
    })

    describe('from LITE to PREMIUM', () => {
      beforeEach(() => {
        sessionManager.setLitePlan()
      })

      it('starts recording if startSessionReplayRecording was called', () => {
        recorderApi.start()
        sessionManager.setPremiumPlan()
        lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
        expect(startRecordingSpy).not.toHaveBeenCalled()
        lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
        expect(startRecordingSpy).toHaveBeenCalled()
        expect(stopRecordingSpy).not.toHaveBeenCalled()
      })

      it('does not starts recording if stopSessionReplayRecording was called', () => {
        recorderApi.start()
        recorderApi.stop()
        sessionManager.setPremiumPlan()
        lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
        lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
        expect(startRecordingSpy).not.toHaveBeenCalled()
      })
    })

    describe('from LITE to untracked', () => {
      beforeEach(() => {
        sessionManager.setLitePlan()
      })

      it('keeps not recording if startSessionReplayRecording was called', () => {
        recorderApi.start()
        sessionManager.setNotTracked()
        lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
        lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
        expect(startRecordingSpy).not.toHaveBeenCalled()
        expect(stopRecordingSpy).not.toHaveBeenCalled()
      })
    })

    describe('from LITE to LITE', () => {
      beforeEach(() => {
        sessionManager.setLitePlan()
      })

      it('keeps not recording if startSessionReplayRecording was called', () => {
        recorderApi.start()
        lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
        lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
        expect(startRecordingSpy).not.toHaveBeenCalled()
        expect(stopRecordingSpy).not.toHaveBeenCalled()
      })
    })

    describe('from PREMIUM to LITE', () => {
      beforeEach(() => {
        sessionManager.setPremiumPlan()
      })

      it('stops recording if startSessionReplayRecording was called', () => {
        recorderApi.start()
        expect(startRecordingSpy).toHaveBeenCalledTimes(1)
        sessionManager.setLitePlan()
        lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
        expect(stopRecordingSpy).toHaveBeenCalled()
        lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
        expect(startRecordingSpy).toHaveBeenCalledTimes(1)
      })

      it('prevents session recording to start if the session is renewed before the DOM is loaded', () => {
        setupBuilder.build()
        const { triggerOnDomLoaded } = mockDocumentReadyState()
        rumInit()
        recorderApi.start()
        sessionManager.setLitePlan()
        lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
        lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
        triggerOnDomLoaded()
        expect(startRecordingSpy).not.toHaveBeenCalled()
      })
    })

    describe('from PREMIUM to untracked', () => {
      beforeEach(() => {
        sessionManager.setPremiumPlan()
      })

      it('stops recording if startSessionReplayRecording was called', () => {
        recorderApi.start()
        expect(startRecordingSpy).toHaveBeenCalledTimes(1)
        sessionManager.setNotTracked()
        lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
        expect(stopRecordingSpy).toHaveBeenCalled()
        lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
        expect(startRecordingSpy).toHaveBeenCalledTimes(1)
      })
    })

    describe('from PREMIUM to PREMIUM', () => {
      beforeEach(() => {
        sessionManager.setPremiumPlan()
      })

      it('keeps recording if startSessionReplayRecording was called', () => {
        recorderApi.start()
        expect(startRecordingSpy).toHaveBeenCalledTimes(1)
        lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
        expect(stopRecordingSpy).toHaveBeenCalled()
        lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
        expect(startRecordingSpy).toHaveBeenCalledTimes(2)
      })

      it('does not starts recording if stopSessionReplayRecording was called', () => {
        recorderApi.start()
        expect(startRecordingSpy).toHaveBeenCalledTimes(1)
        recorderApi.stop()
        expect(stopRecordingSpy).toHaveBeenCalledTimes(1)
        lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
        lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
        expect(startRecordingSpy).toHaveBeenCalledTimes(1)
        expect(stopRecordingSpy).toHaveBeenCalledTimes(1)
      })
    })

    describe('from untracked to REPLAY', () => {
      beforeEach(() => {
        sessionManager.setNotTracked()
      })

      it('starts recording if startSessionReplayRecording was called', () => {
        recorderApi.start()
        sessionManager.setPremiumPlan()
        lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
        lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
        expect(startRecordingSpy).toHaveBeenCalled()
        expect(stopRecordingSpy).not.toHaveBeenCalled()
      })

      it('does not starts recording if stopSessionReplayRecording was called', () => {
        recorderApi.start()
        recorderApi.stop()
        sessionManager.setPremiumPlan()
        lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
        lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
        expect(startRecordingSpy).not.toHaveBeenCalled()
        expect(stopRecordingSpy).not.toHaveBeenCalled()
      })
    })

    describe('from untracked to LITE', () => {
      beforeEach(() => {
        sessionManager.setNotTracked()
      })

      it('keeps not recording if startSessionReplayRecording was called', () => {
        recorderApi.start()
        sessionManager.setLitePlan()
        lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
        lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
        expect(startRecordingSpy).not.toHaveBeenCalled()
        expect(stopRecordingSpy).not.toHaveBeenCalled()
      })
    })

    describe('from untracked to untracked', () => {
      beforeEach(() => {
        sessionManager.setNotTracked()
      })

      it('keeps not recording if startSessionReplayRecording was called', () => {
        recorderApi.start()
        lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
        lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
        expect(startRecordingSpy).not.toHaveBeenCalled()
        expect(stopRecordingSpy).not.toHaveBeenCalled()
      })
    })
  })

  describe('isRecording', () => {
    it('is true only if recording', () => {
      setupBuilder.build()
      rumInit()
      expect(recorderApi.isRecording()).toBeFalse()
      recorderApi.start()
      expect(recorderApi.isRecording()).toBeTrue()
      recorderApi.stop()
      expect(recorderApi.isRecording()).toBeFalse()
    })

    it('is false before the DOM is loaded', () => {
      setupBuilder.build()
      const { triggerOnDomLoaded } = mockDocumentReadyState()
      rumInit()
      expect(recorderApi.isRecording()).toBeFalse()
      recorderApi.start()
      expect(recorderApi.isRecording()).toBeFalse()
      triggerOnDomLoaded()
      expect(recorderApi.isRecording()).toBeTrue()
    })
  })
})

function mockDocumentReadyState() {
  let readyState = 'loading'
  spyOnProperty(Document.prototype, 'readyState', 'get').and.callFake(() => readyState)
  return {
    triggerOnDomLoaded: () => {
      readyState = 'interactive'
      window.dispatchEvent(createNewEvent('DOMContentLoaded'))
    },
  }
}
