import type { RelativeTime } from '@datadog/browser-core'
import { HookNames } from '@datadog/browser-core'
import { mockSyntheticsWorkerValues, replaceMockable } from '../../../../core/test'
import {
  disableTier2Detection,
  mockAiAgentCooperativeGlobal,
  mockAiAgentCooperativeCookie,
  mockNavigatorWebdriver,
  mockUserAgent,
  mockAutomationFrameworkGlobal,
} from '../../../test'

import type { AssembleHookParams, Hooks } from '../hooks'
import { createHooks } from '../hooks'
import { detectCDP, detectHeadlessEnvironment, detectSoftwareRenderer, startAiAgentContext } from './aiAgentContext'

// Return type is 'any' because SessionType.AI_AGENT is not yet in the auto-generated rum-events-format schema
describe('aiAgentContext', () => {
  let hooks: Hooks

  beforeEach(() => {
    hooks = createHooks()
  })

  function triggerAssembleHook(): any {
    return hooks.triggerHook(HookNames.Assemble, {
      eventType: 'view',
      startTime: 0 as RelativeTime,
    } as AssembleHookParams)
  }

  describe('cooperative detection via window global', () => {
    it('should detect an AI agent from the window global', () => {
      mockAiAgentCooperativeGlobal({ name: 'claude-code' })
      startAiAgentContext(hooks)

      expect(triggerAssembleHook()).toEqual({
        type: 'view',
        context: {
          isAgentSession: true,
          aiAgentContext: { name: 'claude-code', detection_method: 'cooperative' },
        },
      })
    })

    it('should not detect via cooperative global if the name is missing', () => {
      mockNavigatorWebdriver(false)
      disableTier2Detection()
      ;(window as any)._DATADOG_AI_AGENT = { version: '1.0' }
      startAiAgentContext(hooks)

      expect(triggerAssembleHook()).toBeUndefined()
      delete (window as any)._DATADOG_AI_AGENT
    })

    it('should not detect via cooperative global if it is not an object', () => {
      mockNavigatorWebdriver(false)
      disableTier2Detection()
      ;(window as any)._DATADOG_AI_AGENT = 'claude-code'
      startAiAgentContext(hooks)

      expect(triggerAssembleHook()).toBeUndefined()
      delete (window as any)._DATADOG_AI_AGENT
    })
  })

  describe('cooperative detection via cookie', () => {
    it('should detect an AI agent from the cookie', () => {
      mockAiAgentCooperativeCookie('cursor')
      startAiAgentContext(hooks)

      expect(triggerAssembleHook()).toEqual({
        type: 'view',
        context: {
          isAgentSession: true,
          aiAgentContext: { name: 'cursor', detection_method: 'cooperative' },
        },
      })
    })
  })

  describe('navigator.webdriver detection', () => {
    it('should detect when navigator.webdriver is true', () => {
      mockNavigatorWebdriver(true)
      startAiAgentContext(hooks)

      expect(triggerAssembleHook()).toEqual({
        type: 'view',
        context: {
          isAgentSession: true,
          aiAgentContext: { detection_method: 'webdriver' },
        },
      })
    })

    it('should not detect when navigator.webdriver is false', () => {
      mockNavigatorWebdriver(false)
      disableTier2Detection()
      startAiAgentContext(hooks)

      expect(triggerAssembleHook()).toBeUndefined()
    })
  })

  describe('user-agent detection', () => {
    beforeEach(() => {
      mockNavigatorWebdriver(false)
      disableTier2Detection()
    })

    it('should detect ClaudeBot user agent', () => {
      mockUserAgent('Mozilla/5.0 ClaudeBot/1.0')
      startAiAgentContext(hooks)

      expect(triggerAssembleHook()).toEqual({
        type: 'view',
        context: {
          isAgentSession: true,
          aiAgentContext: { name: 'claudebot', detection_method: 'ua_match' },
        },
      })
    })

    it('should detect GPTBot user agent', () => {
      mockUserAgent('Mozilla/5.0 GPTBot/1.0')
      startAiAgentContext(hooks)

      expect(triggerAssembleHook()).toEqual({
        type: 'view',
        context: {
          isAgentSession: true,
          aiAgentContext: { name: 'gptbot', detection_method: 'ua_match' },
        },
      })
    })

    it('should not detect a normal Chrome user agent', () => {
      mockUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36')
      startAiAgentContext(hooks)

      expect(triggerAssembleHook()).toBeUndefined()
    })
  })

  describe('automation framework detection', () => {
    beforeEach(() => {
      mockNavigatorWebdriver(false)
      disableTier2Detection()
    })

    it('should detect Playwright globals', () => {
      mockAutomationFrameworkGlobal('playwright')
      startAiAgentContext(hooks)

      expect(triggerAssembleHook()).toEqual({
        type: 'view',
        context: {
          isAgentSession: true,
          aiAgentContext: { detection_method: 'automation_framework', framework: 'playwright' },
        },
      })
    })

    it('should detect Puppeteer globals', () => {
      mockAutomationFrameworkGlobal('puppeteer')
      startAiAgentContext(hooks)

      expect(triggerAssembleHook()).toEqual({
        type: 'view',
        context: {
          isAgentSession: true,
          aiAgentContext: { detection_method: 'automation_framework', framework: 'puppeteer' },
        },
      })
    })

    it('should detect Selenium globals', () => {
      mockAutomationFrameworkGlobal('selenium')
      startAiAgentContext(hooks)

      expect(triggerAssembleHook()).toEqual({
        type: 'view',
        context: {
          isAgentSession: true,
          aiAgentContext: { detection_method: 'automation_framework', framework: 'selenium' },
        },
      })
    })
  })

  describe('WebGL software renderer detection', () => {
    beforeEach(() => {
      mockNavigatorWebdriver(false)
    })

    it('should detect SwiftShader renderer', () => {
      replaceMockable(detectSoftwareRenderer, () => ({ detection_method: 'webgl_renderer' as const }))
      replaceMockable(detectHeadlessEnvironment, () => undefined)
      replaceMockable(detectCDP, () => undefined)
      startAiAgentContext(hooks)

      expect(triggerAssembleHook()).toEqual({
        type: 'view',
        context: {
          isAgentSession: true,
          aiAgentContext: { detection_method: 'webgl_renderer' },
        },
      })
    })

    it('should not detect with a hardware-accelerated renderer', () => {
      disableTier2Detection()
      startAiAgentContext(hooks)

      expect(triggerAssembleHook()).toBeUndefined()
    })
  })

  describe('headless environment detection', () => {
    beforeEach(() => {
      mockNavigatorWebdriver(false)
      replaceMockable(detectSoftwareRenderer, () => undefined)
      replaceMockable(detectCDP, () => undefined)
    })

    it('should detect zero outer dimensions', () => {
      replaceMockable(detectHeadlessEnvironment, () => ({ detection_method: 'headless_environment' as const }))
      startAiAgentContext(hooks)

      expect(triggerAssembleHook()).toEqual({
        type: 'view',
        context: {
          isAgentSession: true,
          aiAgentContext: { detection_method: 'headless_environment' },
        },
      })
    })

    it('should not detect in a normal browser environment', () => {
      replaceMockable(detectHeadlessEnvironment, () => undefined)
      startAiAgentContext(hooks)

      expect(triggerAssembleHook()).toBeUndefined()
    })
  })

  describe('CDP detection', () => {
    beforeEach(() => {
      mockNavigatorWebdriver(false)
      replaceMockable(detectSoftwareRenderer, () => undefined)
      replaceMockable(detectHeadlessEnvironment, () => undefined)
    })

    it('should detect active CDP connection', () => {
      replaceMockable(detectCDP, () => ({ detection_method: 'cdp' as const }))
      startAiAgentContext(hooks)

      expect(triggerAssembleHook()).toEqual({
        type: 'view',
        context: {
          isAgentSession: true,
          aiAgentContext: { detection_method: 'cdp' },
        },
      })
    })

    it('should not detect without CDP connection', () => {
      replaceMockable(detectCDP, () => undefined)
      startAiAgentContext(hooks)

      expect(triggerAssembleHook()).toBeUndefined()
    })
  })

  describe('detection priority', () => {
    it('should prioritize cooperative global over webdriver', () => {
      mockAiAgentCooperativeGlobal({ name: 'claude-code' })
      mockNavigatorWebdriver(true)
      startAiAgentContext(hooks)

      const result = triggerAssembleHook()
      expect(result.context.aiAgentContext.detection_method).toBe('cooperative')
      expect(result.context.aiAgentContext.name).toBe('claude-code')
    })

    it('should prioritize cooperative cookie over webdriver', () => {
      mockAiAgentCooperativeCookie('devin')
      mockNavigatorWebdriver(true)
      startAiAgentContext(hooks)

      const result = triggerAssembleHook()
      expect(result.context.aiAgentContext.detection_method).toBe('cooperative')
      expect(result.context.aiAgentContext.name).toBe('devin')
    })

    it('should prioritize webdriver over user-agent', () => {
      mockNavigatorWebdriver(true)
      mockUserAgent('Mozilla/5.0 GPTBot/1.0')
      startAiAgentContext(hooks)

      const result = triggerAssembleHook()
      expect(result.context.aiAgentContext.detection_method).toBe('webdriver')
    })

    it('should prioritize user-agent over automation framework', () => {
      mockUserAgent('Mozilla/5.0 GPTBot/1.0')
      mockAutomationFrameworkGlobal('playwright')
      startAiAgentContext(hooks)

      const result = triggerAssembleHook()
      expect(result.context.aiAgentContext.detection_method).toBe('ua_match')
    })

    it('should prioritize automation framework over Tier 2 signals', () => {
      mockNavigatorWebdriver(false)
      mockAutomationFrameworkGlobal('playwright')
      replaceMockable(detectSoftwareRenderer, () => ({ detection_method: 'webgl_renderer' as const }))
      replaceMockable(detectHeadlessEnvironment, () => undefined)
      replaceMockable(detectCDP, () => undefined)
      startAiAgentContext(hooks)

      const result = triggerAssembleHook()
      expect(result.context.aiAgentContext.detection_method).toBe('automation_framework')
    })

    it('should prioritize WebGL renderer over headless environment', () => {
      mockNavigatorWebdriver(false)
      replaceMockable(detectSoftwareRenderer, () => ({ detection_method: 'webgl_renderer' as const }))
      replaceMockable(detectHeadlessEnvironment, () => ({ detection_method: 'headless_environment' as const }))
      replaceMockable(detectCDP, () => ({ detection_method: 'cdp' as const }))
      startAiAgentContext(hooks)

      const result = triggerAssembleHook()
      expect(result.context.aiAgentContext.detection_method).toBe('webgl_renderer')
    })

    it('should prioritize headless environment over CDP', () => {
      mockNavigatorWebdriver(false)
      replaceMockable(detectSoftwareRenderer, () => undefined)
      replaceMockable(detectHeadlessEnvironment, () => ({ detection_method: 'headless_environment' as const }))
      replaceMockable(detectCDP, () => ({ detection_method: 'cdp' as const }))
      startAiAgentContext(hooks)

      const result = triggerAssembleHook()
      expect(result.context.aiAgentContext.detection_method).toBe('headless_environment')
    })
  })

  describe('synthetics exclusion', () => {
    it('should not detect AI agent during a Synthetics test', () => {
      mockSyntheticsWorkerValues({ context: { test_id: 'foo', result_id: 'bar' } }, 'globals')
      mockNavigatorWebdriver(true)
      startAiAgentContext(hooks)

      expect(triggerAssembleHook()).toBeUndefined()
    })
  })

  describe('no detection', () => {
    it('should not set AI agent context when no signals are present', () => {
      mockNavigatorWebdriver(false)
      disableTier2Detection()
      startAiAgentContext(hooks)

      expect(triggerAssembleHook()).toBeUndefined()
    })
  })
})
