const fs = require('fs')
const path = require('path')

function fixMarkdownLinks(content) {
  // Remplacer les tables HTML complexes par des tables markdown simples
  // ou convertir les liens markdown en HTML dans les cellules

  // Pattern pour trouver les liens markdown [text](url)
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g

  // Remplacer les liens dans les cellules de table
  content = content.replace(/<td>\s*\n*\s*\[([^\]]+)\]\(([^)]+)\)\s*\n*\s*<\/td>/g, (_match, text, url) => {
    // Corriger l'URL si nécessaire
    let fixedUrl = url
    if (url.startsWith('./')) {
      fixedUrl = url.substring(2)
    }
    if (fixedUrl.endsWith('.md')) {
      fixedUrl = fixedUrl.replace('.md', '.html')
    }

    return `<td><a href="${fixedUrl}">${text}</a></td>`
  })

  // Gérer les cas où il y a du texte supplémentaire dans les cellules
  content = content.replace(/<td>([\s\S]*?)<\/td>/g, (_match, cellContent) => {
    const fixedContent = cellContent.replace(linkPattern, (_linkMatch, text, url) => {
      let fixedUrl = url
      if (url.startsWith('./')) {
        fixedUrl = url.substring(2)
      }
      if (fixedUrl.endsWith('.md')) {
        fixedUrl = fixedUrl.replace('.md', '.html')
      }
      return `<a href="${fixedUrl}">${text}</a>`
    })
    return `<td>${fixedContent}</td>`
  })

  // Corriger aussi les liens en dehors des tables
  content = content.replace(/\[Home\]\(\.\/(index\.md)\)/g, '[Home](index.html)')
  content = content.replace(/&gt; \[([^\]]+)\]\(\.\/([^)]+)\.md\)/g, '&gt; <a href="$2.html">$1</a>')

  return content
}

function processDirectory(dirPath) {
  const files = fs.readdirSync(dirPath)

  files.forEach((file) => {
    const filePath = path.join(dirPath, file)
    const stat = fs.statSync(filePath)

    if (stat.isDirectory() && !file.startsWith('_') && file !== '.git') {
      processDirectory(filePath)
    } else if (stat.isFile() && file.endsWith('.md') && file !== 'README.md') {
      console.log(`Processing: ${filePath}`)

      let content = fs.readFileSync(filePath, 'utf-8')
      const fixedContent = fixMarkdownLinks(content)

      if (content !== fixedContent) {
        fs.writeFileSync(filePath, fixedContent, 'utf-8')
        console.log(`  ✓ Fixed links in ${file}`)
      }
    }
  })
}

function runMain() {
  // Traiter le dossier docs
  const docsPath = path.join(__dirname, '..', 'docs')
  if (fs.existsSync(docsPath)) {
    console.log('Fixing API documentation links...')
    processDirectory(docsPath)
    console.log('Done!')
  } else {
    console.error('Error: docs directory not found')
    process.exit(1)
  }
}

runMain()
