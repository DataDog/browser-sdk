module.exports = {
  compare,
  markdownArray,
}

function compare(baseResults, localResults) {
  return baseResults.map((baseResult) => {
    let localResult = null

    if (Array.isArray(localResults)) {
      const localResultObj = localResults.find((result) => result.name === baseResult.name)
      localResult = localResultObj ? localResultObj.value : null
    } else {
      localResult = localResults[baseResult.name]
    }

    let change = null
    let percentageChange = null

    if (baseResult.value && localResult) {
      change = localResult - baseResult.value
      percentageChange = ((change / baseResult.value) * 100).toFixed(2)
    } else if (localResult) {
      change = localResult
      percentageChange = 'N/A'
    }

    return {
      name: baseResult.name,
      change,
      percentageChange,
    }
  })
}

function markdownArray({ headers, rows }) {
  let markdown = `| ${headers.join(' | ')} |\n| ${new Array(headers.length).fill('---').join(' | ')} |\n`
  rows.forEach((row) => {
    markdown += `| ${row.join(' | ')} |\n`
  })
  return markdown
}
