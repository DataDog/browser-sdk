import { test } from 'node:test'
import assert from 'node:assert'
import { parseCommandTemplateArguments } from './command.ts'

test('splits on white spaces', () => {
  assert.deepStrictEqual(parseCommandTemplateArguments`foo bar`, ['foo', 'bar'])
})

test('interpolates a variable as a separate argument when surrounded by spaces', () => {
  assert.deepStrictEqual(parseCommandTemplateArguments`foo ${'bar'} baz`, ['foo', 'bar', 'baz'])
})

test('appends a variable to the previous argument when no leading space', () => {
  assert.deepStrictEqual(parseCommandTemplateArguments`foo${'bar'} baz`, ['foobar', 'baz'])
})

test('prepends a variable to the next argument when no trailing space', () => {
  assert.deepStrictEqual(parseCommandTemplateArguments`foo ${'bar'}baz`, ['foo', 'barbaz'])
})

test('merges variable into surrounding argument when no spaces on either side', () => {
  assert.deepStrictEqual(parseCommandTemplateArguments`foo${'bar'}baz`, ['foobarbaz'])
})

test('does not split a variable value on white spaces', () => {
  assert.deepStrictEqual(parseCommandTemplateArguments`foo ${'bar baz'}`, ['foo', 'bar baz'])
})

test('spreads array variables as separate arguments', () => {
  assert.deepStrictEqual(parseCommandTemplateArguments`foo ${['bar', 'baz']}`, ['foo', 'bar', 'baz'])
})

test('keeps empty string as a distinct argument', () => {
  assert.deepStrictEqual(parseCommandTemplateArguments`foo ${''} bar`, ['foo', '', 'bar'])
})

test('ignores empty array, producing no extra arguments', () => {
  assert.deepStrictEqual(parseCommandTemplateArguments`foo ${[]} bar`, ['foo', 'bar'])
})

test('real-world: git commit with message', () => {
  const commitMessage = 'my commit message'
  assert.deepStrictEqual(parseCommandTemplateArguments`git commit -c ${commitMessage}`, [
    'git',
    'commit',
    '-c',
    'my commit message',
  ])
})
