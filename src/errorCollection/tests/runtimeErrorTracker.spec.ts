import { expect, use } from "chai";
import * as sinon from "sinon";
import * as sinonChai from "sinon-chai";
import { startRuntimeErrorTracking, stopRuntimeErrorTracking } from "../runtimeErrorTracker";

use(sinonChai);

describe("runtime error tracker", () => {
  const ERROR_MESSAGE = "foo";
  let mochaHandler: ErrorEventHandler;
  let logger: any;
  let onerrorSpy: sinon.SinonSpy;

  beforeEach(() => {
    mochaHandler = window.onerror;
    onerrorSpy = sinon.spy(() => ({}));
    window.onerror = onerrorSpy;

    logger = {
      // ensure that we call mocha handler for unexpected errors
      error: (message: string) => (message !== ERROR_MESSAGE ? mochaHandler(message) : undefined)
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
      throw new Error(ERROR_MESSAGE);
    }, 10);

    setTimeout(() => {
      expect(logger.error).to.have.been.calledWith(ERROR_MESSAGE);
      done();
    }, 100);
  });

  it("should call original error handler", done => {
    setTimeout(() => {
      throw new Error(ERROR_MESSAGE);
    }, 10);

    setTimeout(() => {
      expect(onerrorSpy).to.have.been.calledWith(`Uncaught Error: ${ERROR_MESSAGE}`);
      done();
    }, 100);
  });
});
