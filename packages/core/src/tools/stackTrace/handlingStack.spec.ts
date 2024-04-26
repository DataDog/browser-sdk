import { createHandlingStack } from './handlingStack'

describe('createHandlingStack', () => {
  let handlingStack: string
  function internalCall() {
    handlingStack = createHandlingStack(2)
  }
  function userCallTwo() {
    internalCall()
  }
  function userCallOne() {
    userCallTwo()
  }

  it('should create handling stack trace without internal calls', () => {
    userCallOne()

    expect(handlingStack).toMatch(/^Error: \n\s+at userCallTwo @ (.*)\n\s+at userCallOne @ (.*)/)
  })
})
