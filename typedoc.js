/* eslint-disable no-undef */
;(function (h, o, u, n, d) {
  h = h[d] = h[d] || {
    q: [],
    onReady(c) {
      h.q.push(c)
    },
  }
  d = o.createElement(u)
  d.async = 1
  d.src = n
  n = o.getElementsByTagName(u)[0]
  n.parentNode.insertBefore(d, n)
})(window, document, 'script', 'https://www.datadoghq-browser-agent.com/us1/v6/datadog-rum.js', 'DD_RUM')
window.DD_RUM.onReady(function () {
  window.DD_RUM.init({
    clientToken: 'pubfdd257fb4cbeb6508cc003dc43311ab8',
    applicationId: 'cc47640f-067a-457a-8940-d742a13a9eb7',
    // `site` refers to the Datadog site parameter of your organization
    // see https://docs.datadoghq.com/getting_started/site/
    site: 'datadoghq.com',
    service: 'browser-sdk-api-documentation',
    env: location.origin.includes('datadoghq.dev') ? 'prod' : 'dev',
    // Specify a version number to identify the deployed version of your application in Datadog
    // version: '1.0.0',
    sessionSampleRate: 100,
    sessionReplaySampleRate: 20,
    trackBfcacheViews: true,
    defaultPrivacyLevel: 'mask-user-input',
  })
})
