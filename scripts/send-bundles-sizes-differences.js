const { runMain, fetch } = require('./lib/execution-utils')

// const budget : [
//     {
//         name : 'bundles_sizes_rum',
//         queries : ''
//     },
//     {
//         name : 'bundles_sizes_logs',
//         queries : ''
//     },
//     {
//         name : 'bundles_sizes_rum_slim',
//         queries : ''
//     },
//     {
//         name : 'bundles_sizes_worker',
//         queries : ''
//     }
// ]

runMain(async () => {
  await addComment(12312)
})

async function addComment(prNumber) {
  await fetch(`https://api.github.com/repos/DataDog/browser-sdk/pulls/${prNumber}/comments`, {
    method: 'POST',
    headers: {
      Authorization: `token ${this.token}`,
      'Content-Type': 'application/json',
    },
    body: 'Hello World',
  })
}
