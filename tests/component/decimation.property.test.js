import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { decimateContinuous } from "../../lib/analysis/decimation.js";

describe("display decimation properties", () => {
  it("is bounded, endpoint-preserving, and does not mutate raw values", () => {
    fc.assert(fc.property(
      fc.array(fc.double({ noNaN: true, noDefaultInfinity: true }), { minLength: 5, maxLength: 500 }),
      fc.integer({ min: 4, max: 100 }),
      (input, requestedLimit) => {
        const limit = Math.min(requestedLimit, input.length - 1);
        if (limit < 4) return;
        const times = Float64Array.from({ length: input.length }, (_, index) => index);
        const values = Float64Array.from(input);
        const before = values.slice();
        const output = decimateContinuous(times, values, limit);
        expect(output.times.length).toBeLessThanOrEqual(limit);
        expect(output.times[0]).toBe(0);
        expect(output.times.at(-1)).toBe(times.at(-1));
        expect(values).toEqual(before);
      },
    ), { numRuns: 200 });
  });
});
