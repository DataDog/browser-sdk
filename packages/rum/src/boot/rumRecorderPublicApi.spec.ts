import { Configuration, includes } from '@datadog/browser-core'
import { RecorderApi, ParentContexts, LifeCycleEventType } from '@datadog/browser-rum-core'
import { createNewEvent } from '@datadog/browser-core/test/specHelper'
import { createRumSessionMock, RumSessionMock } from '../../../rum-core/test/mockRumSession'
import { setup, TestSetupBuilder } from '../../../rum-core/test/specHelper'
import { makeRecorderApi, RumRecorderInitConfiguration, StartRecording } from './rumRecorderPublicApi'

const DEFAULT_INIT_CONFIGURATION = { applicationId: 'xxx', clientToken: 'xxx' }

describe('makeRecorderApi', () => {
  let setupBuilder: TestSetupBuilder
  let recorderApi: RecorderApi
  let startRecordingSpy: jasmine.Spy<StartRecording>
  let stopRecordingSpy: jasmine.Spy<() => void>

  let rumInit: (initConfiguration: RumRecorderInitConfiguration) => void

  beforeEach(() => {
    setupBuilder = setup().beforeBuild(({ lifeCycle, session }) => {
      stopRecordingSpy = jasmine.createSpy('stopRecording')
      startRecordingSpy = jasmine.createSpy('startRecording').and.callFake(() => ({
        stop: stopRecordingSpy,
      }))
      recorderApi = makeRecorderApi(startRecordingSpy)
      rumInit = (initConfiguration) => {
        recorderApi.onRumStart(
          lifeCycle,
          initConfiguration,
          {
            isEnabled: (feature) => includes(initConfiguration.enableExperimentalFeatures || [], feature),
          } as Configuration,
          session,
          {} as ParentContexts
        )
      }
    })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  describe('boot', () => {
    it('starts recording when init() is called', () => {
      setupBuilder.build()
      expect(startRecordingSpy).not.toHaveBeenCalled()
      rumInit(DEFAULT_INIT_CONFIGURATION)
      expect(startRecordingSpy).toHaveBeenCalled()
    })

    it('does not start recording when calling init() with manualSessionReplayRecordingStart: true', () => {
      setupBuilder.build()
      rumInit({ ...DEFAULT_INIT_CONFIGURATION, manualSessionReplayRecordingStart: true })
      expect(startRecordingSpy).not.toHaveBeenCalled()
    })

    it('does not start recording when calling init() with the feature "postpone_start_recording"', () => {
      setupBuilder.build()
      rumInit({
        ...DEFAULT_INIT_CONFIGURATION,
        enableExperimentalFeatures: ['postpone_start_recording'],
      })
      expect(startRecordingSpy).not.toHaveBeenCalled()
    })

    it('does not start recording before the page "load"', () => {
      setupBuilder.build()
      const { triggerOnLoad } = mockDocumentReadyState()
      rumInit(DEFAULT_INIT_CONFIGURATION)
      expect(startRecordingSpy).not.toHaveBeenCalled()
      triggerOnLoad()
      expect(startRecordingSpy).toHaveBeenCalled()
    })
  })

  describe('startSessionReplayRecording()', () => {
    it('ignores calls while recording is already started', () => {
      setupBuilder.build()
      rumInit(DEFAULT_INIT_CONFIGURATION)
      recorderApi.public.startSessionReplayRecording()
      recorderApi.public.startSessionReplayRecording()
      recorderApi.public.startSessionReplayRecording()
      expect(startRecordingSpy).toHaveBeenCalledTimes(1)
    })

    it('starts recording if called before init()', () => {
      setupBuilder.build()
      recorderApi.public.startSessionReplayRecording()
      rumInit({ ...DEFAULT_INIT_CONFIGURATION, manualSessionReplayRecordingStart: true })
      expect(startRecordingSpy).toHaveBeenCalled()
    })

    it('does not start recording multiple times if restarted before onload', () => {
      setupBuilder.build()
      const { triggerOnLoad } = mockDocumentReadyState()
      rumInit(DEFAULT_INIT_CONFIGURATION)
      recorderApi.public.stopSessionReplayRecording()
      recorderApi.public.startSessionReplayRecording()
      triggerOnLoad()
      expect(startRecordingSpy).toHaveBeenCalledTimes(1)
    })

    it('ignores calls if the session is not tracked', () => {
      setupBuilder.withSession(createRumSessionMock().setNotTracked()).build()
      rumInit(DEFAULT_INIT_CONFIGURATION)
      recorderApi.public.startSessionReplayRecording()
      expect(startRecordingSpy).not.toHaveBeenCalled()
    })

    it('ignores calls if the session plan is LITE', () => {
      setupBuilder.withSession(createRumSessionMock().setLitePlan()).build()
      rumInit(DEFAULT_INIT_CONFIGURATION)
      recorderApi.public.startSessionReplayRecording()
      expect(startRecordingSpy).not.toHaveBeenCalled()
    })

    describe('when an untracked session expires and the renewed session plan is REPLAY', () => {
      let session: RumSessionMock
      beforeEach(() => {
        session = createRumSessionMock().setNotTracked()
        setupBuilder.withSession(session)
      })

      it('starts recording if startSessionReplayRecording was called', () => {
        const { lifeCycle } = setupBuilder.build()
        rumInit(DEFAULT_INIT_CONFIGURATION)
        recorderApi.public.startSessionReplayRecording()
        session.setReplayPlan()
        lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
        expect(startRecordingSpy).toHaveBeenCalled()
      })

      it('does not starts recording if stopSessionReplayRecording was called', () => {
        const { lifeCycle } = setupBuilder.build()
        rumInit(DEFAULT_INIT_CONFIGURATION)
        recorderApi.public.startSessionReplayRecording()
        recorderApi.public.stopSessionReplayRecording()
        session.setReplayPlan()
        lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
        expect(startRecordingSpy).not.toHaveBeenCalled()
      })
    })
  })

  describe('stopSessionReplayRecording()', () => {
    it('ignores calls while recording is already stopped', () => {
      setupBuilder.build()
      rumInit(DEFAULT_INIT_CONFIGURATION)
      recorderApi.public.stopSessionReplayRecording()
      recorderApi.public.stopSessionReplayRecording()
      recorderApi.public.stopSessionReplayRecording()
      expect(stopRecordingSpy).toHaveBeenCalledTimes(1)
    })

    it('does not start recording if called before init()', () => {
      setupBuilder.build()
      recorderApi.public.stopSessionReplayRecording()
      rumInit(DEFAULT_INIT_CONFIGURATION)
      expect(startRecordingSpy).not.toHaveBeenCalled()
    })

    it('prevents recording to start at page "load"', () => {
      setupBuilder.build()
      const { triggerOnLoad } = mockDocumentReadyState()
      rumInit(DEFAULT_INIT_CONFIGURATION)
      recorderApi.public.stopSessionReplayRecording()
      triggerOnLoad()
      expect(startRecordingSpy).not.toHaveBeenCalled()
    })
  })

  describe('isRecording', () => {
    it('is true only if recording', () => {
      setupBuilder.build()
      rumInit({ ...DEFAULT_INIT_CONFIGURATION, manualSessionReplayRecordingStart: true })
      expect(recorderApi.isRecording()).toBeFalse()
      recorderApi.public.startSessionReplayRecording()
      expect(recorderApi.isRecording()).toBeTrue()
      recorderApi.public.stopSessionReplayRecording()
      expect(recorderApi.isRecording()).toBeFalse()
    })

    it('is false before page "load"', () => {
      setupBuilder.build()
      const { triggerOnLoad } = mockDocumentReadyState()
      rumInit(DEFAULT_INIT_CONFIGURATION)
      expect(recorderApi.isRecording()).toBeFalse()
      recorderApi.public.startSessionReplayRecording()
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
