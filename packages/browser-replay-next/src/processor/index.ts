import type { Module, ModuleContext } from '@datadog/core-next'
import { replayExtension } from '../domain/configuration'
import type { ReplayConfig } from '../domain/configuration'
import { startRecorder } from '../domain/record/recorder'
import type { RecorderAPI } from '../domain/record/recorder'
import { startSegmentCollection } from '../domain/segmentCollection'

interface ReplayPublicApi extends Record<string, unknown> {
  startSessionReplayRecording(options?: { force?: boolean }): void
  stopSessionReplayRecording(): void
}

function shouldRecord(sampleRate: number): boolean {
  return Math.random() * 100 < sampleRate
}

const replayProcessor: Module = {
  name: 'replay',
  extension: replayExtension,
  init(context: ModuleContext): ReplayPublicApi {
    const config = (context.config as Record<string, unknown>).replay as ReplayConfig
    const isRecording = shouldRecord(config.sampleRate)

    // Segment collection — publishes observation:replay to pipeline
    const segments = startSegmentCollection({ pipeline: context.pipeline })

    // Recorder state
    let recorder: RecorderAPI | undefined

    function startRecording() {
      if (recorder) return
      recorder = startRecorder({
        document,
        configuration: config,
        emitRecord: (record) => segments.addRecord(record as unknown as Record<string, unknown>),
        emitStats: () => {},
      })
    }

    function stopRecording() {
      if (!recorder) return
      segments.flush('stop')
      recorder.stop()
      recorder = undefined
    }

    // Flush segment on view change
    context.pipeline.subscribe('signal:view_changed', () => {
      if (recorder) {
        recorder.flushMutations()
        segments.flush('view_change')
      }
    })

    // Stop recording on session expiry
    context.session.on('expired', () => {
      if (recorder) {
        recorder.flushMutations()
        segments.flush('before_unload')
        recorder.stop()
        recorder = undefined
      }
    })

    // Route segments to replay track
    context.transport.route('observation:replay', 'replay')

    // Auto-start if not manual and sample rate allows
    if (!config.startRecordingManually && isRecording) {
      startRecording()
    }

    return {
      startSessionReplayRecording(options?: { force?: boolean }) {
        if (options?.force || isRecording) {
          startRecording()
        }
      },

      stopSessionReplayRecording() {
        stopRecording()
      },

      __stop() {
        stopRecording()
        segments.stop()
      },
    }
  },
}

export { replayProcessor }
export type { ReplayPublicApi }
