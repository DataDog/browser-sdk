import { expect, use } from "chai";
import * as sinon from "sinon";
import * as sinonChai from "sinon-chai";
import { startRuntimeErrorTracking, stopRuntimeErrorTracking } from "../runtimeErrorTracker";

use(sinonChai);

describe("runtime error tracker", () => {
  let mochaHandler: ErrorEventHandler;
  let logger: any;
  let onerrorSpy: sinon.SinonSpy;

  beforeEach(() => {
    mochaHandler = window.onerror;
    onerrorSpy = sinon.spy(() => ({}));
    window.onerror = onerrorSpy;
    logger = {
      // ensure that we log test error while mocha handler is disabled
      error: (message: string) => (message.indexOf("foo") === -1 ? console.error(message) : undefined)
    };
    sinon.spy(logger, "error");
    startRuntimeErrorTracking(logger);
  });

  afterEach(() => {
    stopRuntimeErrorTracking();
    sinon.restore();
    window.onerror = mochaHandler;
  });

  it("should log error", done => {
    setTimeout(() => {
      throw new Error("foo");
    }, 10);

    setTimeout(() => {
      expect(logger.error.called).to.equal(true);
      done();
    }, 100);
  });

  it("should call original error handler", done => {
    setTimeout(() => {
      throw new Error("foo");
    }, 10);

    setTimeout(() => {
      expect(onerrorSpy.called).to.equal(true);
      done();
    }, 100);
  });
});
