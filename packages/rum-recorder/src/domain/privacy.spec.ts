import { isIE } from '../../../core/test/specHelper'
import {
  nodeShouldBeHidden,
  nodeOrAncestorsShouldBeHidden,
  nodeShouldHaveInputIgnored,
  nodeOrAncestorsShouldHaveInputIgnored,
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
    it('considers a normal DOM Element as not to be ignored', () => {
      const node = document.createElement('input')
      expect(nodeShouldHaveInputIgnored(node)).toBeFalsy()
    })
    it('considers a DOM Element with a data-dd-privacy="input-ignored" attribute to be ignored', () => {
      const node = document.createElement('input')
      node.setAttribute('data-dd-privacy', 'input-ignored')
      expect(nodeShouldHaveInputIgnored(node)).toBeTruthy()
    })
    it('considers a DOM Element with a data-dd-privacy="foo" attribute as not to be ignored', () => {
      const node = document.createElement('input')
      node.setAttribute('data-dd-privacy', 'foo')
      expect(nodeShouldHaveInputIgnored(node)).toBeFalsy()
    })
    it('considers a DOM Element with a dd-privacy-input-ignored class to be ignored', () => {
      const node = document.createElement('input')
      node.className = 'dd-privacy-input-ignored'
      expect(nodeShouldHaveInputIgnored(node)).toBeTruthy()
    })
    it('considers a DOM HTMLInputElement with a type of "password" to be ignored', () => {
      const node = document.createElement('input')
      node.type = 'password'
      expect(nodeShouldHaveInputIgnored(node)).toBeTruthy()
    })
    it('considers a DOM HTMLInputElement with a type of "text" as not to be ignored', () => {
      const node = document.createElement('input')
      node.type = 'text'
      expect(nodeShouldHaveInputIgnored(node)).toBeFalse()
    })
    it('considers a normal DOM Element with a normal parent as not to be ignored', () => {
      const node = document.createElement('input')
      const parent = document.createElement('form')
      parent.appendChild(node)
      expect(nodeOrAncestorsShouldHaveInputIgnored(node)).toBeFalsy()
    })
    it('considers a DOM Element with a parent node with a dd-privacy="input-ignored" attribute to be ignored', () => {
      const node = document.createElement('input')
      const parent = document.createElement('form')
      parent.setAttribute('data-dd-privacy', 'input-ignored')
      parent.appendChild(node)
      expect(nodeOrAncestorsShouldHaveInputIgnored(node)).toBeTruthy()
    })
    it('considers a DOM Element with a parent node with a dd-privacy-input-ignored class to be ignored', () => {
      const node = document.createElement('input')
      const parent = document.createElement('form')
      parent.className = 'dd-privacy-input-ignored'
      parent.appendChild(node)
      expect(nodeOrAncestorsShouldHaveInputIgnored(node)).toBeTruthy()
    })
    it('considers a DOM Document as not to be ignored', () => {
      expect(nodeOrAncestorsShouldHaveInputIgnored(document)).toBeFalsy()
    })
  })
})
