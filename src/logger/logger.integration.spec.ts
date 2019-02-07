import { expect } from "chai";
import * as sinon from "sinon";
import { loggerModule } from "./logger.module";

describe("logger module", () => {
  const configuration = {
    logsEndpoint: "https://localhost/log",
    publicAPIKey: "123"
  };

  beforeEach(() => {
    loggerModule(configuration);
  });

  it("should send log data to log endpoint", () => {
    const server = sinon.fakeServer.create();

    window.Datadog.log("foo");

    expect(server.requests.length).to.equal(1);
    expect(server.requests[0].url).to.contain(configuration.logsEndpoint);
    expect(server.requests[0].url).to.contain(configuration.publicAPIKey);
    expect(server.requests[0].requestBody).to.equal("foo");

    server.restore();
  });
});
