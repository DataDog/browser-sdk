const { SymbolFlags } = require('typescript')

/**
 * This rule forbids exporting 'enums'.  It serves two purposes:
 *
 * # enums
 *
 * This SDK is used in a variety of ways. It can be used in JS, in TS, but also a mix between the
 * two, for example when including the bundle via the CDN and using it in a JS or TS app. We want to
 * give the user flexibility on how to specify constant options, to let them chose between hardcoded
 * strings or importing some constant. To allow this, we can't use enums publicly because it is not
 * flexible enough.
 *
 * # const enums
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
      description: 'Disallow export of enums.',
      recommended: false,
    },
    schema: [],
  },
  create(context) {
    const parserServices = context.sourceCode.parserServices;
    const checker = parserServices.program.getTypeChecker()

    return {
      ExportNamedDeclaration(node) {
        for (const specifier of node.specifiers) {
          const originalNode = parserServices.esTreeNodeToTSNodeMap.get(specifier)
          const type = checker.getTypeAtLocation(originalNode)
          if (type.symbol && isEnum(type.symbol)) {
            context.report(specifier, 'Cannot export enum')
          }
        }
      },
      ExportAllDeclaration(node) {
        const originalNode = parserServices.esTreeNodeToTSNodeMap.get(node)
        const moduleSymbol = checker.getSymbolAtLocation(originalNode.moduleSpecifier)
        const moduleExports = checker.getExportsOfModule(moduleSymbol)

        for (const symbol of moduleExports) {
          if (isEnum(symbol, checker)) {
            context.report(node, `Cannot export enum ${symbol.getName()}`)
          }
        }
      },
    }

    function isEnum(symbol) {
      const flags = symbol.getFlags()

      // eslint-disable-next-line no-bitwise
      if (flags & SymbolFlags.Enum) {
        return true
      }

      // eslint-disable-next-line no-bitwise
      if (flags & SymbolFlags.Alias) {
        return isEnum(checker.getAliasedSymbol(symbol))
      }

      return false
    }
  },
}
