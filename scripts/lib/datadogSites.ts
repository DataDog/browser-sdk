export const siteByDatacenter = {
  us1: 'datadoghq.com',
  eu1: 'datadoghq.eu',
  us3: 'us3.datadoghq.com',
  us5: 'us5.datadoghq.com',
  ap1: 'ap1.datadoghq.com',
  ap2: 'ap2.datadoghq.com',
} as const

export type Datacenter = keyof typeof siteByDatacenter
export type Site = (typeof siteByDatacenter)[Datacenter]
