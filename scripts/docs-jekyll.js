const fs = require('fs')
const path = require('path')
const { globSync } = require('glob')

const DOCS_DIR = path.join(__dirname, '..', 'docs')
let navOrder = 1

function titleFromContent(content, fallback) {
  const m = content.match(/^#{1,2}\s+(.+)$/m)
  return m ? m[1].replace(/[<>]/g, '') : fallback
}

function addJekyllFrontMatter(content, filename) {
  const title = titleFromContent(content, path.basename(filename, '.md'))
  return `---
layout: default
title: "${title}"
nav_order: ${navOrder++}
permalink: /${filename.replace('.md', '.html')}
---

${content}`
}

function cleanMarkdownForJekyll(md) {
  return md
    .replace(/[“”]/g, '"')
    .replace(/_\(Optional\)_/g, '(Optional)')
    .replace(/\[([^\]]+)]\(\s*(https?:\/\/[^\s)]+?)\s*\)/g, (_, label, rawUrl) => {
      const url = rawUrl.replace(/\\([)#])/g, '$1')
      return `<a href="${encodeURI(url)}" target="_blank" rel="noopener">${label}</a>`
    })
    .replace(
      /\[([^\]]+)]\(\s*(?:\{\{\s*["']?\/([^"')]+\.html)["']?\s*\|\s*relative_url\s*}}|\/([^)]+\.html)|\.\/([^)]+?)(?:\.md|\.html))\s*\)/g,
      (_, txt, f1, f2, f3) => {
        const file = (f1 || f2 || f3).replace(/\.md$/, '.html')
        return `<a href="{{ "/${file}" | relative_url }}">${txt}</a>`
      }
    )
    .replace(/\\([_*`\\<>])/g, '$1')
    .replace(/\\\|/g, '|')
}

function processDocFile(file) {
  let content = fs.readFileSync(file, 'utf8')
  content = cleanMarkdownForJekyll(content)
  content = addJekyllFrontMatter(content, path.basename(file))
  fs.writeFileSync(file, content, 'utf8')
}

function runMain() {
  const files = globSync(`${DOCS_DIR}/*.md`)
  files.forEach(processDocFile)
}

if (require.main === module) {
  runMain()
}
module.exports = { addJekyllFrontMatter, cleanMarkdownForJekyll }
