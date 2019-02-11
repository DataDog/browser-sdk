import { expect } from "chai";
import * as sinon from "sinon";
import { HttpTransport } from "../../core/httpTransport";
import { Monitoring } from "../monitoring";

describe("monitoring decorate", () => {
  let monitoring: Monitoring;
  let sendStub: sinon.SinonStub;
  const notThrowing = () => "result";
  const throwing = () => {
    throw new Error("error");
  };

  beforeEach(() => {
    const transport = {
      // tslint:disable-next-line no-empty
      send(_: string) {}
    };
    sendStub = sinon.stub(transport, "send");
    monitoring = new Monitoring(transport as HttpTransport);
  });

  it("should return decorated function result", () => {
    sendStub.returnsThis();

    const decorated = monitoring.decorate(notThrowing);

    expect(decorated()).to.equal("result");
    expect(sendStub.notCalled).to.equal(true);
  });

  it("should send decorated function exceptions", () => {
    sendStub.returnsThis();

    const decorated = monitoring.decorate(throwing);

    expect(decorated()).to.be.undefined;
    expect(sendStub.callCount).to.equal(1);
  });

  it("should swallow transport exceptions", () => {
    sendStub.throws();

    const decorated = monitoring.decorate(throwing);

    expect(() => decorated()).to.not.throw();
  });
});
