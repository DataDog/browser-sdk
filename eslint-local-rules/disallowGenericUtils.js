const path = require('path')

module.exports = {
  meta: {
    docs: {
      description: 'Disallow the use of too generic utility file names',
      recommended: false,
    },
    schema: [],
  },
  create: (context) => ({
    Program: (node) => {
      const filename = path.basename(context.filename)
      if (isGenericUtilsFileName(filename)) {
        context.report({
          node,
          message: 'Consider having a more specific file name to reflect the domain of this utility file',
        })
      }
    },
  }),
}

function isGenericUtilsFileName(filename) {
  return /^(utils|specHelper)\..*/.test(filename)
}
