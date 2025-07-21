import { ActionType } from '../../../rawRumEvent.types'
import { NodePrivacyLevel } from '../../privacyConstants'
import { ActionNameSource } from '../getActionNameFromElement'
import type { ClickActionBase } from '../trackClickActions'
import {
  maskActionName,
} from './allowedDictionary'

const TEST_STRINGS = {
  COMPLEX_MIXED: 'test-team-name:💥$$$',
  PARAGRAPH_MIXED: "✅ This is an action name in allowlist",
}


describe('createActionNameDictionary and maskActionName', () => {
  const clickActionBase: ClickActionBase = {
    type: ActionType.CLICK,
    name: '',
    nameSource: ActionNameSource.MASK_DISALLOWED,
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

  it('should not run if $DD_ALLOW is not defined', () => {
    window.$DD_ALLOW = undefined as any
    clickActionBase.name = 'mask-feature-off'
    const testString = maskActionName(clickActionBase, NodePrivacyLevel.ALLOW)
    expect(testString.name).toBe('mask-feature-off')
    expect(testString.nameSource).toBe(ActionNameSource.MASK_DISALLOWED)
  })

  it('masks words not in allowlist (with dictionary from $DD_ALLOW)', () => {
    clickActionBase.name = "This is an action name in allowlist"
    const testString1 = maskActionName(clickActionBase, NodePrivacyLevel.MASK)
    expect(testString1.name).toBe('Masked Element')
    expect(testString1.nameSource).toBe(ActionNameSource.MASK_DISALLOWED)

    clickActionBase.name = 'any unallowed string'
    const testString2 = maskActionName(clickActionBase, NodePrivacyLevel.MASK)
    expect(testString2.name).toBe('Masked Element')
    expect(testString2.nameSource).toBe(ActionNameSource.MASK_DISALLOWED)
  })

  it('handles empty string', () => {
    clickActionBase.name = ''
    const result = maskActionName(clickActionBase, NodePrivacyLevel.ALLOW)
    expect(result.name).toBe('')
    expect(result.nameSource).toBe(ActionNameSource.MASK_DISALLOWED)
  })
})
