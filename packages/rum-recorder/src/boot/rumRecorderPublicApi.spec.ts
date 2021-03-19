/* eslint-disable @typescript-eslint/unbound-method */
import { Configuration } from '@datadog/browser-core'
import { RumPublicApi, StartRum } from '@datadog/browser-rum-core'
import { makeRumRecorderPublicApi, StartRecording } from './rumRecorderPublicApi'

const DEFAULT_INIT_CONFIGURATION = { applicationId: 'xxx', clientToken: 'xxx' }

describe('makeRumRecorderPublicApi', () => {
  let rumGlobal: RumPublicApi & { startSessionReplayRecording?(): void }
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
    it('if disabled, startSessionReplayRecording should not be defined', () => {
      expect(rumGlobal.startSessionReplayRecording).toBeUndefined()
      rumGlobal.init(DEFAULT_INIT_CONFIGURATION)
      expect(rumGlobal.startSessionReplayRecording).toBeUndefined()
    })

    it('if enabled, recording should not start when calling init()', () => {
      enabledFlags = ['postpone_start_recording']
      rumGlobal.init(DEFAULT_INIT_CONFIGURATION)
      expect(startRecordingSpy).not.toHaveBeenCalled()
    })

    it('if enabled, startSessionReplayRecording should be defined', () => {
      enabledFlags = ['postpone_start_recording']
      expect(rumGlobal.startSessionReplayRecording).toBeUndefined()
      rumGlobal.init(DEFAULT_INIT_CONFIGURATION)
      expect(rumGlobal.startSessionReplayRecording).toEqual(jasmine.any(Function))
    })

    it('if enabled, commonContext.hasReplay should be true only if startSessionReplayRecording is called', () => {
      enabledFlags = ['postpone_start_recording']
      rumGlobal.init(DEFAULT_INIT_CONFIGURATION)
      expect(getCommonContext().hasReplay).toBeUndefined()
      rumGlobal.startSessionReplayRecording!()
      expect(getCommonContext().hasReplay).toBe(true)
    })

    it('if enabled, calling startSessionReplayRecording multiple times should only start recording once', () => {
      enabledFlags = ['postpone_start_recording']
      rumGlobal.init(DEFAULT_INIT_CONFIGURATION)
      rumGlobal.startSessionReplayRecording!()
      rumGlobal.startSessionReplayRecording!()
      rumGlobal.startSessionReplayRecording!()
      expect(startRecordingSpy).toHaveBeenCalledTimes(1)
    })
  })
})
