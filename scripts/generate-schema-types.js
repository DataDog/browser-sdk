const fs = require('fs')
const path = require('path')
const prettier = require('prettier')
const { printLog, runMain } = require('./lib/execution-utils')

const schemasDirectoryPath = path.join(__dirname, '../rum-events-format/schemas')
const prettierConfigPath = path.join(__dirname, '../.prettierrc.yml')

const PREFIX = `\
/* eslint-disable */
/**
 * DO NOT MODIFY IT BY HAND. Run \`yarn rum-events-format:sync\` instead.
 */

`

runMain(async () => {
  await generateTypesFromSchema(
    path.join(__dirname, '../packages/rum-core/src/rumEvent.types.ts'),
    path.join(schemasDirectoryPath, 'rum-events-schema.json')
  )
  await generateTypesFromSchema(
    path.join(__dirname, '../packages/core/src/domain/telemetry/telemetryEvent.types.ts'),
    path.join(schemasDirectoryPath, 'telemetry-events-schema.json')
  )
  // await generateTypesFromSchema(
  //  path.join(__dirname, '../packages/rum/src/types/sessionReplay.ts'),
  //  path.join(schemasDirectoryPath, 'session-replay-browser-schema.json'),
  //  { options: { additionalProperties: false } }
  // )
})

async function generateTypesFromSchema(typesPath, schemaPath, options = {}) {
  const prettierConfig = await prettier.resolveConfig(prettierConfigPath)
  printLog(`Compiling ${schemaPath}...`)

  const schema = readSchema(schemaPath)
  const resolvedSchema = resolveAllSchemas(schema, schemaPath)

  let namedTypes = new Map()
  let dependencies = new Set()
  generate(resolvedSchema, dependencies, namedTypes)
  console.log(Array.from(namedTypes.values(), ({ name, dependencies }) => [name, dependencies]))
  // const order = [
  //  'RumEvent',
  //  'RumActionEvent',
  //  'RumErrorEvent',
  //  'RumLongTaskEvent',
  //  'RumResourceEvent',
  //  'RumViewEvent',
  //  'RumVitalEvent',
  //  'TelemetryEvent',
  //  'TelemetryErrorEvent',
  //  'TelemetryDebugEvent',
  //  'TelemetryConfigurationEvent',
  //  'TelemetryUsageEvent',
  //  'TelemetryCommonFeaturesUsage',
  //  'TelemetryBrowserFeaturesUsage',
  // ]
  //
  // console.log(Array.from(namedTypes.keys()))
  // let sortedNamedTypes = Array.from(namedTypes.values())
  // sortedNamedTypes.sort((a, b) => {
  //  let orderA = order.indexOf(a.name)
  //  let orderB = order.indexOf(b.name)
  //  if (orderA === -1) {
  //    orderA = Infinity
  //  }
  //  if (orderB === -1) {
  //    orderB = Infinity
  //  }
  //  return orderA - orderB
  // })
  // let unformatedTypes = sortedNamedTypes.map(({ type }) => type)
  // console.log(Array.from(sortedNamedTypes.map(({ name }) => name)))

  let sortedNamedTypes = []
  while (namedTypes.size > 0) {
    for (let namedType of namedTypes.values()) {
      if (namedType.dependencies.size === 0) {
        sortedNamedTypes.unshift(namedType)
        namedTypes.delete(namedType.name)
        for (let otherNamedType of namedTypes.values()) {
          otherNamedType.dependencies.delete(namedType.name)
        }
      }
    }
  }
  let unformatedTypes = sortedNamedTypes.map(({ type }) => type)

  // let unformatedTypes = Array.from(namedTypes.values())
  // unformatedTypes.reverse()

  const formatedTypes = await prettier.format(unformatedTypes.join(''), {
    ...prettierConfig,
    parser: 'typescript',
  })
  // console.log(formatedTypes)

  printLog(`Writing ${typesPath}...`)
  fs.writeFileSync(typesPath, `${PREFIX}${formatedTypes}`)
  printLog('Generation done.')
}

function resolveAllSchemas(schema, schemaPath) {
  if (schema.$ref) {
    schemaPath = path.join(path.dirname(schemaPath), schema.$ref)
    schema = readSchema(schemaPath)
  }

  if (schema.allOf) {
    schema.allOf = schema.allOf.map((subSchema) => resolveAllSchemas(subSchema, schemaPath))
  }
  if (schema.oneOf) {
    schema.oneOf = schema.oneOf.map((subSchema) => resolveAllSchemas(subSchema, schemaPath))
  }
  if (schema.properties) {
    schema.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([propertyName, propertySchema]) => [
        propertyName,
        resolveAllSchemas(propertySchema, schemaPath),
      ])
    )
  }
  delete schema.$id
  delete schema.$schema
  delete schema.$comment

  return schema
}

function generate(schema, dependencies, namedTypes) {
  if (schema.title) {
    dependencies.add(schema.title)
    if (namedTypes.has(schema.title)) {
      return { comment: '', type: schema.title }
    }
    namedTypes.set(schema.title, { name: schema.title, dependencies: new Set(), type: '' }) // handle recursive types
    dependencies = new Set()
  }

  let generatedType
  if (schema.enum) {
    generatedType = schema.enum.map((value) => JSON.stringify(value)).join(' | ')
  } else if (schema.const) {
    generatedType = JSON.stringify(schema.const)
  } else if (schema.allOf) {
    // const baseInterfaces = schema.allOf.slice(0, -1)
    // if (baseInterfaces.slice(0, -1).every((subSchema) => subSchema.type === 'object' && subSchema.title)) {
    //  yield `interface ${schema.title} extends ${baseInterfaces.map((subSchema) => subSchema.title).join(', ')} { ${}`
    //  // interface A extends B, C, D
    // }
    // type A = B & C & D
    generatedType = schema.allOf
      .map((subSchema) => {
        let { comment, type } = generate(subSchema, dependencies, namedTypes)
        return `${comment} ${type}`
      })
      .join(' & ')
  } else if (schema.oneOf || schema.anyOf) {
    // type A = B | C | D
    generatedType = (schema.oneOf || schema.anyOf)
      .map((subSchema) => {
        let { comment, type } = generate(subSchema, dependencies, namedTypes)
        return `${comment} ${type}`
      })
      .join(' | ')
  } else if (schema.type === 'null') {
    generatedType = 'null'
  } else if (schema.type === 'boolean') {
    generatedType = 'boolean'
  } else if (schema.type === 'integer' || schema.type === 'number') {
    generatedType = 'number'
  } else if (schema.type === 'string') {
    generatedType = 'string'
  } else if (schema.type === 'array') {
    const { comment, type } = generate(schema.items, dependencies, namedTypes)
    // TODO: handle comment
    generatedType = `(${type})[]`
  } else {
    const requiredProperties = schema.required || []
    let generatedProperties
    if (schema.properties) {
      generatedProperties = Object.entries(schema.properties)
        .map(([propertyName, propertySchema]) => {
          let modifier = ''
          if (propertySchema.readOnly) {
            modifier = 'readonly '
          }
          const { comment, type } = generate(propertySchema, dependencies, namedTypes)
          const optionalModifier = requiredProperties.includes(propertyName) ? '' : '?'
          return ` ${comment}\n${modifier} ${propertyName}${optionalModifier}: ${type},\n`
        })
        .join('')
    } else {
      generatedProperties = ''
    }

    let generatedAdditionalProperties
    if (schema.additionalProperties === true || schema.additionalProperties === undefined) {
      generatedAdditionalProperties = '[k: string]: unknown\n'
    } else if (schema.additionalProperties) {
      const { comment, type } = generate(schema.additionalProperties, dependencies, namedTypes)
      generatedAdditionalProperties = `${comment}\n[k: string]: ${type}\n`
    } else {
      generatedAdditionalProperties = ''
    }

    generatedType = `{\n${generatedProperties}${generatedAdditionalProperties}}`
  }

  let comment
  if (schema.description) {
    comment = `/**\n* ${schema.description}\n*/`
  } else {
    comment = ''
  }

  if (schema.title) {
    namedTypes.set(schema.title, {
      name: schema.title,
      dependencies,
      type: `${comment}\nexport type ${schema.title} = ${generatedType}\n`,
    })
    return {
      comment: '',
      type: schema.title,
    }
  }

  return {
    comment,
    type: generatedType,
  }
}

function readSchema(schemaPath) {
  try {
    return JSON.parse(fs.readFileSync(schemaPath, 'utf8'))
  } catch (error) {
    throw new Error(`Failed to read schema from ${schemaPath}: ${error.message}`)
  }
}

function addAll(destination, source) {
  for (const value of source) {
    destination.add(value)
  }
}
