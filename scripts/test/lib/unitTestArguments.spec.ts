import assert from 'node:assert'
import { describe, it } from 'node:test'
import { buildVitestCommand } from './unitTestArguments.ts'

describe('buildVitestCommand', () => {
  it('preserves regular Vitest arguments', () => {
    assert.deepStrictEqual(buildVitestCommand(['--bail=1', '-t', 'my test']), {
      arguments: ['--bail=1', '-t', 'my test'],
      watch: false,
    })
  })

  it('translates repeated spec filters', () => {
    assert.deepStrictEqual(buildVitestCommand(['--spec', 'first.spec.ts', '--spec=second.spec.ts']), {
      arguments: ['first.spec.ts', 'second.spec.ts'],
      watch: false,
    })
  })

  it('translates the randomization seed', () => {
    assert.deepStrictEqual(buildVitestCommand(['--seed', '123', '--seed=456']), {
      arguments: ['--sequence.seed=123', '--sequence.seed=456'],
      watch: false,
    })
  })

  it('recognizes watch mode options', () => {
    assert.deepStrictEqual(buildVitestCommand(['--no-single-run']), { arguments: [], watch: true })
    assert.deepStrictEqual(buildVitestCommand(['--watch']), { arguments: [], watch: true })
  })

  it('rejects an option without a value', () => {
    assert.throws(() => buildVitestCommand(['--spec']), /Missing value for --spec/)
    assert.throws(() => buildVitestCommand(['--seed']), /Missing value for --seed/)
  })
})
