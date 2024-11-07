import {wildcardMatch, makeRegexPattern} from './wildcard'

describe("makeRegexPattern", function() {
    it("on catch all", function() {
        expect(makeRegexPattern("a*")).toBe("^a.*$");
    });
    it("on not char class ", function() {
        expect(makeRegexPattern("_[[^()]]_")).toBe("^[^()]+$");
    });
    it("on mix of wildcard and char classes", function() {
        expect(makeRegexPattern("*abc_[[\\d]]_xyz*_[[\\w]]_")).toBe("^.*abc[\\d]+xyz.*[\\w]+$");
    });
});

describe("wildcardMatch", function() {
    it("on empty string", function() {
        const match = wildcardMatch("")
        expect(match("")).toBe(true);
        expect(match("xxx")).toBe(false);
    });
    it("on non wildcard string", function() {
        const match = wildcardMatch("abc")
        expect(match("abc")).toBe(true);
        expect(match("xxx")).toBe(false);
    });
    it("on catch all wildcard", function() {
        const match = wildcardMatch("*")
        expect(match("")).toBe(true);
        expect(match("x")).toBe(true);
        expect(match("xxx")).toBe(true);
    });
    it("on catch all wildcard", function() {
        const match = wildcardMatch("*/coucou/ca/va*")
        expect(match("/coucou/ca/va")).toBe(true);
        expect(match("app.datadog.com/coucou/ca/va?truc=0")).toBe(true);
        expect(match("staging.datadog.com/coucou/ca/va?order=desc&truc=1")).toBe(true);
    });
});
