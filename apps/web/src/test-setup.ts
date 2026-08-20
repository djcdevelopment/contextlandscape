import "@testing-library/jest-dom/vitest";

let uuidSequence = 0;
Object.defineProperty(globalThis, "crypto", {
  configurable: true,
  value: { randomUUID: () => `00000000-0000-4000-8000-${String(++uuidSequence).padStart(12, "0")}` }
});

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  value: () => null
});
