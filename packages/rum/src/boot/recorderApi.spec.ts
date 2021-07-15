import { Configuration, includes } from '@datadog/browser-core'
import { RecorderApi, ParentContexts, LifeCycleEventType, RumInitConfiguration } from '@datadog/browser-rum-core'
import { createNewEvent } from '@datadog/browser-core/test/specHelper'
import { createRumSessionMock, RumSessionMock } from '../../../rum-core/test/mockRumSession'
import { setup, TestSetupBuilder } from '../../../rum-core/test/specHelper'
import { makeRecorderApi, StartRecording } from './recorderApi'

const DEFAULT_INIT_CONFIGURATION = { applicationId: 'xxx', clientToken: 'xxx' }

describe('makeRecorderApi', () => {
  let setupBuilder: TestSetupBuilder
  let recorderApi: RecorderApi
  let startRecordingSpy: jasmine.Spy<StartRecording>
  let stopRecordingSpy: jasmine.Spy<() => void>

  let rumInit: (initConfiguration: RumInitConfiguration) => void

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

    describe('when an untracked session expires and the renewed session plan is REPLAY', () => {
      let session: RumSessionMock
      beforeEach(() => {
        session = createRumSessionMock().setNotTracked()
        setupBuilder.withSession(session)
      })

      it('starts recording if startSessionReplayRecording was called', () => {
        const { lifeCycle } = setupBuilder.build()
        rumInit(DEFAULT_INIT_CONFIGURATION)
        recorderApi.start()
        session.setReplayPlan()
        lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
        expect(startRecordingSpy).toHaveBeenCalled()
      })

      it('does not starts recording if stopSessionReplayRecording was called', () => {
        const { lifeCycle } = setupBuilder.build()
        rumInit(DEFAULT_INIT_CONFIGURATION)
        recorderApi.start()
        recorderApi.stop()
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
