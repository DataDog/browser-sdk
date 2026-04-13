import type {
  DocumentFragmentNode,
  MouseInteractionData,
  ScrollData,
  SerializedNodeWithId,
} from '@datadog/browser-rum/src/types'
import {
  ChangeType,
  IncrementalSource,
  MouseInteractionType,
  NodeType,
  SnapshotFormat,
} from '@datadog/browser-rum/src/types'

import { createMutationPayloadValidatorFromSegment } from '@datadog/browser-rum/test/record/mutationPayloadValidator'
import {
  findElementWithIdAttribute,
  findNode,
  findTextContent,
  findTextNode,
} from '@datadog/browser-rum/test/record/nodes'
import {
  findFullSnapshot,
  findFullSnapshotInFormat,
  findIncrementalSnapshot,
  findMouseInteractionRecords,
} from '@datadog/browser-rum/test/record/segments'

import type { Page } from '@playwright/test'
import { test, expect } from '@playwright/test'
import { decodeChangeRecords, findChangeRecords } from '@datadog/browser-rum/test/record/changes'
import { getElementIdsFromFullSnapshot } from '@datadog/browser-rum/test/record/elements'
import { createTest, html } from '../../lib/framework'

/**
 * Will generate the following HTML
 * ```html
 * <my-input-field id="titi">
 *  #shadow-root
 *    <div>
 *      <label  id="label-titi">field titi: </label>
 *      <input id="input-titi" value="toto">
 *    </div>
 *</my-input-field>
 *```
 when called like `<my-input-field id="titi" />`
 */
const inputShadowDom = `<script>
 class MyInputField extends HTMLElement {
   constructor() {
     super();
     this.attachShadow({ mode: "open" });
   }
   connectedCallback() {
     const componentId = this.getAttribute('id') ?? '';
     const privacyOverride = this.getAttribute("privacy");
     const parent = document.createElement("div");
     if (privacyOverride) {
       parent.setAttribute("data-dd-privacy", privacyOverride);
     }
     const label = document.createElement("label");
     label.setAttribute("id", "label-" + componentId);
     label.innerText = "field " + componentId + ": ";
     const input = document.createElement("input");
     input.setAttribute("id", "input-" + componentId);
     input.value = "toto"
     parent.appendChild(label)
     parent.appendChild(input)
     this.shadowRoot.appendChild(parent);
   }
 }
       window.customElements.define("my-input-field", MyInputField);
 </script>
 `

/**
 * Will generate the following HTML
 * ```html
 * <my-div id="titi">
 *  #shadow-root
 *    <div>toto</div>
 *</my-div>
 *```
 when called like `<my-div />`
 */
const divShadowDom = `<script>
 class CustomDiv extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }
  connectedCallback() {
    const div = document.createElement("div");
    div.setAttribute('id', 'shadow-child')
    div.textContent = 'toto'
    this.shadowRoot.appendChild(div);
  }
}
      window.customElements.define("my-div", CustomDiv);
 </script>
 `

/**
 * Will generate the following HTML
 * ```html
 * <my-div id="titi">
 *  #shadow-root
 *    <div scrollable-div style="height:100px; overflow: scroll;">
 *      <div style="height:500px;"></div>
 *    </div>
 *    <button>scroll to 250</button>
 *</my-div>
 *```
 when called like `<my-div />`
 */
const scrollableDivShadowDom = `<script>
 class CustomScrollableDiv extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }
  connectedCallback() {
    const div = document.createElement("div");
    div.id = 'scrollable-div';
    div.style.height = '100px';
    div.style.overflow = 'scroll';

    const innerDiv = document.createElement("div");
    innerDiv.style.height = '500px';

    const button = document.createElement("button");
    button.textContent = 'scroll to 250';

    button.onclick = () => {
      div.scrollTo({ top: 250 });
    }

    div.appendChild(innerDiv);
    this.shadowRoot.appendChild(button);
    this.shadowRoot.appendChild(div);
  }
}
      window.customElements.define("my-scrollable-div", CustomScrollableDiv);
 </script>
 `

/**
 * Will generate the following HTML
 * ```html
 * <div-with-style>
 *  #shadow-root
 *    <div>toto</div>
 *</div-with-style>
 *```
 when called like `<div-with-style />`
 */
const divWithStyleShadowDom = `<script>
class DivWithStyle extends HTMLElement {
 constructor() {
   super();
   this.attachShadow({ mode: "open" });
 }
 connectedCallback() {
   const div = document.createElement("div");
   div.textContent = 'toto'
   this.shadowRoot.appendChild(div);
   const styleSheet = new CSSStyleSheet();
   styleSheet.insertRule('div { width: 100%; }')
   this.shadowRoot.adoptedStyleSheets = [styleSheet]
 }
}
     window.customElements.define("div-with-style", DivWithStyle);
</script>
`

test.describe('recorder with shadow DOM', () => {
  test.describe('can record fullsnapshot with the detail inside the shadow root', () => {
    const body = html`
      ${divShadowDom}
      <my-div />
    `

    createTest('V1')
      .withRum({
        defaultPrivacyLevel: 'allow',
      })
      .withBody(body)
      .run(async ({ flushEvents, intakeRegistry }) => {
        await flushEvents()
        expect(intakeRegistry.replaySegments).toHaveLength(1)

        const fullSnapshot = findFullSnapshotInFormat(SnapshotFormat.V1, intakeRegistry.replaySegments[0])!
        expect(fullSnapshot).toBeTruthy()

        const textNode = findTextNode(fullSnapshot.data.node, 'toto')
        expect(textNode).toBeTruthy()
        expect(textNode?.textContent).toBe('toto')
      })

    createTest('Change')
      .withRum({
        defaultPrivacyLevel: 'allow',
        enableExperimentalFeatures: ['use_incremental_change_records'],
      })
      .withBody(body)
      .run(async ({ flushEvents, intakeRegistry }) => {
        await flushEvents()
        expect(intakeRegistry.replaySegments).toHaveLength(1)

        const records = findChangeRecords(intakeRegistry.replaySegments[0].records)
        expect(decodeChangeRecords(records).at(0)!.data).toEqual([
          [
            ChangeType.AddNode,
            [null, '#document'],
            [1, '#doctype', 'html', '', ''],
            [0, 'HTML'],
            [1, 'HEAD'],
            [0, 'BODY'],
            [1, '#text', '\n      '],
            [0, '#text', '\n \n      '],
            [0, 'MY-DIV'],
            [1, '#text', '\n    '],
            [0, '#shadow-root'],
            [1, 'DIV', ['id', 'shadow-child']],
            [1, '#text', 'toto'],
          ],
          [ChangeType.ScrollPosition, [0, 0, 0]],
        ])
      })
  })

  test.describe('can record fullsnapshot with adoptedStylesheet', () => {
    const body = html`
      ${divWithStyleShadowDom}
      <div-with-style />
    `

    async function skipIfAdoptedStyleSheetsNotSupported(page: Page): Promise<void> {
      const isAdoptedStyleSheetsSupported = await page.evaluate(() => document.adoptedStyleSheets !== undefined)
      test.skip(!isAdoptedStyleSheetsSupported, 'adoptedStyleSheets is not supported in this browser')
    }

    createTest('V1')
      .withRum()
      .withBody(body)
      .run(async ({ flushEvents, intakeRegistry, page }) => {
        await skipIfAdoptedStyleSheetsNotSupported(page)

        await flushEvents()
        expect(intakeRegistry.replaySegments).toHaveLength(1)

        const fullSnapshot = findFullSnapshotInFormat(SnapshotFormat.V1, intakeRegistry.replaySegments[0])!
        expect(fullSnapshot).toBeTruthy()
        const shadowRoot = findNode(
          fullSnapshot.data.node,
          (node) => node.type === NodeType.DocumentFragment
        ) as DocumentFragmentNode
        expect(shadowRoot.isShadowRoot).toBe(true)
        expect(shadowRoot.adoptedStyleSheets).toEqual([{ cssRules: ['div { width: 100%; }'] }])
      })

    createTest('Change')
      .withRum({
        enableExperimentalFeatures: ['use_incremental_change_records'],
      })
      .withBody(body)
      .run(async ({ flushEvents, intakeRegistry, page }) => {
        await skipIfAdoptedStyleSheetsNotSupported(page)

        await flushEvents()
        expect(intakeRegistry.replaySegments).toHaveLength(1)

        const records = findChangeRecords(intakeRegistry.replaySegments[0].records)
        expect(decodeChangeRecords(records).at(-1)!.data).toEqual([
          [
            ChangeType.AddNode,
            [null, '#document'],
            [1, '#doctype', 'html', '', ''],
            [0, 'HTML'],
            [1, 'HEAD'],
            [0, 'BODY'],
            [1, '#text', '\n      '],
            [0, '#text', '\n\n      '],
            [0, 'DIV-WITH-STYLE'],
            [1, '#text', '\n    '],
            [0, '#shadow-root'],
            [1, 'DIV'],
            [1, '#text', 'toto'],
          ],
          [ChangeType.ScrollPosition, [0, 0, 0]],
          [ChangeType.AddStyleSheet, [['div { width: 100%; }']]],
          [ChangeType.AttachedStyleSheets, [9, 0]],
        ])
      })
  })

  test.describe('can apply privacy level set from outside or inside the shadow DOM', () => {
    const body = html`
      ${inputShadowDom}
      <div data-dd-privacy="mask-user-input"><my-input-field id="privacy-set-outside" /></div>
      <my-input-field privacy="mask-user-input" id="privacy-set-inside" />
    `

    createTest('V1')
      .withRum({
        defaultPrivacyLevel: 'allow',
      })
      .withBody(body)
      .run(async ({ flushEvents, intakeRegistry }) => {
        await flushEvents()
        expect(intakeRegistry.replaySegments).toHaveLength(1)

        const fullSnapshot = findFullSnapshotInFormat(SnapshotFormat.V1, intakeRegistry.replaySegments[0])!
        expect(fullSnapshot).toBeTruthy()

        const {
          input: outsideInput,
          shadowRoot: outsideShadowRoot,
          textContent: outsideTextContent,
        } = findElementsInShadowDom(fullSnapshot.data.node, 'privacy-set-outside')
        expect(outsideShadowRoot?.isShadowRoot).toBe(true)
        expect(outsideInput?.attributes.value).toBe('***')
        expect(outsideTextContent).toBe('field privacy-set-outside: ')

        const {
          input: insideInput,
          shadowRoot: insideShadowRoot,
          textContent: insideTextContent,
        } = findElementsInShadowDom(fullSnapshot.data.node, 'privacy-set-inside')
        expect(insideShadowRoot?.isShadowRoot).toBe(true)
        expect(insideInput?.attributes.value).toBe('***')
        expect(insideTextContent).toBe('field privacy-set-inside: ')
      })

    createTest('Change')
      .withRum({
        defaultPrivacyLevel: 'allow',
        enableExperimentalFeatures: ['use_incremental_change_records'],
      })
      .withBody(body)
      .run(async ({ flushEvents, intakeRegistry }) => {
        await flushEvents()
        expect(intakeRegistry.replaySegments).toHaveLength(1)

        const records = findChangeRecords(intakeRegistry.replaySegments[0].records)
        expect(decodeChangeRecords(records).at(0)!.data).toEqual([
          [
            ChangeType.AddNode,
            [null, '#document'],
            [1, '#doctype', 'html', '', ''],
            [0, 'HTML'],
            [1, 'HEAD'],
            [0, 'BODY'],
            [1, '#text', '\n      '],
            [0, '#text', '\n \n      '],
            [0, 'DIV', ['data-dd-privacy', 'mask-user-input']],
            [1, 'MY-INPUT-FIELD', ['id', 'privacy-set-outside']],
            [1, '#shadow-root'],
            [1, 'DIV'],
            [1, 'LABEL', ['id', 'label-privacy-set-outside']],
            [1, '#text', 'field privacy-set-outside: '],
            [3, 'INPUT', ['id', 'input-privacy-set-outside'], ['value', '***']],
            [10, '#text', '\n      '],
            [0, 'MY-INPUT-FIELD', ['privacy', 'mask-user-input'], ['id', 'privacy-set-inside']],
            [1, '#text', '\n    '],
            [0, '#shadow-root'],
            [1, 'DIV', ['data-dd-privacy', 'mask-user-input']],
            [1, 'LABEL', ['id', 'label-privacy-set-inside']],
            [1, '#text', 'field privacy-set-inside: '],
            [3, 'INPUT', ['id', 'input-privacy-set-inside'], ['value', '***']],
          ],
          [ChangeType.ScrollPosition, [0, 0, 0]],
        ])
      })
  })

  test.describe('can record click with target from inside the shadow root', () => {
    function createTestVariation(name: string, enableExperimentalFeatures: string[]): void {
      createTest(name)
        .withRum({ enableExperimentalFeatures })
        .withBody(html`
          ${divShadowDom}
          <my-div />
        `)
        .run(async ({ flushEvents, intakeRegistry, page }) => {
          const div = page.locator('my-div #shadow-child')
          await div.click()
          await flushEvents()
          expect(intakeRegistry.replaySegments).toHaveLength(1)

          const fullSnapshot = findFullSnapshot({ records: intakeRegistry.replayRecords })!
          const elementIds = getElementIdsFromFullSnapshot(fullSnapshot)
          const shadowChildId = elementIds.get('shadow-child')

          const mouseInteraction = findMouseInteractionRecords(
            intakeRegistry.replaySegments[0],
            MouseInteractionType.Click
          )[0]
          expect(mouseInteraction).toBeTruthy()
          expect((mouseInteraction.data as MouseInteractionData).id).toBe(shadowChildId)
        })
    }

    createTestVariation('V1', [])
    createTestVariation('Change', ['use_incremental_change_records'])
  })

  test.describe('can record mutation from inside the shadow root', () => {
    const body = html`
      ${divShadowDom}
      <my-div id="host" />
    `

    const mutate = () => {
      const host = document.body.querySelector('#host') as HTMLElement
      const div = host.shadowRoot!.querySelector('div') as HTMLElement
      div.innerText = 'titi'
    }

    createTest('V1')
      .withRum({
        defaultPrivacyLevel: 'allow',
      })
      .withBody(body)
      .run(async ({ flushEvents, intakeRegistry, page }) => {
        await page.evaluate(mutate)
        await flushEvents()
        expect(intakeRegistry.replaySegments).toHaveLength(1)

        const { validate, expectInitialNode, expectNewNode } = createMutationPayloadValidatorFromSegment(
          intakeRegistry.replaySegments[0],
          { expect }
        )
        validate({
          adds: [
            {
              parent: expectInitialNode({ tag: 'div' }),
              node: expectNewNode({ type: NodeType.Text, textContent: 'titi' }),
            },
          ],
          removes: [
            {
              parent: expectInitialNode({ tag: 'div' }),
              node: expectInitialNode({ text: 'toto' }),
            },
          ],
        })
      })

    createTest('Change')
      .withRum({
        defaultPrivacyLevel: 'allow',
        enableExperimentalFeatures: ['use_incremental_change_records'],
      })
      .withBody(body)
      .run(async ({ flushEvents, intakeRegistry, page }) => {
        await page.evaluate(mutate)
        await flushEvents()
        expect(intakeRegistry.replaySegments).toHaveLength(1)

        const records = findChangeRecords(intakeRegistry.replaySegments[0].records)
        expect(decodeChangeRecords(records).at(-1)!.data).toEqual([
          [ChangeType.AddNode, [2, '#text', 'titi']],
          [ChangeType.RemoveNode, 11],
        ])
      })
  })

  test.describe('can record scroll from inside the shadow root', () => {
    function createTestVariation(name: string, enableExperimentalFeatures: string[]): void {
      createTest(name)
        .withRum({ enableExperimentalFeatures })
        .withBody(html`
          ${scrollableDivShadowDom}
          <my-scrollable-div id="host" />
        `)
        .run(async ({ flushEvents, intakeRegistry, page }) => {
          const button = page.locator('my-scrollable-div button')

          // Triggering scrollTo from the test itself is not allowed
          // Thus, a callback to scroll the div was added to the button 'click' event
          await button.click()

          await flushEvents()
          expect(intakeRegistry.replaySegments).toHaveLength(1)

          const firstSegment = intakeRegistry.replaySegments[0]
          const fullSnapshot = findFullSnapshot(firstSegment)!
          const elementIds = getElementIdsFromFullSnapshot(fullSnapshot)

          const divId = elementIds.get('scrollable-div')
          expect(divId).not.toBeUndefined()

          const scrollRecord = findIncrementalSnapshot(firstSegment, IncrementalSource.Scroll)
          expect(scrollRecord).toBeTruthy()

          const scrollData = scrollRecord?.data as ScrollData
          expect(scrollData.id).toBe(divId)
          expect(scrollData.y).toBe(250)
        })
    }

    createTestVariation('V1', [])
    createTestVariation('Change', ['use_incremental_change_records'])
  })
})

function findElementsInShadowDom(node: SerializedNodeWithId, id: string) {
  const shadowHost = findElementWithIdAttribute(node, id)
  expect(shadowHost).toBeTruthy()

  const shadowRoot = shadowHost!.childNodes.find(
    (node) => node.type === NodeType.DocumentFragment && node.isShadowRoot
  ) as DocumentFragmentNode
  expect(shadowRoot).toBeTruthy()

  const input = findElementWithIdAttribute(node, `input-${id}`)
  expect(input).toBeTruthy()

  const text = findElementWithIdAttribute(node, `label-${id}`)!
  expect(text).toBeTruthy()
  const textContent = findTextContent(text)
  expect(textContent).toBeTruthy()
  return { shadowHost, shadowRoot, input, text, textContent }
}
