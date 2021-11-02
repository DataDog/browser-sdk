import { Configuration, noop, resetExperimentalFeatures, updateExperimentalFeatures } from '@datadog/browser-core'
import {
  RecorderApi,
  ParentContexts,
  LifeCycleEventType,
  RumInitConfiguration,
  LifeCycle,
} from '@datadog/browser-rum-core'
import { createNewEvent, deleteEventBridgeStub, initEventBridgeStub } from '../../../core/test/specHelper'
import { createRumSessionMock, RumSessionMock } from '../../../rum-core/test/mockRumSession'
import { setup, TestSetupBuilder } from '../../../rum-core/test/specHelper'
import { DeflateWorker } from '../domain/segmentCollection/deflateWorker'
import { startDeflateWorker } from '../domain/segmentCollection/startDeflateWorker'
import { makeRecorderApi, StartRecording } from './recorderApi'

const DEFAULT_INIT_CONFIGURATION = { applicationId: 'xxx', clientToken: 'xxx' }

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

  let rumInit: (initConfiguration: RumInitConfiguration) => void

  beforeEach(() => {
    setupBuilder = setup().beforeBuild(({ lifeCycle, session }) => {
      stopRecordingSpy = jasmine.createSpy('stopRecording')
      startRecordingSpy = jasmine.createSpy('startRecording').and.callFake(() => ({
        stop: stopRecordingSpy,
      }))

      startDeflateWorkerWith(FAKE_WORKER)
      recorderApi = makeRecorderApi(startRecordingSpy, startDeflateWorkerSpy)
      rumInit = (initConfiguration) => {
        recorderApi.onRumStart(lifeCycle, initConfiguration, {} as Configuration, session, {} as ParentContexts)
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
      rumInit(DEFAULT_INIT_CONFIGURATION)
      expect(startRecordingSpy).not.toHaveBeenCalled()
    })

    it('does not start recording after the page "load"', () => {
      setupBuilder.build()
      const { triggerOnLoad } = mockDocumentReadyState()
      rumInit(DEFAULT_INIT_CONFIGURATION)
      expect(startRecordingSpy).not.toHaveBeenCalled()
      triggerOnLoad()
      expect(startRecordingSpy).not.toHaveBeenCalled()
    })
  })

  describe('startSessionReplayRecording()', () => {
    it('ignores calls while recording is already started', () => {
      setupBuilder.build()
      rumInit(DEFAULT_INIT_CONFIGURATION)
      recorderApi.start()
      recorderApi.start()
      recorderApi.start()
      expect(startRecordingSpy).toHaveBeenCalledTimes(1)
    })

    it('starts recording if called before init()', () => {
      setupBuilder.build()
      recorderApi.start()
      rumInit(DEFAULT_INIT_CONFIGURATION)
      expect(startRecordingSpy).toHaveBeenCalled()
    })

    it('does not start recording multiple times if restarted before onload', () => {
      setupBuilder.build()
      const { triggerOnLoad } = mockDocumentReadyState()
      rumInit(DEFAULT_INIT_CONFIGURATION)
      recorderApi.start()
      recorderApi.stop()
      recorderApi.start()
      triggerOnLoad()
      expect(startRecordingSpy).toHaveBeenCalledTimes(1)
    })

    it('ignores calls if the session is not tracked', () => {
      setupBuilder.withSession(createRumSessionMock().setNotTracked()).build()
      rumInit(DEFAULT_INIT_CONFIGURATION)
      recorderApi.start()
      expect(startRecordingSpy).not.toHaveBeenCalled()
    })

    it('ignores calls if the session plan is LITE', () => {
      setupBuilder.withSession(createRumSessionMock().setLitePlan()).build()
      rumInit(DEFAULT_INIT_CONFIGURATION)
      recorderApi.start()
      expect(startRecordingSpy).not.toHaveBeenCalled()
    })

    it('do not start recording if worker fails to be instantiated', () => {
      setupBuilder.build()
      rumInit(DEFAULT_INIT_CONFIGURATION)
      startDeflateWorkerWith(undefined)
      recorderApi.start()
      expect(startRecordingSpy).not.toHaveBeenCalled()
    })

    it('does not start recording multiple times if restarted before worker is initialized', () => {
      setupBuilder.build()
      rumInit(DEFAULT_INIT_CONFIGURATION)
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
        updateExperimentalFeatures(['event-bridge'])
        initEventBridgeStub()
      })

      afterEach(() => {
        resetExperimentalFeatures()
        deleteEventBridgeStub()
      })

      it('does not start recording', () => {
        setupBuilder.build()
        recorderApi.start()
        rumInit(DEFAULT_INIT_CONFIGURATION)
        expect(startRecordingSpy).not.toHaveBeenCalled()
      })
    })
  })

  describe('stopSessionReplayRecording()', () => {
    it('ignores calls while recording is already stopped', () => {
      setupBuilder.build()
      rumInit(DEFAULT_INIT_CONFIGURATION)
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
      rumInit(DEFAULT_INIT_CONFIGURATION)
      expect(startRecordingSpy).not.toHaveBeenCalled()
    })

    it('prevents recording to start at page "load"', () => {
      setupBuilder.build()
      const { triggerOnLoad } = mockDocumentReadyState()
      rumInit(DEFAULT_INIT_CONFIGURATION)
      recorderApi.start()
      recorderApi.stop()
      triggerOnLoad()
      expect(startRecordingSpy).not.toHaveBeenCalled()
    })
  })

  describe('when session renewal change the session plan', () => {
    let session: RumSessionMock
    let lifeCycle: LifeCycle
    beforeEach(() => {
      session = createRumSessionMock()
      setupBuilder.withSession(session)
      ;({ lifeCycle } = setupBuilder.build())
      rumInit(DEFAULT_INIT_CONFIGURATION)
    })

    describe('from LITE to REPLAY', () => {
      beforeEach(() => {
        session.setLitePlan()
      })

      it('starts recording if startSessionReplayRecording was called', () => {
        recorderApi.start()
        session.setReplayPlan()
        lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
        expect(startRecordingSpy).not.toHaveBeenCalled()
        lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
        expect(startRecordingSpy).toHaveBeenCalled()
        expect(stopRecordingSpy).not.toHaveBeenCalled()
      })

      it('does not starts recording if stopSessionReplayRecording was called', () => {
        recorderApi.start()
        recorderApi.stop()
        session.setReplayPlan()
        lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
        lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
        expect(startRecordingSpy).not.toHaveBeenCalled()
      })
    })

    describe('from LITE to untracked', () => {
      beforeEach(() => {
        session.setLitePlan()
      })

      it('keeps not recording if startSessionReplayRecording was called', () => {
        recorderApi.start()
        session.setNotTracked()
        lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
        lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
        expect(startRecordingSpy).not.toHaveBeenCalled()
        expect(stopRecordingSpy).not.toHaveBeenCalled()
      })
    })

    describe('from LITE to LITE', () => {
      beforeEach(() => {
        session.setLitePlan()
      })

      it('keeps not recording if startSessionReplayRecording was called', () => {
        recorderApi.start()
        lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
        lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
        expect(startRecordingSpy).not.toHaveBeenCalled()
        expect(stopRecordingSpy).not.toHaveBeenCalled()
      })
    })

    describe('from REPLAY to LITE', () => {
      beforeEach(() => {
        session.setReplayPlan()
      })

      it('stops recording if startSessionReplayRecording was called', () => {
        recorderApi.start()
        expect(startRecordingSpy).toHaveBeenCalledTimes(1)
        session.setLitePlan()
        lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
        expect(stopRecordingSpy).toHaveBeenCalled()
        lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
        expect(startRecordingSpy).toHaveBeenCalledTimes(1)
      })

      it('prevents session recording to start if the session is renewed before onload', () => {
        setupBuilder.build()
        const { triggerOnLoad } = mockDocumentReadyState()
        rumInit(DEFAULT_INIT_CONFIGURATION)
        recorderApi.start()
        session.setLitePlan()
        lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
        lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
        triggerOnLoad()
        expect(startRecordingSpy).not.toHaveBeenCalled()
      })
    })

    describe('from REPLAY to untracked', () => {
      beforeEach(() => {
        session.setReplayPlan()
      })

      it('stops recording if startSessionReplayRecording was called', () => {
        recorderApi.start()
        expect(startRecordingSpy).toHaveBeenCalledTimes(1)
        session.setNotTracked()
        lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
        expect(stopRecordingSpy).toHaveBeenCalled()
        lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
        expect(startRecordingSpy).toHaveBeenCalledTimes(1)
      })
    })

    describe('from REPLAY to REPLAY', () => {
      beforeEach(() => {
        session.setReplayPlan()
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
        session.setNotTracked()
      })

      it('starts recording if startSessionReplayRecording was called', () => {
        recorderApi.start()
        session.setReplayPlan()
        lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
        lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
        expect(startRecordingSpy).toHaveBeenCalled()
        expect(stopRecordingSpy).not.toHaveBeenCalled()
      })

      it('does not starts recording if stopSessionReplayRecording was called', () => {
        recorderApi.start()
        recorderApi.stop()
        session.setReplayPlan()
        lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
        lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
        expect(startRecordingSpy).not.toHaveBeenCalled()
        expect(stopRecordingSpy).not.toHaveBeenCalled()
      })
    })

    describe('from untracked to LITE', () => {
      beforeEach(() => {
        session.setNotTracked()
      })

      it('keeps not recording if startSessionReplayRecording was called', () => {
        recorderApi.start()
        session.setLitePlan()
        lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
        lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
        expect(startRecordingSpy).not.toHaveBeenCalled()
        expect(stopRecordingSpy).not.toHaveBeenCalled()
      })
    })

    describe('from untracked to untracked', () => {
      beforeEach(() => {
        session.setNotTracked()
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
      rumInit(DEFAULT_INIT_CONFIGURATION)
      expect(recorderApi.isRecording()).toBeFalse()
      recorderApi.start()
      expect(recorderApi.isRecording()).toBeTrue()
      recorderApi.stop()
      expect(recorderApi.isRecording()).toBeFalse()
    })

    it('is false before page "load"', () => {
      setupBuilder.build()
      const { triggerOnLoad } = mockDocumentReadyState()
      rumInit(DEFAULT_INIT_CONFIGURATION)
      expect(recorderApi.isRecording()).toBeFalse()
      recorderApi.start()
      expect(recorderApi.isRecording()).toBeFalse()
      triggerOnLoad()
      expect(recorderApi.isRecording()).toBeTrue()
    })
  })
})

function mockDocumentReadyState() {
  let readyState = 'loading'
  spyOnProperty(Document.prototype, 'readyState', 'get').and.callFake(() => readyState)
  return {
    triggerOnLoad: () => {
      readyState = 'complete'
      window.dispatchEvent(createNewEvent('load'))
    },
  }
}
