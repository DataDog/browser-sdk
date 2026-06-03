import path from 'node:path'
import { RuleCreator } from '@typescript-eslint/utils/eslint-utils'

export default RuleCreator.withoutDocs({
  meta: {
    docs: {
      description: 'Disallow the use of too generic utility file names',
    },
    schema: [],
    messages: {
      genericUtilsFileName: 'Consider having a more specific file name to reflect the domain of this utility file',
    },
    type: 'suggestion',
  },
  create: (context) => ({
    Program: (node) => {
      const filename = path.basename(context.filename)
      if (isGenericUtilsFileName(filename)) {
        context.report({
          node,
          messageId: 'genericUtilsFileName',
        })
      }
    },
  }),
})

function isGenericUtilsFileName(filename: string) {
  return /^(utils|specHelper)\..*/.test(filename)
}
