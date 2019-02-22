import { expect } from "chai";
import * as sinon from "sinon";
import { HttpTransport } from "../httpTransport";

describe("http transport", () => {
  const ENDPOINT_URL = "http://my.website";
  let server: sinon.SinonFakeServer;
  let transport: HttpTransport;

  beforeEach(() => {
    server = sinon.fakeServer.create();
    transport = new HttpTransport(ENDPOINT_URL);
  });

  afterEach(() => {
    server.restore();
  });

  it("should send object", () => {
    transport.send({ foo: "bar" });

    expect(server.requests.length).to.equal(1);
    expect(server.requests[0].url).to.equal(ENDPOINT_URL);
  });

  it("should send string array", () => {
    transport.send(['{"foo":"bar1"}', '{"foo":"bar2"}']);

    expect(server.requests.length).to.equal(1);
    expect(server.requests[0].url).to.equal(ENDPOINT_URL);
    expect(server.requests[0].requestBody).to.equal('{"foo":"bar1"}\n{"foo":"bar2"}');
  });
});
