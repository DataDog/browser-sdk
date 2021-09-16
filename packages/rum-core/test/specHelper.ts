import {
  assign,
  buildUrl,
  combine,
  Configuration,
  DEFAULT_CONFIGURATION,
  Observable,
  TimeStamp,
  noop,
} from '@datadog/browser-core'
import { SPEC_ENDPOINTS, mockClock, Clock } from '../../core/test/specHelper'
import { RecorderApi } from '../src/boot/rumPublicApi'
import { ForegroundContexts } from '../src/domain/foregroundContexts'
import { LifeCycle, LifeCycleEventType, RawRumEventCollectedData } from '../src/domain/lifeCycle'
import { ParentContexts } from '../src/domain/parentContexts'
import { trackViews, ViewEvent } from '../src/domain/rumEventsCollection/view/trackViews'
import { RumSession, RumSessionPlan } from '../src/domain/rumSession'
import { RawRumEvent, RumContext, ViewContext } from '../src/rawRumEvent.types'
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
  configuration: Readonly<Configuration>
  session: RumSession
  location: Location
  applicationId: string
  parentContexts: ParentContexts
  foregroundContexts: ForegroundContexts
}

export interface TestIO {
  lifeCycle: LifeCycle
  domMutationObservable: Observable<void>
  clock: Clock
  fakeLocation: Partial<Location>
  session: RumSession
  rawRumEvents: RawRumEventCollectedData[]
}

export function setup(): TestSetupBuilder {
  let session: RumSession = createRumSessionMock().setId('1234')
  const lifeCycle = new LifeCycle()
  const domMutationObservable = new Observable<void>()
  const cleanupTasks: Array<() => void> = []
  const beforeBuildTasks: BeforeBuildCallback[] = []
  const rawRumEvents: RawRumEventCollectedData[] = []

  let clock: Clock
  let fakeLocation: Partial<Location> = location
  let parentContexts: ParentContexts
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

  const setupBuilder = {
    withFakeLocation(initialUrl: string) {
      fakeLocation = buildLocation(initialUrl, location.href)
      spyOn(history, 'pushState').and.callFake((_: any, __: string, pathname: string) => {
        assign(fakeLocation, buildLocation(pathname, fakeLocation.href))
      })

      function hashchangeCallBack() {
        fakeLocation.hash = window.location.hash
      }

      window.addEventListener('hashchange', hashchangeCallBack)

      cleanupTasks.push(() => {
        window.removeEventListener('hashchange', hashchangeCallBack)
        window.location.hash = ''
      })

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
          parentContexts,
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

function buildLocation(url: string, base?: string) {
  const urlObject = buildUrl(url, base)
  return {
    hash: urlObject.hash,
    href: urlObject.href,
    pathname: urlObject.pathname,
    search: urlObject.search,
  }
}

function validateRumEventFormat(rawRumEvent: RawRumEvent) {
  const fakeId = '00000000-aaaa-0000-aaaa-000000000000'
  const fakeContext: RumContext & ViewContext = {
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
  { lifeCycle, location, domMutationObservable, configuration }: BuildContext,
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
