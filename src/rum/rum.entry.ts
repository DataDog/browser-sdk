import { UserConfiguration } from '../core/configuration'

import { commonInit, makeGlobal, makeStub } from '../core/init'
import { monitor } from '../core/internalMonitoring'
import { startRum } from './rum'

declare global {
  interface Window {
    DD_RUM: RumGlobal
  }
}

export interface RumUserConfiguration extends UserConfiguration {
  applicationId?: string
  rumProjectId?: string
}

const STUBBED_RUM = {
  init(userConfiguration: RumUserConfiguration) {
    makeStub('core.init')
  },
}

export type RumGlobal = typeof STUBBED_RUM

window.DD_RUM = makeGlobal(STUBBED_RUM)
window.DD_RUM.init = monitor((userConfiguration: RumUserConfiguration) => {
  if (!userConfiguration || !userConfiguration.publicApiKey) {
    console.error('Public API Key is not configured, we will not send any data.')
    return
  }
  if (!userConfiguration.applicationId && !userConfiguration.rumProjectId) {
    console.error('application id is not configured, no RUM data will be collected')
    return
  }
  const rumUserConfiguration = { ...userConfiguration, isCollectingError: true }
  const { errorObservable, configuration } = commonInit(rumUserConfiguration)
  startRum(rumUserConfiguration.applicationId! || rumUserConfiguration.rumProjectId!, errorObservable, configuration)
})
