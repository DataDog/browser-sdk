import path from 'node:path'

export default {
  meta: {
    docs: {
      description: 'Disallow the use of too generic utility file names',
      recommended: false,
    },
    schema: [],
  },
  create: (context) => ({
    Program: (node) => {
      const filename = path.basename(context.getFilename())
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
