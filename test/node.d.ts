// The little of Node the tests use, as the extension does not depend on @types/node.
declare module "node:test" {
  export const test: (name: string, run: () => Promise<void> | void) => void;
}

declare module "node:assert/strict" {
  interface Assert {
    (value: unknown, message?: string): asserts value;
    ok(value: unknown, message?: string): asserts value;
    equal<T>(
      actual: unknown,
      expected: T,
      message?: string,
    ): asserts actual is T;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
  }

  const assert: Assert;
  export default assert;
}

declare function setImmediate(run: (value?: unknown) => void): unknown;
