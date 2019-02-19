import { expect, use } from "chai";
import * as sinon from "sinon";
import * as sinonChai from "sinon-chai";
import { startConsoleTracking, stopConsoleTracking } from "../consoleTracker";

use(sinonChai);

describe("console tracker", () => {
  let consoleErrorStub: sinon.SinonStub;
  let logger: any;
  beforeEach(() => {
    logger = {
      error: () => ({})
    };
    consoleErrorStub = sinon.stub(console, "error");
    consoleErrorStub.returnsThis();
    sinon.spy(logger, "error");
    startConsoleTracking(logger);
  });

  afterEach(() => {
    stopConsoleTracking();
    sinon.restore();
  });

  it("should keep original behavior", () => {
    console.error("foo", "bar");
    expect(consoleErrorStub).to.have.been.calledWithExactly("foo", "bar");
  });

  it("should log error", () => {
    console.error("foo", "bar");
    expect(logger.error).to.have.been.calledWithExactly("foo bar");
  });
});
