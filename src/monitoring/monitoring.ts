import { HttpTransport } from "../core/httpTransport";

export class Monitoring {
  constructor(private monitoringTransport: HttpTransport) {}

  decorate(fn: any) {
    const self = this; // tslint:disable-line no-this-assignment
    return function(this: any) {
      try {
        return fn.apply(this, arguments);
      } catch (e) {
        try {
          self.monitoringTransport.send({ message: e.message });
        } catch {
          // nothing to do
        }
      }
    };
  }
}
