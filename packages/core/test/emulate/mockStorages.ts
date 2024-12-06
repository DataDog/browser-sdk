export interface MockStorage {
  getSpy: jasmine.Spy
  setSpy: jasmine.Spy
  currentValue: (key: string) => string
  setCurrentValue: (key: string, value: string) => void
}

export function mockCookie(cookie: string = ''): MockStorage {
  return {
    getSpy: spyOnProperty(document, 'cookie', 'get').and.callFake(() => cookie),
    setSpy: spyOnProperty(document, 'cookie', 'set').and.callFake((newCookie) => (cookie = newCookie)),
    currentValue: () => cookie,
    setCurrentValue: (key, newCookie) => (cookie = `${key}=${newCookie}`),
  }
}

export function mockLocalStorage(): MockStorage {
  const store: Record<string, string> = {}
  spyOn(Storage.prototype, 'removeItem').and.callFake((key) => {
    delete store[key]
  })

  return {
    getSpy: spyOn(Storage.prototype, 'getItem').and.callFake((key) => store[key] || null),
    setSpy: spyOn(Storage.prototype, 'setItem').and.callFake((key, newValue) => (store[key] = newValue)),
    currentValue: (key) => store[key],
    setCurrentValue: (key, newValue) => (store[key] = newValue),
  }
}
