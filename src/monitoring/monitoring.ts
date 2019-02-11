import { Configuration } from "../core/configuration";
import { HttpTransport } from "../core/httpTransport";

let transport: HttpTransport | undefined;

export function initMonitoring(configuration: Configuration) {
  transport = new HttpTransport(configuration.monitoringEndpoint);
}

export function resetMonitoring() {
  transport = undefined;
}

export function monitored(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  descriptor.value = function() {
    const decorated = !transport ? originalMethod : monitor(originalMethod);
    return decorated.apply(this, arguments);
  };
}

// tslint:disable-next-line ban-types
export function monitor(fn: Function) {
  return function(this: any) {
    try {
      return fn.apply(this, arguments);
    } catch (e) {
      try {
        if (transport !== undefined) {
          transport.send({ message: e.message });
        }
      } catch {
        // nothing to do
      }
    }
  };
}
