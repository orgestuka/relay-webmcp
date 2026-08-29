class InertMutationObserver {
  observe(): void {}
  disconnect(): void {}
  takeRecords(): MutationRecord[] { return []; }
}

if (!("MutationObserver" in globalThis)) {
  Object.defineProperty(globalThis, "MutationObserver", {
    configurable: true,
    writable: true,
    value: InertMutationObserver,
  });
}

if (!("document" in globalThis)) {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    writable: true,
    value: {
      body: {},
      querySelector: () => null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
  });
}

if (!("window" in globalThis)) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: {
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      location: new URL("http://localhost/"),
    },
  });
}
