declare const deepEqualInAnyOrder: (chai: any, utils: any) => void;

declare module "deep-equal-in-any-order" {
  global {
    export namespace Chai {
      interface Deep {
        equalInAnyOrder: Equal;
      }
    }
  }
  export = deepEqualInAnyOrder;
}
