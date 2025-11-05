type GlobalWithPublicApi = typeof globalThis & {
  DATADOG: Record<string, unknown>
}

export function definePublicApiGlobal(publicApi: unknown, namespace?: string) {
  const g = globalThis as GlobalWithPublicApi
  let object: any = g.DATADOG || (g.DATADOG = {})
  if (namespace) {
    object = object[namespace] || (object[namespace] = {})
  }
  Object.assign(object, publicApi)
}
