import { expect } from "chai";
import * as sinon from "sinon";
import { initMonitoring, monitor, monitored, resetMonitoring } from "../monitoring";

const configuration: any = {
  monitoringEndpoint: "http://localhot/monitoring"
};

describe("monitoring", () => {
  describe("decorator", () => {
    class Candidate {
      notMonitoredThrowing() {
        throw new Error("not monitored");
      }

      @monitored
      monitoredThrowing() {
        throw new Error("monitored");
      }

      @monitored
      monitoredNotThrowing() {
        return 1;
      }
    }

    let candidate: Candidate;
    beforeEach(() => {
      candidate = new Candidate();
    });

    describe("before initialisation", () => {
      it("should not monitor", () => {
        expect(() => candidate.notMonitoredThrowing()).to.throw("not monitored");
        expect(() => candidate.monitoredThrowing()).to.throw("monitored");
        expect(candidate.monitoredNotThrowing()).to.equal(1);
      });
    });

    describe("after initialisation", () => {
      beforeEach(() => {
        initMonitoring(configuration);
      });

      afterEach(() => {
        resetMonitoring();
      });

      it("should preserve original behavior", () => {
        expect(candidate.monitoredNotThrowing()).to.equal(1);
      });

      it("should catch error", () => {
        expect(() => candidate.notMonitoredThrowing()).to.throw();
        expect(() => candidate.monitoredThrowing()).to.not.throw();
      });

      it("should report error", () => {
        const server = sinon.fakeServer.create();

        candidate.monitoredThrowing();

        expect(JSON.parse(server.requests[0].requestBody).message).to.equal("monitored");
        server.restore();
      });
    });
  });

  describe("function", () => {
    const notThrowing = () => 1;
    const throwing = () => {
      throw new Error("error");
    };

    beforeEach(() => {
      initMonitoring(configuration);
    });

    afterEach(() => {
      resetMonitoring();
    });

    it("should preserve original behavior", () => {
      const decorated = monitor(notThrowing);
      expect(decorated()).to.equal(1);
    });

    it("should catch error", () => {
      const decorated = monitor(throwing);
      expect(() => decorated()).to.not.throw();
    });

    it("should report error", () => {
      const server = sinon.fakeServer.create();

      monitor(throwing)();

      expect(JSON.parse(server.requests[0].requestBody).message).to.equal("error");
      server.restore();
    });
  });

  describe("request", () => {
    beforeEach(() => {
      initMonitoring(configuration);
    });

    afterEach(() => {
      resetMonitoring();
    });

    it("should send the needed data", () => {
      const server = sinon.fakeServer.create();

      monitor(() => {
        throw new Error("message");
      })();

      expect(server.requests.length).to.equal(1);
      expect(server.requests[0].url).to.equal(configuration.monitoringEndpoint);
      expect(JSON.parse(server.requests[0].requestBody)).to.deep.equal({
        http: {
          url: window.location.href,
          useragent: navigator.userAgent
        },
        message: "message"
      });
      server.restore();
    });
  });
});
