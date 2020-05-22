import {
  Configuration,
  DEFAULT_CONFIGURATION,
  InternalMonitoring,
  PerformanceObserverStubBuilder,
  SPEC_ENDPOINTS,
} from '@datadog/browser-core'
import sinon from 'sinon'
import { RumGlobal } from '../src'
import { LifeCycle } from '../src/lifeCycle'
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
  maxBatchSize: 1,
}

export interface TestSetupBuilder {
  withSession: (session: RumSession) => TestSetupBuilder
  withRum: () => TestSetupBuilder
  withViewCollection: (fakeLocation?: Partial<Location>) => TestSetupBuilder
  withUserActionCollection: () => TestSetupBuilder
  withPerformanceCollection: () => TestSetupBuilder
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
}

export function setup(): TestSetupBuilder {
  let session = {
    getId: () => undefined as string | undefined,
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

  const setupBuilder = {
    withSession(sessionStub: RumSession) {
      session = sessionStub
      return setupBuilder
    },
    withRum() {
      buildTasks.push(
        () => (rumApi = startRum('appId', lifeCycle, configuration as Configuration, session, internalMonitoringStub))
      )
      return setupBuilder
    },
    withViewCollection(fakeLocation?: Partial<Location>) {
      buildTasks.push(() => {
        startViewCollection((fakeLocation as Location) || location, lifeCycle, session)
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
      return { server, lifeCycle, stubBuilder, rumApi, clock }
    },
    cleanup() {
      cleanupTasks.forEach((task) => task())
    },
  }
  return setupBuilder
}
