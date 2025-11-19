export const siteByDatacenter: Record<string, string> = {
  us1: 'datadoghq.com',
  eu1: 'datadoghq.eu',
  us3: 'us3.datadoghq.com',
  us5: 'us5.datadoghq.com',
  ap1: 'ap1.datadoghq.com',
  ap2: 'ap2.datadoghq.com',
  prtest00: 'prtest00.datad0g.com',
}

/**
 * Each datacenter has 3 monitor IDs:
 * - Telemetry errors
 * - Telemetry errors on specific org
 * - Telemetry errors on specific message
 */
export const monitorIdsByDatacenter: Record<string, [number, number, number]> = {
  us1: [72055549, 68975047, 110519972],
  eu1: [5855803, 5663834, 9896387],
  us3: [164368, 160677, 329066],
  us5: [22388, 20646, 96049],
  ap1: [858, 859, 2757030],
  ap2: [1234, 1235, 1236],
}
