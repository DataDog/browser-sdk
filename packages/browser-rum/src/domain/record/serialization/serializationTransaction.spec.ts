import { StringRole } from '../../../types'
import { createString } from '../encoding'
import type { SerializationTransaction } from './serializationTransaction'

describe('SerializationTransaction', () => {
  // addNode() carries one overload per kind of node, so that each kind is checked against the
  // parameters its own change type defines. The checks below are assertions about those overloads
  // rather than about behavior at runtime, so they are enforced by `yarn typecheck` and there is
  // nothing for Jasmine to run. A regression here is silent — an overload that accepts an
  // unconstrained node name matches every call and quietly stops checking any of them — so each
  // expected-error directive below is the guard: if the call it covers starts compiling, tsc
  // reports the directive as unused and the build fails.

  it('accepts a node name only in its role-annotated form', () => {
    const addNode = (() => undefined) as unknown as SerializationTransaction['addNode']

    // @ts-expect-error the name of a kind of node as an obsolete bare string literal
    addNode(null, '#document')
    // @ts-expect-error an element name as an obsolete bare string literal
    addNode(null, 'DIV')
    // @ts-expect-error a string table reference, which only the encoder is allowed to produce
    addNode(null, 0)
  })

  it('checks the parameters of each kind of node at compile time', () => {
    const addNode = (() => undefined) as unknown as SerializationTransaction['addNode']

    // A #text node carries its text content.
    addNode(null, createString(StringRole.NodeName, '#text'), createString(StringRole.TextContent, 'content'))
    // @ts-expect-error a #text node without its text content
    addNode(null, createString(StringRole.NodeName, '#text'))

    // A #doctype node carries its name, public id, and system id.
    addNode(
      null,
      createString(StringRole.NodeName, '#doctype'),
      createString(StringRole.AttributeValue, 'html'),
      createString(StringRole.AttributeValue, ''),
      createString(StringRole.Url, '')
    )
    // @ts-expect-error a #doctype node missing its public id and system id
    addNode(null, createString(StringRole.NodeName, '#doctype'), createString(StringRole.AttributeValue, 'html'))

    // A #document node carries nothing else.
    addNode(null, createString(StringRole.NodeName, '#document'))
    // @ts-expect-error a #document node given a parameter it has no place for
    addNode(null, createString(StringRole.NodeName, '#document'), createString(StringRole.TextContent, 'content'))

    // An element node carries its attribute assignments.
    addNode(null, createString(StringRole.NodeName, 'DIV'), [
      createString(StringRole.AttributeName, 'id'),
      createString(StringRole.AttributeValue, 'main'),
    ])
    // @ts-expect-error an element node given a bare string where an assignment belongs
    addNode(null, createString(StringRole.NodeName, 'DIV'), createString(StringRole.AttributeValue, 'main'))
  })
})
