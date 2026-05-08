import type { StyleSheet } from '../../../../types'
import type { StyleSheetId } from '../../itemIds'
import type { VDocument } from './vDocument'

export interface VStyleSheet {
  renderAsAdoptedStyleSheet(): StyleSheet
  renderAsCssText(): string

  get data(): VStyleSheetData
  get id(): StyleSheetId
  get ownerDocument(): VDocument
}

export interface VStyleSheetData {
  disabled: boolean
  mediaList: string[]
  rules: string | string[]
}

export function createVStyleSheet(document: VDocument, id: StyleSheetId, data: VStyleSheetData): VStyleSheet {
  const self: VStyleSheet = {
    renderAsAdoptedStyleSheet(): StyleSheet {
      const cssRules = typeof data.rules === 'string' ? [data.rules] : data.rules
      return {
        cssRules,
        disabled: data.disabled ? true : undefined,
        media: data.mediaList.length > 0 ? data.mediaList : undefined,
      }
    },

    renderAsCssText(): string {
      return typeof data.rules === 'string' ? data.rules : data.rules.join('')
    },

    get data(): VStyleSheetData {
      return data
    },
    get id(): StyleSheetId {
      return id
    },
    get ownerDocument(): VDocument {
      return document
    },
  }

  return self
}
