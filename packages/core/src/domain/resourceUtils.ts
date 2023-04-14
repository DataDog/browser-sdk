export const enum ResourceType {
  DOCUMENT = 'document',
  XHR = 'xhr',
  BEACON = 'beacon',
  FETCH = 'fetch',
  CSS = 'css',
  JS = 'js',
  IMAGE = 'image',
  FONT = 'font',
  MEDIA = 'media',
  OTHER = 'other',
}

export const enum RequestType {
  FETCH = ResourceType.FETCH,
  XHR = ResourceType.XHR,
}
