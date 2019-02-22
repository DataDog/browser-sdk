import { stubDatadog } from "../global";

beforeEach(() => {
  (navigator.sendBeacon as any) = false;
  stubDatadog();
});
