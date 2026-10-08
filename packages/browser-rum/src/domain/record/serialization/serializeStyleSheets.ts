import { StringRole } from '../../../types'
import type { NodeId, StyleSheetId } from '../encoding'
import { createString } from '../encoding'
import type { SerializationTransaction } from './serializationTransaction'

/**
 * Serialize the `adoptedStyleSheets` of a #document or #shadow-root node, and remember
 * them so that later changes can be detected by serializeAdoptedStyleSheetsChanges().
 */
export function serializeAdoptedStyleSheets(
  node: Document | ShadowRoot,
  nodeId: NodeId,
  transaction: SerializationTransaction
): void {
  const sheets = Array.from(node.adoptedStyleSheets || [])
  transaction.scope.serializedAdoptedStyleSheets.set(node, sheets)
  if (sheets.length === 0) {
    return
  }
  attachAdoptedStyleSheets(nodeId, sheets, transaction)
}

/**
 * Emit an AttachedStyleSheets change for each serialized #document or #shadow-root node
 * whose `adoptedStyleSheets` changed since it was last serialized.
 *
 * Changes to `adoptedStyleSheets` can't be observed directly (in particular, in-place
 * changes to the array, like `push()`, bypass the property setter), so this is meant to
 * be called for each batch of mutations. As a consequence, a change to
 * `adoptedStyleSheets` is only recorded once a DOM mutation occurs afterwards. This is
 * generally the case in practice, as component libraries adopt stylesheets while
 * rendering the content of the shadow root.
 */
export function serializeAdoptedStyleSheetsChanges(transaction: SerializationTransaction): void {
  const { nodeIds, serializedAdoptedStyleSheets } = transaction.scope

  for (const [node, previousSheets] of serializedAdoptedStyleSheets) {
    const nodeId = nodeIds.get(node)
    if (nodeId === undefined || !node.isConnected) {
      // This node is not part of the recorded document anymore.
      serializedAdoptedStyleSheets.delete(node)
      continue
    }

    const currentSheets = node.adoptedStyleSheets || []
    if (areSameStyleSheets(previousSheets, currentSheets)) {
      continue
    }

    const sheets = Array.from(currentSheets)
    serializedAdoptedStyleSheets.set(node, sheets)
    attachAdoptedStyleSheets(nodeId, sheets, transaction)
  }
}

/**
 * Serialize the given stylesheet, unless it was already serialized in the current
 * recording scope, and return its id.
 *
 * AddStyleSheet changes don't carry an explicit id; the player assigns ids sequentially.
 * To keep the recorder's ids in sync with the player's, an AddStyleSheet change must be
 * emitted if and only if a new id is allocated. This matters for constructed stylesheets,
 * which are commonly adopted by several shadow roots.
 */
function serializeStyleSheet(sheet: CSSStyleSheet, transaction: SerializationTransaction): StyleSheetId {
  const styleSheetIds = transaction.scope.styleSheetIds
  const existingSheetId = styleSheetIds.get(sheet)
  if (existingSheetId !== undefined) {
    return existingSheetId
  }

  const rules = Array.from(sheet.cssRules || sheet.rules, (rule) => createString(StringRole.Css, rule.cssText))
  const mediaList =
    sheet.media.length > 0 ? Array.from(sheet.media).map((medium) => createString(StringRole.Css, medium)) : undefined
  transaction.addMetric(
    'cssText',
    rules.reduce((totalLength, rule) => totalLength + rule.string.length, 0)
  )
  transaction.addStyleSheet(rules, mediaList, sheet.disabled)
  return styleSheetIds.getOrInsert(sheet)
}

function attachAdoptedStyleSheets(
  nodeId: NodeId,
  sheets: CSSStyleSheet[],
  transaction: SerializationTransaction
): void {
  transaction.attachStyleSheets(
    nodeId,
    sheets.map((sheet) => serializeStyleSheet(sheet, transaction))
  )
}

function areSameStyleSheets(previousSheets: CSSStyleSheet[], currentSheets: CSSStyleSheet[]): boolean {
  if (previousSheets.length !== currentSheets.length) {
    return false
  }
  for (let index = 0; index < previousSheets.length; index++) {
    if (previousSheets[index] !== currentSheets[index]) {
      return false
    }
  }
  return true
}
