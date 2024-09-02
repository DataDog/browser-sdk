import { buildUrl } from '../../src'

export function mockLocation(initialUrl: string) {
  const fakeLocation = buildLocation(initialUrl)
  spyOn(History.prototype, 'pushState').and.callFake((_: any, __: string, pathname: string) => {
    assign(fakeLocation, buildLocation(pathname, fakeLocation.href))
  })

  function hashchangeCallBack() {
    fakeLocation.hash = window.location.hash
    fakeLocation.href = fakeLocation.href.replace(/#.*/, '') + window.location.hash
  }

  window.addEventListener('hashchange', hashchangeCallBack)
  return {
    location: fakeLocation,
    cleanup: () => {
      window.removeEventListener('hashchange', hashchangeCallBack)
      window.location.hash = ''
    },
  }
}

export function buildLocation(url: string, base = location.href) {
  const urlObject = buildUrl(url, base)
  return {
    hash: urlObject.hash,
    href: urlObject.href,
    pathname: urlObject.pathname,
    search: urlObject.search,
  } as Location
}
