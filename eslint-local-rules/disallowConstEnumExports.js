const { SymbolFlags } = require('typescript')

/**
 * This rule forbids exporting 'const enums'.
 *
 * 'const enums' are useful in TS to optimize the generated code, but they don't produce any JS code
 * on their own[0].  So, exporting them in public packages entry points should be avoided, because
 * we don't know how public packages are used: it could be used by other builders like babel which
 * don't have access to the type definition, so won't be able to access the enum value.
 *
 * Exporting 'const enums' from internal modules to be consumed by internal modules is fine, because
 * we know that everything will be handled by TypeScript.
 *
 * So, this rule should not be applied on all the source code, but only on entry points that will be
 * used in the wild.
 *
 * In the future, this rule could be removed and the 'isolatedModules' TS option[1] could be used
 * instead. This way, TS output 'const enum' the same way it does for standard 'enum'. But this
 * option adds a few more requirements, like exporting type with `export type` statements, which is
 * not possible before TS 3.8[2]. Since we support all TS 3.x versions, it is not currently possible
 * to enable this option.
 *
 * [0]: https://github.com/microsoft/TypeScript/issues/16671
 * [1]: https://www.typescriptlang.org/tsconfig#isolatedModules
 * [2]: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export
 */
module.exports = {
  meta: {
    docs: {
      description: 'Disallow export of const enums.',
      recommended: false,
    },
    schema: [],
  },
  create(context) {
    const parserServices = context.parserServices
    const checker = parserServices.program.getTypeChecker()

    return {
      ExportNamedDeclaration(node) {
        for (const specifier of node.specifiers) {
          const originalNode = parserServices.esTreeNodeToTSNodeMap.get(specifier)
          const type = checker.getTypeAtLocation(originalNode)
          if (type.symbol && isConstEnum(type.symbol)) {
            context.report(specifier, 'Cannot export const enum')
          }
        }
      },
      ExportAllDeclaration(node) {
        const originalNode = parserServices.esTreeNodeToTSNodeMap.get(node)
        const moduleSymbol = checker.getSymbolAtLocation(originalNode.moduleSpecifier)
        const moduleExports = checker.getExportsOfModule(moduleSymbol)

        for (const symbol of moduleExports) {
          if (isConstEnum(symbol)) {
            context.report(node, `Cannot export const enum ${symbol.getName()}`)
          }
        }
      },
    }
  },
}

function isConstEnum(symbol) {
  // eslint-disable-next-line no-bitwise
  return symbol.getFlags() & SymbolFlags.ConstEnum
}
