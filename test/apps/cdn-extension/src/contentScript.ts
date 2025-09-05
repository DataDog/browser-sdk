export {}

declare const DD_RUM_URL: string

interface RumGlobal {
  q: Array<() => void>
  onReady: (cb: () => void) => void
  init: (config: { applicationId: string; clientToken: string; proxy: string }) => void
}

declare global {
  interface Window {
    DD_RUM: RumGlobal
  }
}

function loadRum() {
  ;(function (hWindow: any, o: Document, u: string, n: string, d: string) {
    const h: RumGlobal = (hWindow[d] = hWindow[d] || {
      q: [],
      onReady(c: () => void) {
        h.q.push(c)
      },
    })
    const scriptEl = o.createElement(u) as HTMLScriptElement
    scriptEl.src = n
    scriptEl.onload = () => {
      window.DD_RUM.init({
        applicationId: '37fe52bf-b3d5-4ac7-ad9b-44882d479ec8',
        clientToken: 'pubf2099de38f9c85797d20d64c7d632a69',
        proxy: (window as any).DD_PROXY_URL,
      })
    }
    const firstScript = o.getElementsByTagName(u)[0]
    firstScript.parentNode!.insertBefore(scriptEl, firstScript)
  })(window, document, 'script', DD_RUM_URL, 'DD_RUM')
}

const interval = setInterval(() => {
  if (window.DD_RUM) {
    window.DD_RUM.onReady(() => {
      loadRum()
      clearInterval(interval)
    })
  }
}, 500)
