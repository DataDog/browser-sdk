import { Configuration } from "../core/configuration";
import { getCommonContext } from "../core/context";
import { HttpTransport } from "../core/transport/httpTransport";
import { computeStackTrace } from "../tracekit/tracekit";

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
          transport.send({ ...computeStackTrace(e), ...getCommonContext() });
        }
      } catch {
        // nothing to do
      }
    }
  };
}
