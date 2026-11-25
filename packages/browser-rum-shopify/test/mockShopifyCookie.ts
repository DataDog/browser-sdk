export function createFakeShopifyCookie() {
  const cookies = new Map<string, string>()
  const cookieStore = {
    get: jasmine.createSpy('get').and.callFake((name: string) => Promise.resolve(cookies.get(name) ?? '')),
    set: jasmine.createSpy('set').and.callFake((cookieString: string) => {
      const nameValue = cookieString.split(';')[0]
      const separatorIndex = nameValue.indexOf('=')
      const name = nameValue.slice(0, separatorIndex)
      const value = nameValue.slice(separatorIndex + 1)
      if (value) {
        cookies.set(name, value)
      } else {
        cookies.delete(name)
      }
      return Promise.resolve(cookieString)
    }),
  }
  return { cookies, cookieStore }
}
