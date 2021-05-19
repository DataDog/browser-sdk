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

  describe('for ignoring input events', () => {
    it('cannot determine the input privacy mode for a normal DOM Element', () => {
      const node = document.createElement('input')
      expect(getNodeInputPrivacyMode(node)).toBeUndefined()
    })
    it('considers a DOM Element with a data-dd-privacy="input-ignored" attribute to be ignored', () => {
      const node = document.createElement('input')
      node.setAttribute('data-dd-privacy', 'input-ignored')
      expect(getNodeInputPrivacyMode(node)).toBe(InputPrivacyMode.IGNORED)
    })
    it('cannot determine the input privacy mode for a DOM Element with a data-dd-privacy="foo" attribute', () => {
      const node = document.createElement('input')
      node.setAttribute('data-dd-privacy', 'foo')
      expect(getNodeInputPrivacyMode(node)).toBeUndefined()
    })
    it('considers a DOM Element with a dd-privacy-input-ignored class to be ignored', () => {
      const node = document.createElement('input')
      node.className = 'dd-privacy-input-ignored'
      expect(getNodeInputPrivacyMode(node)).toBe(InputPrivacyMode.IGNORED)
    })
    it('considers a DOM HTMLInputElement with a type of "password" to be ignored', () => {
      const node = document.createElement('input')
      node.type = 'password'
      expect(getNodeInputPrivacyMode(node)).toBe(InputPrivacyMode.IGNORED)
    })
    it('cannot determine the input privacy mode for a DOM HTMLInputElement with a type of "text"', () => {
      const node = document.createElement('input')
      node.type = 'text'
      expect(getNodeInputPrivacyMode(node)).toBeUndefined()
    })

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
    it('considers a DOM Document as not to be ignored', () => {
      expect(getNodeOrAncestorsInputPrivacyMode(document)).toBe(InputPrivacyMode.NONE)
    })
  })
})
