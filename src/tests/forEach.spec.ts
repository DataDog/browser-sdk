import { stubDatadog } from "../index";

beforeEach(() => {
  (navigator.sendBeacon as any) = false;
  stubDatadog();
});
