import {
  assign,
  buildUrl,
  combine,
  Configuration,
  Context,
  DEFAULT_CONFIGURATION,
  PerformanceObserverStubBuilder,
  SPEC_ENDPOINTS,
  withSnakeCaseKeys,
} from '@datadog/browser-core'
import sinon from 'sinon'
import { startRumEventCollection } from '../src/boot/rum'
import { startPerformanceCollection } from '../src/browser/performanceCollection'
import { startRumAssembly } from '../src/domain/assembly'
import { startRumAssemblyV2 } from '../src/domain/assemblyV2'
import { LifeCycle, LifeCycleEventType } from '../src/domain/lifeCycle'
import { ParentContexts, startParentContexts } from '../src/domain/parentContexts'
import { trackActions } from '../src/domain/rumEventsCollection/action/trackActions'
import { trackViews } from '../src/domain/rumEventsCollection/view/trackViews'
import { RumSession } from '../src/domain/rumSession'
import { RawRumEvent } from '../src/types'
import { RawRumEventV2, RumContextV2, ViewContextV2 } from '../src/typesV2'
import { validateFormat } from './formatValidation'

interface BrowserWindow extends Window {
  PerformanceObserver?: PerformanceObserver
}

export interface TestSetupBuilder {
  withFakeLocation: (initialUrl: string) => TestSetupBuilder
  withSession: (session: RumSession) => TestSetupBuilder
  withRum: () => TestSetupBuilder
  withViewCollection: () => TestSetupBuilder
  withActionCollection: () => TestSetupBuilder
  withPerformanceCollection: () => TestSetupBuilder
  withParentContexts: (stub?: Partial<ParentContexts>) => TestSetupBuilder
  withAssembly: () => TestSetupBuilder
  withAssemblyV2: () => TestSetupBuilder
  withFakeClock: () => TestSetupBuilder
  withFakeServer: () => TestSetupBuilder
  withPerformanceObserverStubBuilder: () => TestSetupBuilder
  beforeBuild: (
    callback: (lifeCycle: LifeCycle, configuration: Configuration, session: RumSession) => void
  ) => TestSetupBuilder

  cleanup: () => void
  build: () => TestIO
}

export interface TestIO {
  lifeCycle: LifeCycle
  server: sinon.SinonFakeServer
  stubBuilder: PerformanceObserverStubBuilder
  clock: jasmine.Clock
  parentContexts: ParentContexts
  fakeLocation: Partial<Location>
  setGlobalContext: (context: Context) => void
  session: RumSession
  rawRumEvents: Array<{
    startTime: number
    rawRumEvent: RawRumEvent
    savedGlobalContext?: Context
    customerContext?: Context
  }>
  rawRumEventsV2: Array<{
    startTime: number
    rawRumEvent: RawRumEventV2
    savedGlobalContext?: Context
    customerContext?: Context
  }>
}

export function setup(): TestSetupBuilder {
  let session = {
    getId: () => '1234' as string | undefined,
    isTracked: () => true,
    isTrackedWithResource: () => true,
  }
  const lifeCycle = new LifeCycle()
  const cleanupTasks: Array<() => void> = []
  const beforeBuildTasks: Array<(lifeCycle: LifeCycle, configuration: Configuration, session: RumSession) => void> = []
  const buildTasks: Array<() => void> = []
  const rawRumEvents: Array<{
    startTime: number
    rawRumEvent: RawRumEvent
    savedGlobalContext?: Context
    customerContext?: Context
  }> = []
  const rawRumEventsV2: Array<{
    startTime: number
    rawRumEvent: RawRumEventV2
    savedGlobalContext?: Context
    customerContext?: Context
  }> = []

  let globalContext: Context
  let server: sinon.SinonFakeServer
  let clock: jasmine.Clock
  let stubBuilder: PerformanceObserverStubBuilder
  let fakeLocation: Partial<Location> = location
  let parentContexts: ParentContexts
  const configuration: Partial<Configuration> = {
    ...DEFAULT_CONFIGURATION,
    ...SPEC_ENDPOINTS,
    isEnabled: () => true,
    maxBatchSize: 1,
  }
  const FAKE_APP_ID = 'appId'

  const setupBuilder = {
    withFakeLocation(initialUrl: string) {
      fakeLocation = buildLocation(initialUrl, location.href)
      spyOn(history, 'pushState').and.callFake((_: any, __: string, pathname: string) => {
        assign(fakeLocation, buildLocation(pathname, fakeLocation.href!))
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
    withRum() {
      buildTasks.push(() => {
        let stopRum
        ;({ parentContexts, stop: stopRum } = startRumEventCollection(
          FAKE_APP_ID,
          fakeLocation as Location,
          lifeCycle,
          configuration as Configuration,
          session,
          () => globalContext
        ))
        cleanupTasks.push(stopRum)
      })

      return setupBuilder
    },
    withAssembly() {
      buildTasks.push(() => {
        startRumAssembly(
          FAKE_APP_ID,
          configuration as Configuration,
          lifeCycle,
          session,
          parentContexts,
          () => globalContext
        )
      })
      return setupBuilder
    },
    withAssemblyV2() {
      buildTasks.push(() => {
        startRumAssemblyV2(
          FAKE_APP_ID,
          configuration as Configuration,
          lifeCycle,
          session,
          parentContexts,
          () => globalContext
        )
      })
      return setupBuilder
    },
    withViewCollection() {
      buildTasks.push(() => {
        const { stop } = trackViews(fakeLocation as Location, lifeCycle)
        cleanupTasks.push(stop)
      })
      return setupBuilder
    },
    withActionCollection() {
      buildTasks.push(() => {
        const { stop } = trackActions(lifeCycle)
        cleanupTasks.push(stop)
      })
      return setupBuilder
    },
    withPerformanceCollection() {
      buildTasks.push(() => startPerformanceCollection(lifeCycle, configuration as Configuration))
      return setupBuilder
    },
    withParentContexts(stub?: Partial<ParentContexts>) {
      if (stub) {
        parentContexts = stub as ParentContexts
        return setupBuilder
      }
      buildTasks.push(() => {
        parentContexts = startParentContexts(lifeCycle, session)
        cleanupTasks.push(() => {
          parentContexts.stop()
        })
      })
      return setupBuilder
    },
    withFakeClock() {
      jasmine.clock().install()
      jasmine.clock().mockDate()
      const start = Date.now()
      spyOn(performance, 'now').and.callFake(() => Date.now() - start)
      clock = jasmine.clock()
      cleanupTasks.push(() => {
        jasmine.clock().uninstall()
      })
      return setupBuilder
    },
    withFakeServer() {
      server = sinon.fakeServer.create()
      cleanupTasks.push(() => server.restore())
      return setupBuilder
    },
    withPerformanceObserverStubBuilder() {
      const browserWindow = window as BrowserWindow
      const original = browserWindow.PerformanceObserver
      stubBuilder = new PerformanceObserverStubBuilder()
      browserWindow.PerformanceObserver = stubBuilder.getStub()
      cleanupTasks.push(() => (browserWindow.PerformanceObserver = original))
      return setupBuilder
    },
    beforeBuild(callback: (lifeCycle: LifeCycle, configuration: Configuration, session: RumSession) => void) {
      beforeBuildTasks.push(callback)
      return setupBuilder
    },
    build() {
      beforeBuildTasks.forEach((task) => task(lifeCycle, configuration as Configuration, session))
      buildTasks.forEach((task) => task())
      lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (data) => rawRumEvents.push(data))
      lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_V2_COLLECTED, (data) => {
        rawRumEventsV2.push(data)
        validateRumEventFormat(data.rawRumEvent)
      })
      return {
        clock,
        fakeLocation,
        lifeCycle,
        parentContexts,
        rawRumEvents,
        rawRumEventsV2,
        server,
        session,
        stubBuilder,
        setGlobalContext(context: Context) {
          globalContext = context
        },
      }
    },
    cleanup() {
      cleanupTasks.forEach((task) => task())
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

function validateRumEventFormat(rawRumEvent: RawRumEventV2) {
  const fakeId = '00000000-aaaa-0000-aaaa-000000000000'
  const fakeContext: RumContextV2 & ViewContextV2 = {
    _dd: {
      formatVersion: 2,
    },
    application: {
      id: fakeId,
    },
    date: 0,
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
  validateFormat(withSnakeCaseKeys(combine(fakeContext, rawRumEvent)))
}
