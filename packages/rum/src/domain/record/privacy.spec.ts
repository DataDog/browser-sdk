import { isIE } from '../../../../core/test/specHelper'
import { NodePrivacyLevel, NodePrivacyLevelInternal } from '../../constants'
import { getNodePrivacyLevel } from './privacy'

describe('privacy helpers', () => {
  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }
  })

  describe('for hiding blocks', () => {
    it('considers a normal DOM Element as not hidden', () => {
      const node = document.createElement('p')
      expect(getNodePrivacyLevel(node)).not.toBe(NodePrivacyLevel.HIDDEN)
    })
    it('considers a DOM Element with a data-dd-privacy="hidden" attribute as hidden', () => {
      const node = document.createElement('p')
      node.setAttribute('data-dd-privacy', 'hidden')
      expect(getNodePrivacyLevel(node)).toBe(NodePrivacyLevel.HIDDEN)
    })
    it('considers a DOM Element with a data-dd-privacy="foo" attribute as not hidden', () => {
      const node = document.createElement('p')
      node.setAttribute('data-dd-privacy', 'foo')
      expect(getNodePrivacyLevel(node)).not.toBe(NodePrivacyLevel.HIDDEN)
    })
    it('considers a DOM Element with a dd-privacy-hidden class as hidden', () => {
      const node = document.createElement('p')
      node.className = 'dd-privacy-hidden'
      expect(getNodePrivacyLevel(node)).toBe(NodePrivacyLevel.HIDDEN)
    })
    it('considers a normal DOM Element with a normal parent as not hidden', () => {
      const node = document.createElement('p')
      const parent = document.createElement('div')
      parent.appendChild(node)
      expect(getNodePrivacyLevel(node)).not.toBe(NodePrivacyLevel.HIDDEN)
    })
    it('considers a DOM Element with a parent node with a dd-privacy="hidden" attribute as hidden', () => {
      const node = document.createElement('p')
      const parent = document.createElement('div')
      parent.setAttribute('data-dd-privacy', 'hidden')
      parent.appendChild(node)
      expect(getNodePrivacyLevel(node)).toBe(NodePrivacyLevel.HIDDEN)
    })
    it('considers a DOM Element with a parent node with a dd-privacy-hidden class as hidden', () => {
      const node = document.createElement('p')
      const parent = document.createElement('div')
      parent.className = 'dd-privacy-hidden'
      parent.appendChild(node)
      expect(getNodePrivacyLevel(node)).toBe(NodePrivacyLevel.HIDDEN)
    })
    it('considers a DOM Document as not hidden', () => {
      const isHidden = getNodePrivacyLevel(document) === NodePrivacyLevel.HIDDEN
      expect(isHidden).toBeFalsy()
    })
  })

  describe('input privacy mode', () => {
    it('use the ancestor privacy mode for a normal DOM Element', () => {
      const node = document.createElement('div')
      expect(getNodePrivacyLevel(node, NodePrivacyLevelInternal.ALLOW)).toBe(NodePrivacyLevel.ALLOW)
      expect(getNodePrivacyLevel(node, NodePrivacyLevelInternal.IGNORE)).toBe(NodePrivacyLevel.IGNORE)
      expect(getNodePrivacyLevel(node, NodePrivacyLevelInternal.MASK)).toBe(NodePrivacyLevel.MASK)
    })

    it('use the ancestor privacy mode for a DOM Element with a data-dd-privacy="unknown-mode" attribute', () => {
      const node = document.createElement('input')
      node.setAttribute('data-dd-privacy', 'unknown-mode')
      expect(getNodePrivacyLevel(node, NodePrivacyLevelInternal.ALLOW)).toBe(NodePrivacyLevel.ALLOW)
      expect(getNodePrivacyLevel(node, NodePrivacyLevelInternal.IGNORE)).toBe(NodePrivacyLevel.IGNORE)
      expect(getNodePrivacyLevel(node, NodePrivacyLevelInternal.MASK)).toBe(NodePrivacyLevel.MASK)
    })

    it('use the ancestor privacy mode for a DOM HTMLInputElement with a type of "text"', () => {
      const node = document.createElement('input')
      node.type = 'text'
      expect(getNodePrivacyLevel(node, NodePrivacyLevelInternal.ALLOW)).toBe(NodePrivacyLevel.ALLOW)
      expect(getNodePrivacyLevel(node, NodePrivacyLevelInternal.IGNORE)).toBe(NodePrivacyLevel.IGNORE)
      expect(getNodePrivacyLevel(node, NodePrivacyLevelInternal.MASK)).toBe(NodePrivacyLevel.MASK)
      expect(getNodePrivacyLevel(node, NodePrivacyLevelInternal.MASK_FORMS_ONLY)).toBe(NodePrivacyLevel.MASK)
    })

    it('considers a DOM Element with a data-dd-privacy="input-ignored" attribute to be MASK (mask-froms-only)', () => {
      const node = document.createElement('input')
      node.setAttribute('data-dd-privacy', 'input-ignored')
      expect(getNodePrivacyLevel(node, NodePrivacyLevelInternal.NOT_SET)).toBe(NodePrivacyLevel.MASK)
    })

    it('considers a DOM Element with a dd-privacy-input-ignored class to be MASK (mask-froms-only)', () => {
      const node = document.createElement('input')
      node.className = 'dd-privacy-input-ignored'
      expect(getNodePrivacyLevel(node, NodePrivacyLevelInternal.NOT_SET)).toBe(NodePrivacyLevel.MASK)
    })

    it('considers a DOM HTMLInputElement with a type of "password" to be MASK (mask-froms-only)', () => {
      const node = document.createElement('input')
      node.type = 'password'
      expect(getNodePrivacyLevel(node, NodePrivacyLevelInternal.NOT_SET)).toBe(NodePrivacyLevel.MASK)
    })

    describe('input mode priority', () => {
      it('consider a DOM Element to be MASK (mask-froms-only) if both modes can apply', () => {
        const node = document.createElement('input')
        node.className = 'dd-privacy-input-ignored'
        node.setAttribute('data-dd-privacy', 'input-masked')
        expect(getNodePrivacyLevel(node, NodePrivacyLevelInternal.NOT_SET)).toBe(NodePrivacyLevel.MASK)
      })

      it('forces an element to be ignored if an ancestor is ignored', () => {
        const node = document.createElement('input')
        node.setAttribute('data-dd-privacy', 'input-masked')
        expect(getNodePrivacyLevel(node, NodePrivacyLevelInternal.IGNORE)).toBe(NodePrivacyLevel.IGNORE)
      })

      it('does not force an element to be masked if an ancestor is masked', () => {
        const node = document.createElement('input')
        node.setAttribute('data-dd-privacy', 'allow')
        expect(getNodePrivacyLevel(node, NodePrivacyLevelInternal.MASK_FORMS_ONLY)).toBe(NodePrivacyLevel.ALLOW)
      })
    })

    describe('walk through elements ancestors to determine the privacy mode', () => {
      it('considers a normal DOM Element with a normal parent as not to be ALLOW', () => {
        const node = document.createElement('input')
        const parent = document.createElement('form')
        parent.appendChild(node)
        expect(getNodePrivacyLevel(node)).toBe(NodePrivacyLevel.ALLOW)
      })

      it('considers DOM Element with parent node with dd-privacy="input-ignored" attr to be MASK', () => {
        const node = document.createElement('input')
        const parent = document.createElement('form')
        parent.setAttribute('data-dd-privacy', 'input-ignored')
        parent.appendChild(node)
        expect(getNodePrivacyLevel(node)).toBe(NodePrivacyLevel.MASK)
      })

      it('considers DOM Element with parent node with dd-privacy-input-ignored class to be MASK', () => {
        const node = document.createElement('input')
        const parent = document.createElement('form')
        parent.className = 'dd-privacy-input-ignored'
        parent.appendChild(node)
        expect(getNodePrivacyLevel(node)).toBe(NodePrivacyLevel.MASK)
      })

      // eslint-disable-next-line max-len
      it('considers a DOM Element with a "masked" privacy mode but within a parent with a "ignored" privacy mode to be MASK', () => {
        const node = document.createElement('input')
        const parent = document.createElement('form')
        parent.setAttribute('data-dd-privacy', 'input-ignored')
        parent.appendChild(node)
        node.setAttribute('data-dd-privacy', 'input-masked')
        expect(getNodePrivacyLevel(node)).toBe(NodePrivacyLevel.MASK)
      })
    })
  })
})
