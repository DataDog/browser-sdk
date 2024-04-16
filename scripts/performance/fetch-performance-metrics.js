const { getOrg2ApiKey, getOrg2AppKey } = require('../lib/secrets')
const { fetchHandlingError } = require('../lib/execution-utils')
const ONE_DAY_IN_SECOND = 24 * 60 * 60

function fetchPerformanceMetrics(type, names, commitId) {
  return Promise.all(names.map((name) => fetchMetric(type, name, commitId)))
}

async function fetchMetric(type, name, commitId) {
  const now = Math.floor(Date.now() / 1000)
  const date = now - 30 * ONE_DAY_IN_SECOND
  let query = ''

  if (type === 'bundle') {
    query = `avg:bundle_sizes.${name}{commit:${commitId}}&from=${date}&to=${now}`
  } else if (type === 'cpu') {
    query = `avg:cpu.sdk.${name}.performance.average{commitid:${commitId}}&from=${date}&to=${now}`
  }

  const response = await fetchHandlingError(`https://api.datadoghq.com/api/v1/query?query=${query}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'DD-API-KEY': getOrg2ApiKey(),
      'DD-APPLICATION-KEY': getOrg2AppKey(),
    },
  })
  const data = await response.json()
  if (data.series && data.series.length > 0 && data.series[0].pointlist && data.series[0].pointlist.length > 0) {
    return {
      name,
      value: data.series[0].pointlist[0][1],
    }
  }
  return {
    name,
    value: null,
  }
}

module.exports = {
  fetchPerformanceMetrics,
}
