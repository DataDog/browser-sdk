import { test, expect } from '../../android/androidFixture'
import {
  IntakeRegistry,
  createIntakeServerApp,
  createMockServerApp,
  getTestServers,
  waitForServersIdle,
  flushEvents,
  bundleSetup,
  html,
  DEFAULT_RUM_CONFIGURATION,
  DEFAULT_LOGS_CONFIGURATION,
} from '../../lib/framework'
import { APPLICATION_ID } from '../../lib/helpers/configuration'

test.describe('android basic', () => {
  test('RUM view events are collected', async ({ page }) => {
    const servers = await getTestServers()
    const intakeRegistry = new IntakeRegistry()

    servers.intake.bindServerApp(createIntakeServerApp(intakeRegistry))

    const rumConfiguration = { ...DEFAULT_RUM_CONFIGURATION }
    const setup = bundleSetup(
      {
        rum: rumConfiguration,
        useRumSlim: false,
        eventBridge: false,
        basePath: '',
        rumInit: (configuration) => {
          window.DD_RUM!.init(configuration)
        },
        logsInit: (configuration) => {
          window.DD_LOGS!.init(configuration)
        },
        context: { run_id: 'android-e2e', test_name: 'RUM view events' },
        testFixture: test,
      },
      servers
    )

    servers.base.bindServerApp(createMockServerApp(servers, setup))

    await page.goto(servers.base.origin)
    await waitForServersIdle()

    await flushEvents(page)

    const viewEvents = intakeRegistry.rumViewEvents
    expect(viewEvents.length).toBeGreaterThan(0)
    expect(viewEvents[0].application.id).toBe(APPLICATION_ID)
  })

  test('log events are collected', async ({ page }) => {
    const servers = await getTestServers()
    const intakeRegistry = new IntakeRegistry()

    servers.intake.bindServerApp(createIntakeServerApp(intakeRegistry))

    const logsConfiguration = { ...DEFAULT_LOGS_CONFIGURATION }
    const setup = bundleSetup(
      {
        logs: logsConfiguration,
        useRumSlim: false,
        eventBridge: false,
        basePath: '',
        rumInit: (configuration) => {
          window.DD_RUM!.init(configuration)
        },
        logsInit: (configuration) => {
          window.DD_LOGS!.init(configuration)
        },
        context: { run_id: 'android-e2e', test_name: 'log events' },
        testFixture: test,
      },
      servers
    )

    servers.base.bindServerApp(createMockServerApp(servers, setup))

    await page.goto(servers.base.origin)
    await waitForServersIdle()

    await page.evaluate(() => {
      window.DD_LOGS!.logger.log('hello from android')
    })

    await flushEvents(page)

    expect(intakeRegistry.logsEvents).toHaveLength(1)
    expect(intakeRegistry.logsEvents[0].message).toBe('hello from android')
  })

  test('user action events are collected', async ({ page }) => {
    const servers = await getTestServers()
    const intakeRegistry = new IntakeRegistry()

    servers.intake.bindServerApp(createIntakeServerApp(intakeRegistry))

    const rumConfiguration = { ...DEFAULT_RUM_CONFIGURATION }
    const setup = bundleSetup(
      {
        rum: rumConfiguration,
        useRumSlim: false,
        eventBridge: false,
        basePath: '',
        body: html`<button id="test-button">Click me</button>`,
        rumInit: (configuration) => {
          window.DD_RUM!.init(configuration)
        },
        logsInit: (configuration) => {
          window.DD_LOGS!.init(configuration)
        },
        context: { run_id: 'android-e2e', test_name: 'user action' },
        testFixture: test,
      },
      servers
    )

    servers.base.bindServerApp(createMockServerApp(servers, setup))

    await page.goto(servers.base.origin)
    await waitForServersIdle()

    await page.click('#test-button')

    await flushEvents(page)

    const actionEvents = intakeRegistry.rumActionEvents
    expect(actionEvents.length).toBeGreaterThan(0)
    expect(actionEvents.some((event) => event.action.target?.name === 'Click me')).toBe(true)
  })
})
