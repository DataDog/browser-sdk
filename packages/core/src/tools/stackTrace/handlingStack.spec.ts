import { createHandlingStack } from './handlingStack'

describe('createHandlingStack', () => {
  let handlingStack: string
  function internalCall() {
    handlingStack = createHandlingStack('error')
  }
  function userCallTwo() {
    internalCall()
  }
  function userCallOne() {
    userCallTwo()
  }

  it('should create handling stack trace without internal calls', () => {
    userCallOne()

    expect(handlingStack).toMatch(/^HandlingStack: Received error\n\s+at userCallTwo @ (.*)\n\s+at userCallOne @ (.*)/)
  })
})
