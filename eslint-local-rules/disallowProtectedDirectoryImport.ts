import path from 'node:path'
import { RuleCreator } from '@typescript-eslint/utils/eslint-utils'
import { minimatch } from 'minimatch'

import { importType, moduleVisitor, resolve } from 'eslint-plugin-import-x/utils'

export default RuleCreator.withoutDocs({
  meta: {
    docs: {
      description:
        'Consider directories containing an "index" file as protected, and disallow importing modules from them.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          ignore: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      protectedDirectoryImport: '{{protectedDirectory}} is a protected directory, import from its index module instead',
    },
    type: 'suggestion',
  },
  create(context) {
    return moduleVisitor((source) => {
      const protectedDirectory = getFirstProtectedDirectory(source.value, context)
      if (protectedDirectory) {
        context.report({
          node: source,
          messageId: 'protectedDirectoryImport',
          data: { protectedDirectory },
        })
      }
    })
  },
})

function getFirstProtectedDirectory(importedModule: string, context: Parameters<typeof importType>[1]) {
  // only consider relative and absolute paths, no package or builtin imports
  if (!['absolute', 'sibling', 'index', 'parent'].includes(importType(importedModule, context))) {
    return
  }

  // only consider imports that can be resolved
  if (!resolve(importedModule, context)) {
    return
  }

  return findProtectedDirectory(splitLast(importedModule)[0])

  function findProtectedDirectory(potentialProtectedDirectory: string): string | undefined {
    const [parentPotentialProtectedDirectory, basename] = splitLast(potentialProtectedDirectory)
    if (basename === '' || basename === '..' || basename === '.') {
      return
    }

    // Look for a directory higher in the hierarchy first
    const parentProtectedDirectory = findProtectedDirectory(parentPotentialProtectedDirectory)
    if (parentProtectedDirectory) {
      return parentProtectedDirectory
    }

    // If we can import an index file within the directory, consider it protected.
    const resolvedPath = resolve(`${potentialProtectedDirectory}/index`, context)
    if (!resolvedPath) {
      return
    }

    // Make sure we shouldn't ignore it
    const resolvedPathRelativeToCwd = path.relative(context.cwd, resolvedPath)
    const firstOption = context.options[0] as { ignore?: string[] } | undefined
    const shouldIgnore = firstOption?.ignore?.some((glob) => minimatch(resolvedPathRelativeToCwd, glob))
    if (shouldIgnore) {
      return
    }

    return potentialProtectedDirectory
  }
}

function splitLast(importSource: string): [string, string] {
  const lastIndex = importSource.lastIndexOf('/')
  if (lastIndex < 0) {
    return ['', importSource]
  }
  return [importSource.slice(0, lastIndex), importSource.slice(lastIndex + 1)]
}
