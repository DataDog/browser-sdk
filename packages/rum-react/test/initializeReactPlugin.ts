import type { Encoder, DeflateEncoderStreamId } from '@datadog/browser-core'
import { noop } from '@datadog/browser-core'
import type {
  LifeCycle,
  RumConfiguration,
  RumInitConfiguration,
  RumPublicApi,
  RumSessionManager,
  StartRumResult,
  ViewHistory,
} from '@datadog/browser-rum-core'
import type { ReactPluginConfiguration } from '../src/domain/reactPlugin'
import { reactPlugin, resetReactPlugin } from '../src/domain/reactPlugin'
import { registerCleanupTask } from '../../core/test'

const MOCK_SESSION_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

export function initializeReactPlugin({
  configuration = {},
  initConfiguration = {},
  publicApi = {},
  addError = noop,
  lifeCycle,
  sessionManager,
  viewHistory,
  createEncoder,
  rumConfiguration,
}: {
  configuration?: ReactPluginConfiguration
  initConfiguration?: Partial<RumInitConfiguration>
  publicApi?: Partial<RumPublicApi>
  addError?: StartRumResult['addError']
  lifeCycle?: LifeCycle
  sessionManager?: RumSessionManager
  viewHistory?: ViewHistory
  createEncoder?: (streamId: DeflateEncoderStreamId) => Encoder
  rumConfiguration?: RumConfiguration
} = {}) {
  resetReactPlugin()
  const plugin = reactPlugin(configuration)

  plugin.onInit({
    publicApi: {
      getInternalContext: () => ({ application_id: 'test-app', session_id: MOCK_SESSION_ID }),
      ...publicApi,
    } as RumPublicApi,
    initConfiguration: initConfiguration as RumInitConfiguration,
  })
  plugin.onRumStart({
    addError,
    lifeCycle,
    session: sessionManager,
    viewHistory,
    createEncoder,
    configuration: rumConfiguration,
  })

  registerCleanupTask(() => {
    resetReactPlugin()
  })
}
