import { expect } from 'chai'
import * as sinon from 'sinon'

describe('rum module', () => {
  it('init should log an error with no rum application id', () => {
    let errorCount = 0
    require('../rum')

    sinon.replace(console, 'error', () => (errorCount += 1))
    window.Datadog.init({ apiKey: 'yes' })
    expect(errorCount).to.eq(1)

    window.Datadog.init({ apiKey: 'yes', rumApplicationId: 'yes' })
    expect(errorCount).to.eq(1)

    sinon.restore()
  })
})
