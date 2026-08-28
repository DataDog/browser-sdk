import { StringRole } from '../../../types'
import { createString } from '../encoding'
import type { NodeId } from '../encoding'
import type { SerializationTransaction } from './serializationTransaction'

describe('SerializationTransaction', () => {
  // The checks below are assertions about the types SerializationTransaction accepts rather than
  // about behavior at runtime, so they are enforced by `yarn typecheck` and there is nothing for
  // Jasmine to run. Each expected-error directive is the guard: if the call it covers starts
  // compiling, tsc reports the directive as unused and the build fails.
  //
  // They matter because both kinds of regression are silent. A string that reaches the encoder
  // without a role is recorded under the default role and simply never masked; the decoder can't
  // catch it either, since a default-role table entry decodes like any other. And an addNode()
  // overload that accepts an unconstrained node name matches every call, which quietly stops the
  // parameters of every kind of node from being checked at all.

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

  it('accepts a string only in its role-annotated form, wherever one appears', () => {
    const addNode = (() => undefined) as unknown as SerializationTransaction['addNode']
    const addStyleSheet = (() => undefined) as unknown as SerializationTransaction['addStyleSheet']
    const setAttributes = (() => undefined) as unknown as SerializationTransaction['setAttributes']
    const nodeId = 0 as NodeId
    const attributeName = createString(StringRole.AttributeName, 'id')
    const attributeValue = createString(StringRole.AttributeValue, 'main')
    const css = createString(StringRole.Css, 'body {}')

    setAttributes([nodeId, [attributeName, attributeValue]])
    setAttributes([nodeId, [attributeName]])
    // @ts-expect-error an attribute assignment of bare strings
    setAttributes([nodeId, ['id', 'main']])
    // @ts-expect-error an attribute deletion naming a bare string
    setAttributes([nodeId, ['id']])
    // @ts-expect-error an attribute assignment that annotates only its name
    setAttributes([nodeId, [attributeName, 'main']])

    addStyleSheet(css)
    addStyleSheet([css], [createString(StringRole.Css, 'screen')], true)
    // @ts-expect-error a stylesheet whose rules are a bare string
    addStyleSheet('body {}')
    // @ts-expect-error a stylesheet with a bare string among its rules
    addStyleSheet(['body {}'])
    // @ts-expect-error a stylesheet with a bare string in its media list
    addStyleSheet(css, ['screen'])

    // @ts-expect-error a #text node whose text content is a bare string
    addNode(null, createString(StringRole.NodeName, '#text'), 'content')
    // @ts-expect-error an element node whose attribute assignment is a pair of bare strings
    addNode(null, createString(StringRole.NodeName, 'DIV'), ['id', 'main'])
  })
})
