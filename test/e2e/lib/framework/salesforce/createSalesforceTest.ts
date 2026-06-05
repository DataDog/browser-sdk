import { test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { getSfSession, buildFrontdoorUrl } from './sfAuth.ts'
import { SfRegistry, BRIDGE_INIT_SCRIPT, BridgeEvent } from './sfRegistry.ts'

export type RumEventType = 'view' | 'action' | 'error' | 'resource' | 'long_task'

export interface SfTestContext {
  page: Page
  sfRegistry: SfRegistry
  instanceUrl: string
  waitForSfEvents: (minCount?: number, timeout?: number) => Promise<void>
  waitForRumEvent: (type: RumEventType, minCount?: number, timeout?: number) => Promise<void>
  waitForUniqueViews: (count: number, timeout?: number) => Promise<void>
}

type SfTestRunner = (ctx: SfTestContext) => Promise<void> | void

class SalesforceTestBuilder {
  private path = '/lightning/page/home'

  constructor(private title: string) {}

  withPath(path: string) {
    this.path = path
    return this
  }

  run(runner: SfTestRunner) {
    const { title, path } = this

    test(title, async ({ page }) => {
      const sfRegistry = new SfRegistry()

      await page.addInitScript(BRIDGE_INIT_SCRIPT)

      const session = getSfSession()
      await page.goto(buildFrontdoorUrl(session, path))
      await page.waitForLoadState('load')

      const syncRegistry = async () => {
        sfRegistry.load(
          (await page.evaluate(() => (window as any).__ddSfTestEvents ?? [])) as BridgeEvent[]
        )
      }

      const waitForSfEvents = async (minCount = 1, timeout = 15000) => {
        await page.waitForFunction(
          (min: number) => ((window as any).__ddSfTestEvents ?? []).length >= min,
          minCount,
          { timeout }
        )
        await syncRegistry()
      }

      const waitForRumEvent = async (type: RumEventType, minCount = 1, timeout = 15000) => {
        await page.waitForFunction(
          (arg: { t: string; min: number }) =>
            ((window as any).__ddSfTestEvents ?? []).filter(
              (e: any) => e.type === 'rum' && e.payload?.type === arg.t
            ).length >= arg.min,
          { t: type, min: minCount },
          { timeout }
        )
        await syncRegistry()
      }

      const waitForUniqueViews = async (count: number, timeout = 20000) => {
        await page.waitForFunction(
          (n: number) => {
            const ids = new Set(
              ((window as any).__ddSfTestEvents ?? [])
                .filter((e: any) => e.type === 'rum' && e.payload?.type === 'view')
                .map((e: any) => e.payload?.view?.id)
                .filter(Boolean)
            )
            return ids.size >= n
          },
          count,
          { timeout }
        )
        await syncRegistry()
      }

      await runner({ page, sfRegistry, instanceUrl: session.instanceUrl, waitForSfEvents, waitForRumEvent, waitForUniqueViews })
    })
  }
}

export function createSalesforceTest(title: string) {
  return new SalesforceTestBuilder(title)
}
