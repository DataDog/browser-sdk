import ts from 'typescript'

/**
 * Converts a spec file from the Jasmine API to the Vitest API.
 *
 * The conversion edits the source text in place (based on the TypeScript AST) so the original
 * formatting and comments are preserved. Constructs that can't be converted safely are left
 * untouched and reported, to be fixed by hand.
 */

export interface Unsupported {
  line: number
  text: string
  reason: string
}

export interface TransformResult {
  code: string
  unsupported: Unsupported[]
}

interface Edit {
  start: number
  end: number
  text: string
}

const TEST_FUNCTIONS = ['describe', 'it', 'expect', 'beforeEach', 'afterEach', 'beforeAll', 'afterAll']
const CALLBACK_FUNCTIONS = ['it', 'fit', 'xit', 'beforeEach', 'afterEach', 'beforeAll', 'afterAll']
const FOCUS_AND_SKIP: Record<string, string> = {
  fdescribe: 'describe.only',
  fit: 'it.only',
  xdescribe: 'describe.skip',
  xit: 'it.skip',
}
// jasmine.xxx() -> expect.xxx()
const ASYMMETRIC_MATCHERS = [
  'any',
  'anything',
  'objectContaining',
  'arrayContaining',
  'stringMatching',
  'stringContaining',
]
const RENAMED_MATCHERS: Record<string, string> = {
  toHaveBeenCalledOnceWith: 'toHaveBeenCalledExactlyOnceWith',
  toHaveSize: 'toHaveLength',
}
const ASYNC_MATCHERS: Record<string, string> = {
  toBeResolvedTo: 'resolves.toEqual',
  toBeRejectedWith: 'rejects.toEqual',
  toBeRejectedWithError: 'rejects.toThrow',
}
const RENAMED_STRATEGIES: Record<string, string> = {
  returnValue: 'mockReturnValue',
  callFake: 'mockImplementation',
  resolveTo: 'mockResolvedValue',
  rejectWith: 'mockRejectedValue',
}
const JASMINE_CALLS_METHODS = ['count', 'argsFor', 'allArgs', 'reset', 'mostRecent', 'first', 'all', 'any', 'thisFor']
const SPY_TYPES: Record<string, string> = {
  Spy: 'Mock',
  SpyObj: 'Mocked',
}

export function transformJasmineToVitest(source: string, fileName: string): TransformResult {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )
  const edits: Edit[] = []
  const unsupported: Unsupported[] = []
  const declaredNames = collectDeclaredNames(sourceFile)
  const usedVitestValues = new Set<string>()
  const usedVitestTypes = new Set<string>()

  const isGlobal = (name: string) => !declaredNames.has(name)

  function report(node: ts.Node, reason: string) {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart())
    unsupported.push({ line: line + 1, text: node.getText().split('\n')[0], reason })
  }

  function addEdit(start: number, end: number, text: string) {
    edits.push({ start, end, text })
  }

  function replaceNode(node: ts.Node, text: string) {
    addEdit(node.getStart(), node.end, text)
  }

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && transformCall(node)) {
      return
    }
    if (ts.isPropertyAccessExpression(node) && transformPropertyAccess(node)) {
      return
    }
    if (ts.isTypeReferenceNode(node) && transformTypeReference(node)) {
      return
    }
    if (isFunctionLike(node)) {
      transformDoneCallback(node)
    }
    if (ts.isObjectLiteralExpression(node) && isCustomAsymmetricMatcher(node)) {
      report(node, 'custom Jasmine asymmetric matcher: use an `expect.*` matcher instead')
    }
    if (ts.isIdentifier(node)) {
      trackTestFunction(node)
    }
    ts.forEachChild(node, visit)
  }

  function trackTestFunction(node: ts.Identifier) {
    if (TEST_FUNCTIONS.includes(node.text) && isGlobal(node.text) && isValueReference(node)) {
      usedVitestValues.add(node.text)
    }
  }

  // Returns true when the node (and its children) has been fully handled
  function transformCall(node: ts.CallExpression): boolean {
    const callee = node.expression

    if (ts.isIdentifier(callee) && isGlobal(callee.text)) {
      switch (callee.text) {
        case 'spyOn':
        case 'spyOnProperty':
          transformSpyOn(node, callee)
          return false
        case 'fail':
          replaceNode(callee, 'expect.unreachable')
          usedVitestValues.add('expect')
          return false
        case 'pending':
          transformPending(node, callee)
          return false
        case 'expectAsync':
          replaceNode(callee, 'expect')
          usedVitestValues.add('expect')
          return false
      }
      if (callee.text in FOCUS_AND_SKIP) {
        replaceNode(callee, FOCUS_AND_SKIP[callee.text])
        usedVitestValues.add(FOCUS_AND_SKIP[callee.text].split('.')[0])
        return false
      }
    }

    if (isJasmineMember(callee, 'createSpy')) {
      addEdit(callee.getStart(), callee.end, 'vi.fn')
      // The spy name (and original function, only used for typing) are dropped
      if (node.arguments.length) {
        addEdit(node.arguments.pos, node.arguments.end, '')
      }
      usedVitestValues.add('vi')
      return true
    }

    if (isJasmineMember(callee, 'isSpy')) {
      replaceNode(callee, 'vi.isMockFunction')
      usedVitestValues.add('vi')
      return false
    }

    if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) {
      const object = callee.expression
      if (object.text === 'jasmine' && isGlobal('jasmine') && ASYMMETRIC_MATCHERS.includes(callee.name.text)) {
        replaceNode(callee, `expect.${callee.name.text}`)
        usedVitestValues.add('expect')
        return false
      }
    }

    if (ts.isPropertyAccessExpression(callee)) {
      return transformMatcher(node, callee)
    }

    return false
  }

  function transformSpyOn(node: ts.CallExpression, callee: ts.Identifier) {
    addEdit(callee.getStart(), callee.end, 'vi.spyOn')
    usedVitestValues.add('vi')

    const isProperty = callee.text === 'spyOnProperty'
    let accessType = 'get'
    if (isProperty) {
      if (node.arguments.length < 3) {
        addEdit(node.arguments.end, node.arguments.end, ", 'get'")
      } else {
        const accessTypeArgument = node.arguments[2]
        accessType = ts.isStringLiteral(accessTypeArgument) ? accessTypeArgument.text : 'get'
      }
    }

    // Jasmine spies don't call through by default, Vitest ones do
    const strategy = getSpyStrategy(node)
    if (strategy === undefined) {
      const stub =
        isProperty && accessType === 'set' ? '.mockImplementation(() => {})' : '.mockReturnValue(undefined as never)'
      addEdit(node.end, node.end, stub)
    } else if (strategy.name === 'callThrough') {
      addEdit(node.end, strategy.call.end, '')
    }
  }

  function getSpyStrategy(node: ts.Expression) {
    const and = node.parent
    if (!ts.isPropertyAccessExpression(and) || and.name.text !== 'and' || and.expression !== node) {
      return
    }
    const method = and.parent
    if (!ts.isPropertyAccessExpression(method) || !ts.isCallExpression(method.parent)) {
      return
    }
    return { name: method.name.text, call: method.parent }
  }

  function transformPending(node: ts.CallExpression, callee: ts.Identifier) {
    const callback = getEnclosingFunction(node)
    if (!callback || !isTestCallback(callback, ['it', 'fit', 'xit'])) {
      report(node, 'pending() outside of a test callback: use the test context `skip()`')
      return
    }
    if (callback.parameters.length > 0) {
      report(node, 'pending() in a test callback that already has parameters')
      return
    }
    addEdit(callback.parameters.pos, callback.parameters.pos, 'ctx')
    replaceNode(callee, 'ctx.skip')
  }

  function transformMatcher(node: ts.CallExpression, callee: ts.PropertyAccessExpression): boolean {
    const name = callee.name.text
    const expectCall = getExpectCall(callee.expression)
    if (!expectCall) {
      return false
    }

    if (name === 'toBeTrue' || name === 'toBeFalse') {
      addEdit(callee.name.getStart(), node.end, `toBe(${name === 'toBeTrue'})`)
      visit(callee.expression)
      return true
    }
    if (name in RENAMED_MATCHERS) {
      replaceNode(callee.name, RENAMED_MATCHERS[name])
      return false
    }
    if (name === 'withContext') {
      // expect(x).withContext(message).matcher() -> expect(x, message).matcher()
      const message = node.arguments[0]
      if (expectCall !== callee.expression || !message) {
        report(node, 'unexpected withContext() usage')
        return false
      }
      addEdit(expectCall.arguments.end, expectCall.arguments.end, `, ${message.getText()}`)
      addEdit(expectCall.end, node.end, '')
      ts.forEachChild(expectCall, visit)
      return true
    }
    if (isExpectAsync(expectCall)) {
      if (name in ASYNC_MATCHERS && (name !== 'toBeRejectedWithError' || node.arguments.length <= 1)) {
        replaceNode(callee.name, ASYNC_MATCHERS[name])
        return false
      }
      report(node, `unsupported async matcher ${name}()`)
      return false
    }
    if (['toThrowMatching', 'toHaveBeenCalledBefore', 'toHaveBeenCalledAfter'].includes(name)) {
      report(node, `no Vitest equivalent for ${name}()`)
    }
    return false
  }

  // Returns true when the node (and its children) has been fully handled
  function transformPropertyAccess(node: ts.PropertyAccessExpression): boolean {
    if (node.name.text === 'calls' && isJasmineCallsMethod(node)) {
      return transformCalls(node)
    }
    if (node.name.text === 'and') {
      if (isSpyOnCall(node.expression) && getSpyStrategy(node.expression)?.name === 'callThrough') {
        return false
      }
      return transformSpyStrategy(node)
    }
    if (isJasmineObject(node.expression) && !isHandledJasmineMember(node)) {
      report(node, `unsupported jasmine.${node.name.text}`)
      return true
    }
    return false
  }

  // spy.calls.xxx() -> spy.mock.xxx
  function transformCalls(node: ts.PropertyAccessExpression): boolean {
    const spy = node.expression
    const method = node.parent as ts.PropertyAccessExpression
    const call = method.parent as ts.CallExpression
    const after = call.parent
    const argsAccess = ts.isPropertyAccessExpression(after) && after.name.text === 'args' ? after : undefined
    let replacement: string | undefined
    let end = call.end

    switch (method.name.text) {
      case 'count':
        replacement = '.mock.calls.length'
        break
      case 'argsFor':
        replacement = `.mock.calls[${call.arguments[0]?.getText() ?? 0}]`
        break
      case 'allArgs':
        replacement = '.mock.calls'
        break
      case 'reset':
        replacement = '.mockClear()'
        break
      case 'mostRecent':
      case 'first':
        if (argsAccess) {
          const base = method.name.text === 'mostRecent' ? '.mock.lastCall' : '.mock.calls[0]'
          replacement = base + getArgsSuffix(argsAccess, method.name.text === 'mostRecent' ? '!' : '')
          end = argsAccess.end
        }
        break
    }
    if (replacement === undefined) {
      report(node, `unsupported spy.calls.${method.name.text}()`)
      return true
    }
    addEdit(spy.end, end, replacement)
    visit(spy)
    return true
  }

  // spy.and.xxx() -> spy.mockXxx()
  function transformSpyStrategy(node: ts.PropertyAccessExpression): boolean {
    const strategy = getSpyStrategy(node.expression)
    if (!strategy) {
      report(node, 'spy.and used without a method call')
      return true
    }
    const { name, call } = strategy
    const method = node.parent as ts.PropertyAccessExpression
    const renamed = RENAMED_STRATEGIES[name]
    if (renamed) {
      // spy.and.returnValue(x) -> spy.mockReturnValue(x), arguments are visited normally
      addEdit(node.expression.end, method.name.end, `.${renamed}`)
      visit(node.expression)
      return true
    }
    const args = call.arguments.map((argument) => argument.getText())
    let replacement: string | undefined

    switch (name) {
      case 'returnValues':
        replacement = args.map((arg) => `.mockReturnValueOnce(${arg})`).join('')
        break
      case 'stub':
        replacement = '.mockReturnValue(undefined as never)'
        break
      case 'throwError': {
        const error = call.arguments[0]
        if (
          error &&
          (ts.isStringLiteral(error) || ts.isNoSubstitutionTemplateLiteral(error) || ts.isTemplateExpression(error))
        ) {
          replacement = `.mockImplementation(() => {\n  throw new Error(${error.getText()})\n})`
        } else if (error && ts.isNewExpression(error)) {
          replacement = `.mockImplementation(() => {\n  throw ${error.getText()}\n})`
        }
        break
      }
    }
    if (replacement === undefined) {
      report(call, `unsupported spy.and.${name}()`)
      return true
    }
    // Arguments are copied as is, so they must not contain anything to convert themselves
    addEdit(node.expression.end, call.end, replacement)
    visit(node.expression)
    return true
  }

  function transformTypeReference(node: ts.TypeReferenceNode): boolean {
    const typeName = node.typeName
    if (!ts.isQualifiedName(typeName) || !ts.isIdentifier(typeName.left) || typeName.left.text !== 'jasmine') {
      return false
    }
    const name = typeName.right.text
    if (name in SPY_TYPES) {
      replaceNode(typeName, SPY_TYPES[name])
      usedVitestTypes.add(SPY_TYPES[name])
      node.typeArguments?.forEach(visit)
      return true
    }
    if (name === 'Func') {
      replaceNode(node, '(...args: any[]) => any')
      return true
    }
    report(node, `unsupported type jasmine.${name}`)
    return true
  }

  // it('...', (done) => { ... }) -> it('...', () => new Promise<void>((done) => { ... }))
  function transformDoneCallback(node: ts.ArrowFunction | ts.FunctionExpression) {
    if (node.parameters.length !== 1 || !isTestCallback(node, CALLBACK_FUNCTIONS)) {
      return
    }
    const parameter = node.parameters[0]
    if (!ts.isIdentifier(parameter.name) || parameter.name.text !== 'done') {
      return
    }
    if (node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)) {
      report(node, 'async callback with a done parameter')
      return
    }
    const done = parameter.name.text
    const failCalls = findDoneFailCalls(node.body, done)
    const executorParameters = failCalls.length ? `${done}, reject` : done

    const hasParentheses = sourceFile.text[parameter.getStart() - 1] === '('
    addEdit(parameter.getStart(), parameter.end, '')
    if (!hasParentheses) {
      addEdit(parameter.getStart(), parameter.getStart(), '()')
    }
    if (ts.isBlock(node.body)) {
      addEdit(
        node.body.getStart() + 1,
        node.body.getStart() + 1,
        `\nreturn new Promise<void>((${executorParameters}) => {`
      )
      addEdit(node.body.end - 1, node.body.end - 1, '})\n')
    } else {
      addEdit(node.body.getStart(), node.body.getStart(), `new Promise<void>((${executorParameters}) => {\n`)
      addEdit(node.body.end, node.body.end, '\n})')
    }
    for (const failAccess of failCalls) {
      replaceNode(failAccess, 'reject')
    }
  }

  function findDoneFailCalls(body: ts.Node, done: string) {
    const result: ts.PropertyAccessExpression[] = []
    const find = (node: ts.Node) => {
      if (
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === done &&
        node.name.text === 'fail'
      ) {
        result.push(node)
      }
      ts.forEachChild(node, find)
    }
    find(body)
    return result
  }

  // Keep `spy.calls.mostRecent()?.args[0]` safe when the spy has not been called
  function getArgsSuffix(argsAccess: ts.PropertyAccessExpression, nonOptionalSuffix: string) {
    if (!argsAccess.questionDotToken) {
      return nonOptionalSuffix
    }
    const next = argsAccess.parent
    return ts.isElementAccessExpression(next) && next.expression === argsAccess ? '?.' : ''
  }

  function isJasmineCallsMethod(node: ts.PropertyAccessExpression) {
    const method = node.parent
    return (
      ts.isPropertyAccessExpression(method) &&
      method.expression === node &&
      ts.isCallExpression(method.parent) &&
      JASMINE_CALLS_METHODS.includes(method.name.text)
    )
  }

  function isJasmineObject(node: ts.Node) {
    return ts.isIdentifier(node) && node.text === 'jasmine' && isGlobal('jasmine')
  }

  function isJasmineMember(node: ts.Node, member: string): node is ts.PropertyAccessExpression {
    return ts.isPropertyAccessExpression(node) && node.name.text === member && isJasmineObject(node.expression)
  }

  function isHandledJasmineMember(node: ts.PropertyAccessExpression) {
    return ['createSpy', 'isSpy', ...ASYMMETRIC_MATCHERS].includes(node.name.text)
  }

  function isSpyOnCall(node: ts.Node) {
    return (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ['spyOn', 'spyOnProperty'].includes(node.expression.text) &&
      isGlobal(node.expression.text)
    )
  }

  function getExpectCall(node: ts.Expression): ts.CallExpression | undefined {
    let current: ts.Expression = node
    while (ts.isPropertyAccessExpression(current) && current.name.text === 'not') {
      current = current.expression
    }
    if (
      ts.isCallExpression(current) &&
      ts.isIdentifier(current.expression) &&
      ['expect', 'expectAsync'].includes(current.expression.text)
    ) {
      return current
    }
    // expect(x).withContext(message).matcher()
    if (
      ts.isCallExpression(current) &&
      ts.isPropertyAccessExpression(current.expression) &&
      current.expression.name.text === 'withContext'
    ) {
      return getExpectCall(current.expression.expression)
    }
  }

  function isExpectAsync(node: ts.CallExpression) {
    return ts.isIdentifier(node.expression) && node.expression.text === 'expectAsync'
  }

  function isTestCallback(node: ts.Node, functions: string[]) {
    const call = node.parent
    if (!ts.isCallExpression(call) || !call.arguments.includes(node as ts.Expression)) {
      return false
    }
    const callee = ts.isPropertyAccessExpression(call.expression) ? call.expression.expression : call.expression
    return ts.isIdentifier(callee) && functions.includes(callee.text) && isGlobal(callee.text)
  }

  visit(sourceFile)

  if (usedVitestValues.size || usedVitestTypes.size) {
    addImports(sourceFile, usedVitestValues, usedVitestTypes, addEdit)
  }

  return { code: applyEdits(source, edits, unsupported, sourceFile), unsupported }
}

function addImports(
  sourceFile: ts.SourceFile,
  values: Set<string>,
  types: Set<string>,
  addEdit: (start: number, end: number, text: string) => void
) {
  const existing = sourceFile.statements.find(
    (statement): statement is ts.ImportDeclaration =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === 'vitest' &&
      !statement.getText().startsWith('import type')
  )
  if (existing?.importClause?.namedBindings && ts.isNamedImports(existing.importClause.namedBindings)) {
    for (const element of existing.importClause.namedBindings.elements) {
      values.add(element.isTypeOnly ? `type ${element.name.text}` : element.name.text)
    }
  }

  let text = values.size ? `import { ${[...values].sort().join(', ')} } from 'vitest'\n` : ''
  if (types.size) {
    text += `import type { ${[...types].sort().join(', ')} } from 'vitest'\n`
  }

  if (existing) {
    addEdit(existing.getStart(), existing.end + 1, text)
    return
  }
  const firstStatement = sourceFile.statements[0]
  const position = firstStatement ? firstStatement.getStart() : 0
  addEdit(position, position, text)
}

function applyEdits(source: string, edits: Edit[], unsupported: Unsupported[], sourceFile: ts.SourceFile) {
  // Stable sort by position, so insertions at the same position keep their order
  const sorted = edits
    .map((edit, index) => ({ ...edit, index }))
    .sort((a, b) => a.start - b.start || a.end - b.end || a.index - b.index)
  let result = ''
  let cursor = 0
  for (const edit of sorted) {
    if (edit.start < cursor) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(edit.start)
      unsupported.push({
        line: line + 1,
        text: source.slice(edit.start, edit.end).split('\n')[0],
        reason: 'overlapping conversions',
      })
      continue
    }
    result += source.slice(cursor, edit.start) + edit.text
    cursor = edit.end
  }
  return result + source.slice(cursor)
}

function collectDeclaredNames(sourceFile: ts.SourceFile) {
  const names = new Set<string>()
  const visit = (node: ts.Node) => {
    if (
      (ts.isVariableDeclaration(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isParameter(node) ||
        ts.isImportSpecifier(node) ||
        ts.isClassDeclaration(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    ) {
      names.add(node.name.text)
    }
    if (ts.isImportClause(node) && node.name) {
      names.add(node.name.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return names
}

// Jasmine treats objects with an `asymmetricMatch` method as matchers, Vitest doesn't
function isCustomAsymmetricMatcher(node: ts.ObjectLiteralExpression) {
  return node.properties.some(
    (property) =>
      property.name &&
      ts.isIdentifier(property.name) &&
      ['asymmetricMatch', 'jasmineToString'].includes(property.name.text)
  )
}

function isFunctionLike(node: ts.Node): node is ts.ArrowFunction | ts.FunctionExpression {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node)
}

function getEnclosingFunction(node: ts.Node): ts.ArrowFunction | ts.FunctionExpression | undefined {
  let current = node.parent
  while (current && !ts.isSourceFile(current)) {
    if (isFunctionLike(current)) {
      return current
    }
    if (ts.isFunctionDeclaration(current) || ts.isMethodDeclaration(current)) {
      return
    }
    current = current.parent
  }
}

function isValueReference(node: ts.Identifier) {
  const parent = node.parent
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) {
    return false
  }
  if (
    (ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent)) &&
    parent.name === node
  ) {
    return false
  }
  if (ts.isImportSpecifier(parent) || ts.isTypeReferenceNode(parent) || ts.isQualifiedName(parent)) {
    return false
  }
  return true
}
