import path from 'node:path'

import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils'
import { RuleCreator } from '@typescript-eslint/utils/eslint-utils'

type MessageIds = 'importWithSideEffects' | 'nodeWithSideEffects'
type RuleContext = Readonly<TSESLint.RuleContext<MessageIds, readonly unknown[]>>

export default RuleCreator.withoutDocs({
  meta: {
    docs: {
      description:
        'Disallow potential side effects when evaluating modules, to ensure modules content are tree-shakable.',
    },
    schema: [],
    messages: {
      importWithSideEffects: 'This file cannot import modules with side-effects',
      nodeWithSideEffects:
        '{{nodeType}} can have side effects when the module is evaluated. Maybe move it in a function declaration?',
    },
    type: 'suggestion',
  },
  create(context) {
    const filename = context.filename
    if (pathsWithSideEffect.has(filename)) {
      return {}
    }
    return {
      Program(node) {
        reportPotentialSideEffect(context, node)
      },
    }
  },
})

const packagesRoot = path.resolve(import.meta.dirname, '..', 'packages')

// Those modules are known to have side effects when evaluated
const pathsWithSideEffect = new Set([
  `${packagesRoot}/browser-logs/src/entries/main.ts`,
  `${packagesRoot}/browser-rum/src/entries/main.ts`,
  `${packagesRoot}/browser-rum-slim/src/entries/main.ts`,
  `${packagesRoot}/browser-rum-slim/src/entries/salesforce.ts`,
  `${packagesRoot}/browser-debugger/src/entries/main.ts`,
])

// Those packages are known to have no side effects when evaluated
const packagesWithoutSideEffect = new Set([
  '@datadog/browser-core',
  '@datadog/browser-rum-core',
  '@datadog/browser-rum-react/internal',
  'react',
  'react-router-dom',
  'vue',
  'vue-router',
  '@angular/core',
  '@angular/router',
  'rxjs',
])

/**
 * Iterate over the given node and its children, and report any node that may have a side effect
 * when evaluated.
 *
 * @example
 * const foo = 1     // OK, this statement can't have any side effect
 * foo()             // KO, we don't know what 'foo' does, report this
 * function bar() {  // OK, a function declaration doesn't have side effects
 *    foo()          // OK, this statement won't be executed when evaluating the module code
 * }
 */
function reportPotentialSideEffect(context: RuleContext, node: TSESTree.Node) {
  // This acts like an authorized list of syntax nodes to use directly in the body of a module.  All
  // those nodes should not have a side effect when evaluated.
  //
  // This list is probably not complete, feel free to add more cases if you encounter an unhandled
  // node.
  switch (node.type) {
    case AST_NODE_TYPES.Program:
      node.body.forEach((child) => reportPotentialSideEffect(context, child))
      return
    case AST_NODE_TYPES.TemplateLiteral:
      node.expressions.forEach((child) => reportPotentialSideEffect(context, child))
      return
    case AST_NODE_TYPES.ExportNamedDeclaration:
    case AST_NODE_TYPES.ExportAllDeclaration:
    case AST_NODE_TYPES.ImportDeclaration: {
      if ('declaration' in node && node.declaration) {
        reportPotentialSideEffect(context, node.declaration)
      } else if (
        node.source &&
        (node.type !== AST_NODE_TYPES.ImportDeclaration || node.importKind !== 'type') &&
        typeof node.source.value === 'string' &&
        !isAllowedImport(context.filename, node.source.value)
      ) {
        context.report({
          node: node.source,
          messageId: 'importWithSideEffects',
        })
      }
      return
    }
    case AST_NODE_TYPES.VariableDeclaration:
      node.declarations.forEach((child) => reportPotentialSideEffect(context, child))
      return
    case AST_NODE_TYPES.VariableDeclarator:
      if (node.init) {
        reportPotentialSideEffect(context, node.init)
      }
      return
    case AST_NODE_TYPES.ArrayExpression:
      node.elements.forEach((child) => reportPotentialSideEffect(context, child!))
      return
    case AST_NODE_TYPES.UnaryExpression:
      reportPotentialSideEffect(context, node.argument)
      return
    case AST_NODE_TYPES.ObjectExpression:
      node.properties.forEach((child) => reportPotentialSideEffect(context, child))
      return
    case AST_NODE_TYPES.SpreadElement:
      reportPotentialSideEffect(context, node.argument)
      return
    case AST_NODE_TYPES.Property:
      reportPotentialSideEffect(context, node.key)
      reportPotentialSideEffect(context, node.value)
      return
    case AST_NODE_TYPES.BinaryExpression:
    case AST_NODE_TYPES.LogicalExpression:
      reportPotentialSideEffect(context, node.left)
      reportPotentialSideEffect(context, node.right)
      return
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.ExpressionStatement:
      reportPotentialSideEffect(context, node.expression)
      return
    case AST_NODE_TYPES.MemberExpression:
      reportPotentialSideEffect(context, node.object)
      reportPotentialSideEffect(context, node.property)
      return
    case AST_NODE_TYPES.ConditionalExpression:
    case AST_NODE_TYPES.FunctionExpression:
    case AST_NODE_TYPES.ArrowFunctionExpression:
    case AST_NODE_TYPES.FunctionDeclaration:
    case AST_NODE_TYPES.ClassDeclaration:
    case AST_NODE_TYPES.TSEnumDeclaration:
    case AST_NODE_TYPES.TSInterfaceDeclaration:
    case AST_NODE_TYPES.TSTypeAliasDeclaration:
    case AST_NODE_TYPES.TSModuleDeclaration:
    case AST_NODE_TYPES.TSDeclareFunction:
    case AST_NODE_TYPES.TSInstantiationExpression:
    case AST_NODE_TYPES.Literal:
    case AST_NODE_TYPES.Identifier:
      return
    case AST_NODE_TYPES.CallExpression:
      if (isAllowedCallExpression(node)) {
        return
      }
      break
    case AST_NODE_TYPES.NewExpression:
      if (isAllowedNewExpression(node)) {
        return
      }
      break
  }

  // If the node doesn't match any of the condition above, report it
  context.report({
    node,
    messageId: 'nodeWithSideEffects',
    data: { nodeType: node.type },
  })
}

/**
 * Make sure an 'import' statement does not pull a module or package with side effects.
 */
function isAllowedImport(basePath: string, source: string) {
  if (source.startsWith('.')) {
    const resolvedPath = `${path.resolve(path.dirname(basePath), source)}.ts`
    return !pathsWithSideEffect.has(resolvedPath)
  }
  return packagesWithoutSideEffect.has(source)
}

/**
 * Authorize some call expressions. Feel free to add more exceptions here. Good candidates would
 * be functions that are known to be ECMAScript functions without side effects, that are likely to
 * be considered as pure functions by the bundler.
 *
 * You can experiment with Rollup tree-shaking strategy to ensure your function is known to be pure.
 * https://rollupjs.org/repl/?version=2.38.5&shareable=JTdCJTIybW9kdWxlcyUyMiUzQSU1QiU3QiUyMm5hbWUlMjIlM0ElMjJtYWluLmpzJTIyJTJDJTIyY29kZSUyMiUzQSUyMiUyRiUyRiUyMFB1cmUlMjBmdW5jdGlvbnMlNUNubmV3JTIwV2Vha01hcCgpJTVDbk9iamVjdC5rZXlzKCklNUNuJTVDbiUyRiUyRiUyMFNpZGUlMjBlZmZlY3QlMjBmdW5jdGlvbnMlNUNuZm9vKCklMjAlMkYlMkYlMjB1bmtub3duJTIwZnVuY3Rpb25zJTIwYXJlJTIwY29uc2lkZXJlZCUyMHRvJTIwaGF2ZSUyMHNpZGUlMjBlZmZlY3RzJTVDbmFsZXJ0KCdhYWEnKSU1Q25uZXclMjBNdXRhdGlvbk9ic2VydmVyKCgpJTIwJTNEJTNFJTIwJTdCJTdEKSUyMiUyQyUyMmlzRW50cnklMjIlM0F0cnVlJTdEJTVEJTJDJTIyb3B0aW9ucyUyMiUzQSU3QiUyMmZvcm1hdCUyMiUzQSUyMmVzJTIyJTJDJTIybmFtZSUyMiUzQSUyMm15QnVuZGxlJTIyJTJDJTIyYW1kJTIyJTNBJTdCJTIyaWQlMjIlM0ElMjIlMjIlN0QlMkMlMjJnbG9iYWxzJTIyJTNBJTdCJTdEJTdEJTJDJTIyZXhhbXBsZSUyMiUzQW51bGwlN0Q=
 *
 * Webpack is not as smart as Rollup, and it usually treat all call expressions as impure, but it
 * could be fine to allow it nonetheless at it pulls very little code.
 */
function isAllowedCallExpression({ callee }: TSESTree.CallExpression) {
  // Allow "Object.keys()"
  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === 'Object' &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === 'keys'
  ) {
    return true
  }

  // Allow ".concat()"
  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === 'concat'
  ) {
    return true
  }

  return false
}

/**
 * Authorize some 'new' expressions. Feel free to add more exceptions here. Good candidates would
 * be functions that are known to be ECMAScript functions without side effects, that are likely to
 * be considered as pure functions by the bundler.
 *
 * You can experiment with Rollup tree-shaking strategy to ensure your function is known to be pure.
 * https://rollupjs.org/repl/?version=2.38.5&shareable=JTdCJTIybW9kdWxlcyUyMiUzQSU1QiU3QiUyMm5hbWUlMjIlM0ElMjJtYWluLmpzJTIyJTJDJTIyY29kZSUyMiUzQSUyMiUyRiUyRiUyMFB1cmUlMjBmdW5jdGlvbnMlNUNubmV3JTIwV2Vha01hcCgpJTVDbk9iamVjdC5rZXlzKCklNUNuJTVDbiUyRiUyRiUyMFNpZGUlMjBlZmZlY3QlMjBmdW5jdGlvbnMlNUNuZm9vKCklMjAlMkYlMkYlMjB1bmtub3duJTIwZnVuY3Rpb25zJTIwYXJlJTIwY29uc2lkZXJlZCUyMHRvJTIwaGF2ZSUyMHNpZGUlMjBlZmZlY3RzJTVDbmFsZXJ0KCdhYWEnKSU1Q25uZXclMjBNdXRhdGlvbk9ic2VydmVyKCgpJTIwJTNEJTNFJTIwJTdCJTdEKSUyMiUyQyUyMmlzRW50cnklMjIlM0F0cnVlJTdEJTVEJTJDJTIyb3B0aW9ucyUyMiUzQSU3QiUyMmZvcm1hdCUyMiUzQSUyMmVzJTIyJTJDJTIybmFtZSUyMiUzQSUyMm15QnVuZGxlJTIyJTJDJTIyYW1kJTIyJTNBJTdCJTIyaWQlMjIlM0ElMjIlMjIlN0QlMkMlMjJnbG9iYWxzJTIyJTNBJTdCJTdEJTdEJTJDJTIyZXhhbXBsZSUyMiUzQW51bGwlN0Q=
 *
 * Webpack is not as smart as Rollup, and it usually treat all 'new' expressions as impure, but it
 * could be fine to allow it nonetheless at it pulls very little code.
 */
function isAllowedNewExpression({ callee }: TSESTree.NewExpression) {
  if (callee.type !== AST_NODE_TYPES.Identifier) {
    return false
  }

  switch (callee.name) {
    // Allow some native constructors
    case 'RegExp':
    case 'WeakMap':
    case 'WeakSet':
    case 'Set':
    case 'Map':
      return true

    default:
      return false
  }
}
