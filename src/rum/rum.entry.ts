import lodashAssign from 'lodash.assign'

import { UserConfiguration } from '../core/configuration'
import { commonInit, makeGlobal, makeStub } from '../core/init'
import { monitor } from '../core/internalMonitoring'
import { startRequestCollection } from '../core/requestCollection'
import { Context, ContextValue } from '../core/utils'
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
  addRumGlobalContext(key: string, value: ContextValue) {
    makeStub('addRumGlobalContext')
  },
  setRumGlobalContext(context: Context) {
    makeStub('setRumGlobalContext')
  },
  addCustomEvent(name: string, context: Context) {
    makeStub('addCustomEvent')
  },
}

export type RumGlobal = typeof STUBBED_RUM

window.DD_RUM = makeGlobal(STUBBED_RUM)
window.DD_RUM.init = monitor((userConfiguration: RumUserConfiguration) => {
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

  const globalApi = startRum(
    rumUserConfiguration.applicationId,
    errorObservable,
    requestObservable,
    configuration,
    session
  )
  lodashAssign(window.DD_RUM, globalApi)
})
