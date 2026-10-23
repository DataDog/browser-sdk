import { describe, it } from 'node:test'
import assert from 'node:assert'
import { transformJasmineToVitest } from './jasmineToVitest.ts'

function transform(source: string) {
  return transformJasmineToVitest(source, 'foo.spec.ts')
}

function assertTransform(source: string, expected: string) {
  const { code, unsupported } = transform(source)
  assert.strictEqual(code, expected)
  assert.deepStrictEqual(unsupported, [])
}

function assertUnsupported(source: string, reason: RegExp) {
  const { code, unsupported } = transform(source)
  assert.strictEqual(unsupported.length, 1, `expected one unsupported construct, got ${JSON.stringify(unsupported)}`)
  assert.match(unsupported[0].reason, reason)
  return code
}

describe('transformJasmineToVitest', () => {
  describe('imports', () => {
    it('imports the test functions used by the file', () => {
      assertTransform(
        "describe('a', () => {\n  beforeEach(() => {})\n  it('b', () => {\n    expect(1).toBe(1)\n  })\n})\n",
        "import { beforeEach, describe, expect, it } from 'vitest'\ndescribe('a', () => {\n  beforeEach(() => {})\n  it('b', () => {\n    expect(1).toBe(1)\n  })\n})\n"
      )
    })

    it('inserts the import after leading comments', () => {
      assertTransform(
        "// comment\nimport { foo } from './foo'\n\nit('a', () => {})\n",
        "// comment\nimport { it } from 'vitest'\nimport { foo } from './foo'\n\nit('a', () => {})\n"
      )
    })

    it('merges with an existing vitest import', () => {
      assertTransform(
        "import { vi } from 'vitest'\nit('a', () => vi.fn())\n",
        "import { it, vi } from 'vitest'\nit('a', () => vi.fn())\n"
      )
    })

    it('imports types separately', () => {
      assertTransform(
        'let spy: jasmine.Spy<() => void>\n',
        "import type { Mock } from 'vitest'\nlet spy: Mock<() => void>\n"
      )
    })

    it('ignores locally declared names', () => {
      assertTransform('function expect() {}\nexpect()\n', 'function expect() {}\nexpect()\n')
    })
  })

  describe('focus and skip', () => {
    it('converts fdescribe, fit, xdescribe and xit', () => {
      assertTransform(
        "fdescribe('a', () => {\n  fit('b', () => {})\n  xit('c', () => {})\n})\nxdescribe('d', () => {})\n",
        "import { describe, it } from 'vitest'\ndescribe.only('a', () => {\n  it.only('b', () => {})\n  it.skip('c', () => {})\n})\ndescribe.skip('d', () => {})\n"
      )
    })
  })

  describe('spies', () => {
    it('converts jasmine.createSpy', () => {
      assertTransform("const spy = jasmine.createSpy('name')\n", "import { vi } from 'vitest'\nconst spy = vi.fn()\n")
    })

    it('keeps createSpy type arguments', () => {
      assertTransform(
        "const spy = jasmine.createSpy<() => void>('name', foo)\n",
        "import { vi } from 'vitest'\nconst spy = vi.fn<() => void>()\n"
      )
    })

    it('stubs a bare spyOn, like Jasmine does', () => {
      assertTransform(
        "spyOn(console, 'log')\n",
        "import { vi } from 'vitest'\nvi.spyOn(console, 'log').mockReturnValue(undefined as never)\n"
      )
    })

    it('removes callThrough on spyOn, as Vitest spies call through by default', () => {
      assertTransform(
        "spyOn(console, 'log').and.callThrough()\n",
        "import { vi } from 'vitest'\nvi.spyOn(console, 'log')\n"
      )
    })

    it('converts spyOnProperty', () => {
      assertTransform(
        "spyOnProperty(document, 'cookie', 'get').and.returnValue('a')\nspyOnProperty(document, 'title')\nspyOnProperty(document, 'title', 'set')\n",
        "import { vi } from 'vitest'\nvi.spyOn(document, 'cookie', 'get').mockReturnValue('a')\nvi.spyOn(document, 'title', 'get').mockReturnValue(undefined as never)\nvi.spyOn(document, 'title', 'set').mockImplementation(() => {})\n"
      )
    })

    it('converts jasmine.isSpy', () => {
      assertTransform('jasmine.isSpy(foo)\n', "import { vi } from 'vitest'\nvi.isMockFunction(foo)\n")
    })
  })

  describe('spy strategies', () => {
    it('converts returnValue, callFake, resolveTo and rejectWith', () => {
      assertTransform(
        'spy.and.returnValue(1)\nspy.and.callFake(() => 2)\nspy.and.resolveTo(3)\nspy.and.rejectWith(4)\n',
        'spy.mockReturnValue(1)\nspy.mockImplementation(() => 2)\nspy.mockResolvedValue(3)\nspy.mockRejectedValue(4)\n'
      )
    })

    it('converts the strategy of a spyOn call', () => {
      assertTransform(
        "spyOn(window, 'fetch').and.returnValue(promise)\n",
        "import { vi } from 'vitest'\nvi.spyOn(window, 'fetch').mockReturnValue(promise)\n"
      )
    })

    it('converts the strategy arguments', () => {
      assertTransform(
        'spy.and.returnValue(jasmine.createSpy())\n',
        "import { vi } from 'vitest'\nspy.mockReturnValue(vi.fn())\n"
      )
    })

    it('converts returnValues', () => {
      assertTransform('spy.and.returnValues(1, 2)\n', 'spy.mockReturnValueOnce(1).mockReturnValueOnce(2)\n')
    })

    it('converts throwError with a message or an error', () => {
      assertTransform(
        "spy.and.throwError('oops')\nspy.and.throwError(new TypeError('oops'))\n",
        "spy.mockImplementation(() => {\n  throw new Error('oops')\n})\nspy.mockImplementation(() => {\n  throw new TypeError('oops')\n})\n"
      )
    })

    it('reports throwError with a value of unknown type', () => {
      assertUnsupported('spy.and.throwError(error)\n', /throwError/)
    })
  })

  describe('spy calls', () => {
    it('converts calls methods', () => {
      assertTransform(
        'spy.calls.count()\nspy.calls.argsFor(1)\nspy.calls.allArgs()\nspy.calls.reset()\nspy.calls.mostRecent().args\nspy.calls.first().args\n',
        'spy.mock.calls.length\nspy.mock.calls[1]\nspy.mock.calls\nspy.mockClear()\nspy.mock.lastCall!\nspy.mock.calls[0]\n'
      )
    })

    it('keeps indexing into the arguments', () => {
      assertTransform('const [a] = spy.calls.mostRecent().args[0]\n', 'const [a] = spy.mock.lastCall![0]\n')
    })

    it('keeps optional chaining when the spy may not have been called', () => {
      assertTransform(
        'spy.calls.mostRecent()?.args[0]\nspy.calls.mostRecent()?.args\n',
        'spy.mock.lastCall?.[0]\nspy.mock.lastCall\n'
      )
    })

    it('reports unsupported calls methods', () => {
      assertUnsupported('spy.calls.all()\n', /calls\.all/)
      assertUnsupported('spy.calls.mostRecent().returnValue\n', /calls\.mostRecent/)
    })

    it('ignores other `calls` properties', () => {
      assertTransform('spy.mock.calls.length\nfoo.calls.map(bar)\n', 'spy.mock.calls.length\nfoo.calls.map(bar)\n')
    })
  })

  describe('matchers', () => {
    it('renames matchers', () => {
      assertTransform(
        'expect(spy).toHaveBeenCalledOnceWith(1)\nexpect(list).not.toHaveSize(2)\n',
        "import { expect } from 'vitest'\nexpect(spy).toHaveBeenCalledExactlyOnceWith(1)\nexpect(list).not.toHaveLength(2)\n"
      )
    })

    it('converts toBeTrue and toBeFalse', () => {
      assertTransform(
        'expect(a).toBeTrue()\nexpect(b).not.toBeFalse()\n',
        "import { expect } from 'vitest'\nexpect(a).toBe(true)\nexpect(b).not.toBe(false)\n"
      )
    })

    it('converts withContext', () => {
      assertTransform(
        "expect(a).withContext('message').toBeTrue()\n",
        "import { expect } from 'vitest'\nexpect(a, 'message').toBe(true)\n"
      )
    })

    it('converts asymmetric matchers', () => {
      assertTransform(
        "expect(a).toEqual({ b: jasmine.any(Number), c: jasmine.objectContaining({ d: jasmine.anything() }), e: jasmine.stringMatching('f') })\n",
        "import { expect } from 'vitest'\nexpect(a).toEqual({ b: expect.any(Number), c: expect.objectContaining({ d: expect.anything() }), e: expect.stringMatching('f') })\n"
      )
    })

    it('converts async matchers', () => {
      assertTransform(
        "await expectAsync(promise).toBeResolvedTo(1)\nawait expectAsync(promise).toBeRejectedWithError('oops')\n",
        "import { expect } from 'vitest'\nawait expect(promise).resolves.toEqual(1)\nawait expect(promise).rejects.toThrow('oops')\n"
      )
    })

    it('reports matchers without equivalent', () => {
      assertUnsupported('expect(a).toHaveBeenCalledBefore(b)\n', /toHaveBeenCalledBefore/)
    })
  })

  describe('test helpers', () => {
    it('converts done callbacks', () => {
      assertTransform(
        "it('a', (done) => {\n  setTimeout(done)\n})\n",
        "import { it } from 'vitest'\nit('a', () => {\nreturn new Promise<void>((done) => {\n  setTimeout(done)\n})\n})\n"
      )
    })

    it('converts done.fail', () => {
      assertTransform(
        'beforeEach((done) => {\n  promise.then(done, done.fail)\n})\n',
        "import { beforeEach } from 'vitest'\nbeforeEach(() => {\nreturn new Promise<void>((done, reject) => {\n  promise.then(done, reject)\n})\n})\n"
      )
    })

    it('converts done callbacks with an expression body', () => {
      assertTransform(
        "it('a', (done) => promise.then(done))\n",
        "import { it } from 'vitest'\nit('a', () => new Promise<void>((done) => {\npromise.then(done)\n}))\n"
      )
    })

    it('ignores other callback parameters', () => {
      assertTransform("it('a', (ctx) => {})\n", "import { it } from 'vitest'\nit('a', (ctx) => {})\n")
    })

    it('converts pending in a test callback', () => {
      assertTransform(
        "it('a', () => {\n  if (!supported) {\n    pending('not supported')\n  }\n})\n",
        "import { it } from 'vitest'\nit('a', (ctx) => {\n  if (!supported) {\n    ctx.skip('not supported')\n  }\n})\n"
      )
    })

    it('reports pending outside of a test callback', () => {
      assertUnsupported("function skipIfUnsupported() {\n  pending('not supported')\n}\n", /pending/)
    })

    it('converts fail', () => {
      assertTransform("fail('oops')\n", "import { expect } from 'vitest'\nexpect.unreachable('oops')\n")
    })
  })

  describe('types', () => {
    it('converts spy types', () => {
      assertTransform(
        'let a: jasmine.Spy\nlet b: jasmine.SpyObj<Foo>\nlet c: jasmine.Func\n',
        "import type { Mock, Mocked } from 'vitest'\nlet a: Mock\nlet b: Mocked<Foo>\nlet c: (...args: any[]) => any\n"
      )
    })

    it('reports unsupported types', () => {
      assertUnsupported('let calls: jasmine.Calls<Foo>\n', /jasmine\.Calls/)
    })
  })

  it('reports custom asymmetric matchers', () => {
    assertUnsupported('const whatever = { asymmetricMatch: () => true }\n', /asymmetric matcher/)
  })

  it('reports unsupported jasmine APIs', () => {
    assertUnsupported('jasmine.clock().install()\n', /jasmine\.clock/)
  })
})
