import type { Context, ContextManager, ServerDuration, TimeStamp } from '@datadog/browser-core'
import { CustomerDataType, assign, combine, createContextManager, noop, Observable } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { mockClock, buildLocation, SPEC_ENDPOINTS } from '@datadog/browser-core/test'
import type { LocationChange } from '../src/browser/locationChangeObservable'
import type { RumConfiguration } from '../src/domain/configuration'
import { validateAndBuildRumConfiguration } from '../src/domain/configuration'
import type { FeatureFlagContexts } from '../src/domain/contexts/featureFlagContext'
import type { ForegroundContexts } from '../src/domain/contexts/foregroundContexts'
import type { PageStateHistory } from '../src/domain/contexts/pageStateHistory'
import { PageState } from '../src/domain/contexts/pageStateHistory'
import type { UrlContexts } from '../src/domain/contexts/urlContexts'
import type { ViewContexts } from '../src/domain/contexts/viewContexts'
import type { RawRumEventCollectedData } from '../src/domain/lifeCycle'
import { LifeCycle, LifeCycleEventType } from '../src/domain/lifeCycle'
import type { ActionContexts } from '../src/domain/rumEventsCollection/action/actionCollection'
import type { RumSessionManager } from '../src/domain/rumSessionManager'
import { RumSessionPlan } from '../src/domain/rumSessionManager'
import type { RawRumEvent, RumContext } from '../src/rawRumEvent.types'
import { validateRumFormat } from './formatValidation'
import { createRumSessionManagerMock } from './mockRumSessionManager'

export interface TestSetupBuilder {
  withFakeLocation: (initialUrl: string) => TestSetupBuilder
  withSessionManager: (sessionManager: RumSessionManager) => TestSetupBuilder
  withConfiguration: (overrides: Partial<RumConfiguration>) => TestSetupBuilder
  withViewContexts: (stub: Partial<ViewContexts>) => TestSetupBuilder
  withActionContexts: (stub: ActionContexts) => TestSetupBuilder
  withForegroundContexts: (stub: Partial<ForegroundContexts>) => TestSetupBuilder
  withFeatureFlagContexts: (stub: Partial<FeatureFlagContexts>) => TestSetupBuilder
  withFakeClock: () => TestSetupBuilder
  beforeBuild: (callback: BeforeBuildCallback) => TestSetupBuilder

  clock: Clock | undefined
  domMutationObservable: Observable<void>

  cleanup: () => void
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
  viewContexts: ViewContexts
  actionContexts: ActionContexts
  foregroundContexts: ForegroundContexts
  pageStateHistory: PageStateHistory
  featureFlagContexts: FeatureFlagContexts
  urlContexts: UrlContexts
  globalContextManager: ContextManager
  userContextManager: ContextManager
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
  const rawRumEvents: RawRumEventCollectedData[] = []

  let clock: Clock
  let fakeLocation: Partial<Location> = location
  let viewContexts: ViewContexts
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
    getFeatureFlagBytesCount: () => 0,
  }
  let actionContexts: ActionContexts = {
    findActionId: noop as () => undefined,
  }
  let foregroundContexts: ForegroundContexts = {
    isInForegroundAt: () => undefined,
    selectInForegroundPeriodsFor: () => undefined,
    stop: noop,
  }
  const globalContextManager = createContextManager(CustomerDataType.GlobalContext)
  const userContextManager = createContextManager(CustomerDataType.User)
  const pageStateHistory: PageStateHistory = {
    findAll: () => [{ start: 0 as ServerDuration, state: PageState.ACTIVE }],
    addPageState: noop,
    stop: noop,
  }
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

  // ensure that events generated before build are collected
  const rawRumEventsCollected = lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (data) => {
    rawRumEvents.push(data)
    validateRumEventFormat(data.rawRumEvent)
  })

  function changeLocation(to: string) {
    const currentLocation = { ...fakeLocation }
    assign(fakeLocation, buildLocation(to, fakeLocation.href))
    locationChangeObservable.notify({
      oldLocation: currentLocation as Location,
      newLocation: fakeLocation as Location,
    })
  }

  const setupBuilder: TestSetupBuilder = {
    domMutationObservable,
    get clock() {
      return clock
    },

    withFakeLocation(initialUrl: string) {
      fakeLocation = buildLocation(initialUrl)
      return setupBuilder
    },
    withSessionManager(sessionManagerStub: RumSessionManager) {
      sessionManager = sessionManagerStub
      return setupBuilder
    },
    withConfiguration(overrides: Partial<RumConfiguration>) {
      assign(configuration, overrides)
      return setupBuilder
    },
    withViewContexts(stub: Partial<ViewContexts>) {
      viewContexts = stub as ViewContexts
      return setupBuilder
    },
    withActionContexts(stub: ActionContexts) {
      actionContexts = stub
      return setupBuilder
    },
    withForegroundContexts(stub: Partial<ForegroundContexts>) {
      foregroundContexts = { ...foregroundContexts, ...stub }
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
          viewContexts,
          urlContexts,
          actionContexts,
          foregroundContexts,
          pageStateHistory,
          featureFlagContexts,
          sessionManager,
          applicationId: FAKE_APP_ID,
          configuration,
          location: fakeLocation as Location,
          globalContextManager,
          userContextManager,
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
    cleanup() {
      cleanupTasks.forEach((task) => task())
      // perform these steps at the end to generate correct events in cleanup and validate them
      clock?.cleanup()
      rawRumEventsCollected.unsubscribe()
    },
  }
  return setupBuilder
}

function validateRumEventFormat(rawRumEvent: RawRumEvent) {
  const fakeId = '00000000-aaaa-0000-aaaa-000000000000'
  const fakeContext: RumContext = {
    _dd: {
      format_version: 2,
      drift: 0,
      session: {
        plan: RumSessionPlan.WITH_SESSION_REPLAY,
      },
    },
    application: {
      id: fakeId,
    },
    date: 0 as TimeStamp,
    source: 'browser',
    session: {
      id: fakeId,
      type: 'user',
    },
    view: {
      id: fakeId,
      referrer: '',
      url: 'fake url',
    },
  }
  validateRumFormat(combine(fakeContext as RumContext & Context, rawRumEvent))
}
