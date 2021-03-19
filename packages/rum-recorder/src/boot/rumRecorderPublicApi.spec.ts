/* eslint-disable @typescript-eslint/unbound-method */
import { Configuration } from '@datadog/browser-core'
import { RumPublicApi, RumUserConfiguration, StartRum } from '@datadog/browser-rum-core'
import { makeRumRecorderPublicApi, StartRecording } from './rumRecorderPublicApi'

const DEFAULT_INIT_CONFIGURATION = { applicationId: 'xxx', clientToken: 'xxx' }

describe('makeRumRecorderPublicApi', () => {
  let rumGlobal: RumPublicApi & {
    // TODO postpone_start_recording: those types will be included in rum-recorder public API when
    // postpone_start_recording is stabilized.
    startSessionReplayRecording?(): void
    init(options: RumUserConfiguration & { manualSessionReplayRecordingStart?: boolean }): void
  }
  let startRecordingSpy: jasmine.Spy<StartRecording>
  let startRumSpy: jasmine.Spy<StartRum>
  let enabledFlags: string[] = []

  beforeEach(() => {
    enabledFlags = []
    startRecordingSpy = jasmine.createSpy()
    startRumSpy = jasmine.createSpy().and.callFake(() => {
      const configuration: Partial<Configuration> = {
        isEnabled(flag: string) {
          return enabledFlags.indexOf(flag) >= 0
        },
      }
      return ({ configuration } as unknown) as ReturnType<StartRum>
    })
    rumGlobal = makeRumRecorderPublicApi(startRumSpy, startRecordingSpy)
  })

  function getCommonContext() {
    return startRumSpy.calls.first().args[1]()
  }

  describe('init', () => {
    it('should start RUM when init is called', () => {
      expect(startRumSpy).not.toHaveBeenCalled()
      rumGlobal.init(DEFAULT_INIT_CONFIGURATION)
      expect(startRumSpy).toHaveBeenCalled()
    })

    it('should start recording when init is called', () => {
      expect(startRecordingSpy).not.toHaveBeenCalled()
      rumGlobal.init(DEFAULT_INIT_CONFIGURATION)
      expect(startRecordingSpy).toHaveBeenCalled()
    })

    it('should set commonContext.hasReplay to true', () => {
      rumGlobal.init(DEFAULT_INIT_CONFIGURATION)
      expect(getCommonContext().hasReplay).toBe(true)
    })
  })

  describe('experimental flag postpone_start_recording', () => {
    describe('if disabled', () => {
      it('startSessionReplayRecording should not be defined', () => {
        expect(rumGlobal.startSessionReplayRecording).toBeUndefined()
        rumGlobal.init(DEFAULT_INIT_CONFIGURATION)
        expect(rumGlobal.startSessionReplayRecording).toBeUndefined()
      })

      it('option manualSessionReplayRecordingStart should not be taken into account', () => {
        rumGlobal.init({ ...DEFAULT_INIT_CONFIGURATION, manualSessionReplayRecordingStart: true })
        expect(startRecordingSpy).toHaveBeenCalled()
      })
    })

    describe('if enabled', () => {
      beforeEach(() => {
        enabledFlags = ['postpone_start_recording']
      })

      it('recording should start when calling init() with default options', () => {
        rumGlobal.init(DEFAULT_INIT_CONFIGURATION)
        expect(startRecordingSpy).toHaveBeenCalled()
      })

      it('startSessionReplayRecording should be defined', () => {
        expect(rumGlobal.startSessionReplayRecording).toBeUndefined()
        rumGlobal.init(DEFAULT_INIT_CONFIGURATION)
        expect(rumGlobal.startSessionReplayRecording).toEqual(jasmine.any(Function))
      })

      it('calling startSessionReplayRecording while recording is already start should be ignored', () => {
        rumGlobal.init(DEFAULT_INIT_CONFIGURATION)
        rumGlobal.startSessionReplayRecording!()
        rumGlobal.startSessionReplayRecording!()
        rumGlobal.startSessionReplayRecording!()
        expect(startRecordingSpy).toHaveBeenCalledTimes(1)
      })

      describe('with manualSessionReplayRecordingStart: true option', () => {
        it('recording should not start when calling init() with option manualSessionReplayRecordingStart', () => {
          rumGlobal.init({ ...DEFAULT_INIT_CONFIGURATION, manualSessionReplayRecordingStart: true })
          expect(startRecordingSpy).not.toHaveBeenCalled()
        })

        it('commonContext.hasReplay should be true only if startSessionReplayRecording is called', () => {
          rumGlobal.init({ ...DEFAULT_INIT_CONFIGURATION, manualSessionReplayRecordingStart: true })
          expect(getCommonContext().hasReplay).toBeUndefined()
          rumGlobal.startSessionReplayRecording!()
          expect(getCommonContext().hasReplay).toBe(true)
        })
      })
    })
  })
})
