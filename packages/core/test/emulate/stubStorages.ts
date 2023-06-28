export interface StubStorage {
  getSpy: jasmine.Spy
  setSpy: jasmine.Spy
  currentValue: (key: string) => string
  setCurrentValue: (key: string, value: string) => void
}

export const stubCookieProvider = {
  get: (): StubStorage => {
    let cookie = ''
    return {
      getSpy: spyOnProperty(Document.prototype, 'cookie', 'get').and.callFake(() => cookie),
      setSpy: spyOnProperty(Document.prototype, 'cookie', 'set').and.callFake((newCookie) => (cookie = newCookie)),
      currentValue: () => cookie,
      setCurrentValue: (key, newCookie: string) => (cookie = `${key}=${newCookie}`),
    }
  },
}

export const stubLocalStorageProvider = {
  get: (): StubStorage => {
    const store: Record<string, string> = {}
    spyOn(Storage.prototype, 'removeItem').and.callFake((key) => {
      delete store[key]
    })
    return {
      getSpy: spyOn(Storage.prototype, 'getItem').and.callFake((key) => store[key] || null),
      setSpy: spyOn(Storage.prototype, 'setItem').and.callFake((key, newValue) => (store[key] = newValue)),
      currentValue: (key) => store[key],
      setCurrentValue: (key, newValue: string) => (store[key] = newValue),
    }
  },
}
