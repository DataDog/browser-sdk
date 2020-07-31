import {
  assign,
  buildUrl,
  Configuration,
  DEFAULT_CONFIGURATION,
  InternalMonitoring,
  PerformanceObserverStubBuilder,
  SPEC_ENDPOINTS,
} from '@datadog/browser-core'
import sinon from 'sinon'
import { RumGlobal } from '../src'
import { LifeCycle } from '../src/lifeCycle'
import { ParentContexts, startParentContexts } from '../src/parentContexts'
import { startPerformanceCollection } from '../src/performanceCollection'
import { startRum } from '../src/rum'
import { RumSession } from '../src/rumSession'
import { startUserActionCollection } from '../src/userActionCollection'
import { startViewCollection } from '../src/viewCollection'

interface BrowserWindow extends Window {
  PerformanceObserver?: PerformanceObserver
}

export type RumApi = Omit<RumGlobal, 'init'>

const internalMonitoringStub: InternalMonitoring = {
  setExternalContextProvider: () => undefined,
}

const configuration = {
  ...DEFAULT_CONFIGURATION,
  ...SPEC_ENDPOINTS,
  isEnabled: () => true,
  maxBatchSize: 1,
}

export interface TestSetupBuilder {
  withFakeLocation: (initialUrl: string) => TestSetupBuilder
  withSession: (session: RumSession) => TestSetupBuilder
  withRum: () => TestSetupBuilder
  withViewCollection: () => TestSetupBuilder
  withUserActionCollection: () => TestSetupBuilder
  withPerformanceCollection: () => TestSetupBuilder
  withParentContexts: () => TestSetupBuilder
  withFakeClock: () => TestSetupBuilder
  withFakeServer: () => TestSetupBuilder
  withPerformanceObserverStubBuilder: () => TestSetupBuilder
  beforeBuild: (callback: (lifeCycle: LifeCycle) => void) => TestSetupBuilder

  cleanup: () => void
  build: () => TestIO
}

export interface TestIO {
  lifeCycle: LifeCycle
  server: sinon.SinonFakeServer
  stubBuilder: PerformanceObserverStubBuilder
  rumApi: RumApi
  clock: jasmine.Clock
  parentContexts: ParentContexts
  fakeLocation: Partial<Location>
}

export function setup(): TestSetupBuilder {
  let session = {
    getId: () => '1234' as string | undefined,
    isTracked: () => true,
    isTrackedWithResource: () => true,
  }
  const lifeCycle = new LifeCycle()
  const cleanupTasks: Array<() => void> = []
  const beforeBuildTasks: Array<(lifeCycle: LifeCycle) => void> = []
  const buildTasks: Array<() => void> = []

  let server: sinon.SinonFakeServer
  let clock: jasmine.Clock
  let stubBuilder: PerformanceObserverStubBuilder
  let rumApi: RumApi
  let fakeLocation: Partial<Location> = location
  let parentContexts: ParentContexts

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
      buildTasks.push(
        () =>
          (rumApi = startRum(
            'appId',
            fakeLocation as Location,
            lifeCycle,
            configuration as Configuration,
            session,
            internalMonitoringStub
          ))
      )
      return setupBuilder
    },
    withViewCollection() {
      buildTasks.push(() => {
        const { stop } = startViewCollection(fakeLocation as Location, lifeCycle)
        cleanupTasks.push(stop)
      })
      return setupBuilder
    },
    withUserActionCollection() {
      buildTasks.push(() => {
        const { stop } = startUserActionCollection(lifeCycle)
        cleanupTasks.push(stop)
      })
      return setupBuilder
    },
    withPerformanceCollection() {
      buildTasks.push(() => startPerformanceCollection(lifeCycle, session))
      return setupBuilder
    },
    withParentContexts() {
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
      spyOn(performance, 'now').and.callFake(() => Date.now())
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
    beforeBuild(callback: (lifeCycle: LifeCycle) => void) {
      beforeBuildTasks.push(callback)
      return setupBuilder
    },
    build() {
      beforeBuildTasks.forEach((task) => task(lifeCycle))
      buildTasks.forEach((task) => task())
      return { server, lifeCycle, stubBuilder, rumApi, clock, parentContexts, fakeLocation }
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
