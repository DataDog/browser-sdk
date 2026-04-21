import { ONE_MINUTE, resetInitCookies, deleteCookie, setCookie } from '@datadog/browser-core'
import { registerCleanupTask, replaceMockable } from '@datadog/browser-core/test'
import {
  AI_AGENT_COOKIE_NAME,
  detectCDP,
  detectHeadlessEnvironment,
  detectSoftwareRenderer,
  type AiAgentWindow,
} from '../src/domain/contexts/aiAgentContext'

const COOKIE_DURATION = ONE_MINUTE

export function disableTier2Detection() {
  replaceMockable(detectSoftwareRenderer, () => undefined)
  replaceMockable(detectHeadlessEnvironment, () => undefined)
  replaceMockable(detectCDP, () => undefined)
}

export function mockAiAgentCooperativeGlobal(context: { name: string }) {
  ;(window as AiAgentWindow)._DATADOG_AI_AGENT = context
  registerCleanupTask(() => {
    delete (window as AiAgentWindow)._DATADOG_AI_AGENT
  })
}

export function mockAiAgentCooperativeCookie(agentName: string) {
  setCookie(AI_AGENT_COOKIE_NAME, agentName, COOKIE_DURATION)
  resetInitCookies()
  registerCleanupTask(() => {
    deleteCookie(AI_AGENT_COOKIE_NAME)
    resetInitCookies()
  })
}

export function mockNavigatorWebdriver(value: boolean) {
  Object.defineProperty(navigator, 'webdriver', {
    get() {
      return value
    },
    configurable: true,
  })
  registerCleanupTask(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get() {
        return false
      },
      configurable: true,
    })
  })
}

export function mockUserAgent(userAgent: string) {
  Object.defineProperty(navigator, 'userAgent', {
    get() {
      return userAgent
    },
    configurable: true,
  })
  registerCleanupTask(() => {
    delete (navigator as any).userAgent
  })
}

export function mockAutomationFrameworkGlobal(framework: 'playwright' | 'puppeteer' | 'selenium') {
  const win = window as AiAgentWindow
  switch (framework) {
    case 'playwright':
      ;(win as any).__playwright__binding__ = true
      registerCleanupTask(() => {
        delete (win as any).__playwright__binding__
      })
      break
    case 'puppeteer':
      ;(win as any).__puppeteer_evaluation_script__ = true
      registerCleanupTask(() => {
        delete (win as any).__puppeteer_evaluation_script__
      })
      break
    case 'selenium':
      ;(win as any)._selenium = true
      registerCleanupTask(() => {
        delete (win as any)._selenium
      })
      break
  }
}
