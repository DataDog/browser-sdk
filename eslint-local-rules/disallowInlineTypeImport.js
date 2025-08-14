module.exports = {
  meta: {
    docs: {
      description:
        'Disallow inline type import as it was introduced in typescript 4.5 and breaks compatibility with older versions when exported by the package',
      recommended: false,
    },
    schema: [],
  },
  create(context) {
    return {
      ImportSpecifier(node) {
        if (node.importKind === 'type') {
          context.report({
            node,
            message: 'Types must be in a separate import',
          })
        }
      },
    }
  },
}
