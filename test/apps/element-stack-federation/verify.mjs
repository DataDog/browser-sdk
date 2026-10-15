import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { chromium } from '@playwright/test'

let browser
before(async () => {
  browser = await chromium.launch()
})
after(async () => {
  await browser?.close()
})

async function openShell() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
  page.setDefaultTimeout(15000)
  const errors = []
  const loaded = []
  page.on('console', (message) => {
    if (message.type() === 'error' || /hydration.*mismatch|NG05/i.test(message.text())) errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('response', (response) => {
    if (response.url().endsWith('/remoteEntry.js') && response.ok()) loaded.push(response.url())
  })
  await page.goto('http://127.0.0.1:3110')
  await page.waitForFunction(() =>
    ['react', 'vue', 'angular'].every(
      (name) => typeof document.getElementById(`${name}-property-root`)?.dd_element_stack === 'string'
    )
  )
  assert.equal(loaded.length, 3, 'Three real remote containers must load')
  assert.equal(await page.locator('iframe').count(), 0)
  return { page, errors }
}

async function clickAndRead(page, id) {
  const name = (await page.locator(`#${id}`).textContent()).trim()
  const previous = await page.evaluate(
    (name) => window.prototypeEvents.filter((event) => event.name === name).length,
    name
  )
  await page.click(`#${id}`)
  await page.waitForFunction(
    ({ name, previous }) => window.prototypeEvents.filter((event) => event.name === name).length > previous,
    { name, previous }
  )
  return page.evaluate((name) => window.prototypeEvents.filter((event) => event.name === name).at(-1), name)
}

async function verifyApi(framework, service, version, port) {
  const { page, errors } = await openShell()
  try {
    assert.equal(
      await page.locator(`#${framework}-api-root`).evaluate((element) => 'dd_element_stack' in element),
      false
    )
    const event = await clickAndRead(page, `${framework}-api-click`)
    assert.equal(event.service, service)
    assert.equal(event.version, version)
    assert.equal(event.handlingStack, undefined)
    assert.match(event.elementStack.split('\n')[1], new RegExp(`127\\.0\\.0\\.1:${port}/`))
    assert.equal(await page.locator(`#${framework}-api-root output`).textContent(), '1')
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
  }
}

async function verifyProperty(framework, service, version, port) {
  const { page, errors } = await openShell()
  try {
    const stack = await page.locator(`#${framework}-property-root`).evaluate((element) => element.dd_element_stack)
    const event = await clickAndRead(page, `${framework}-property-click`)
    assert.equal(event.service, service)
    assert.equal(event.version, version)
    assert.equal(event.elementStack, stack)
    assert.equal(event.handlingStack, undefined)
    assert.match(stack.split('\n')[1], new RegExp(`127\\.0\\.0\\.1:${port}/`))
    assert.equal(await page.locator(`#${framework}-property-root`).getAttribute('dd_element_stack'), null)
    assert.equal(await page.locator(`#${framework}-property-root output`).textContent(), '1')
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
  }
}

async function verifyRemount(framework, service) {
  const { page, errors } = await openShell()
  try {
    await page.click(`#${framework}-toggle`)
    assert.equal(await page.locator(`#${framework}-api-root`).count(), 0)
    await page.click(`#${framework}-toggle`)
    await page.waitForFunction(
      (framework) => document.getElementById(`${framework}-property-root`)?.dd_element_stack,
      framework
    )
    const event = await clickAndRead(page, `${framework}-api-click`)
    assert.equal(event.service, service)
    assert.equal(await page.locator(`#${framework}-api-root output`).textContent(), '1')
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
  }
}

test('React remote: API attribution', () => verifyApi('react', 'checkout-react', '1.1.0', 3111))
test('React remote: custom property attribution', () => verifyProperty('react', 'checkout-react', '1.1.0', 3111))
test('Vue remote: API attribution', () => verifyApi('vue', 'catalog-vue', '2.2.0', 3112))
test('Vue remote: custom property attribution', () => verifyProperty('vue', 'catalog-vue', '2.2.0', 3112))
test('Angular remote: API attribution', () => verifyApi('angular', 'account-angular', '3.3.0', 3113))
test('Angular remote: custom property attribution', () => verifyProperty('angular', 'account-angular', '3.3.0', 3113))
test('React remote can unmount and remount', () => verifyRemount('react', 'checkout-react'))
test('Vue remote can unmount and remount', () => verifyRemount('vue', 'catalog-vue'))
test('Angular remote can unmount and remount', () => verifyRemount('angular', 'account-angular'))
test('Shell click has no element stack', async () => {
  const { page, errors } = await openShell()
  try {
    const event = await clickAndRead(page, 'shell-click')
    assert.equal(event.service, 'mfe-shell')
    assert.equal(event.version, '0.1.0')
    assert.equal(event.elementStack, undefined)
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
  }
})
test('Attribution stays isolated when switching between frameworks', async () => {
  const { page, errors } = await openShell()
  try {
    assert.equal((await clickAndRead(page, 'angular-property-click')).service, 'account-angular')
    assert.equal((await clickAndRead(page, 'react-api-click')).service, 'checkout-react')
    assert.equal((await clickAndRead(page, 'vue-property-click')).service, 'catalog-vue')
    assert.equal((await clickAndRead(page, 'shell-click')).service, 'mfe-shell')
    assert.deepEqual(errors, [])
    await page.screenshot({ path: '/tmp/mfe-federation.png', fullPage: true })
  } finally {
    await page.close()
  }
})

async function verifyAttribute(framework, service, version, port) {
  const { page, errors } = await openShell()
  try {
    await page.waitForFunction(
      (framework) => document.getElementById(`${framework}-attribute-root`)?.getAttribute('data-dd-element-stack'),
      framework
    )
    const stack = await page.locator(`#${framework}-attribute-root`).getAttribute('data-dd-element-stack')
    assert.match(stack, /Error/)
    const event = await clickAndRead(page, `${framework}-attribute-click`)
    assert.equal(event.service, service)
    assert.equal(event.version, version)
    assert.equal(event.elementStack, stack)
    assert.match(stack.split('\n')[1], new RegExp(`127\\.0\\.0\\.1:${port}/`))
    assert.equal(await page.locator(`#${framework}-attribute-root output`).textContent(), '1')
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
  }
}
test('React remote: DOM attribute attribution', () => verifyAttribute('react', 'checkout-react', '1.1.0', 3111))
test('Vue remote: DOM attribute attribution', () => verifyAttribute('vue', 'catalog-vue', '2.2.0', 3112))
test('Angular remote: DOM attribute attribution', () => verifyAttribute('angular', 'account-angular', '3.3.0', 3113))
test('The shell serves empty remote containers for client rendering', async () => {
  const html = await (await fetch('http://127.0.0.1:3110')).text()
  assert.match(html, /<div id="react-container"><\/div>/)
  assert.match(html, /<div id="vue-container"><\/div>/)
  assert.match(html, /<div id="angular-container"><\/div>/)
  assert.doesNotMatch(html, /ngh=|<!--nghm-->|id="react-api-root"/)
})
