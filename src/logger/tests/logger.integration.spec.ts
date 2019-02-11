import { expect } from "chai";
import * as sinon from "sinon";
import { Configuration } from "../../core/configuration";
import { loggerModule } from "../logger.module";
import { LOG_LEVELS } from "../logLevel";

describe("logger module", () => {
  const configuration = {
    logsEndpoint: "https://localhost/log"
  };

  beforeEach(() => {
    loggerModule(configuration as Configuration);
  });

  it("should send log to logs endpoint", () => {
    const server = sinon.fakeServer.create();

    window.Datadog.log("message", { foo: "bar" }, "severity");

    expect(server.requests.length).to.equal(1);
    expect(server.requests[0].url).to.equal(configuration.logsEndpoint);

    expect(JSON.parse(server.requests[0].requestBody)).to.deep.equal({
      message: "message",
      severity: "severity",
      foo: "bar", // tslint:disable-line object-literal-sort-keys
      http: {
        url: window.location.href,
        useragent: navigator.userAgent
      }
    });

    server.restore();
  });

  LOG_LEVELS.forEach(logLevel => {
    it(`should send ${logLevel} to logs endpoint`, () => {
      const server = sinon.fakeServer.create();

      (window.Datadog as any)[logLevel]("message");

      expect(server.requests.length).to.equal(1);
      expect(server.requests[0].url).to.equal(configuration.logsEndpoint);

      expect(JSON.parse(server.requests[0].requestBody)).to.deep.equal({
        message: "message",
        severity: logLevel,
        // tslint:disable-next-line object-literal-sort-keys
        http: {
          url: window.location.href,
          useragent: navigator.userAgent
        }
      });

      server.restore();
    });
  });
});
