import {
  assign,
  combine,
  Configuration,
  DEFAULT_CONFIGURATION,
  Observable,
  TimeStamp,
  noop,
} from '@datadog/browser-core'
import { SPEC_ENDPOINTS, mockClock, Clock, buildLocation } from '../../core/test/specHelper'
import { RecorderApi } from '../src/boot/rumPublicApi'
import { ForegroundContexts } from '../src/domain/foregroundContexts'
import { LifeCycle, LifeCycleEventType, RawRumEventCollectedData } from '../src/domain/lifeCycle'
import { ParentContexts } from '../src/domain/parentContexts'
import { trackViews, ViewEvent } from '../src/domain/rumEventsCollection/view/trackViews'
import { RumSession, RumSessionPlan } from '../src/domain/rumSession'
import { RawRumEvent, RumContext, ViewContext, UrlContext } from '../src/rawRumEvent.types'
import { LocationChange } from '../src/browser/locationChangeObservable'
import { UrlContexts } from '../src/domain/urlContexts'
import { validateFormat } from './formatValidation'
import { createRumSessionMock } from './mockRumSession'

export interface TestSetupBuilder {
  withFakeLocation: (initialUrl: string) => TestSetupBuilder
  withSession: (session: RumSession) => TestSetupBuilder
  withConfiguration: (overrides: Partial<Configuration>) => TestSetupBuilder
  withParentContexts: (stub: Partial<ParentContexts>) => TestSetupBuilder
  withForegroundContexts: (stub: Partial<ForegroundContexts>) => TestSetupBuilder
  withFakeClock: () => TestSetupBuilder
  beforeBuild: (callback: BeforeBuildCallback) => TestSetupBuilder

  cleanup: () => void
  build: () => TestIO
}

type BeforeBuildCallback = (buildContext: BuildContext) => void | { stop: () => void }
export interface BuildContext {
  lifeCycle: LifeCycle
  domMutationObservable: Observable<void>
  locationChangeObservable: Observable<LocationChange>
  configuration: Readonly<Configuration>
  session: RumSession
  location: Location
  applicationId: string
  parentContexts: ParentContexts
  foregroundContexts: ForegroundContexts
  urlContexts: UrlContexts
}

export interface TestIO {
  lifeCycle: LifeCycle
  domMutationObservable: Observable<void>
  changeLocation: (to: string) => void
  clock: Clock
  fakeLocation: Partial<Location>
  session: RumSession
  rawRumEvents: RawRumEventCollectedData[]
}

export function setup(): TestSetupBuilder {
  let session: RumSession = createRumSessionMock().setId('1234')
  const lifeCycle = new LifeCycle()
  const domMutationObservable = new Observable<void>()
  const locationChangeObservable = new Observable<LocationChange>()
  const cleanupTasks: Array<() => void> = []
  const beforeBuildTasks: BeforeBuildCallback[] = []
  const rawRumEvents: RawRumEventCollectedData[] = []

  let clock: Clock
  let fakeLocation: Partial<Location> = location
  let parentContexts: ParentContexts
  const urlContexts: UrlContexts = {
    findUrl: () => ({
      view: {
        url: fakeLocation.href!,
        referrer: document.referrer,
      },
    }),
    stop: noop,
  }
  let foregroundContexts: ForegroundContexts = {
    isInForegroundAt: () => undefined,
    selectInForegroundPeriodsFor: () => undefined,
    stop: noop,
  }
  const configuration: Partial<Configuration> = {
    ...DEFAULT_CONFIGURATION,
    ...SPEC_ENDPOINTS,
    isEnabled: () => true,
  }
  const FAKE_APP_ID = 'appId'

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

  const setupBuilder = {
    withFakeLocation(initialUrl: string) {
      fakeLocation = buildLocation(initialUrl)
      return setupBuilder
    },
    withSession(sessionStub: RumSession) {
      session = sessionStub
      return setupBuilder
    },
    withConfiguration(overrides: Partial<Configuration>) {
      assign(configuration, overrides)
      return setupBuilder
    },
    withParentContexts(stub: Partial<ParentContexts>) {
      parentContexts = stub as ParentContexts
      return setupBuilder
    },
    withForegroundContexts(stub: Partial<ForegroundContexts>) {
      foregroundContexts = { ...foregroundContexts, ...stub }
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
          parentContexts,
          urlContexts,
          foregroundContexts,
          session,
          applicationId: FAKE_APP_ID,
          configuration: configuration as Configuration,
          location: fakeLocation as Location,
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
        session,
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
  const fakeContext: RumContext & ViewContext & UrlContext = {
    _dd: {
      format_version: 2,
      drift: 0,
      session: {
        plan: RumSessionPlan.REPLAY,
      },
    },
    application: {
      id: fakeId,
    },
    date: 0 as TimeStamp,
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
  validateFormat(combine(fakeContext, rawRumEvent))
}

export type ViewTest = ReturnType<typeof setupViewTest>

export function setupViewTest(
  { lifeCycle, location, domMutationObservable, configuration, locationChangeObservable }: BuildContext,
  initialViewName?: string
) {
  const { handler: viewUpdateHandler, getViewEvent: getViewUpdate, getHandledCount: getViewUpdateCount } = spyOnViews(
    'view update'
  )
  lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, viewUpdateHandler)
  const { handler: viewCreateHandler, getViewEvent: getViewCreate, getHandledCount: getViewCreateCount } = spyOnViews(
    'view create'
  )
  lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, viewCreateHandler)
  const { stop, startView, addTiming } = trackViews(
    location,
    lifeCycle,
    domMutationObservable,
    locationChangeObservable,
    !configuration.trackViewsManually,
    initialViewName
  )
  return {
    stop,
    startView,
    addTiming,
    getViewUpdate,
    getViewUpdateCount,
    getViewCreate,
    getViewCreateCount,
  }
}

export function spyOnViews(name?: string) {
  const handler = jasmine.createSpy(name)

  function getViewEvent(index: number) {
    return handler.calls.argsFor(index)[0] as ViewEvent
  }

  function getHandledCount() {
    return handler.calls.count()
  }

  return { handler, getViewEvent, getHandledCount }
}

export const noopRecorderApi: RecorderApi = {
  start: noop,
  stop: noop,
  isRecording: () => false,
  onRumStart: noop,
  getReplayStats: () => undefined,
}
