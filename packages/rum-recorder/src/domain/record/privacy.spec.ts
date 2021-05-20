import { isIE } from '../../../../core/test/specHelper'
import { InputPrivacyMode } from '../../constants'
import {
  nodeShouldBeHidden,
  nodeOrAncestorsShouldBeHidden,
  getNodeInputPrivacyMode,
  getNodeOrAncestorsInputPrivacyMode,
} from './privacy'

describe('privacy helpers', () => {
  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }
  })

  describe('for hiding blocks', () => {
    it('considers a normal DOM Element as not hidden', () => {
      const node = document.createElement('p')
      expect(nodeShouldBeHidden(node)).toBeFalsy()
    })
    it('considers a DOM Element with a data-dd-privacy="hidden" attribute as hidden', () => {
      const node = document.createElement('p')
      node.setAttribute('data-dd-privacy', 'hidden')
      expect(nodeShouldBeHidden(node)).toBeTruthy()
    })
    it('considers a DOM Element with a data-dd-privacy="foo" attribute as not hidden', () => {
      const node = document.createElement('p')
      node.setAttribute('data-dd-privacy', 'foo')
      expect(nodeShouldBeHidden(node)).toBeFalsy()
    })
    it('considers a DOM Element with a dd-privacy-hidden class as hidden', () => {
      const node = document.createElement('p')
      node.className = 'dd-privacy-hidden'
      expect(nodeShouldBeHidden(node)).toBeTruthy()
    })
    it('considers a normal DOM Element with a normal parent as not hidden', () => {
      const node = document.createElement('p')
      const parent = document.createElement('div')
      parent.appendChild(node)
      expect(nodeOrAncestorsShouldBeHidden(node)).toBeFalsy()
    })
    it('considers a DOM Element with a parent node with a dd-privacy="hidden" attribute as hidden', () => {
      const node = document.createElement('p')
      const parent = document.createElement('div')
      parent.setAttribute('data-dd-privacy', 'hidden')
      parent.appendChild(node)
      expect(nodeOrAncestorsShouldBeHidden(node)).toBeTruthy()
    })
    it('considers a DOM Element with a parent node with a dd-privacy-hidden class as hidden', () => {
      const node = document.createElement('p')
      const parent = document.createElement('div')
      parent.className = 'dd-privacy-hidden'
      parent.appendChild(node)
      expect(nodeOrAncestorsShouldBeHidden(node)).toBeTruthy()
    })
    it('considers a DOM Document as not hidden', () => {
      expect(nodeOrAncestorsShouldBeHidden(document)).toBeFalsy()
    })
  })

  describe('input privacy mode', () => {
    it('use the ancestor privacy mode for a normal DOM Element', () => {
      const node = document.createElement('div')
      expect(getNodeInputPrivacyMode(node, InputPrivacyMode.NONE)).toBe(InputPrivacyMode.NONE)
      expect(getNodeInputPrivacyMode(node, InputPrivacyMode.IGNORED)).toBe(InputPrivacyMode.IGNORED)
      expect(getNodeInputPrivacyMode(node, InputPrivacyMode.MASKED)).toBe(InputPrivacyMode.MASKED)
    })

    it('use the ancestor privacy mode for a DOM Element with a data-dd-privacy="unknown-mode" attribute', () => {
      const node = document.createElement('input')
      node.setAttribute('data-dd-privacy', 'unknown-mode')
      expect(getNodeInputPrivacyMode(node, InputPrivacyMode.NONE)).toBe(InputPrivacyMode.NONE)
      expect(getNodeInputPrivacyMode(node, InputPrivacyMode.IGNORED)).toBe(InputPrivacyMode.IGNORED)
      expect(getNodeInputPrivacyMode(node, InputPrivacyMode.MASKED)).toBe(InputPrivacyMode.MASKED)
    })

    it('use the ancestor privacy mode for a DOM HTMLInputElement with a type of "text"', () => {
      const node = document.createElement('input')
      node.type = 'text'
      expect(getNodeInputPrivacyMode(node, InputPrivacyMode.NONE)).toBe(InputPrivacyMode.NONE)
      expect(getNodeInputPrivacyMode(node, InputPrivacyMode.IGNORED)).toBe(InputPrivacyMode.IGNORED)
      expect(getNodeInputPrivacyMode(node, InputPrivacyMode.MASKED)).toBe(InputPrivacyMode.MASKED)
    })

    it('considers a DOM Document as not to be ignored', () => {
      expect(getNodeInputPrivacyMode(document, InputPrivacyMode.NONE)).toBe(InputPrivacyMode.NONE)
    })

    it('considers a DOM Element with a data-dd-privacy="input-ignored" attribute to be ignored', () => {
      const node = document.createElement('input')
      node.setAttribute('data-dd-privacy', 'input-ignored')
      expect(getNodeInputPrivacyMode(node, InputPrivacyMode.NONE)).toBe(InputPrivacyMode.IGNORED)
    })

    it('considers a DOM Element with a dd-privacy-input-ignored class to be ignored', () => {
      const node = document.createElement('input')
      node.className = 'dd-privacy-input-ignored'
      expect(getNodeInputPrivacyMode(node, InputPrivacyMode.NONE)).toBe(InputPrivacyMode.IGNORED)
    })

    it('considers a DOM HTMLInputElement with a type of "password" to be ignored', () => {
      const node = document.createElement('input')
      node.type = 'password'
      expect(getNodeInputPrivacyMode(node, InputPrivacyMode.NONE)).toBe(InputPrivacyMode.IGNORED)
    })

    describe('input mode priority', () => {
      it('consider a DOM Element to be ignored if both modes can apply', () => {
        const node = document.createElement('input')
        node.className = 'dd-privacy-input-ignored'
        node.setAttribute('data-dd-privacy', 'input-masked')
        expect(getNodeInputPrivacyMode(node, InputPrivacyMode.NONE)).toBe(InputPrivacyMode.IGNORED)
      })

      it('forces an element to be ignored if an ancestor is ignored', () => {
        const node = document.createElement('input')
        node.setAttribute('data-dd-privacy', 'input-masked')
        expect(getNodeInputPrivacyMode(node, InputPrivacyMode.IGNORED)).toBe(InputPrivacyMode.IGNORED)
      })

      it('does not force an element to be masked if an ancestor is masked', () => {
        const node = document.createElement('input')
        node.setAttribute('data-dd-privacy', 'input-ignored')
        expect(getNodeInputPrivacyMode(node, InputPrivacyMode.MASKED)).toBe(InputPrivacyMode.IGNORED)
      })
    })

    describe('walk through elements ancestors to determine the privacy mode', () => {
      it('considers a normal DOM Element with a normal parent as not to be ignored', () => {
        const node = document.createElement('input')
        const parent = document.createElement('form')
        parent.appendChild(node)
        expect(getNodeOrAncestorsInputPrivacyMode(node)).toBe(InputPrivacyMode.NONE)
      })

      it('considers a DOM Element with a parent node with a dd-privacy="input-ignored" attribute to be ignored', () => {
        const node = document.createElement('input')
        const parent = document.createElement('form')
        parent.setAttribute('data-dd-privacy', 'input-ignored')
        parent.appendChild(node)
        expect(getNodeOrAncestorsInputPrivacyMode(node)).toBe(InputPrivacyMode.IGNORED)
      })

      it('considers a DOM Element with a parent node with a dd-privacy-input-ignored class to be ignored', () => {
        const node = document.createElement('input')
        const parent = document.createElement('form')
        parent.className = 'dd-privacy-input-ignored'
        parent.appendChild(node)
        expect(getNodeOrAncestorsInputPrivacyMode(node)).toBe(InputPrivacyMode.IGNORED)
      })

      // eslint-disable-next-line max-len
      it('considers a DOM Element with a "masked" privacy mode but within a parent with a "ignored" privacy mode to be ignored', () => {
        const node = document.createElement('input')
        const parent = document.createElement('form')
        parent.setAttribute('data-dd-privacy', 'input-ignored')
        parent.appendChild(node)
        node.setAttribute('data-dd-privacy', 'input-masked')
        expect(getNodeOrAncestorsInputPrivacyMode(node)).toBe(InputPrivacyMode.IGNORED)
      })
    })
  })
})
