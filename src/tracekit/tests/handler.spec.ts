import { expect } from "chai";
import * as sinon from "sinon";
import { isIE } from "../../tests/browserHelper";
import { report, StackFrame, wrap } from "../tracekit";

describe("Handler", () => {
  beforeEach(function() {
    if (isIE(9)) {
      this.skip();
    }
  });

  it("it should not go into an infinite loop", done => {
    const stacks = [];

    function handler(stackInfo: StackFrame) {
      stacks.push(stackInfo);
    }

    function throwException() {
      throw new Error("Boom!");
    }

    report.subscribe(handler);
    expect(() => wrap(throwException)()).to.throw();

    setTimeout(() => {
      report.unsubscribe(handler);
      expect(stacks.length).to.equal(1);
      done();
    }, 1000);
  });

  it("should get extra arguments (isWindowError and exception)", done => {
    const handler = sinon.fake();

    const exception = new Error("Boom!");

    function throwException() {
      throw exception;
    }

    report.subscribe(handler);
    expect(() => wrap(throwException)()).to.throw();

    setTimeout(() => {
      report.unsubscribe(handler);

      expect(handler.callCount).to.equal(1);

      const isWindowError = handler.lastCall.args[1];
      expect(isWindowError).to.equal(false);

      const e = handler.lastCall.args[2];
      expect(e).to.equal(exception);

      done();
    }, 1000);
  });
});
