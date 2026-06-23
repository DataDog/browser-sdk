import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils'
import { RuleCreator } from '@typescript-eslint/utils/eslint-utils'

const PROBLEMATIC_IDENTIFIERS = {
  // Using the patched `MutationObserver` from Zone.js triggers an infinite callback loop on some
  // occasion, see PRs #376 #866 #1530
  MutationObserver: 'Use `getMutationObserverConstructor` from @openobserve/browser-rum-core instead',

  // Using the patched `setTimeout` from Zone.js triggers a rendering loop in some Angular
  // component, see issue PR #2030
  setTimeout: 'Use `setTimeout` from @openobserve/browser-core instead',
  clearTimeout: 'Use `clearTimeout` from @openobserve/browser-core instead',

  // We didn't stumble on cases where using the patched `setInterval` from Zone.js is problematic
  // yet, but still consider it problematic in prevention and to unify its usages with `setTimeout`.
  setInterval: 'Use `setInterval` from @openobserve/browser-core instead',
  clearInterval: 'Use `clearInterval` from @openobserve/browser-core instead',

  // Using the patched `addEventListener` from Zone.js might trigger a memory leak in Firefox, see
  // PR #1860
  addEventListener: 'Use `addEventListener` from @openobserve/browser-core instead',
  removeEventListener: 'Use `addEventListener().stop` from @openobserve/browser-core instead',

  // Using the patched `fetch` from Zone.js triggers unnecessary Angular change detection cycles,
  // see PR #4117.
  fetch: 'Use `fetch` from @openobserve/browser-core instead',
} as const

type ProblematicIdentifier = keyof typeof PROBLEMATIC_IDENTIFIERS

export default RuleCreator.withoutDocs({
  meta: {
    docs: {
      description: 'Disallow problematic ZoneJs patched values.',
    },
    schema: [],
    messages: {
      patchedValue: 'This value might be patched by Zone.js. {{replacement}}',
    },
    type: 'suggestion',
  },
  create(context) {
    const parserServices = context.sourceCode.parserServices!
    const checker = parserServices.program!.getTypeChecker()

    return {
      Identifier(node) {
        if (
          isProblematicIdentifier(node.name) &&
          // Using those identifiers inside type definition is not problematic
          !isInTypeDefinition(node)
        ) {
          const originalNode = parserServices.esTreeNodeToTSNodeMap!.get(node)
          const symbol = checker.getSymbolAtLocation(originalNode)
          if (symbol && isNativeValue(symbol.declarations![0] as unknown as DeclarationLike)) {
            context.report({
              node,
              messageId: 'patchedValue',
              data: { replacement: PROBLEMATIC_IDENTIFIERS[node.name] },
            })
          }
        }
      },
    }
  },
})

interface DeclarationLike {
  parent?: DeclarationLike
  path: string
}

function isProblematicIdentifier(name: string): name is ProblematicIdentifier {
  return Object.hasOwn(PROBLEMATIC_IDENTIFIERS, name)
}

/**
 * Wether the declaration is inside the TypeScript DOM declaration file (i.e. lib.dom.d.ts) or in a
 * 'globalObject.ts' file, indicating that it's a "native" browser API and not a function that we
 * declare ourselves.
 */
function isNativeValue(declaration: DeclarationLike) {
  if (declaration.parent) {
    return isNativeValue(declaration.parent)
  }
  // in macOs, path is lowercased
  const path = declaration.path.toLowerCase()
  return path.endsWith('/lib.dom.d.ts') || path.endsWith('/globalobject.ts')
}

/**
 * Whether the symbol is a concrete value and not a type
 */

function isInTypeDefinition(node: TSESTree.Node | undefined) {
  const types = new Set()
  while (node) {
    types.add(node.type)
    if (isTypeDefinition(node)) {
      return true
    }
    node = node.parent
  }
  return false
}

const typeDefinitionNodeTypes = new Set([
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSTypeAliasDeclaration,
  AST_NODE_TYPES.TSInterfaceDeclaration,
])
function isTypeDefinition(node: TSESTree.Node) {
  return typeDefinitionNodeTypes.has(node.type)
}
