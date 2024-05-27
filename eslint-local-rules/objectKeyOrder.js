module.exports = {
  meta: {
    docs: {
      description: 'Make sure object declaration follow the same order as in the TypeScript interface',
    },
    schema: [],
    fixable: 'code',
  },
  create(context) {
    const parserServices = context.parserServices
    const checker = parserServices.program.getTypeChecker()

    return {
      ObjectExpression(node) {
        const originalNode = parserServices.esTreeNodeToTSNodeMap.get(node)
        let contextualType = checker.getContextualType(originalNode)
        if (!contextualType) {
          return
        }

        const actualProperties = node.properties.filter((property) => property.type === 'Property')
        const actualPropertiesNames = new Set(actualProperties.map((property) => property.key.name))
        const expectedPropertiesNames = getTypePropertyNames(checker, contextualType)
        const expectedIndexes = new Map(expectedPropertiesNames.map((key, index) => [key, index]))

        let previousIndex = -1

        for (const property of actualProperties) {
          const name = property.key.name

          let expectedIndex = expectedIndexes.get(name)

          if (expectedIndex === undefined) {
            continue
          }

          if (expectedIndex < previousIndex) {
            let expectedPreviousPropertyName
            for (let i = expectedIndex - 1; i >= 0; i--) {
              if (actualPropertiesNames.has(expectedPropertiesNames[i])) {
                expectedPreviousPropertyName = expectedPropertiesNames[i]
                break
              }
            }
            context.report({
              node: property,
              message: `Property "${name}" should be declared ${
                !expectedPreviousPropertyName ? 'first' : `after "${expectedPreviousPropertyName}"`
              }.`,
              fix(fixer) {
                return fix(fixer, context.getSourceCode(), property, expectedPreviousPropertyName, actualProperties)
              },
            })
          }

          previousIndex = expectedIndex
        }
      },
    }
  },
}

function getTypePropertyNames(checker, type) {
  const output = new Set()
  addTypePropertyNames(checker, type, output)
  return Array.from(output)
}

function addTypePropertyNames(checker, type, output) {
  if (type.isClassOrInterface()) {
    // Add properties from base types first
    for (const baseType of checker.getBaseTypes(type)) {
      addTypePropertyNames(checker, baseType, output)
    }
  }

  if (type.isUnion()) {
    for (const unitType of type.types) {
      addTypePropertyNames(checker, unitType, output)
    }
  }

  for (const property of checker.getPropertiesOfType(type)) {
    output.add(property.escapedName)
  }
}

function* fix(fixer, sourceCode, property, expectedPreviousPropertyName, actualProperties) {
  const propertyRange = getPropertyRange(sourceCode, property)

  let sourceCodeText = sourceCode.getText()
  let fullText
  if (sourceCode.getTokenAfter(property).value === ',') {
    fullText = sourceCodeText.slice(propertyRange[0], propertyRange[1])
  } else {
    // Add a comma
    const endIndex = sourceCode.getIndexFromLoc(property.loc.end)
    fullText = `${sourceCodeText.slice(propertyRange[0], endIndex)},${sourceCodeText.slice(endIndex, propertyRange[1])}`
  }

  yield fixer.removeRange(propertyRange)

  if (expectedPreviousPropertyName) {
    const expectedPreviousProperty = actualProperties.find(
      (property) => property.key.name === expectedPreviousPropertyName
    )
    const previousPropertyRange = getPropertyRange(sourceCode, expectedPreviousProperty)
    yield fixer.insertTextAfterRange(previousPropertyRange, fullText)
  } else {
    const nextPropertyRange = getPropertyRange(sourceCode, actualProperties[0])
    yield fixer.insertTextBeforeRange(nextPropertyRange, fullText)
  }
}

function getPropertyRange(sourceCode, property) {
  // {
  //   previousProperty: 1,|
  //   property: 2
  // }
  // {
  //   previousProperty: 1, /* comment */|
  //   property: 2
  // }
  // {
  //   previousProperty: 1, // comment|
  //   // comment
  //   property: 2
  // }
  // {|
  //   property: 1
  // }
  // { // comment|
  //   // comment
  //   property: 1
  // }
  const startLoc = getCommentEndLoc(sourceCode, sourceCode.getTokenBefore(property))

  let endLoc
  let nextToken = sourceCode.getTokenAfter(property)
  if (nextToken.value === ',') {
    // {
    //  property: 1,|
    // }
    // {
    //  property: 1, // comment|
    // }
    // {
    //  property: 1 /* comment */,|
    //  // comment
    // }
    endLoc = getCommentEndLoc(sourceCode, nextToken)
  } else {
    // {
    //  property: 1|
    // }
    // {
    //  property: 1 // comment|
    // }
    // {
    //  property: 1 /* comment */|
    //  // comment
    // }
    endLoc = getCommentEndLoc(sourceCode, property)
  }

  return [sourceCode.getIndexFromLoc(startLoc), sourceCode.getIndexFromLoc(endLoc)]
}

function getCommentEndLoc(sourceCode, token) {
  let endLoc = token.loc.end

  const commentsAfter = sourceCode.getCommentsAfter(token)
  for (const comment of commentsAfter) {
    if (comment.loc.start.line === endLoc.line) {
      endLoc = comment.loc.end
    }
  }

  return endLoc
}
