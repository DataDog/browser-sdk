import { expect } from "chai";
import * as sinon from "sinon";
import { Configuration } from "../../core/configuration";
import { monitor, monitoringModule, reset } from "../monitoring.module";

class Candidate {
  notMonitored() {
    throw new Error("not monitored");
  }

  @monitor
  monitored() {
    throw new Error("monitored");
  }
}

describe("monitoring module", () => {
  const configuration = {
    monitoringEndpoint: "http://localhot/monitoring"
  };
  let candidate: Candidate;
  beforeEach(() => {
    candidate = new Candidate();
  });

  describe("before initialisation", () => {
    it("should not monitor", () => {
      expect(() => candidate.notMonitored()).to.throw("not monitored");
      expect(() => candidate.monitored()).to.throw("monitored");
    });
  });

  describe("after initialisation", () => {
    beforeEach(() => {
      monitoringModule(configuration as Configuration);
    });

    afterEach(() => {
      reset();
    });

    it("should catch error", () => {
      expect(() => candidate.notMonitored()).to.throw();
      expect(() => candidate.monitored()).to.not.throw();
    });

    it("should report error", () => {
      const server = sinon.fakeServer.create();

      candidate.monitored();

      expect(server.requests.length).to.equal(1);
      expect(server.requests[0].url).to.equal(configuration.monitoringEndpoint);
      expect(server.requests[0].requestBody).to.equal('{"message":"monitored"}');
      server.restore();
    });
  });
});
