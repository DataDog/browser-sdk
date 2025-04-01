export type NetworkInterface = 'bluetooth' | 'cellular' | 'ethernet' | 'none' | 'wifi' | 'wimax' | 'other' | 'unknown'
export type EffectiveType = 'slow-2g' | '2g' | '3g' | '4g'

interface BrowserNavigator extends Navigator {
  connection?: NetworkInformation
}

export interface NetworkInformation {
  type?: NetworkInterface
  effectiveType?: EffectiveType
  saveData: boolean
}

export interface Connectivity {
  status: 'connected' | 'not_connected' | 'maybe'
  interfaces?: NetworkInterface[]
  effective_type?: EffectiveType
  [key: string]: unknown
}

export function getConnectivity(): Connectivity {
  const isServiceWorker = typeof self !== 'undefined' && 'ServiceWorkerGlobalScope' in self;
  
  const isBrowser = typeof window !== 'undefined';
  
  if (!isBrowser && !isServiceWorker) {
    return {
      status: 'not_connected',
    };
  }

  const globalNav = isServiceWorker ? self.navigator : window.navigator;
  
  const navigator = globalNav as BrowserNavigator;
  
  if (!navigator) {
    return {
      status: 'not_connected',
    };
  }

  return {
    status: navigator.onLine ? 'connected' : 'not_connected',
    interfaces: navigator.connection && navigator.connection.type ? [navigator.connection.type] : undefined,
    effective_type: navigator.connection?.effectiveType,
  };
}
