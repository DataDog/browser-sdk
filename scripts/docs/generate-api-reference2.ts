import fs from 'fs'
import assert from 'assert'
import ts, { SyntaxKind } from 'typescript'
import { Html, html } from './html'
import { renderDocComment } from './render-tsdoc'

function main() {
  const host = ts.createCompilerHost({})
  host.readFile = (fileName) => fs.readFileSync(fileName, 'utf-8')
  const program = ts.createProgram(
    ['./packages/rum/esm/entries/main.d.ts'],
    {
      noEmit: true,
      skipLibCheck: true,
      types: [],
      lib: ['lib.es2016.d.ts', 'lib.dom.d.ts'],
    },
    host
  )
  const checker = program.getTypeChecker()
  ts.getPreEmitDiagnostics(program).forEach((diagnostic) => {
    console.log(diagnostic.file?.fileName)
    if (typeof diagnostic.messageText === 'string') {
      console.log(diagnostic.messageText)
    } else {
      printChain(diagnostic.messageText)
    }
    function printChain(chain: ts.DiagnosticMessageChain, indent = 0) {
      console.log(' '.repeat(indent), chain.messageText)
      if (chain.next) {
        for (const next of chain.next) {
          printChain(next, indent + 2)
        }
      }
    }

    console.log()
  })
  const sourceFile = program.getSourceFile(program.getRootFileNames()[0])!
  generateDocumentation(checker, sourceFile)
  // assert.deepStrictEqual(getExportedSymbols(checker, sourceFile), ['foo', 'baz', 'bar'])

  // generateDocumentation(['./packages/rum/esm/entries/main.d.ts'], {
  //  noEmit: true,
  //  skipLibCheck: true,
  //  types: [],
  // })
  return
  const apiPackage = ApiPackage.loadFromJsonFile('./temp/browser-rum.api.json')
  const output = html`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>API Reference</title>
        <style>
          .members {
            margin-left: 1em;
          }
          .excerpt-identifier {
          }
          pre {
            border: 1px solid #ccc;
            padding: 1em;
            background-color: #f8f8f8;
          }
        </style>
      </head>
      <body>
        <h1>API Reference</h1>
        ${renderApiItem(apiPackage)}
      </body>
    </html>
  `

  fs.writeFileSync('./temp/api-reference.html', output.toString())
}

function getTestProgram() {
  const files: Record<string, string> = {
    '/main.ts': `
 export { foo } from "./toto"
 export * from "./tata"
 const notExported = 1
 export const baz: number = 1
/**
* toto
*/
export interface Foo {
  a: string
}
 `,
    '/toto.ts': `
 export const foo = 1
 `,
    '/tata.ts': `
 export const bar = 1
 `,
  }
  const host = ts.createCompilerHost({})
  host.readFile = (fileName) => {
    if (fileName.includes('typescript/lib/')) {
      return fs.readFileSync(fileName, 'utf-8')
    }
    if (Object.hasOwnProperty.call(files, fileName)) {
      return files[fileName]
    }
    return ''
  }
  host.fileExists = (filePath) => Object.hasOwnProperty.call(files, filePath)
  host.getCurrentDirectory = () => '/'

  return ts.createProgram(['/main.ts'], {}, host)
}

function generateDocumentation(checker: ts.TypeChecker, sourceFile: ts.SourceFile): void {
  const exportSymbols = getExportedSymbols(checker, sourceFile)
  for (const symbol of exportSymbols) {
    const s = resolveAliasedSymbol(checker, symbol)
    serializeSymbol(s)
  }

  return

  function serializeSymbol(symbol: ts.Symbol) {
    const type = checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration!))

    if (symbol.flags & ts.SymbolFlags.TypeAlias) {
      console.log(symbol.getName())
      console.log(ts.SyntaxKind[symbol.declarations![0].kind])
      // console.log(symbol.declarations?.map((d) => d.getText()))
    }

    return {
      name: symbol.getName(),
      documentation: ts.displayPartsToString(symbol.getDocumentationComment(checker)),
      flags: formatFlags(symbol.flags),
      type: checker.typeToString(type),
      members:
        symbol.members &&
        Array.from(symbol.members, ([key, value]) => serializeSymbol(resolveAliasedSymbol(checker, value))),
    }
  }
}

function formatFlags(flags: number) {
  let result = ''
  let i = 0
  while (flags > 0) {
    if (flags & 1) {
      if (result) {
        result += ' | '
      }
      result += ts.SymbolFlags[2 ** i]
    }
    flags >>= 1
    i++
  }

  return result
}

function resolveAliasedSymbol(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol {
  const seen = new Set<ts.Symbol>()
  // eslint-disable-next-line no-bitwise
  while (ts.SymbolFlags.Alias & symbol.flags) {
    symbol = checker.getAliasedSymbol(symbol)

    // #2438, with declaration files, we might have an aliased symbol which eventually points to itself.
    if (seen.has(symbol)) {
      return symbol
    }
    seen.add(symbol)
  }
  return symbol
}

main()

function getExportedSymbols(checker: ts.TypeChecker, sourceFile: ts.SourceFile) {
  return checker.getExportsOfModule(checker.getSymbolAtLocation(sourceFile)!)
}
