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

  it("should send log to logs endpoint", () => {
    const server = sinon.fakeServer.create();

    window.Datadog.log("message", { foo: "bar" }, "severity");

    expect(server.requests.length).to.equal(1);
    expect(server.requests[0].url).to.contain(configuration.logsEndpoint);
    expect(server.requests[0].url).to.contain(configuration.publicAPIKey);
    expect(server.requests[0].requestBody).to.equal('{"message":"message","severity":"severity","foo":"bar"}');

    server.restore();
  });

  ["trace", "debug", "info", "warn", "error"].forEach(method => {
    it(`should send ${method} to logs endpoint`, () => {
      const server = sinon.fakeServer.create();

      (window.Datadog as any)[method]("message");

      expect(server.requests.length).to.equal(1);
      expect(server.requests[0].url).to.contain(configuration.logsEndpoint);
      expect(server.requests[0].url).to.contain(configuration.publicAPIKey);
      expect(server.requests[0].requestBody).to.equal(`{"message":"message","severity":"${method}"}`);

      server.restore();
    });
  });
});
