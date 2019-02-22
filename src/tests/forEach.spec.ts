import { initGlobal } from "../global";

beforeEach(() => {
  (navigator.sendBeacon as any) = false;
  initGlobal();
});
