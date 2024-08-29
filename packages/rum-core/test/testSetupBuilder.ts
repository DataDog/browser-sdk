import type { ContextManager, CustomerDataTrackerManager } from '@datadog/browser-core'
import {
  assign,
  createContextManager,
  createCustomerDataTrackerManager,
  CustomerDataType,
  noop,
  Observable,
} from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { registerCleanupTask, mockClock, buildLocation, SPEC_ENDPOINTS } from '@datadog/browser-core/test'
import type { LocationChange } from '../src/browser/locationChangeObservable'
import type { RumConfiguration } from '../src/domain/configuration'
import { validateAndBuildRumConfiguration } from '../src/domain/configuration'
import type { FeatureFlagContexts } from '../src/domain/contexts/featureFlagContext'
import type { PageStateHistory } from '../src/domain/contexts/pageStateHistory'
import type { UrlContexts } from '../src/domain/contexts/urlContexts'
import type { ViewHistory } from '../src/domain/contexts/viewHistoryEntries'
import type { RawRumEventCollectedData } from '../src/domain/lifeCycle'
import { LifeCycle } from '../src/domain/lifeCycle'
import type { ActionContexts } from '../src/domain/action/actionCollection'
import type { RumSessionManager } from '../src/domain/rumSessionManager'
import type { DisplayContext } from '../src/domain/contexts/displayContext'
import { collectAndValidateRawRumEvents } from './formatValidation'
import { createRumSessionManagerMock } from './mockRumSessionManager'
import { mockPageStateHistory } from './mockPageStateHistory'

export interface TestSetupBuilder {
  withFakeLocation: (initialUrl: string) => TestSetupBuilder
  withSessionManager: (sessionManager: RumSessionManager) => TestSetupBuilder
  withConfiguration: (overrides: Partial<RumConfiguration>) => TestSetupBuilder
  withviewHistory: (stub: Partial<ViewHistory>) => TestSetupBuilder
  withActionContexts: (stub: ActionContexts) => TestSetupBuilder
  withPageStateHistory: (stub: Partial<PageStateHistory>) => TestSetupBuilder
  withFeatureFlagContexts: (stub: Partial<FeatureFlagContexts>) => TestSetupBuilder
  withFakeClock: () => TestSetupBuilder
  beforeBuild: (callback: BeforeBuildCallback) => TestSetupBuilder

  clock: Clock | undefined
  domMutationObservable: Observable<void>
  build: () => TestIO
}

type BeforeBuildCallback = (buildContext: BuildContext) => void | { stop: () => void }

export interface BuildContext {
  lifeCycle: LifeCycle
  domMutationObservable: Observable<void>
  locationChangeObservable: Observable<LocationChange>
  configuration: Readonly<RumConfiguration>
  sessionManager: RumSessionManager
  location: Location
  applicationId: string
  viewHistory: ViewHistory
  actionContexts: ActionContexts
  displayContext: DisplayContext
  pageStateHistory: PageStateHistory
  featureFlagContexts: FeatureFlagContexts
  urlContexts: UrlContexts
  globalContextManager: ContextManager
  userContextManager: ContextManager
  customerDataTrackerManager: CustomerDataTrackerManager
}

export interface TestIO {
  lifeCycle: LifeCycle
  domMutationObservable: Observable<void>
  changeLocation: (to: string) => void
  clock: Clock
  fakeLocation: Partial<Location>
  sessionManager: RumSessionManager
  rawRumEvents: RawRumEventCollectedData[]
}

export function setup(): TestSetupBuilder {
  let sessionManager: RumSessionManager = createRumSessionManagerMock().setId('1234')
  const lifeCycle = new LifeCycle()
  const domMutationObservable = new Observable<void>()
  const locationChangeObservable = new Observable<LocationChange>()
  const cleanupTasks: Array<() => void> = []
  const beforeBuildTasks: BeforeBuildCallback[] = []

  let clock: Clock
  let fakeLocation: Partial<Location> = location
  let viewHistory: ViewHistory
  const urlContexts: UrlContexts = {
    findUrl: () => ({
      url: fakeLocation.href!,
      referrer: document.referrer,
    }),
    stop: noop,
  }
  let featureFlagContexts: FeatureFlagContexts = {
    findFeatureFlagEvaluations: () => undefined,
    addFeatureFlagEvaluation: noop,
    stop: noop,
  }
  let actionContexts: ActionContexts = {
    findActionId: noop as () => undefined,
  }
  const displayContext: DisplayContext = {
    get: () => ({ viewport: { height: 0, width: 0 } }),
    stop: noop,
  }

  const customerDataTrackerManager = createCustomerDataTrackerManager()
  const globalContextManager = createContextManager(
    customerDataTrackerManager.getOrCreateTracker(CustomerDataType.GlobalContext)
  )
  const userContextManager = createContextManager(customerDataTrackerManager.getOrCreateTracker(CustomerDataType.User))
  let pageStateHistory = mockPageStateHistory()
  const FAKE_APP_ID = 'appId'
  const configuration: RumConfiguration = {
    ...validateAndBuildRumConfiguration({
      clientToken: 'xxx',
      applicationId: FAKE_APP_ID,
      trackResources: true,
      trackLongTasks: true,
    })!,
    ...SPEC_ENDPOINTS,
  }

  function changeLocation(to: string) {
    const currentLocation = { ...fakeLocation }
    assign(fakeLocation, buildLocation(to, fakeLocation.href))
    locationChangeObservable.notify({
      oldLocation: currentLocation as Location,
      newLocation: fakeLocation as Location,
    })
  }

  const rawRumEvents = collectAndValidateRawRumEvents(lifeCycle)

  const setupBuilder: TestSetupBuilder = {
    domMutationObservable,
    get clock() {
      return clock
    },

    withFakeLocation(initialUrl: string) {
      fakeLocation = buildLocation(initialUrl)
      return setupBuilder
    },
    withSessionManager(stub: RumSessionManager) {
      sessionManager = stub
      return setupBuilder
    },
    withConfiguration(overrides: Partial<RumConfiguration>) {
      assign(configuration, overrides)
      return setupBuilder
    },
    withviewHistory(stub: Partial<ViewHistory>) {
      viewHistory = stub as ViewHistory
      return setupBuilder
    },
    withActionContexts(stub: ActionContexts) {
      actionContexts = stub
      return setupBuilder
    },
    withPageStateHistory(stub: Partial<PageStateHistory>) {
      pageStateHistory = { ...pageStateHistory, ...stub }
      return setupBuilder
    },
    withFeatureFlagContexts(stub: Partial<FeatureFlagContexts>) {
      featureFlagContexts = { ...featureFlagContexts, ...stub }
      return setupBuilder
    },
    withFakeClock() {
      clock = mockClock()
      return setupBuilder
    },

    beforeBuild(callback: BeforeBuildCallback) {
      beforeBuildTasks.push(callback)
      return setupBuilder
    },
    build() {
      beforeBuildTasks.forEach((task) => {
        const result = task({
          lifeCycle,
          domMutationObservable,
          locationChangeObservable,
          viewHistory,
          urlContexts,
          actionContexts,
          displayContext,
          pageStateHistory,
          featureFlagContexts,
          sessionManager,
          applicationId: FAKE_APP_ID,
          configuration,
          location: fakeLocation as Location,
          globalContextManager,
          userContextManager,
          customerDataTrackerManager,
        })
        if (result && result.stop) {
          cleanupTasks.push(result.stop)
        }
      })
      return {
        clock,
        fakeLocation,
        lifeCycle,
        domMutationObservable,
        rawRumEvents,
        sessionManager,
        changeLocation,
      }
    },
  }
  registerCleanupTask(() => {
    cleanupTasks.forEach((task) => task())
    // perform these steps at the end to generate correct events in cleanup and validate them
    if (clock) {
      clock.cleanup()
    }
  })
  return setupBuilder
}
