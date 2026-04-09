import type { TimeStamp } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { forEachChildNodes, getNodePrivacyLevel } from '@datadog/browser-rum-core'
import { registerCleanupTask } from 'packages/core/test'
import type { BrowserFullSnapshotChangeRecord, BrowserChangeRecord, BrowserRecord } from '../../../types'
import { RecordType, SnapshotFormat } from '../../../types'
import type { RecordingScope } from '../recordingScope'
import { createRecordingScopeForTesting } from '../test/recordingScope.specHelper'
import type { ChangeSerializationTransaction } from './serializationTransaction'
import { SerializationKind, serializeChangesInTransaction } from './serializationTransaction'
import { createRootInsertionCursor } from './insertionCursor'
import { serializeNodeAsChange } from './serializeNodeAsChange'
import { createChangeDecoder } from './conversions'
import type { SerializationStats } from './serializationStats'
import { aggregateSerializationStats, createSerializationStats } from './serializationStats'

/**
 * A wrapper for serializeNodeAsChange() that parses HTML in an isolated context, selects
 * a target node from the resulting subtree (by default, the subtree root), and serializes
 * it using serializeNodeAsChange().
 *
 * @param html - The HTML to parse.
 * @param options - Options to customize the serialization process.
 * @param options.after - A callback to run against the target node after serialization; use this
 * to make assertions that require the target node as context.
 * @param options.before - A callback to run against the target node before serialization; use this
 * to perform mutations that affect serialization but can't be expressed directly in the HTML.
 * @param options.configuration - A custom RumConfiguration to use for serialization.
 * @param options.input - Whether the HTML input represents a subtree or an entire
 * document. The default is 'subtree'.
 * @param options.kind - The kind of serialization to perform. The default is
 * SerializationKind.INITIAL_FULL_SNAPSHOT.
 * @param options.target - A callback which is passed the subtree root and can return a different
 * node to use as a serialization target.
 * @param options.whitespace - Whether to keep or discard whitespace-only text nodes. The default
 * is to discard them, which gives you more freedom when formatting the HTML.
 */
export async function serializeHtmlAsChange(
  html: string,
  {
    after,
    before,
    configuration,
    input,
    kind,
    target,
    whitespace,
  }: {
    after?: (target: Node, scope: RecordingScope, stats: SerializationStats) => void
    before?: (target: Node, scope: RecordingScope) => void
    configuration?: Partial<RumConfiguration>
    input?: 'document' | 'subtree'
    kind?: SerializationKind
    target?: (defaultTarget: Node) => Node
    whitespace?: 'discard' | 'keep'
  } = {}
): Promise<BrowserChangeRecord | BrowserFullSnapshotChangeRecord | undefined> {
  const content =
    input === 'document'
      ? html
      : `<!doctype HTML><html style="width: 100%; height: 100%;"><head></head><body>${html}</body></html>`
  const container = await createFreshIFrame(content)
  registerCleanupTask(() => {
    container.remove()
  })

  const iframeDoc = container.contentDocument
  if (!iframeDoc) {
    throw new Error('Expected a loaded iframe document')
  }

  if (whitespace !== 'keep') {
    removeWhiteSpaceOnlyNodesInSubtree(iframeDoc)
  }

  const subtreeRoot = input === 'document' ? iframeDoc : iframeDoc.body.firstChild
  if (!subtreeRoot) {
    throw new Error('Expected a subtree containing at least one node')
  }

  const targetNode = target?.(subtreeRoot) ?? subtreeRoot

  const scope = createRecordingScopeForTesting({ configuration })

  let emittedRecord: BrowserRecord | undefined
  const emitRecord = (record: BrowserRecord): void => {
    emittedRecord = record
  }

  const emittedStats = createSerializationStats()
  const emitStats = (stats: SerializationStats): void => {
    aggregateSerializationStats(emittedStats, stats)
  }

  before?.(targetNode, scope)

  serializeChangesInTransaction(
    kind ?? SerializationKind.INITIAL_FULL_SNAPSHOT,
    emitRecord,
    emitStats,
    scope,
    0 as TimeStamp,
    (transaction: ChangeSerializationTransaction) => {
      const insertionCursor = createRootInsertionCursor(scope.nodeIds)
      const defaultPrivacyLevel = transaction.scope.configuration.defaultPrivacyLevel
      const parentNodePrivacyLevel = !targetNode.parentNode
        ? defaultPrivacyLevel
        : getNodePrivacyLevel(targetNode.parentNode, defaultPrivacyLevel)
      serializeNodeAsChange(insertionCursor, targetNode, parentNodePrivacyLevel, transaction)
    }
  )

  after?.(targetNode, scope, emittedStats)

  if (!emittedRecord) {
    return undefined
  }

  if (
    emittedRecord.type !== RecordType.Change &&
    (emittedRecord.type !== RecordType.FullSnapshot || emittedRecord.format !== SnapshotFormat.Change)
  ) {
    throw new Error('Expected serialization to yield a BrowserChangeRecord')
  }

  const changeDecoder = createChangeDecoder()
  return changeDecoder.decode(emittedRecord)
}

// The size of the iframes we render test content into. The same size is used for both
// width and height.
const IFRAME_SIZE_PX = '500'

async function createFreshIFrame(content: string): Promise<HTMLIFrameElement> {
  const iframe = document.createElement('iframe')
  iframe.width = IFRAME_SIZE_PX
  iframe.height = IFRAME_SIZE_PX
  iframe.style.border = '0'
  iframe.style.boxSizing = 'border-box'
  iframe.style.margin = '0'
  iframe.style.width = `${IFRAME_SIZE_PX}px`
  iframe.style.height = `${IFRAME_SIZE_PX}px`
  iframe.srcdoc = content

  const loadEvent = waitForLoadEvent(iframe)
  document.body.appendChild(iframe)
  await loadEvent

  return iframe
}

function waitForLoadEvent(iframe: HTMLIFrameElement): Promise<void> {
  return new Promise((resolve, reject) => {
    iframe.addEventListener('load', () => {
      resolve()
    })
    iframe.addEventListener('error', reject)
  })
}

function removeWhiteSpaceOnlyNodesInSubtree(subtreeRoot: Node): void {
  const descendantsToRemove = new Set<Node>()

  const collectWhiteSpaceOnlyDescendants = (node: Node) => {
    forEachChildNodes(node, (child: Node) => {
      if (child.nodeType === child.TEXT_NODE && !child.textContent?.trim()) {
        descendantsToRemove.add(child)
      }
      collectWhiteSpaceOnlyDescendants(child)
    })
  }

  collectWhiteSpaceOnlyDescendants(subtreeRoot)

  for (const descendant of descendantsToRemove) {
    descendant.parentNode?.removeChild(descendant)
  }
}
