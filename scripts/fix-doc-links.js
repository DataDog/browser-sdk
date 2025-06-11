const fs = require('fs')
const path = require('path')
const { globSync } = require('glob')

// Replace markdown links [text](url) with HTML <a href="url">text</a>
function convertLinks(markdown) {
  return markdown.replace(/\[([^\]]+)]\(([^)]+)\)/g, (_match, text, url) => `<a href="${url}">${text}</a>`)
}

function runMain() {
  const docsDir = path.join(__dirname, '..', 'docs')
  const files = globSync(`${docsDir}/**/*.md`, { nodir: true })
  files.forEach((file) => {
    const content = fs.readFileSync(file, 'utf8')
    const transformed = convertLinks(content)
    if (content !== transformed) {
      fs.writeFileSync(file, transformed, 'utf8')
    }
  })
  console.log(`Processed ${files.length} markdown files, converted markdown links to HTML <a> tags.`)
}

if (require.main === module) {
  runMain()
}
