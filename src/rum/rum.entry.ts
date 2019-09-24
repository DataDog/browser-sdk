import { UserConfiguration } from '../core/configuration'

import { commonInit, makeGlobal, makeStub } from '../core/init'
import { monitor } from '../core/internalMonitoring'
import { startRequestCollection } from '../core/requestCollection'
import { cookieAuthorized } from '../core/utils'
import { startRum } from './rum'
import { startRumSession } from './rumSession'

declare global {
  interface Window {
    DD_RUM: RumGlobal
  }
}

export interface RumUserConfiguration extends UserConfiguration {
  applicationId: string
}

const STUBBED_RUM = {
  init(userConfiguration: RumUserConfiguration) {
    makeStub('core.init')
  },
}

export type RumGlobal = typeof STUBBED_RUM

window.DD_RUM = makeGlobal(STUBBED_RUM)
window.DD_RUM.init = monitor((userConfiguration: RumUserConfiguration) => {
  if (!cookieAuthorized) {
    console.error('Cookies are not authorized, we will not send any data.')
    return
  }
  if (!userConfiguration || (!userConfiguration.clientToken && !userConfiguration.publicApiKey)) {
    console.error('Client Token is not configured, we will not send any data.')
    return
  }
  if (userConfiguration.publicApiKey) {
    userConfiguration.clientToken = userConfiguration.publicApiKey
  }
  if (!userConfiguration.applicationId) {
    console.error('Application ID is not configured, no RUM data will be collected.')
    return
  }
  const rumUserConfiguration = { ...userConfiguration, isCollectingError: true }

  const { errorObservable, configuration } = commonInit(rumUserConfiguration)
  const session = startRumSession(configuration)
  const requestObservable = startRequestCollection()

  startRum(rumUserConfiguration.applicationId, errorObservable, requestObservable, configuration, session)
})
