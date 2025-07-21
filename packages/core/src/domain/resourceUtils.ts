export const ResourceType = {
  DOCUMENT: 'document',
  XHR: 'xhr',
  BEACON: 'beacon',
  FETCH: 'fetch',
  CSS: 'css',
  JS: 'js',
  IMAGE: 'image',
  FONT: 'font',
  MEDIA: 'media',
  OTHER: 'other',
} as const

export type ResourceType = (typeof ResourceType)[keyof typeof ResourceType]

export const RequestType = {
  FETCH: ResourceType.FETCH,
  XHR: ResourceType.XHR,
} as const

export type RequestType = (typeof RequestType)[keyof typeof RequestType]
