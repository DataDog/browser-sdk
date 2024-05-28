import { createHandlingStack } from './handlingStack'

describe('createHandlingStack', () => {
  let handlingStack: string
  function internalCall() {
    handlingStack = createHandlingStack()
  }
  function userCallTwo() {
    internalCall()
  }
  function userCallOne() {
    userCallTwo()
  }

  it('should create handling stack trace without internal calls', () => {
    userCallOne()

    expect(handlingStack).toMatch('Error: \n {2}at userCallTwo @ (.*)\n {2}at userCallOne @ (.*)')
  })
})
