module.exports = {
  meta: {
    docs: {
      description:
        // eslint-disable-next-line max-len
        'Disallow importing spec file code to avoid to execute the tests from the imported spec file twice',
      recommended: false,
    },
    schema: [],
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        if (isSpecFile(node.source.value)) {
          context.report({
            node: node.source,
            message: 'Members of a spec file must not be imported',
          })
        }
      },
    }
  },
}

function isSpecFile(filename) {
  return /\.spec(\.ts)?$/.test(filename)
}
