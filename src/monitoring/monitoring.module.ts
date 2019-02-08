import { Configuration } from "../core/configuration";
import { HttpTransport } from "../core/httpTransport";
import { Monitoring } from "./monitoring";

let monitoring: Monitoring | null = null;

export function monitoringModule(configuration: Configuration) {
  const transport = new HttpTransport(configuration.monitoringEndpoint);
  monitoring = new Monitoring(transport);
}

export function reset() {
  monitoring = null;
}

export function monitor(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  descriptor.value = function() {
    const decorated = !monitoring ? originalMethod : monitoring.decorate(originalMethod);
    decorated.apply(this, arguments);
  };
}
