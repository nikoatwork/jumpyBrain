import fc from "fast-check";

/**
 * Shared deterministic fast-check settings for jumpyBrain property tests.
 *
 * Keep generated coverage modest and focused on pure architecture-edge contracts.
 * See test/PROPERTY_TESTING.md before adding or expanding property tests.
 */
export const propertySettings = Object.freeze({
  seed: 0x6a756d70,
  numRuns: 75,
  endOnFailure: true,
});

export { fc };

export function assertProperty(property, options = {}) {
  return fc.assert(property, { ...propertySettings, ...options });
}

export const safeFrontmatterKey = fc.stringMatching(/^[A-Za-z0-9_-]{1,24}$/);

export const safeScalarString = fc
  .string({ maxLength: 80 })
  .filter((value) => !/[\r\n"'\\]/.test(value));

export const safePathSegment = fc
  .stringMatching(/^[A-Za-z0-9._~-]{1,16}$/)
  .filter((segment) => segment !== "." && segment !== "..");

export const relativePathArbitrary = fc
  .array(safePathSegment, { minLength: 1, maxLength: 5 })
  .map((segments) => segments.join("/"));
