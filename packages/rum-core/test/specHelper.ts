import {
  assign,
  combine,
  Observable,
  TimeStamp,
  noop,
  setCookie,
  deleteCookie,
  ONE_MINUTE,
} from '@datadog/browser-core'
import { SPEC_ENDPOINTS, mockClock, Clock, buildLocation } from '../../core/test/specHelper'
import { RecorderApi } from '../src/boot/rumPublicApi'
import { ForegroundContexts } from '../src/domain/foregroundContexts'
import { LifeCycle, LifeCycleEventType, RawRumEventCollectedData } from '../src/domain/lifeCycle'
import { ParentContexts } from '../src/domain/parentContexts'
import { trackViews, ViewEvent } from '../src/domain/rumEventsCollection/view/trackViews'
import { RumSessionManager, RumSessionPlan } from '../src/domain/rumSessionManager'
import { RawRumEvent, RumContext, ViewContext, UrlContext } from '../src/rawRumEvent.types'
import { LocationChange } from '../src/browser/locationChangeObservable'
import { UrlContexts } from '../src/domain/urlContexts'
import {
  BrowserWindow,
  SYNTHETICS_INJECTS_RUM_COOKIE_NAME,
  SYNTHETICS_RESULT_ID_COOKIE_NAME,
  SYNTHETICS_TEST_ID_COOKIE_NAME,
} from '../src/domain/syntheticsContext'
import { RumConfiguration, validateAndBuildRumConfiguration } from '../src/domain/configuration'
import { validateFormat } from './formatValidation'
import { createRumSessionManagerMock } from './mockRumSessionManager'

export interface TestSetupBuilder {
  withFakeLocation: (initialUrl: string) => TestSetupBuilder
  withSessionManager: (sessionManager: RumSessionManager) => TestSetupBuilder
  withConfiguration: (overrides: Partial<RumConfiguration>) => TestSetupBuilder
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
  configuration: Readonly<RumConfiguration>
  sessionManager: RumSessionManager
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
  const FAKE_APP_ID = 'appId'
  const configuration: RumConfiguration = {
    ...validateAndBuildRumConfiguration({ clientToken: 'xxx', applicationId: FAKE_APP_ID })!,
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

  const setupBuilder = {
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
          sessionManager,
          applicationId: FAKE_APP_ID,
          configuration,
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

// Duration to create a cookie lasting at least until the end of the test
const COOKIE_DURATION = ONE_MINUTE

export function mockSyntheticsWorkerValues(
  { publicId, resultId, injectsRum }: { publicId?: any; resultId?: any; injectsRum?: any } = {
    publicId: 'synthetics_public_id',
    resultId: 'synthetics_result_id',
    injectsRum: false,
  },
  method: 'globals' | 'cookies' = 'globals'
) {
  switch (method) {
    case 'globals':
      ;(window as BrowserWindow)._DATADOG_SYNTHETICS_PUBLIC_ID = publicId
      ;(window as BrowserWindow)._DATADOG_SYNTHETICS_RESULT_ID = resultId
      ;(window as BrowserWindow)._DATADOG_SYNTHETICS_INJECTS_RUM = injectsRum
      break
    case 'cookies':
      if (publicId !== undefined) {
        setCookie(SYNTHETICS_TEST_ID_COOKIE_NAME, publicId, COOKIE_DURATION)
      }
      if (resultId !== undefined) {
        setCookie(SYNTHETICS_RESULT_ID_COOKIE_NAME, resultId, COOKIE_DURATION)
      }
      if (injectsRum !== undefined) {
        setCookie(SYNTHETICS_INJECTS_RUM_COOKIE_NAME, injectsRum, COOKIE_DURATION)
      }
      break
  }
}

export function cleanupSyntheticsWorkerValues() {
  delete (window as BrowserWindow)._DATADOG_SYNTHETICS_PUBLIC_ID
  delete (window as BrowserWindow)._DATADOG_SYNTHETICS_RESULT_ID
  delete (window as BrowserWindow)._DATADOG_SYNTHETICS_INJECTS_RUM
  deleteCookie(SYNTHETICS_TEST_ID_COOKIE_NAME)
  deleteCookie(SYNTHETICS_RESULT_ID_COOKIE_NAME)
  deleteCookie(SYNTHETICS_INJECTS_RUM_COOKIE_NAME)
}
