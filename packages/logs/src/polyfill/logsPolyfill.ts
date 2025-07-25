
// Simple XMLHttpRequest polyfill using fetch for Service Workers
function createXMLHttpRequestPolyfill() {
  return class XMLHttpRequest {
    public readyState: number = 0
    public status: number = 0
    public statusText: string = ''
    public responseText: string = ''
    public response: any = ''
    public responseType: string = ''
    public onreadystatechange: ((this: XMLHttpRequest, ev: Event) => any) | null = null
    public onerror: ((this: XMLHttpRequest, ev: ErrorEvent) => any) | null = null
    public onload: ((this: XMLHttpRequest, ev: ProgressEvent) => any) | null = null

    private _method: string = 'GET'
    private _url: string = ''
    private _headers: Record<string, string> = {}

    open(method: string, url: string): void {
      this._method = method
      this._url = url
      this.readyState = 1
      this._dispatchEvent('readystatechange')
    }

    setRequestHeader(name: string, value: string): void {
      this._headers[name] = value
    }

    send(body?: string | null): void {
      this.readyState = 2
      this._dispatchEvent('readystatechange')

      // Use fetch to make the actual request
      fetch(this._url, {
        method: this._method,
        headers: this._headers,
        body: body || undefined,
      })
        .then((response) => {
          this.status = response.status
          this.statusText = response.statusText
          this.readyState = 4

          return response.text()
        })
        .then((text) => {
          this.responseText = text
          this.response = text
          this._dispatchEvent('readystatechange')
          this._dispatchEvent('load')
        })
        .catch((error) => {
          this.readyState = 4
          this._dispatchEvent('error')
        })
    }

    private _dispatchEvent(type: string): void {
      if (type === 'readystatechange' && this.onreadystatechange) {
        this.onreadystatechange.call(this, new Event(type))
      } else if (type === 'load' && this.onload) {
        this.onload.call(this, new ProgressEvent(type))
      } else if (type === 'error' && this.onerror) {
        this.onerror.call(this, new ErrorEvent(type))
      }
    }
  }
}

export function initServiceWorkerPolyfillIfNeeded(): void {
  if (
    typeof window === 'undefined' &&
    typeof document === 'undefined' &&
    typeof (globalThis as any).importScripts === 'function'
  ) {
    try {
      // Polyfill document object
      ;(globalThis as any).document = {
        referrer: `chrome-extension://`,
        readyState: 'complete',
        get cookie() {
          return ''
        },
        set cookie(value: string) {
          // No-op
        },
        location: {
          referrer: `chrome-extension://`,
          href: `chrome-extension://`,
          hostname: `chrome-extension://`,
        },
        visibilityState: 'visible',
        hidden: false,
        getElementsByTagName: () => [],
        addEventListener: () => {},
        removeEventListener: () => {},
      }

      // Polyfill window object
      ;(globalThis as any).window = {
        location: {
          href: `chrome-extension://`,
          hostname: `chrome-extension://`,
          origin: `chrome-extension://`,
          protocol: 'chrome-extension:',
        },
        fetch: self.fetch.bind(self),
        TextEncoder: self.TextEncoder,
        Request: self.Request,
        addEventListener: () => {},
        removeEventListener: () => {},
        navigator: self.navigator,
        XMLHttpRequest: createXMLHttpRequestPolyfill(),
        // Simple localStorage fallback (memory-only)
        localStorage: {
          _data: {} as Record<string, string>,
          get length() { return Object.keys(this._data).length },
          key(index: number) { return Object.keys(this._data)[index] || null },
          getItem(key: string) { return this._data[key] || null },
          setItem(key: string, value: string) { this._data[key] = String(value) },
          removeItem(key: string) { delete this._data[key] },
          clear() { this._data = {} }
        }
      }

      // Add XMLHttpRequest to global scope directly (not just window)
      if (typeof XMLHttpRequest === 'undefined') {
        ;(globalThis as any).XMLHttpRequest = createXMLHttpRequestPolyfill()
      }

      // Polyfill performance and timing
      if (!globalThis.performance) {
        ;(globalThis as any).performance = self.performance
      }

      if (!globalThis.performance.timing) {
        const startTime = Date.now() - (globalThis.performance.now ? globalThis.performance.now() : 0)
        ;(globalThis as any).performance.timing = {
          navigationStart: startTime,
        }
      }  
    } catch (error) {
      // Graceful fallback - don't break Service Worker initialization
      console.warn('[DD] Service Worker polyfill initialization failed:', error)
    }
  }
}
