export function stubCookie() {
  let cookie = ''
  return {
    getSpy: spyOnProperty(Document.prototype, 'cookie', 'get').and.callFake(() => cookie),
    setSpy: spyOnProperty(Document.prototype, 'cookie', 'set').and.callFake((newCookie) => {
      cookie = newCookie
    }),
    currentValue: () => cookie,
    setCurrentValue: (newCookie: string) => {
      cookie = newCookie
    },
  }
}
