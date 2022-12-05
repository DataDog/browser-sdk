import type { RumInitConfiguration } from '@datadog/browser-rum-core'
import { IncrementalSource, NodeType } from '@datadog/browser-rum/src/types'
import type {
  MouseInteractionData,
  InputData,
  SerializedNodeWithId,
  TextNode,
  BrowserMutationData,
} from '@datadog/browser-rum/src/types'

import {
  findElementWithIdAttribute,
  findElementWithTagName,
  findFullSnapshot,
  findIncrementalSnapshot,
  findTextContent,
} from '@datadog/browser-rum/test/utils'
import type { EventRegistry } from '../../lib/framework'
import { flushEvents, createTest, bundleSetup, html } from '../../lib/framework'
import { browserExecute } from '../../lib/helpers/browser'

/** Will generate the following HTML 
 * ```html
 * <my-open-web-component id="titi">
 *  #shadow-root
 *    <div for="div1-titi">
 *      <label for="input-titi" id="label-titi">field titi: </label>
 *      <input id="input-titi" value="toto">
 *    </div>
 *    <div>
 *      <p id="text-titi">toto</p>
 *    </div>
 *</my-open-web-component>
 *```
 when called like `<my-open-web-component id="titi" />`
 */
const simpleShadowDom = `<script>
class MyOpenWebComponent extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }
  connectedCallback() {
    const div2 = document.createElement("div");
    div2.setAttribute("id", "div2-" + this.getAttribute("id"));
    const p = document.createElement("p");
    p.setAttribute("id", "text-" + this.getAttribute("id"));
    p.innerText = 'toto'
    div2.appendChild(p)
    const div1 = document.createElement("div");
    if (this.getAttribute("privacy")) {
      div1.setAttribute("data-dd-privacy", this.getAttribute("privacy"));
      div2.setAttribute("data-dd-privacy", this.getAttribute("privacy"));
    }
    const label = document.createElement("label");
    label.setAttribute("for", "input-" + this.getAttribute("id"));
    label.setAttribute("id", "label-" + this.getAttribute("id"));
    label.innerText = "field " + this.getAttribute("id") + ": ";
    const input = document.createElement("input");
    input.setAttribute("id", "input-" + this.getAttribute("id"));
    input.setAttribute("value", "toto");
    input.addEventListener('input', (e) => {
      p.textContent = e.target.value
    })
    div1.appendChild(label);
    div1.appendChild(input);
    div1.setAttribute("id", "div1-" + this.getAttribute("id"));
    this.shadowRoot.appendChild(div1);
    this.shadowRoot.appendChild(div2);
  }
}
window.customElements.define("my-open-web-component", MyOpenWebComponent);
</script>
`

describe('recorder with shadow DOM', () => {
  describe('full snapshot', () => {
    createTest('can overwrite with mask-user-input')
      .withRum({ defaultPrivacyLevel: 'allow', enableExperimentalFeatures: ['recordShadowDom'] })
      .withRumInit(initRumAndStartRecording)
      .withSetup(bundleSetup)
      .withBody(
        html`
          ${simpleShadowDom}
          <div id="wrapper-outside" data-dd-privacy="mask-user-input"><my-open-web-component id="outside" /></div>
          <div id="wrapper-inside"><my-open-web-component privacy="mask-user-input" id="inside" /></div>
        `
      )
      .run(async ({ serverEvents }) => {
        await flushEvents()

        expect(serverEvents.sessionReplay.length).toBe(1)

        const fullSnapshot = findFullSnapshot(getFirstSegment(serverEvents))!
        expect(fullSnapshot).toBeTruthy()

        const {
          input: outsideInput,
          shadowHost: outsideShadowHost,
          textContent: outsideTextContent,
        } = findElementsInShadowDom(fullSnapshot.data.node, 'outside')
        expect(outsideShadowHost?.isShadowHost).toBeTrue()
        expect(outsideInput?.attributes.value).toBe('***')
        expect(outsideTextContent).toBe('toto')

        const {
          input: insideInput,
          shadowHost: insideShadowHost,
          textContent: insideTextContent,
        } = findElementsInShadowDom(fullSnapshot.data.node, 'inside')
        expect(insideShadowHost?.isShadowHost).toBeTrue()
        expect(insideInput?.attributes.value).toBe('***')
        expect(insideTextContent).toBe('toto')
      })
  })
  describe('incremental snapshot', () => {
    createTest('record click')
      .withRum({ enableExperimentalFeatures: ['recordShadowDom'] })
      .withRumInit(initRumAndStartRecording)
      .withSetup(bundleSetup)
      .withBody(
        html`
          ${simpleShadowDom}
          <my-open-web-component id="some" />
        `
      )
      .run(async ({ serverEvents }) => {
        await browserExecute(() => document.documentElement.outerHTML)
        const label = await getNodeInsideShadowDom('label')
        await label.click()
        await flushEvents()
        expect(serverEvents.sessionReplay.length).toBe(1)
        const fullSnapshot = findFullSnapshot(getFirstSegment(serverEvents))!
        const labelNode = findElementWithTagName(fullSnapshot.data.node, 'label')!
        const mouseInteraction = findIncrementalSnapshot(
          getFirstSegment(serverEvents),
          IncrementalSource.MouseInteraction
        )!
        expect(mouseInteraction).toBeTruthy()
        expect(mouseInteraction.data.source).toBe(IncrementalSource.MouseInteraction)
        expect((mouseInteraction.data as MouseInteractionData).id).toBe(labelNode.id)
      })

    createTest('record input')
      .withRum({ defaultPrivacyLevel: 'allow', enableExperimentalFeatures: ['recordShadowDom'] })
      .withRumInit(initRumAndStartRecording)
      .withSetup(bundleSetup)
      .withBody(
        html`
          ${simpleShadowDom}
          <my-open-web-component id="some" />
        `
      )
      .run(async ({ serverEvents }) => {
        await browserExecute(() => document.documentElement.outerHTML)
        const input = await getNodeInsideShadowDom('input')
        await input.addValue('t')

        await flushEvents()
        expect(serverEvents.sessionReplay.length).toBe(1)
        const fullSnapshot = findFullSnapshot(getFirstSegment(serverEvents))!
        const inputNode = findElementWithTagName(fullSnapshot.data.node, 'input')!
        const inputRecord = findIncrementalSnapshot(getFirstSegment(serverEvents), IncrementalSource.Input)!
        expect(inputRecord).toBeTruthy()
        expect(inputRecord.data.source).toBe(IncrementalSource.Input)
        expect((inputRecord.data as InputData).id).toBe(inputNode.id)
        expect((inputRecord.data as { text: string }).text).toBe('totot')
      })

    createTest('record mutation')
      .withRum({ defaultPrivacyLevel: 'allow', enableExperimentalFeatures: ['recordShadowDom'] })
      .withRumInit(initRumAndStartRecording)
      .withSetup(bundleSetup)
      .withBody(
        html`
          ${simpleShadowDom}
          <my-open-web-component id="some" />
        `
      )
      .run(async ({ serverEvents }) => {
        await browserExecute(() => document.documentElement.outerHTML)
        const input = await getNodeInsideShadowDom('input')
        await input.addValue('t')

        await flushEvents()
        expect(serverEvents.sessionReplay.length).toBe(1)
        const fullSnapshot = findFullSnapshot(getFirstSegment(serverEvents))!

        const pNode = findElementWithTagName(fullSnapshot.data.node, 'p')!
        const mutationRecord = findIncrementalSnapshot(getFirstSegment(serverEvents), IncrementalSource.Mutation)!
        expect(mutationRecord).toBeTruthy()
        expect(mutationRecord.data.source).toBe(IncrementalSource.Mutation)
        const mutationData = mutationRecord.data as BrowserMutationData
        expect(mutationData.adds.length).toBe(1)
        expect(mutationData.adds[0].parentId).toBe(pNode.id)
        const textNode = mutationData.adds[0].node as TextNode
        expect(textNode.type).toBe(NodeType.Text)
        expect(textNode.textContent).toBe('totot')
        expect(mutationData.removes.length).toBe(1)
        expect(mutationData.removes[0].parentId).toBe(pNode.id)
        expect(mutationData.removes[0].id).toBe(pNode.childNodes[0].id)
      })
  })
})

function findElementsInShadowDom(node: SerializedNodeWithId, id: string) {
  const shadowHost = findElementWithIdAttribute(node, id)
  expect(shadowHost).toBeTruthy()

  const input = findElementWithIdAttribute(node, `input-${id}`)
  expect(input).toBeTruthy()

  const text = findElementWithIdAttribute(node, `text-${id}`)
  expect(text).toBeTruthy()
  const textContent = findTextContent(text!)
  expect(textContent).toBeTruthy()
  return { shadowHost, input, text, textContent }
}

function getFirstSegment(events: EventRegistry) {
  return events.sessionReplay[0].segment.data
}

function initRumAndStartRecording(initConfiguration: RumInitConfiguration) {
  window.DD_RUM!.init(initConfiguration)
  window.DD_RUM!.startSessionReplayRecording()
}

async function getNodeInsideShadowDom(selector: string) {
  const host = await $('my-open-web-component')
  return host.shadow$(selector)
}
