const { runMain, fetch } = require('./lib/execution-utils')
const message = {
  body: 'Ceci est un commentaire de test.',
}

runMain(async () => {
  await addComment(12612)
})

async function addComment(prNumber) {
  await fetch(`https://api.github.com/repos/DataDog/browser-sdk/issues/${prNumber}/comments`, {
    method: 'POST',
    headers: {
      Authorization: `token ${process.env.GITHUB_TOKEN}`,
    },
    body: JSON.stringify(message),
  })
}
