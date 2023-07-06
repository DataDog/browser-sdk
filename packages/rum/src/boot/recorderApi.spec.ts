import { isIE, noop } from '@datadog/browser-core'
import type { RecorderApi, ViewContexts, LifeCycle, RumConfiguration } from '@datadog/browser-rum-core'
import { LifeCycleEventType } from '@datadog/browser-rum-core'
import { deleteEventBridgeStub, initEventBridgeStub, createNewEvent } from '@datadog/browser-core/test'
import type { RumSessionManagerMock, TestSetupBuilder } from '../../../rum-core/test'
import { createRumSessionManagerMock, setup } from '../../../rum-core/test'
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
  let startSessionReplayRecordingManually: boolean

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }
    startSessionReplayRecordingManually = false
    setupBuilder = setup().beforeBuild(({ lifeCycle, sessionManager }) => {
      stopRecordingSpy = jasmine.createSpy('stopRecording')
      startRecordingSpy = jasmine.createSpy('startRecording').and.callFake(() => ({
        stop: stopRecordingSpy,
      }))

      startDeflateWorkerWith(FAKE_WORKER)
      recorderApi = makeRecorderApi(startRecordingSpy, startDeflateWorkerSpy)
      rumInit = () => {
        recorderApi.onRumStart(
          lifeCycle,
          { startSessionReplayRecordingManually } as RumConfiguration,
          sessionManager,
          {} as ViewContexts
        )
      }
    })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  describe('recorder boot', () => {
    describe('with automatic start', () => {
      it('starts recording when init() is called', () => {
        setupBuilder.build()
        expect(startRecordingSpy).not.toHaveBeenCalled()
        rumInit()
        expect(startRecordingSpy).toHaveBeenCalled()
      })

      it('starts recording after the DOM is loaded', () => {
        setupBuilder.build()
        const { triggerOnDomLoaded } = mockDocumentReadyState()
        rumInit()
        expect(startRecordingSpy).not.toHaveBeenCalled()
        triggerOnDomLoaded()
        expect(startRecordingSpy).toHaveBeenCalled()
      })
    })

    describe('with manual start', () => {
      it('does not start recording when init() is called', () => {
        startSessionReplayRecordingManually = true
        setupBuilder.build()
        expect(startRecordingSpy).not.toHaveBeenCalled()
        rumInit()
        expect(startRecordingSpy).not.toHaveBeenCalled()
      })

      it('does not start recording after the DOM is loaded', () => {
        startSessionReplayRecordingManually = true
        setupBuilder.build()
        const { triggerOnDomLoaded } = mockDocumentReadyState()
        rumInit()
        expect(startRecordingSpy).not.toHaveBeenCalled()
        triggerOnDomLoaded()
        expect(startRecordingSpy).not.toHaveBeenCalled()
      })
    })
  })

  describe('recorder start', () => {
    it('ignores additional start calls while recording is already started', () => {
      setupBuilder.build()
      rumInit()
      recorderApi.start()
      recorderApi.start()
      recorderApi.start()
      expect(startRecordingSpy).toHaveBeenCalledTimes(1)
    })

    it('ignores restart before the DOM is loaded', () => {
      setupBuilder.build()
      const { triggerOnDomLoaded } = mockDocumentReadyState()
      rumInit()
      recorderApi.stop()
      recorderApi.start()
      triggerOnDomLoaded()
      expect(startRecordingSpy).toHaveBeenCalledTimes(1)
    })

    it('ignores start calls if the session is not tracked', () => {
      setupBuilder.withSessionManager(createRumSessionManagerMock().setNotTracked()).build()
      rumInit()
      recorderApi.start()
      expect(startRecordingSpy).not.toHaveBeenCalled()
    })

    it('ignores start calls if the session plan is WITHOUT_REPLAY', () => {
      setupBuilder.withSessionManager(createRumSessionManagerMock().setPlanWithoutSessionReplay()).build()
      rumInit()
      recorderApi.start()
      expect(startRecordingSpy).not.toHaveBeenCalled()
    })

    it('do not start recording if worker fails to be instantiated', () => {
      setupBuilder.build()
      startDeflateWorkerWith(undefined)
      rumInit()
      expect(startRecordingSpy).not.toHaveBeenCalled()
    })

    it('does not start recording multiple times if restarted before worker is initialized', () => {
      setupBuilder.build()
      stopDeflateWorker()
      rumInit()
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
      let originalArrayFrom: (typeof Array)['from']

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

  describe('recorder stop', () => {
    it('ignores calls while recording is already stopped', () => {
      setupBuilder.build()
      rumInit()
      recorderApi.stop()
      recorderApi.stop()
      recorderApi.stop()
      expect(stopRecordingSpy).toHaveBeenCalledTimes(1)
    })

    it('prevents recording to start when the DOM is loaded', () => {
      setupBuilder.build()
      const { triggerOnDomLoaded } = mockDocumentReadyState()
      rumInit()
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
    })

    describe('from WITHOUT_REPLAY to WITH_REPLAY', () => {
      beforeEach(() => {
        sessionManager.setPlanWithoutSessionReplay()
      })

      it('starts recording if startSessionReplayRecording was called', () => {
        rumInit()
        sessionManager.setPlanWithSessionReplay()
        lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
        expect(startRecordingSpy).not.toHaveBeenCalled()
        lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
        expect(startRecordingSpy).toHaveBeenCalled()
        expect(stopRecordingSpy).not.toHaveBeenCalled()
      })

      it('does not starts recording if stopSessionReplayRecording was called', () => {
        rumInit()
        recorderApi.stop()
        sessionManager.setPlanWithSessionReplay()
        lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
        lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
        expect(startRecordingSpy).not.toHaveBeenCalled()
      })
    })

    describe('from WITHOUT_REPLAY to untracked', () => {
      beforeEach(() => {
        sessionManager.setPlanWithoutSessionReplay()
      })

      it('keeps not recording if startSessionReplayRecording was called', () => {
        rumInit()
        sessionManager.setNotTracked()
        lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
        lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
        expect(startRecordingSpy).not.toHaveBeenCalled()
        expect(stopRecordingSpy).not.toHaveBeenCalled()
      })
    })

    describe('from WITHOUT_REPLAY to WITHOUT_REPLAY', () => {
      beforeEach(() => {
        sessionManager.setPlanWithoutSessionReplay()
      })

      it('keeps not recording if startSessionReplayRecording was called', () => {
        rumInit()
        lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
        lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
        expect(startRecordingSpy).not.toHaveBeenCalled()
        expect(stopRecordingSpy).not.toHaveBeenCalled()
      })
    })

    describe('from WITH_REPLAY to WITHOUT_REPLAY', () => {
      beforeEach(() => {
        sessionManager.setPlanWithSessionReplay()
      })

      it('stops recording if startSessionReplayRecording was called', () => {
        rumInit()
        expect(startRecordingSpy).toHaveBeenCalledTimes(1)
        sessionManager.setPlanWithoutSessionReplay()
        lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
        expect(stopRecordingSpy).toHaveBeenCalled()
        lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
        expect(startRecordingSpy).toHaveBeenCalledTimes(1)
      })

      it('prevents session recording to start if the session is renewed before the DOM is loaded', () => {
        const { triggerOnDomLoaded } = mockDocumentReadyState()
        rumInit()
        sessionManager.setPlanWithoutSessionReplay()
        lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
        lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
        triggerOnDomLoaded()
        expect(startRecordingSpy).not.toHaveBeenCalled()
      })
    })

    describe('from WITH_REPLAY to untracked', () => {
      beforeEach(() => {
        sessionManager.setPlanWithSessionReplay()
      })

      it('stops recording if startSessionReplayRecording was called', () => {
        rumInit()
        expect(startRecordingSpy).toHaveBeenCalledTimes(1)
        sessionManager.setNotTracked()
        lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
        expect(stopRecordingSpy).toHaveBeenCalled()
        lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
        expect(startRecordingSpy).toHaveBeenCalledTimes(1)
      })
    })

    describe('from WITH_REPLAY to WITH_REPLAY', () => {
      beforeEach(() => {
        sessionManager.setPlanWithSessionReplay()
      })

      it('keeps recording if startSessionReplayRecording was called', () => {
        rumInit()
        expect(startRecordingSpy).toHaveBeenCalledTimes(1)
        lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
        expect(stopRecordingSpy).toHaveBeenCalled()
        lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
        expect(startRecordingSpy).toHaveBeenCalledTimes(2)
      })

      it('does not starts recording if stopSessionReplayRecording was called', () => {
        rumInit()
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
        rumInit()
        sessionManager.setPlanWithSessionReplay()
        lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
        lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
        expect(startRecordingSpy).toHaveBeenCalled()
        expect(stopRecordingSpy).not.toHaveBeenCalled()
      })

      it('does not starts recording if stopSessionReplayRecording was called', () => {
        rumInit()
        recorderApi.stop()
        sessionManager.setPlanWithSessionReplay()
        lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
        lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
        expect(startRecordingSpy).not.toHaveBeenCalled()
        expect(stopRecordingSpy).not.toHaveBeenCalled()
      })
    })

    describe('from untracked to WITHOUT_REPLAY', () => {
      beforeEach(() => {
        sessionManager.setNotTracked()
      })

      it('keeps not recording if startSessionReplayRecording was called', () => {
        rumInit()
        sessionManager.setPlanWithoutSessionReplay()
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
        rumInit()
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
      expect(recorderApi.isRecording()).toBeTrue()
      recorderApi.stop()
      expect(recorderApi.isRecording()).toBeFalse()
      recorderApi.start()
      expect(recorderApi.isRecording()).toBeTrue()
    })

    it('is false before the DOM is loaded', () => {
      setupBuilder.build()
      const { triggerOnDomLoaded } = mockDocumentReadyState()
      rumInit()
      expect(recorderApi.isRecording()).toBeFalse()
      triggerOnDomLoaded()
      expect(recorderApi.isRecording()).toBeTrue()
    })
  })
})

function mockDocumentReadyState() {
  let readyState: DocumentReadyState = 'loading'
  spyOnProperty(Document.prototype, 'readyState', 'get').and.callFake(() => readyState)
  return {
    triggerOnDomLoaded: () => {
      readyState = 'interactive'
      window.dispatchEvent(createNewEvent('DOMContentLoaded'))
    },
  }
}
