const PROBLEMATIC_IDENTIFIERS = {
  // Using the patched `MutationObserver` from Zone.js triggers an infinite callback loop on some
  // occasion, see PRs #376 #866 #1530
  MutationObserver: 'Use `getMutationObserverConstructor` from @datadog/browser-rum-core instead',

  // Using the patched `setTimeout` from Zone.js triggers a rendering loop in some Angular
  // component, see issue PR #2030
  setTimeout: 'Use `setTimeout` from @datadog/browser-core instead',
  clearTimeout: 'Use `clearTimeout` from @datadog/browser-core instead',

  // TODO: disallow addEventListener, removeEventListener
}

module.exports = {
  meta: {
    docs: {
      description: 'Disallow problematic ZoneJs patched values.',
      recommended: false,
    },
    schema: [],
  },
  create(context) {
    const parserServices = context.parserServices
    const checker = parserServices.program.getTypeChecker()

    return {
      Identifier(node) {
        if (
          Object.hasOwn(PROBLEMATIC_IDENTIFIERS, node.name) &&
          // Using those identifiers inside type definition is not problematic
          !isInTypeDefinition(node)
        ) {
          const originalNode = parserServices.esTreeNodeToTSNodeMap.get(node)
          const symbol = checker.getSymbolAtLocation(originalNode)
          if (symbol && isDeclaredInTsDomLib(symbol.declarations[0])) {
            context.report(node, `This value might be patched by Zone.js. ${PROBLEMATIC_IDENTIFIERS[node.name]}`)
          }
        }
      },
    }
  },
}

/**
 * Wether the declaration is inside the TypeScript DOM declaration file (i.e. lib.dom.d.ts),
 * indicating that it's a "native" browser API and not a function that we declare ourselves.
 */
function isDeclaredInTsDomLib(declaration) {
  if (declaration.parent) {
    return isDeclaredInTsDomLib(declaration.parent)
  }
  return declaration.isDeclarationFile && declaration.path.endsWith('/lib.dom.d.ts')
}

/**
 * Whether the symbol is a concrete value and not a type
 */

function isInTypeDefinition(node) {
  let types = new Set()
  while (node) {
    types.add(node.type)
    if (isTypeDefinition(node)) {
      return true
    }
    node = node.parent
  }
  return false
}

const typeDefinitionNodeTypes = new Set(['TSAsExpression', 'TSTypeAliasDeclaration', 'TSInterfaceDeclaration'])
function isTypeDefinition(node) {
  return typeDefinitionNodeTypes.has(node.type)
}
