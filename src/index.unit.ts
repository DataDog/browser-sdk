import { expect } from "chai";
import { add } from "./index";

describe("test", () => {
  it("should pass", () => {
    expect(add(1, 2)).to.equal(3);
  });
});
