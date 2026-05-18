import { display } from "@datadog/browser-core"
import type { RouteMatch } from "@solidjs/router"
import { initializeSolidJSPlugin } from "../../../test/initializeSolidJSPlugin"
import { startSolidRouterView, computeViewName } from "./startSolidRouterView"

describe("startSolidRouterView", () => {
  it("starts a new view with the computed view name", () => {
    const startViewSpy = jasmine.createSpy()
    initializeSolidJSPlugin({
      configuration: { router: true },
      publicApi: { startView: startViewSpy },
    })

    startSolidRouterView(
      [{ route: { path: "/" } }, { route: { path: "user" } }, { route: { path: ":id" } }] as unknown as RouteMatch[],
      "/user/1"
    )

    expect(startViewSpy).toHaveBeenCalledOnceWith("/user/:id")
  })

  it("warns if router: true is missing from plugin config", () => {
    const warnSpy = spyOn(display, "warn")
    initializeSolidJSPlugin({ configuration: {} })
    startSolidRouterView([] as unknown as RouteMatch[], "/")
    expect(warnSpy).toHaveBeenCalledOnceWith(
      "`router: true` is missing from the solidjs plugin configuration, the view will not be tracked."
    )
  })
})

describe("computeViewName", () => {
  it("returns an empty string if there is no route match", () => {
    expect(computeViewName([] as unknown as RouteMatch[], "/")).toBe("")
  })

  it("ignores routes without a path", () => {
    expect(
      computeViewName(
        [{ route: { path: "/foo" } }, { route: { path: "" } }, { route: { path: "/foo/:id" } }] as unknown as RouteMatch[],
        "/foo/1"
      )
    ).toBe("/foo/:id")
  })

  // prettier-ignore
  const cases: Array<[string, Array<{ route: { path: string } }>, string, string]> = [
    // description,                         matched paths,                                                    pathname,            expected

    // Simple paths
    ["single static segment",               [{ route: { path: "/foo" } }],                                    "/foo",              "/foo"],
    ["nested static segments (absolute)",   [{ route: { path: "/foo" } }, { route: { path: "/foo/bar" } }],   "/foo/bar",          "/foo/bar"],
    ["nested with param",                   [{ route: { path: "/foo" } }, { route: { path: "bar" } }, { route: { path: ":id" } }], "/foo/bar/1", "/foo/bar/:id"],
    ["root param",                          [{ route: { path: "/:p" } }],                                     "/foo",              "/:p"],
    ["param in single segment",             [{ route: { path: "/foo/:p" } }],                                 "/foo/bar",          "/foo/:p"],
    ["nested param",                        [{ route: { path: "/foo" } }, { route: { path: ":p" } }],         "/foo/bar",          "/foo/:p"],
    ["multiple params",                     [{ route: { path: "/:a/:b" } }],                                  "/foo/bar",          "/:a/:b"],
    ["optional segment",                    [{ route: { path: "/stories/:id?" } }],                           "/stories",          "/stories/:id?"],
    ["optional segment with value",         [{ route: { path: "/stories/:id?" } }],                           "/stories/123",      "/stories/:id?"],

    // Catch-all routes
    ["catch-all bare /* at root",           [{ route: { path: "/*" } }],                                      "/anything/nested",  "/anything/nested"],
    ["catch-all bare /* at root (index)",   [{ route: { path: "/*" } }],                                      "/",                 "/"],
    ["named catch-all /*rest at root",      [{ route: { path: "/*rest" } }],                                  "/anything/nested",  "/anything/nested"],
    ["nested catch-all",                    [{ route: { path: "/foo" } }, { route: { path: "/*" } }],         "/foo/bar",          "/foo/bar"],
    ["param before catch-all",              [{ route: { path: "/foo/:p" } }, { route: { path: "/*" } }],      "/foo/bar/baz",      "/foo/:p/baz"],
    ["multiple params before catch-all",    [{ route: { path: "/org/:orgId" } }, { route: { path: "/*" } }],  "/org/123/some/page","/org/:orgId/some/page"],
  ]

  cases.forEach(([description, matched, pathname, expected]) => {
    it(`returns "${expected}" for ${description}`, () => {
      expect(computeViewName(matched as unknown as RouteMatch[], pathname)).toBe(expected)
    })
  })
})
