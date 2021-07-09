import { StartRum } from '@datadog/browser-rum-core'
import { createNewEvent } from '../../../core/test/specHelper'
import { setup, TestSetupBuilder } from '../../../rum-core/test/specHelper'
import { makeRumRecorderPublicApi, RumRecorderPublicApi, StartRecording } from './rumRecorderPublicApi'

const DEFAULT_INIT_CONFIGURATION = { applicationId: 'xxx', clientToken: 'xxx' }

describe('makeRumRecorderPublicApi', () => {
  let setupBuilder: TestSetupBuilder
  let rumRecorderPublicApi: RumRecorderPublicApi
  let startRecordingSpy: jasmine.Spy<StartRecording>
  let stopRecordingSpy: jasmine.Spy<() => void>
  let startRumSpy: jasmine.Spy<StartRum>

  beforeEach(() => {
    setupBuilder = setup().beforeBuild(({ lifeCycle, session }) => {
      stopRecordingSpy = jasmine.createSpy('stopRecording')
      startRecordingSpy = jasmine.createSpy('startRecording').and.callFake(() => ({
        stop: stopRecordingSpy,
      }))
      startRumSpy = jasmine
        .createSpy<StartRum>('startRum')
        .and.callFake(() => (({ session, lifeCycle } as unknown) as ReturnType<StartRum>))
      rumRecorderPublicApi = makeRumRecorderPublicApi(startRumSpy, startRecordingSpy)
    })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  function getCommonContext() {
    return startRumSpy.calls.first().args[3]()
  }

  describe('boot', () => {
    describe('when tracking views automatically', () => {
      it('starts RUM when init is called', () => {
        setupBuilder.build()
        expect(startRumSpy).not.toHaveBeenCalled()
        rumRecorderPublicApi.init(DEFAULT_INIT_CONFIGURATION)
        expect(startRumSpy).toHaveBeenCalled()
      })

      it('starts recording when init() is called', () => {
        setupBuilder.build()
        expect(startRecordingSpy).not.toHaveBeenCalled()
        rumRecorderPublicApi.init(DEFAULT_INIT_CONFIGURATION)
        expect(startRecordingSpy).toHaveBeenCalled()
      })

      it('does not start recording when calling init() with manualSessionReplayRecordingStart: true', () => {
        setupBuilder.build()
        rumRecorderPublicApi.init({ ...DEFAULT_INIT_CONFIGURATION, manualSessionReplayRecordingStart: true })
        expect(startRecordingSpy).not.toHaveBeenCalled()
      })

      it('does not start recording when calling init() with the feature "postpone_start_recording"', () => {
        setupBuilder.build()
        rumRecorderPublicApi.init({
          ...DEFAULT_INIT_CONFIGURATION,
          enableExperimentalFeatures: ['postpone_start_recording'],
        })
        expect(startRecordingSpy).not.toHaveBeenCalled()
      })

      it('does not start recording before the page "load"', () => {
        setupBuilder.build()
        const { triggerOnLoad } = mockDocumentReadyState()
        rumRecorderPublicApi.init(DEFAULT_INIT_CONFIGURATION)
        expect(startRecordingSpy).not.toHaveBeenCalled()
        triggerOnLoad()
        expect(startRecordingSpy).toHaveBeenCalled()
      })
    })

    describe('when tracking views manually', () => {
      const MANUAL_VIEWS_CONFIGURATION = {
        ...DEFAULT_INIT_CONFIGURATION,
        trackViewsManually: true,
      }
      it('starts RUM when initial view is started', () => {
        setupBuilder.build()
        expect(startRumSpy).not.toHaveBeenCalled()
        rumRecorderPublicApi.init(MANUAL_VIEWS_CONFIGURATION)
        expect(startRumSpy).not.toHaveBeenCalled()
        rumRecorderPublicApi.startView()
        expect(startRumSpy).toHaveBeenCalled()
      })

      it('starts recording when initial view is started', () => {
        setupBuilder.build()
        expect(startRecordingSpy).not.toHaveBeenCalled()
        rumRecorderPublicApi.init(MANUAL_VIEWS_CONFIGURATION)
        expect(startRecordingSpy).not.toHaveBeenCalled()
        rumRecorderPublicApi.startView()
        expect(startRecordingSpy).toHaveBeenCalled()
      })

      it('does not start recording when initial view is started with manualSessionReplayRecordingStart: true', () => {
        setupBuilder.build()
        rumRecorderPublicApi.init({ ...MANUAL_VIEWS_CONFIGURATION, manualSessionReplayRecordingStart: true })
        rumRecorderPublicApi.startView()
        expect(startRecordingSpy).not.toHaveBeenCalled()
      })

      it('does not start recording when initial view is started with the feature "postpone_start_recording"', () => {
        setupBuilder.build()
        rumRecorderPublicApi.init({
          ...MANUAL_VIEWS_CONFIGURATION,
          enableExperimentalFeatures: ['postpone_start_recording'],
        })
        rumRecorderPublicApi.startView()
        expect(startRecordingSpy).not.toHaveBeenCalled()
      })

      it('does not start recording before the page "load"', () => {
        setupBuilder.build()
        const { triggerOnLoad } = mockDocumentReadyState()
        rumRecorderPublicApi.init(MANUAL_VIEWS_CONFIGURATION)
        rumRecorderPublicApi.startView()
        expect(startRecordingSpy).not.toHaveBeenCalled()
        triggerOnLoad()
        expect(startRecordingSpy).toHaveBeenCalled()
      })
    })
  })

  describe('startSessionReplayRecording()', () => {
    it('ignores calls while recording is already started', () => {
      setupBuilder.build()
      rumRecorderPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumRecorderPublicApi.startSessionReplayRecording()
      rumRecorderPublicApi.startSessionReplayRecording()
      rumRecorderPublicApi.startSessionReplayRecording()
      expect(startRecordingSpy).toHaveBeenCalledTimes(1)
    })

    it('starts recording if called before init()', () => {
      setupBuilder.build()
      rumRecorderPublicApi.startSessionReplayRecording()
      rumRecorderPublicApi.init({ ...DEFAULT_INIT_CONFIGURATION, manualSessionReplayRecordingStart: true })
      expect(startRecordingSpy).toHaveBeenCalled()
    })

    it('does not start recording multiple times if restarted before onload', () => {
      setupBuilder.build()
      const { triggerOnLoad } = mockDocumentReadyState()
      rumRecorderPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumRecorderPublicApi.stopSessionReplayRecording()
      rumRecorderPublicApi.startSessionReplayRecording()
      triggerOnLoad()
      expect(startRecordingSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('stopSessionReplayRecording()', () => {
    it('ignores calls while recording is already stopped', () => {
      setupBuilder.build()
      rumRecorderPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumRecorderPublicApi.stopSessionReplayRecording()
      rumRecorderPublicApi.stopSessionReplayRecording()
      rumRecorderPublicApi.stopSessionReplayRecording()
      expect(stopRecordingSpy).toHaveBeenCalledTimes(1)
    })

    it('does not start recording if called before init()', () => {
      setupBuilder.build()
      rumRecorderPublicApi.stopSessionReplayRecording()
      rumRecorderPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      expect(startRecordingSpy).not.toHaveBeenCalled()
    })

    it('prevents recording to start at page "load"', () => {
      setupBuilder.build()
      const { triggerOnLoad } = mockDocumentReadyState()
      rumRecorderPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumRecorderPublicApi.stopSessionReplayRecording()
      triggerOnLoad()
      expect(startRecordingSpy).not.toHaveBeenCalled()
    })
  })

  describe('commonContext hasReplay', () => {
    it('is true only if recording', () => {
      setupBuilder.build()
      rumRecorderPublicApi.init({ ...DEFAULT_INIT_CONFIGURATION, manualSessionReplayRecordingStart: true })
      expect(getCommonContext().hasReplay).toBeUndefined()
      rumRecorderPublicApi.startSessionReplayRecording()
      expect(getCommonContext().hasReplay).toBe(true)
      rumRecorderPublicApi.stopSessionReplayRecording()
      expect(getCommonContext().hasReplay).toBeUndefined()
    })

    it('is undefined before page "load"', () => {
      setupBuilder.build()
      const { triggerOnLoad } = mockDocumentReadyState()
      rumRecorderPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      expect(getCommonContext().hasReplay).toBeUndefined()
      rumRecorderPublicApi.startSessionReplayRecording()
      expect(getCommonContext().hasReplay).toBeUndefined()
      triggerOnLoad()
      expect(getCommonContext().hasReplay).toBe(true)
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
