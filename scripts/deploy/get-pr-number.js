const { fetchPR, LOCAL_BRANCH } = require('../lib/git-utils')
const { runMain } = require('../lib/execution-utils')

runMain(async () => {
  const prNumber = await fetchPR(LOCAL_BRANCH)
  console.log(prNumber)
})
