// eslint-disable-next-line local-rules/disallow-side-effects
import { createMachine, interpret, assign } from '@xstate/fsm'

import type { RumSessionManager } from '@datadog/browser-rum-core'
import { canUseEventBridge } from '@datadog/browser-core'
import type { DeflateWorker } from '../domain/segmentCollection'

export const enum RecorderStatus {
  Stopped = 'Stopped',
  IntendToStart = 'IntendToStart',
  ListeningForInteractive = 'ListeningForInteractive',
  ListeningForWorker = 'ListeningForWorker',
  Starting = 'Starting',
  Started = 'Started',
}

type Events =
  | { type: 'INTEND_TO_START' }
  | { type: 'STOP' }
  | { type: 'INIT'; sessionManager?: RumSessionManager }
  | { type: 'RESET_RECORDER' }
  | { type: 'PAGE_INTERACTIVE' }
  | { type: 'ATTEMPT_START' }
  | { type: 'DEFLATE_WORKER_CALLED'; worker?: DeflateWorker }
  | { type: 'START_RECORDING'; stopRecording: () => void }

type Context = {
  sessionManager?: RumSessionManager
  stopRecording?: () => void
  worker?: DeflateWorker
}

const initContext: Context = {
  sessionManager: undefined,
  stopRecording: undefined,
  worker: undefined,
}

export const initRecorderStateMachine = () => {
  const recorderMachine =
    /** @xstate-layout N4IgpgJg5mDOIC5QCcwGMD2yJmQOgGUAXDAB1MgGIBJAOQBUBRWgEQH16B5Ng+gQQBK9RKFIZYASyISMAOxEgAHogBMARgDMGvAE4ADADYNKgKwAWMwHZLADj0mANCACeiDTYN4Tx92ssm1ExMbFQBfUKdUTGxcQhJyKjpqYSQQMUlpOQVlBBV7EzxrPR01GzKNA0CDJ1cENUrCnTM8s1K7IwMTcMj0LBx8alkiMFkIegxiAENkIko+eiYAWQAFeh5+IQV0qRl5VJyVLRs8Gw01UxUQtStLGsR9NUKDS1MrDT0P-26QKL7YweGo3GUxmNFoyS24h2WX2qhMLzwZg0OhUljMJhUzXeGjuCHRxxU6hUz2uAU6nW+vxiAyGIzGEyI01mvE4y0hGV22VUh08eiRpw89meehxLjc9jwaj01zMBlOhxUKIMlN61LwABkJLBARJZFAAGJYAG4SZoaQANzAlGWfAA4ow2HQmAI+ABhejUABqjHZ0L2oAOIURNn8ph0IbMNm81TFCEsRjweh5mhsrRsTQ0Kui-Q1Wp1esNyGNyFNFqtAkYBEYawrrs4AhYjAEvsy-qUbkegRKRnhl0sah0WlxgUTZn09kjyIHfOVER+qpzmu1I11BqNtJLZoklsoLLZqW2ra5uSDkdDJnDaKjFWHGksulMSalaPe-azf3wS-za+QAHUsAA1rglCNvq6rzA6v71gA0k2bCunw6rqowLAtpysIICE2ghCYfKaOikbnLiwRmLoU7BKSISou+apfiuBZYP+yBAcglAVlWNaMHWDZNmhMIBogWEnI+rQaARNhEbGlg6J47TNEE5xqPUZg0Yueb0T+TEsbuXD7qIUJHhhQk4XhYnmBJKi4qY97IgY+inO49ghKpsQgtIeo6YInHcSwdC2nxbY5IpeiJhJzTEucEmWKKtS4QSIYmHKejxqiYmZnOVI5m5q5sZW1ZsLW9aNs2B4GehAl1OoIV6GFhKVJcfgxYgzw2WJSLeJiyJhBlC6uYyMw5XuAXHsFoXXHVkWNbid6yXK0mJdKdiDi5+BuVQQ2lRy-HtnU-ikfGZRjvYA5SmouJjp4YmGCEHhBAYfIqT12Z9UyVDsflhU8SV+lbYFiB+OYTyHfoAQlNKxEWHglwWPCyLvAY1HfLIGA4PAqSZX1ZAUBAw0YQOpwnIOKVIhYZyWbGd6PBouFJtFZhJiG6U9M9NKAvSbm4xVhyJYmgTxhYBhjk0ZgQyoUOC3KmgYolTPzizubLrIq6FsWpbbmAnM7c0uKDmLISysSeQyYtK0K9+hZabgms5FYxz+B8zSNUcqa4v22gouGJO9mopvZXq1v-cUjwfB8BgI+Yd4irinQ6MJfKPpYT5Kb7-XDDjm1+iNFikWHIYya8qaaOdMl4OSxjSrYfiXCtAdxpKF71NTLwhgOxiOLGAC0PO64bhhEjo4azuEQA */
    createMachine<Context, Events>(
      {
        context: initContext,
        initial: 'Stopped',
        id: 'recorder',
        states: {
          Stopped: {
            on: {
              INTEND_TO_START: {
                target: 'IntendToStart',
              },
              INIT: {
                actions: 'setSessionManager',
              },
            },
          },
          IntendToStart: {
            on: {
              ATTEMPT_START: {
                cond: (context: Context) => {
                  const session = context?.sessionManager?.findTrackedSession()
                  return !!session?.sessionReplayAllowed && !(canUseEventBridge() || !isBrowserSupported())
                },
                target: 'ListeningForInteractive',
              },
              INIT: {
                actions: 'setSessionManager',
              },
              STOP: {
                target: 'Stopped',
              },
            },
          },
          ListeningForInteractive: {
            on: {
              PAGE_INTERACTIVE: {
                target: 'ListeningForWorker',
              },
              RESET_RECORDER: {
                target: 'IntendToStart',
              },
              STOP: {
                target: 'Stopped',
              },
            },
          },
          ListeningForWorker: {
            entry: ['resetStopRecordingCallback', 'resetWorker'],
            on: {
              DEFLATE_WORKER_CALLED: [
                {
                  actions: 'setWorker',
                  cond: (_, event) => !!event.worker,
                  target: 'Starting',
                },
                {
                  target: 'Stopped',
                },
              ],
              RESET_RECORDER: {
                target: 'IntendToStart',
              },
              STOP: {
                target: 'Stopped',
              },
            },
          },
          Starting: {
            on: {
              START_RECORDING: {
                actions: 'setStopRecordingCallback',
                target: 'Started',
              },
              RESET_RECORDER: {
                target: 'IntendToStart',
              },
              STOP: {
                target: 'Stopped',
              },
            },
          },
          Started: {
            exit: 'callStopRecordingCallback',
            on: {
              STOP: {
                target: 'Stopped',
              },
              RESET_RECORDER: {
                target: 'IntendToStart',
              },
            },
          },
        },
      },
      {
        actions: {
          setStopRecordingCallback: assign({
            stopRecording: (_, event) => (event.type === 'START_RECORDING' ? event?.stopRecording : undefined),
          }),
          setWorker: assign({
            worker: (_, event) => (event.type === 'DEFLATE_WORKER_CALLED' ? event?.worker : undefined),
          }),
          resetStopRecordingCallback: assign<Context>({
            stopRecording: undefined,
          }),
          resetWorker: assign<Context>({
            worker: undefined,
          }),
          callStopRecordingCallback: (context: Context) => context.stopRecording && context.stopRecording(),
          setSessionManager: assign({
            sessionManager: (_, event) => (event.type === 'INIT' ? event?.sessionManager : undefined),
          }),
        },
      }
    )

  const service = interpret(recorderMachine)

  service.start()
  return service
}

/**
 * Test for Browser features used while recording
 */
export function isBrowserSupported() {
  return (
    // Array.from is a bit less supported by browsers than CSSSupportsRule, but has higher chances
    // to be polyfilled. Test for both to be more confident. We could add more things if we find out
    // this test is not sufficient.
    typeof Array.from === 'function' && typeof CSSSupportsRule === 'function'
  )
}
