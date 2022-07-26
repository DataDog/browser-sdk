const path = require('path')

module.exports = {
  meta: {
    docs: {
      description:
        'Disallow potential side effects when evaluating modules, to ensure modules content are tree-shakable.',
      recommended: false,
    },
    schema: [],
  },
  create(context) {
    const filename = context.getFilename()
    if (pathsWithSideEffect.has(filename)) {
      return {}
    }
    return {
      Program(node) {
        reportPotentialSideEffect(context, node)
      },
    }
  },
}

const packagesRoot = path.resolve(__dirname, '..', 'packages')

// Those modules are known to have side effects when evaluated
const pathsWithSideEffect = new Set([
  `${packagesRoot}/logs/src/entries/main.ts`,
  `${packagesRoot}/rum/src/entries/main.ts`,
  `${packagesRoot}/rum-slim/src/entries/main.ts`,
])

// Those packages are known to have no side effects when evaluated
const packagesWithoutSideEffect = new Set(['@datadog/browser-core', '@datadog/browser-rum-core'])

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
function reportPotentialSideEffect(context, node) {
  // This acts like an authorized list of syntax nodes to use directly in the body of a module.  All
  // those nodes should not have a side effect when evaluated.
  //
  // This list is probably not complete, feel free to add more cases if you encounter an unhandled
  // node.
  switch (node.type) {
    case 'Program':
      node.body.forEach((child) => reportPotentialSideEffect(context, child))
      return
    case 'TemplateLiteral':
      node.expressions.forEach((child) => reportPotentialSideEffect(context, child))
      return
    case 'ExportNamedDeclaration':
    case 'ExportAllDeclaration':
    case 'ImportDeclaration':
      if (node.declaration) {
        reportPotentialSideEffect(context, node.declaration)
      } else if (
        node.source &&
        node.importKind !== 'type' &&
        !isAllowedImport(context.getFilename(), node.source.value)
      ) {
        context.report({
          node: node.source,
          message: 'This file cannot import modules with side-effects',
        })
      }
      return
    case 'VariableDeclaration':
      node.declarations.forEach((child) => reportPotentialSideEffect(context, child))
      return
    case 'VariableDeclarator':
      if (node.init) {
        reportPotentialSideEffect(context, node.init)
      }
      return
    case 'ArrayExpression':
      node.elements.forEach((child) => reportPotentialSideEffect(context, child))
      return
    case 'UnaryExpression':
      reportPotentialSideEffect(context, node.argument)
      return
    case 'ObjectExpression':
      node.properties.forEach((child) => reportPotentialSideEffect(context, child))
      return
    case 'SpreadElement':
      reportPotentialSideEffect(context, node.argument)
      return
    case 'Property':
      reportPotentialSideEffect(context, node.key)
      reportPotentialSideEffect(context, node.value)
      return
    case 'BinaryExpression':
    case 'LogicalExpression':
      reportPotentialSideEffect(context, node.left)
      reportPotentialSideEffect(context, node.right)
      return
    case 'TSAsExpression':
    case 'ExpressionStatement':
      reportPotentialSideEffect(context, node.expression)
      return
    case 'MemberExpression':
      reportPotentialSideEffect(context, node.object)
      reportPotentialSideEffect(context, node.property)
      return
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
    case 'FunctionDeclaration':
    case 'ClassDeclaration':
    case 'TSEnumDeclaration':
    case 'TSInterfaceDeclaration':
    case 'TSTypeAliasDeclaration':
    case 'TSModuleDeclaration':
    case 'TSDeclareFunction':
    case 'Literal':
    case 'Identifier':
      return
    case 'CallExpression':
      if (isAllowedCallExpression(node)) {
        return
      }
      break
    case 'NewExpression':
      if (isAllowedNewExpression(node)) {
        return
      }
      break
  }

  // If the node doesn't match any of the condition above, report it
  context.report({
    node,
    message: `${node.type} can have side effects when the module is evaluated. \
Maybe move it in a function declaration?`,
  })
}

/**
 * Make sure an 'import' statement does not pull a module or package with side effects.
 */
function isAllowedImport(basePath, source) {
  if (source.startsWith('.')) {
    const resolvedPath = `${path.resolve(path.dirname(basePath), source)}.ts`
    return !pathsWithSideEffect.has(resolvedPath)
  }
  return packagesWithoutSideEffect.has(source)
}

/* eslint-disable max-len */
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
/* eslint-enable max-len */
function isAllowedCallExpression({ callee }) {
  // Allow "Object.keys()"
  if (callee.type === 'MemberExpression' && callee.object.name === 'Object' && callee.property.name === 'keys') {
    return true
  }

  // Allow ".concat()"
  if (callee.type === 'MemberExpression' && callee.property.name === 'concat') {
    return true
  }

  return false
}

/* eslint-disable max-len */
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
/* eslint-enable max-len */
function isAllowedNewExpression({ callee }) {
  switch (callee.name) {
    case 'WeakMap': // Allow "new WeakMap()"
    case 'RegExp': // Allow "new RegExp()"
      return true

    default:
      return false
  }
}
