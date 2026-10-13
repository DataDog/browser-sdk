import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { chromium } from '@playwright/test'

let browser
before(async () => {
  browser = await chromium.launch({ headless: true })
})
after(async () => {
  await browser?.close()
})

async function openPrototype(port) {
  const url = `http://127.0.0.1:${port}`
  const response = await fetch(url)
  assert.equal(response.status, 200)
  const html = await response.text()
  assert.match(html, /Server-rendered API content/)
  assert.match(html, /Server-rendered property content/)
  assert.match(html, /Server-rendered attribute content/)
  assert.doesNotMatch(html, /data-dd-element-stack=/)

  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (/hydration|hydrating|mismatch/i.test(message.text()) && ['warning', 'error'].includes(message.type())) {
      errors.push(message.text())
    }
  })
  await page.goto(url)
  await page.waitForFunction(() => typeof document.querySelector('#property-root')?.dd_element_stack === 'string')
  return { page, errors }
}

async function verifyApi(port, service) {
  const { page, errors } = await openPrototype(port)
  try {
    assert.equal(await page.locator('#api-root').evaluate((element) => 'dd_element_stack' in element), false)
    await page.click('#api-click')
    await page.waitForFunction(() => window.prototypeEvents.some((event) => event.name === 'API click'))
    const event = await page.evaluate(() => window.prototypeEvents.find((event) => event.name === 'API click'))
    assert.equal(event.service, service)
    assert.equal(event.version, '1.0.0')
    assert.ok(event.elementStack)
    assert.equal(event.handlingStack, undefined)
    assert.doesNotMatch(event.elementStack.split('\n')[1], /prototype-sdk/)
    assert.equal(await page.locator('#api-root output').textContent(), '1')
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
  }
}

async function verifyProperty(port, service) {
  const { page, errors } = await openPrototype(port)
  try {
    const stack = await page.locator('#property-root').evaluate((element) => element.dd_element_stack)
    assert.equal(await page.locator('#property-root').getAttribute('dd_element_stack'), null)
    await page.click('#property-click')
    await page.waitForFunction(() => window.prototypeEvents.some((event) => event.name === 'Property click'))
    const event = await page.evaluate(() => window.prototypeEvents.find((event) => event.name === 'Property click'))
    assert.equal(event.service, service)
    assert.equal(event.version, '1.0.0')
    assert.equal(event.elementStack, stack)
    assert.equal(event.handlingStack, undefined)
    assert.equal(await page.locator('#property-root output').textContent(), '1')
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
  }
}

test('Next.js SSR: SDK API attribution after hydration', () => verifyApi(3101, 'checkout-next'))
test('Next.js SSR: custom property attribution after hydration', () => verifyProperty(3101, 'checkout-next'))
test('Nuxt SSR: SDK API attribution after hydration', () => verifyApi(3102, 'checkout-nuxt'))
test('Nuxt SSR: custom property attribution after hydration', () => verifyProperty(3102, 'checkout-nuxt'))
test('Angular SSR: SDK API attribution after hydration', () => verifyApi(3103, 'checkout-angular'))
test('Angular SSR: custom property attribution after hydration', () => verifyProperty(3103, 'checkout-angular'))

async function verifyAttribute(port, service) {
  const { page, errors } = await openPrototype(port)
  try {
    await page.waitForFunction(() => document.getElementById('attribute-root')?.getAttribute('data-dd-element-stack'))
    const stack = await page.locator('#attribute-root').getAttribute('data-dd-element-stack')
    assert.ok(stack)
    await page.click('#attribute-click')
    await page.waitForFunction(() => window.prototypeEvents.some((event) => event.name === 'Attribute click'))
    const event = await page.evaluate(() => window.prototypeEvents.find((event) => event.name === 'Attribute click'))
    assert.equal(event.service, service)
    assert.equal(event.version, '1.0.0')
    assert.equal(event.elementStack, stack)
    assert.equal(event.handlingStack, undefined)
    assert.equal(await page.locator('#attribute-root output').textContent(), '1')
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
  }
}
test('Next.js SSR: DOM attribute attribution after hydration', () => verifyAttribute(3101, 'checkout-next'))
test('Nuxt SSR: DOM attribute attribution after hydration', () => verifyAttribute(3102, 'checkout-nuxt'))
test('Angular SSR: DOM attribute attribution after hydration', () => verifyAttribute(3103, 'checkout-angular'))
async function verifyWithoutJavaScript(port) {
  const page = await browser.newPage({ javaScriptEnabled: false })
  try {
    await page.goto(`http://127.0.0.1:${port}`)
    assert.equal(await page.locator('#api-click').isVisible(), true)
    assert.equal(await page.locator('#property-click').isVisible(), true)
    assert.equal(await page.locator('#attribute-click').isVisible(), true)
    assert.equal(await page.locator('[data-dd-element-stack]').count(), 0)
  } finally {
    await page.close()
  }
}
test('Next.js renders all examples without JavaScript', () => verifyWithoutJavaScript(3101))
test('Nuxt renders all examples without JavaScript', () => verifyWithoutJavaScript(3102))
test('Angular renders all examples without JavaScript', () => verifyWithoutJavaScript(3103))
