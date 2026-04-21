import { getInitCookie, HookNames, isSyntheticsTest, SKIPPED } from '@datadog/browser-core'
import { SessionType } from '../rumSessionManager'
import type { DefaultRumEventAttributes, Hooks } from '../hooks'

export const AI_AGENT_COOKIE_NAME = 'datadog-ai-agent-id'

export interface AiAgentWindow extends Window {
  _DATADOG_AI_AGENT?: unknown
  __playwright__binding__?: unknown
  __pwInitScripts?: unknown
  __puppeteer_evaluation_script__?: unknown
  _selenium?: unknown
  _Selenium_IDE_Recorder?: unknown
}

export interface AiAgentContext {
  name?: string
  detection_method: string
  framework?: string
}

const AI_AGENT_UA_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /ClaudeBot/i, name: 'claudebot' },
  { pattern: /Claude-User/i, name: 'claude' },
  { pattern: /Claude-SearchBot/i, name: 'claude-searchbot' },
  { pattern: /GPTBot/i, name: 'gptbot' },
  { pattern: /ChatGPT-User/i, name: 'chatgpt' },
  { pattern: /OAI-SearchBot/i, name: 'oai-searchbot' },
  { pattern: /PerplexityBot/i, name: 'perplexity' },
  { pattern: /Perplexity-User/i, name: 'perplexity' },
  { pattern: /Google-Extended/i, name: 'google-extended' },
  { pattern: /Gemini-Deep-Research/i, name: 'gemini' },
  { pattern: /meta-externalagent/i, name: 'meta' },
  { pattern: /Bytespider/i, name: 'bytespider' },
  { pattern: /Amazonbot/i, name: 'amazonbot' },
  { pattern: /cohere-ai/i, name: 'cohere' },
  { pattern: /Diffbot/i, name: 'diffbot' },
  { pattern: /AI2Bot/i, name: 'ai2bot' },
  { pattern: /Applebot-Extended/i, name: 'applebot' },
]

export function startAiAgentContext(hooks: Hooks) {
  const aiAgentContext = detectAiAgent()

  hooks.register(HookNames.Assemble, ({ eventType }): DefaultRumEventAttributes | SKIPPED => {
    if (!aiAgentContext) {
      return SKIPPED
    }

    // TODO: Remove 'unknown' cast after adding 'ai_agent' to the rum-events-format schema
    return {
      type: eventType,
      session: {
        type: SessionType.AI_AGENT,
      },
      ai_agent: aiAgentContext,
    } as unknown as DefaultRumEventAttributes
  })
}

export function detectAiAgent(): AiAgentContext | undefined {
  if (isSyntheticsTest()) {
    return undefined
  }

  return (
    detectCooperativeGlobal() ??
    detectCooperativeCookie() ??
    detectWebdriver() ??
    detectAiAgentUserAgent() ??
    detectAutomationFramework()
  )
}

function detectCooperativeGlobal(): AiAgentContext | undefined {
  const globalContext = (window as AiAgentWindow)._DATADOG_AI_AGENT
  if (typeof globalContext === 'object' && globalContext !== null && typeof (globalContext as { name?: unknown }).name === 'string') {
    return { name: (globalContext as { name: string }).name, detection_method: 'cooperative' }
  }
}

function detectCooperativeCookie(): AiAgentContext | undefined {
  const cookieValue = getInitCookie(AI_AGENT_COOKIE_NAME)
  if (typeof cookieValue === 'string' && cookieValue.length > 0) {
    return { name: cookieValue, detection_method: 'cooperative' }
  }
}

function detectWebdriver(): AiAgentContext | undefined {
  if (navigator.webdriver === true) {
    return { detection_method: 'webdriver' }
  }
}

function detectAiAgentUserAgent(): AiAgentContext | undefined {
  const userAgent = navigator.userAgent
  for (const { pattern, name } of AI_AGENT_UA_PATTERNS) {
    if (pattern.test(userAgent)) {
      return { name, detection_method: 'ua_match' }
    }
  }
}

function detectAutomationFramework(): AiAgentContext | undefined {
  const win = window as AiAgentWindow
  if ('__playwright__binding__' in win || '__pwInitScripts' in win) {
    return { detection_method: 'automation_framework', framework: 'playwright' }
  }
  if ('__puppeteer_evaluation_script__' in win) {
    return { detection_method: 'automation_framework', framework: 'puppeteer' }
  }
  if ('_selenium' in win || '_Selenium_IDE_Recorder' in win) {
    return { detection_method: 'automation_framework', framework: 'selenium' }
  }
}
