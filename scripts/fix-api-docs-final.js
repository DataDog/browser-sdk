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
  return content
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
