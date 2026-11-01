export class CollaborationError extends Error {
  constructor(
    readonly code: string,
    message = code,
  ) {
    super(message);
    this.name = "CollaborationError";
  }
}
export function collaborationFailure(code: string, message?: string): never {
  throw new CollaborationError(code, message);
}
export const isSourceText = (text: string) =>
  !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
    text,
  );
export const sourceBoundary = (text: string, at: number) =>
  !(
    at > 0 &&
    at < text.length &&
    /[\uD800-\uDBFF]/.test(text[at - 1]!) &&
    /[\uDC00-\uDFFF]/.test(text[at]!)
  );
