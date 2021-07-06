import { Configuration, includes } from '@datadog/browser-core'
import { StartRum } from '@datadog/browser-rum-core'
import { createNewEvent } from '../../../core/test/specHelper'
import { makeRumRecorderPublicApi, RumRecorderPublicApi, StartRecording } from './rumRecorderPublicApi'

const DEFAULT_INIT_CONFIGURATION = { applicationId: 'xxx', clientToken: 'xxx' }

describe('makeRumRecorderPublicApi', () => {
  let rumRecorderPublicApi: RumRecorderPublicApi
  let startRecordingSpy: jasmine.Spy<StartRecording>
  let stopRecordingSpy: jasmine.Spy<() => void>
  let startRumSpy: jasmine.Spy<StartRum>

  beforeEach(() => {
    stopRecordingSpy = jasmine.createSpy('stopRecording')
    startRecordingSpy = jasmine.createSpy('startRecording').and.callFake(() => ({
      stop: stopRecordingSpy,
    }))
    startRumSpy = jasmine.createSpy<StartRum>('startRum').and.callFake((initConfiguration) => {
      const configuration: Partial<Configuration> = {
        isEnabled(feature) {
          return includes(initConfiguration.enableExperimentalFeatures || [], feature)
        },
      }
      return ({ configuration } as unknown) as ReturnType<StartRum>
    })
    rumRecorderPublicApi = makeRumRecorderPublicApi(startRumSpy, startRecordingSpy)
  })

  function getCommonContext() {
    return startRumSpy.calls.first().args[3]()
  }

  describe('boot', () => {
    describe('when tracking views automatically', () => {
      it('starts RUM when init is called', () => {
        expect(startRumSpy).not.toHaveBeenCalled()
        rumRecorderPublicApi.init(DEFAULT_INIT_CONFIGURATION)
        expect(startRumSpy).toHaveBeenCalled()
      })

      it('starts recording when init() is called', () => {
        expect(startRecordingSpy).not.toHaveBeenCalled()
        rumRecorderPublicApi.init(DEFAULT_INIT_CONFIGURATION)
        expect(startRecordingSpy).toHaveBeenCalled()
      })

      it('does not start recording when calling init() with manualSessionReplayRecordingStart: true', () => {
        rumRecorderPublicApi.init({ ...DEFAULT_INIT_CONFIGURATION, manualSessionReplayRecordingStart: true })
        expect(startRecordingSpy).not.toHaveBeenCalled()
      })

      it('does not start recording when calling init() with the feature "postpone_start_recording"', () => {
        rumRecorderPublicApi.init({
          ...DEFAULT_INIT_CONFIGURATION,
          enableExperimentalFeatures: ['postpone_start_recording'],
        })
        expect(startRecordingSpy).not.toHaveBeenCalled()
      })

      it('does not start recording before the page "load"', () => {
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
        expect(startRumSpy).not.toHaveBeenCalled()
        rumRecorderPublicApi.init(MANUAL_VIEWS_CONFIGURATION)
        expect(startRumSpy).not.toHaveBeenCalled()
        rumRecorderPublicApi.startView()
        expect(startRumSpy).toHaveBeenCalled()
      })

      it('starts recording when initial view is started', () => {
        expect(startRecordingSpy).not.toHaveBeenCalled()
        rumRecorderPublicApi.init(MANUAL_VIEWS_CONFIGURATION)
        expect(startRecordingSpy).not.toHaveBeenCalled()
        rumRecorderPublicApi.startView()
        expect(startRecordingSpy).toHaveBeenCalled()
      })

      it('does not start recording when initial view is started with manualSessionReplayRecordingStart: true', () => {
        rumRecorderPublicApi.init({ ...MANUAL_VIEWS_CONFIGURATION, manualSessionReplayRecordingStart: true })
        rumRecorderPublicApi.startView()
        expect(startRecordingSpy).not.toHaveBeenCalled()
      })

      it('does not start recording when initial view is started with the feature "postpone_start_recording"', () => {
        rumRecorderPublicApi.init({
          ...MANUAL_VIEWS_CONFIGURATION,
          enableExperimentalFeatures: ['postpone_start_recording'],
        })
        rumRecorderPublicApi.startView()
        expect(startRecordingSpy).not.toHaveBeenCalled()
      })

      it('does not start recording before the page "load"', () => {
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
      rumRecorderPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumRecorderPublicApi.startSessionReplayRecording()
      rumRecorderPublicApi.startSessionReplayRecording()
      rumRecorderPublicApi.startSessionReplayRecording()
      expect(startRecordingSpy).toHaveBeenCalledTimes(1)
    })

    it('starts recording if called before init()', () => {
      rumRecorderPublicApi.startSessionReplayRecording()
      rumRecorderPublicApi.init({ ...DEFAULT_INIT_CONFIGURATION, manualSessionReplayRecordingStart: true })
      expect(startRecordingSpy).toHaveBeenCalled()
    })

    it('does not start recording multiple times if restarted before onload', () => {
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
      rumRecorderPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumRecorderPublicApi.stopSessionReplayRecording()
      rumRecorderPublicApi.stopSessionReplayRecording()
      rumRecorderPublicApi.stopSessionReplayRecording()
      expect(stopRecordingSpy).toHaveBeenCalledTimes(1)
    })

    it('does not start recording if called before init()', () => {
      rumRecorderPublicApi.stopSessionReplayRecording()
      rumRecorderPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      expect(startRecordingSpy).not.toHaveBeenCalled()
    })

    it('prevents recording to start at page "load"', () => {
      const { triggerOnLoad } = mockDocumentReadyState()
      rumRecorderPublicApi.init(DEFAULT_INIT_CONFIGURATION)
      rumRecorderPublicApi.stopSessionReplayRecording()
      triggerOnLoad()
      expect(startRecordingSpy).not.toHaveBeenCalled()
    })
  })

  describe('commonContext hasReplay', () => {
    it('is true only if recording', () => {
      rumRecorderPublicApi.init({ ...DEFAULT_INIT_CONFIGURATION, manualSessionReplayRecordingStart: true })
      expect(getCommonContext().hasReplay).toBeUndefined()
      rumRecorderPublicApi.startSessionReplayRecording()
      expect(getCommonContext().hasReplay).toBe(true)
      rumRecorderPublicApi.stopSessionReplayRecording()
      expect(getCommonContext().hasReplay).toBeUndefined()
    })

    it('is undefined before page "load"', () => {
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
