/* eslint-disable no-restricted-syntax */
/* eslint-disable no-console */
import { noop } from '@datadog/browser-core'
import type { RumMutationRecord } from '@datadog/browser-rum-core'
import { IncrementalSource, RecordType } from '../../types'
import type {
  AttributeMutation,
  BrowserChangeRecord,
  BrowserFullSnapshotRecord,
  BrowserIncrementalSnapshotRecord,
  BrowserRecord,
  RemovedNodeMutation,
} from '../../types'
import type { EmitRecordCallback, SerializeEvent } from './record.types'
import { createRecordingScope } from './recordingScope'
import type { RecordingScope } from './recordingScope'
import type { ShadowRootsController } from './shadowRootsController'
import type { MutationLog, NodeIdRemapper } from './serialization'
import {
  createChangeConverter,
  createCopyingNodeIdRemapper,
  createIdentityNodeIdRemapper,
  serializeFullSnapshotAsChange,
  serializeMutationsAsChange,
} from './serialization'
import type { NodeId } from './itemIds'

export interface SerializationVerifier {
  stop(this: void): void
}

export function createSerializationVerifier(scope: RecordingScope): SerializationVerifier {
  const nodeIdRemapper = createCopyingNodeIdRemapper()
  scope.nodeIds = nodeIdRemapper.outputNodeIds

  const changeScope = createRecordingScope(scope.configuration, scope.elementsScrollPositions, {
    addShadowRoot: noop,
    removeShadowRoot: noop,
    flush: noop,
    stop: noop,
  } as ShadowRootsController)
  changeScope.nodeIds = nodeIdRemapper.inputNodeIds

  let converter = createChangeConverter()

  const { unsubscribe } = scope.serializeObservable.subscribe((event: SerializeEvent) => {
    let changeRecord: BrowserRecord | undefined
    const emitRecord: EmitRecordCallback = (record: BrowserRecord): void => {
      changeRecord = record
    }

    switch (event.type) {
      case 'full': {
        converter = createChangeConverter()
        serializeFullSnapshotAsChange(event.timestamp, event.kind, event.target, emitRecord, noop, changeScope)
        break
      }

      case 'incremental': {
        console.log(dumpMutationRecords(event.target))
        serializeMutationsAsChange(event.timestamp, event.target, emitRecord, noop, changeScope)
        break
      }

      default:
        event satisfies never
    }

    if (!changeRecord) {
      console.log('XXX No change record generated')
      return
    }

    try {
      const v1Record = event.v1
      const convertedChangeRecord = converter.convert(changeRecord as BrowserChangeRecord, {
        nodeIdRemapper,
        timestamp: v1Record.timestamp,
      })

      verifySnapshotsMatch(v1Record, convertedChangeRecord, nodeIdRemapper, converter.document.mutations)
    } catch (e) {
      console.log('Error:', e)
    }
  })

  return {
    stop: unsubscribe,
  }
}

function dumpMutationRecords(records: RumMutationRecord[]): string {
  const jsonRecords: Array<Record<string, unknown>> = []
  for (const record of records) {
    switch (record.type) {
      case 'attributes':
        jsonRecords.push({
          type: record.type,
          target: getNodeId(record.target),
          attributeName: record.attributeName,
          oldValue: record.oldValue,
          value: record.target.getAttribute(record.attributeName ?? '<null>'),
        })
        continue

      case 'characterData':
        jsonRecords.push({
          type: record.type,
          target: getNodeId(record.target),
          oldValue: record.oldValue,
          value: record.target.textContent,
        })
        continue

      case 'childList':
        jsonRecords.push({
          type: record.type,
          target: getNodeId(record.target),
          addedNodes: getNodeList(record.addedNodes),
          removedNodes: getNodeList(record.removedNodes),
        })
        continue
    }
  }
  return JSON.stringify(jsonRecords)
}

function getNodeList(nodes: NodeList): string[] {
  const result: string[] = []
  for (let i = 0; i < nodes.length; i++) {
    result.push(getNodeId(nodes[i]))
  }
  return result
}

function getNodeId(node: Node): string {
  const v1id = (node as any)['__v1_id']
  if (v1id === undefined) {
    const crid = (node as any)['__cr_id']
    if (crid !== undefined) {
      console.log('WTF1000')
    } else {
      return `<unknown ${node.nodeName} in ${node.parentNode?.nodeName}>`
    }
  }
  return `${v1id}`
}

function verifySnapshotsMatch(
  expectedRecord: BrowserFullSnapshotRecord | BrowserIncrementalSnapshotRecord,
  actualRecord: BrowserFullSnapshotRecord | BrowserIncrementalSnapshotRecord,
  nodeIdRemapper: NodeIdRemapper = createIdentityNodeIdRemapper(),
  mutationLog: MutationLog | undefined = undefined
): void {
  if (
    expectedRecord.type !== RecordType.IncrementalSnapshot ||
    expectedRecord.data.source !== IncrementalSource.Mutation ||
    actualRecord.type !== RecordType.IncrementalSnapshot ||
    actualRecord.data.source !== IncrementalSource.Mutation
  ) {
    verifyByteForByteEquivalence('full snapshot', expectedRecord, actualRecord)
    return
  }

  // Verify that everything but the data is byte-for-byte equivalent.
  verifyByteForByteEquivalence(
    'incremental snapshot wrapper',
    { ...expectedRecord, data: null },
    { ...actualRecord, data: null }
  )

  // Within the data, verify that everything but attribute mutations and node remove
  // mutations are byte-for-byte equivalent.
  verifyByteForByteEquivalence(
    'incremental snapshot data (without attributes and removes)',
    { ...expectedRecord.data, attributes: null, removes: null },
    { ...actualRecord.data, attributes: null, removes: null }
  )

  // Verify that the attribute mutations are byte-for-byte equivalent except for order.
  const orderAttributeMutations = (a: AttributeMutation, b: AttributeMutation): number => a.id - b.id
  verifyByteForByteEquivalence(
    'incremental snapshot attribute mutations',
    expectedRecord.data.attributes.sort(orderAttributeMutations),
    actualRecord.data.attributes.sort(orderAttributeMutations)
  )

  const loggedRemoves = new Set<NodeId>()
  if (mutationLog) {
    for (const removeNodeId of mutationLog.nodeRemoves.keys()) {
      loggedRemoves.add(nodeIdRemapper.remap(removeNodeId))
    }
  }

  console.log(
    JSON.stringify([
      ['V1 REMOVE', 'PARENT'],
      ...expectedRecord.data.removes.map((remove) => [remove.id, remove.parentId]),
    ])
  )
  console.log(JSON.stringify([['CR REMOVE'], ...[...loggedRemoves].map((remove) => [remove])]))

  const expectedRemoves = expectedRecord.data.removes
  const expectedRemovedNodes = new Set<NodeId>()
  for (const remove of expectedRemoves) {
    expectedRemovedNodes.add(remove.id as NodeId)
  }

  const actualRemoves: RemovedNodeMutation[] = actualRecord.data.removes.filter((remove) =>
    expectedRemovedNodes.has(remove.id as NodeId)
  )

  /*
  const expectedRemoves: RemovedNodeMutation[] = []
  const expectedTransitiveRemoves = new Set<NodeId>()
  for (const remove of expectedRecord.data.removes) {
    const removedNodeId = remove.id as NodeId
    if (!mutationLog || loggedRemoves.has(removedNodeId)) {
      expectedRemoves.push(remove)
    } else {
      expectedTransitiveRemoves.add(removedNodeId)
    }
  }

  const actualRemoves = actualRecord.data.removes
  const actualTransitiveRemoves = new Set<NodeId>()
  for (const removedNodeId of loggedTransitiveRemoves) {
    // Note that verification fails if we didn't log a transitive remove that was included
    // in the expected record, but it does *not* fail if we logged extra transitive
    // removes.
    if (expectedTransitiveRemoves.has(removedNodeId)) {
      actualTransitiveRemoves.add(removedNodeId)
    }
  }
  */

  verifyByteForByteEquivalence('incremental snapshot removes', expectedRemoves, actualRemoves)
  // verifyByteForByteEquivalence(
  //  'incremental snapshot transitive removes',
  //  [...expectedTransitiveRemoves].sort(),
  //  [...actualTransitiveRemoves].sort()
  // )
}

function verifyByteForByteEquivalence(context: string, expectedRecord: unknown, actualRecord: unknown): void {
  // When stringified, the two records should be byte-for-byte identical.
  const expectedString = JSON.stringify(expectedRecord)
  const actualString = JSON.stringify(actualRecord)
  if (actualString !== expectedString) {
    // monitor-until: forever
    console.log('Serialization mismatch', {
      context,
      mismatch: createSerializationMismatchContext(expectedString, actualString),
    })
  }
}

function createSerializationMismatchContext(expected: string, actual: string): Record<string, string> {
  console.log('Expected')
  console.log(expected)
  console.log('Actual')
  console.log(actual)
  const length = Math.min(expected.length, actual.length)
  try {
    let firstDifferenceIndex = 0
    while (firstDifferenceIndex < length && expected[firstDifferenceIndex] === actual[firstDifferenceIndex]) {
      firstDifferenceIndex++
    }
    return {
      expected: getStringNearPosition(expected, firstDifferenceIndex),
      actual: getStringNearPosition(actual, firstDifferenceIndex),
    }
  } catch (e) {
    return { firstDifferenceError: JSON.stringify(e) }
  }
}

function getStringNearPosition(str: string, index: number): string {
  const leftContextStart = Math.max(index - 50, 0)
  const rightContextEnd = Math.min(index + 150, str.length)
  return `${str.substring(leftContextStart, index)}(!)${str.substring(index, rightContextEnd)}`
}
