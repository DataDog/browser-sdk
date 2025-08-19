import { ActionType } from '../../../rawRumEvent.types'
import { ACTION_NAME_MASK, ActionNameSource } from '../actionNameConstants'
import type { ClickActionBase } from '../trackClickActions'
import { maskDisallowedTextContent } from './maskWithAllowlist'

const TEST_STRINGS = {
  COMPLEX_MIXED: 'test-team-name:💥$$$',
  PARAGRAPH_MIXED: '✅ This is an action name in allowlist',
}

describe('maskWithAllowlist', () => {
  const clickActionBase: ClickActionBase = {
    type: ActionType.CLICK,
    name: '',
    nameSource: ActionNameSource.TEXT_CONTENT,
    target: {
      selector: 'button',
      width: 100,
      height: 100,
    },
    position: { x: 0, y: 0 },
  }

  beforeEach(() => {
    window.$DD_ALLOW = new Set([TEST_STRINGS.PARAGRAPH_MIXED])
  })

  afterEach(() => {
    window.$DD_ALLOW = undefined
  })

  it('should fail close if $DD_ALLOW is not defined', () => {
    window.$DD_ALLOW = undefined as any
    const testString = maskDisallowedTextContent('mask-feature-on', ACTION_NAME_MASK)
    expect(testString).toBe(ACTION_NAME_MASK)
  })

  it('masks words not in allowlist (with dictionary from $DD_ALLOW)', () => {
    clickActionBase.name = 'This is an action name in allowlist'
    const testString1 = maskDisallowedTextContent(clickActionBase.name, ACTION_NAME_MASK)
    expect(testString1).toBe(ACTION_NAME_MASK)

    clickActionBase.name = 'any unallowed string'
    const testString2 = maskDisallowedTextContent(clickActionBase.name, ACTION_NAME_MASK)
    expect(testString2).toBe(ACTION_NAME_MASK)
  })

  it('handles empty string', () => {
    clickActionBase.name = ''
    const result = maskDisallowedTextContent(clickActionBase.name, ACTION_NAME_MASK)
    expect(result).toBe('')
  })
})
