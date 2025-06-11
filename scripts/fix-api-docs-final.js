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

function processDocFile(file) {
  console.log(`Processing: ${file}`)

  let content = fs.readFileSync(file, 'utf8')

  content = fixTypeBackslashes(content)
  content = fixArrayTypes(content)
  content = fixOptionalFormatting(content)
  content = convertMarkdownLinks(content)

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
