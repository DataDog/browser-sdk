const fs = require('fs')
const path = require('path')
const { globSync } = require('glob')

function fixTypeBackslashes(content) {
  return content.replace(/\\\|/g, '|')
}

function fixArrayTypes(content) {
  return content.replace(/(\w+)\\\[\\]/g, '$1[]')
}

function fixOptionalFormatting(content) {
  return content.replace(/_\(Optional\)_/g, '(Optional)')
}

function convertMarkdownLinks(content) {
  return content.replace(/\[([^\]]+)]\(([^)]+)\)/g, (_match, text, url) => {
    let newUrl = url
    if (url.endsWith('.md')) {
      newUrl = url.replace(/\.md$/, '.html')
    }
    return `<a href="${newUrl}">${text}</a>`
  })
}

function fixHtmlEntities(content) {
  content = content.replace(/&gt;/g, '>')
  content = content.replace(/&lt;/g, '<')
  content = content.replace(/&amp;/g, '&')
  content = content.replace(/&quot;/g, '"')

  content = content.replace(/=&gt;/g, '=>')

  return content
}

function removeEmptyHtmlComments(content) {
  return content.replace(/<!--\s*-->/g, '')
}

function fixHtmlTables(content) {
  const lines = content.split('\n')
  const fixedLines = []
  let inTable = false
  let currentRow = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    if (line.includes('<table>')) {
      inTable = true
      fixedLines.push(lines[i])
      continue
    }

    if (line === '</tbody></table>' || line === '</table>') {
      if (currentRow.length > 0) {
        fixedLines.push(`${currentRow.join(' ')}</td></tr>`)
        currentRow = []
      }
      fixedLines.push(lines[i])
      inTable = false
      continue
    }

    if (inTable) {
      if (
        line === '</td></tr>' ||
        line === '</tbody>' ||
        line === '</th></tr></thead>' ||
        line === '</thead>' ||
        line === '</tr>'
      ) {
        continue
      }

      if (line.startsWith('<tr>') || line.includes('<tbody><tr>') || line.includes('<thead><tr>')) {
        if (currentRow.length > 0) {
          fixedLines.push(`${currentRow.join(' ')}</td></tr>`)
          currentRow = []
        }
        fixedLines.push(lines[i])
      } else if (line.startsWith('<td>') || line.startsWith('<th>')) {
        currentRow.push(lines[i])
      } else if (currentRow.length > 0) {
        currentRow[currentRow.length - 1] += ` ${lines[i]}`
      } else {
        fixedLines.push(lines[i])
      }
    } else {
      fixedLines.push(lines[i])
    }
  }

  if (currentRow.length > 0) {
    fixedLines.push(`${currentRow.join(' ')}</td></tr>`)
  }

  return fixedLines.join('\n')
}

function cleanupSpacing(content) {
  content = content.replace(/ {2,}/g, ' ')

  content = content.replace(/\n{3,}/g, '\n\n')

  return content
}

function fixEscapedTags(content) {
  content = content.replace(/\\<a href=/g, '<a href=')
  content = content.replace(/\\<\/a>/g, '</a>')

  return content
}

function fixBackslashes(content) {
  content = content.replace(/\\_/g, '_')
  content = content.replace(/\\#/g, '#')

  content = content.replace(/\\\[/g, '[')
  content = content.replace(/\\\]/g, ']')

  return content
}

function processDocFile(file) {
  let content = fs.readFileSync(file, 'utf8')

  content = fixTypeBackslashes(content)
  content = fixArrayTypes(content)
  content = fixOptionalFormatting(content)
  content = convertMarkdownLinks(content)
  content = fixHtmlEntities(content)
  content = removeEmptyHtmlComments(content)
  content = fixEscapedTags(content)
  content = fixBackslashes(content)
  content = fixHtmlTables(content)
  content = cleanupSpacing(content)

  fs.writeFileSync(file, content, 'utf8')
}

function runMain() {
  const docsDir = path.join(__dirname, '..', 'docs')
  const docFiles = globSync(`${docsDir}/*.md`)

  for (const file of docFiles) {
    try {
      processDocFile(file)
    } catch (error) {
      console.error(`Error processing ${file}:`, error.message)
    }
  }
}

if (require.main === module) {
  runMain()
}
