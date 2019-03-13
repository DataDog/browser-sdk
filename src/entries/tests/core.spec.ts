import { expect } from 'chai'
import * as sinon from 'sinon'

import '../core'

describe('core module', () => {
  it('should set Datadog global with init', () => {
    expect(!!window.Datadog).to.be.true
    expect(!!window.Datadog.init).to.be.true
  })

  it('init should log an error with no api key', () => {
    let errorCount = 0
    sinon.replace(console, 'error', () => (errorCount += 1))

    window.Datadog.init(undefined as any)
    expect(errorCount).to.eq(1)

    window.Datadog.init({ stillNoApiKey: true } as any)
    expect(errorCount).to.eq(2)

    window.Datadog.init({ apiKey: 'yeah' })
    expect(errorCount).to.eq(2)

    sinon.restore()
  })
})
