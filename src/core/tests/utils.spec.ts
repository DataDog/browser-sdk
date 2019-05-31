import { expect, use } from 'chai'
import * as sinon from 'sinon'
import sinonChai from 'sinon-chai'

import { cache, noop, round, throttle, toSnakeCase, withSnakeCaseKeys } from '../utils'

use(sinonChai)
let clock: sinon.SinonFakeTimers

describe('utils', () => {
  it('should throttle only once by given period', () => {
    clock = sinon.useFakeTimers(123456)
    const spy = sinon.spy(noop)

    const throttled = throttle(spy, 1)

    throttled()
    expect(spy.callCount).to.equal(1)

    throttled()
    throttled()
    expect(spy.callCount).to.equal(1)

    clock.tick(1)
    throttled()
    throttled()
    expect(spy.callCount).to.equal(2)

    clock.restore()
  })

  it('should cache function result for a given duration', () => {
    clock = sinon.useFakeTimers(123456)
    let result: number | undefined = 1
    const spy = sinon.spy(() => result)

    const cached = cache(spy, 1)

    expect(cached()).to.equal(result)
    expect(spy.callCount).to.equal(1)

    expect(cached()).to.equal(result)
    expect(cached()).to.equal(result)
    expect(spy.callCount).to.equal(1)

    clock.tick(1)
    result = undefined
    expect(cached()).to.equal(result)
    expect(cached()).to.equal(result)
    expect(spy.callCount).to.equal(2)

    clock.restore()
  })

  it('should round', () => {
    expect(round(10.12591, 0)).eq(10)
    expect(round(10.12591, 1)).eq(10.1)
    expect(round(10.12591, 2)).eq(10.13)
    expect(round(10.12591, 3)).eq(10.126)
  })

  it('should format a string to snake case', () => {
    expect(toSnakeCase('camelCaseWord')).eq('camel_case_word')
    expect(toSnakeCase('PascalCase')).eq('pascal_case')
    expect(toSnakeCase('kebab-case')).eq('kebab_case')
  })

  it('should format object keys in snake case', () => {
    expect(
      withSnakeCaseKeys({
        camelCase: 1,
        nestedKey: { 'kebab-case': 'helloWorld', array: [{ camelCase: 1 }, { camelCase: 2 }] },
      })
    ).to.deep.equal({
      camel_case: 1,
      nested_key: { kebab_case: 'helloWorld', array: [{ camel_case: 1 }, { camel_case: 2 }] },
    })
  })
})
