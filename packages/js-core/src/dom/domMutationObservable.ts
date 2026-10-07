import { monitor } from '../entries/monitor'
import { noop } from '../util/noop'
import { Observable } from '../util/observable'
import { getZoneJsOriginalValue } from '../util/getZoneJsOriginalValue'

// https://dom.spec.whatwg.org/#interface-mutationrecord

/**
 * A mutation record describing a change to the text content of a `CharacterData` node (text,
 * comment, CDATA section).
 */
export interface CharacterDataMutationRecord {
  /** Discriminant of the {@link MutationRecord} union. */
  type: 'characterData'
  /** The node whose data changed. */
  target: Node
  /** The node data before the change. */
  oldValue: string | null
}

/**
 * A mutation record describing a change to an attribute of an element.
 */
export interface AttributesMutationRecord {
  /** Discriminant of the {@link MutationRecord} union. */
  type: 'attributes'
  /** The element whose attribute changed. */
  target: Element
  /** The attribute value before the change, or `null` if the attribute was absent. */
  oldValue: string | null
  /** The local name of the changed attribute. */
  attributeName: string
}

/**
 * A mutation record describing nodes added to or removed from the children of a node.
 */
export interface ChildListMutationRecord {
  /** Discriminant of the {@link MutationRecord} union. */
  type: 'childList'
  /** The node whose children changed. */
  target: Node
  /** The nodes that were added. */
  addedNodes: NodeList
  /** The nodes that were removed. */
  removedNodes: NodeList
}

/**
 * A narrowed, discriminated version of the native `MutationRecord`, exposing only the fields
 * relevant to each mutation `type`.
 */
export type MutationRecord = CharacterDataMutationRecord | AttributesMutationRecord | ChildListMutationRecord

/**
 * Creates an {@link Observable} notifying batches of DOM mutations happening anywhere in the
 * document (attributes, character data and child lists, including old values).
 *
 * The underlying `MutationObserver` is created lazily on first subscription and disconnected when
 * the last observer unsubscribes. It uses the Zone.js-free constructor returned by
 * {@link getMutationObserverConstructor}.
 *
 * @returns An observable of mutation record batches.
 */
export function createDOMMutationObservable() {
  const MutationObserver = getMutationObserverConstructor()

  return new Observable<MutationRecord[]>((observable) => {
    const observer = new MutationObserver(monitor((records) => observable.notify(records)))
    observer.observe(document, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    })
    return () => observer.disconnect()
  })
}

type MutationObserverConstructor = new (callback: (records: MutationRecord[]) => void) => MutationObserver

export interface BrowserWindow extends Window {
  MutationObserver: MutationObserverConstructor
  Zone?: unknown
}

/**
 * Returns the native `MutationObserver` constructor, bypassing the Zone.js patched one when Angular
 * is used (see the comments below for the rationale).
 *
 * @returns The original `MutationObserver` constructor, or `window.MutationObserver` when Zone.js is
 * not present or its original cannot be retrieved.
 */
export function getMutationObserverConstructor(): MutationObserverConstructor {
  let constructor: MutationObserverConstructor | undefined
  const browserWindow = window as BrowserWindow

  // Angular uses Zone.js to provide a context persisting across async tasks.  Zone.js replaces the
  // global MutationObserver constructor with a patched version to support the context propagation.
  // There is an ongoing issue[1][2] with this setup when using a MutationObserver within a Angular
  // component: on some occasions, the callback is being called in an infinite loop, causing the
  // page to freeze (even if the callback is completely empty).
  //
  // To work around this issue, we try to get the original MutationObserver constructor stored by
  // Zone.js.
  //
  // [1]: https://github.com/angular/angular/issues/26948
  // [2]: https://github.com/angular/angular/issues/31712
  if (browserWindow.Zone) {
    // Zone.js 0.8.6+ is storing original class constructors into the browser 'window' object[3].
    //
    // [3]: https://github.com/angular/angular/blob/6375fa79875c0fe7b815efc45940a6e6f5c9c9eb/packages/zone.js/lib/common/utils.ts#L288
    constructor = getZoneJsOriginalValue(browserWindow, 'MutationObserver')

    if (browserWindow.MutationObserver && constructor === browserWindow.MutationObserver) {
      // Anterior Zone.js versions (used in Angular 2) does not expose the original MutationObserver
      // in the 'window' object. Luckily, the patched MutationObserver class is storing an original
      // instance in its properties[4]. Let's get the original MutationObserver constructor from
      // there.
      //
      // [4]: https://github.com/angular/zone.js/blob/v0.8.5/lib/common/utils.ts#L412

      const patchedInstance = new browserWindow.MutationObserver(noop) as {
        originalInstance?: { constructor: MutationObserverConstructor }
      }

      const originalInstance = getZoneJsOriginalValue(patchedInstance, 'originalInstance')
      constructor = originalInstance?.constructor
    }
  }

  if (!constructor) {
    constructor = browserWindow.MutationObserver
  }

  return constructor
}
