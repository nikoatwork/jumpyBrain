import {
  collaborationFailure as fail,
  isSourceText,
  sourceBoundary,
} from "./errors.js";

export interface SourceSplice {
  start: number;
  deleteCount: number;
  insert: string;
  /** Inferred raw-file alignment cannot identify the original source in this envelope. */
  ambiguous?: true;
}
export interface AppliedSourceSplice extends SourceSplice {
  removed: string;
}
export interface SourceDiffOptions {
  maxBytes?: number;
  maxOperations?: number;
  maxWork?: number;
  maxDistance?: number;
  maxTraceCells?: number;
}
const byteLength = (text: string) => new TextEncoder().encode(text).length;

/** Canonical ordering: all coordinates refer to the same pre-transaction text. */
export function validateSourceSplices(
  body: string,
  operations: readonly SourceSplice[],
  maxOperations = 256,
) {
  if (!Array.isArray(operations) || operations.length > maxOperations)
    fail("batch_limit");
  let previousEnd = -1,
    previousStart = -1;
  for (const operation of operations) {
    if (
      !operation ||
      !Number.isSafeInteger(operation.start) ||
      operation.start < 0 ||
      !Number.isSafeInteger(operation.deleteCount) ||
      operation.deleteCount < 0 ||
      typeof operation.insert !== "string" ||
      (operation.ambiguous !== undefined && operation.ambiguous !== true) ||
      !isSourceText(operation.insert)
    )
      fail("invalid_patch");
    const end = operation.start + operation.deleteCount;
    if (
      end > body.length ||
      !sourceBoundary(body, operation.start) ||
      !sourceBoundary(body, end)
    )
      fail("invalid_base_range");
    if (operation.start < previousEnd || operation.start === previousStart)
      fail(
        "overlapping_batch",
        "Batch splices must be sorted and nonoverlapping.",
      );
    previousEnd = end;
    previousStart = operation.start;
  }
}
export function applySourceSplices(
  body: string,
  operations: readonly SourceSplice[],
): string {
  validateSourceSplices(body, operations);
  let result = body;
  for (let index = operations.length - 1; index >= 0; index--) {
    const operation = operations[index]!;
    result =
      result.slice(0, operation.start) +
      operation.insert +
      result.slice(operation.start + operation.deleteCount);
  }
  return result;
}
/**
 * Total, intent-preserving transform of one transaction across another on the
 * same base. Source removed by both writers is removed once and a deletion
 * never consumes the other writer's insertion. A replacement stands where its
 * removed range was: text added before or after that range keeps its side.
 * Only insertions at one gap, or edits whose ranges overlap, need an order;
 * the later publication goes "before" the earlier one, so each writer's run
 * stays contiguous while both keep typing at one position.
 */
export function rebaseSourceSplices<
  T extends SourceSplice & { removed?: string },
>(
  local: readonly T[],
  remote: readonly SourceSplice[],
  insertionOrder: "after" | "before" = "before",
): T[] {
  const others = remote.filter(
    (other) => other.deleteCount > 0 || other.insert.length > 0,
  );
  // A surviving base character moves by every remote splice starting at or before it.
  const shift = (position: number) => {
    let delta = 0;
    for (const other of others) {
      if (other.start > position) break;
      delta += other.insert.length - other.deleteCount;
    }
    return delta;
  };
  // Where this splice's insertion lands among the remote insertions.
  const anchor = (start: number, end: number) => {
    let delta = 0,
      afterOverlap: number | undefined;
    for (const other of others) {
      const otherEnd = other.start + other.deleteCount;
      if (other.start > end) break;
      const pure = start === end && other.start === otherEnd,
        precedes =
          otherEnd < start ||
          (otherEnd === start && !pure) ||
          (!(other.start === end && !pure) && insertionOrder === "after");
      if (!precedes) return other.start + delta;
      if (otherEnd >= start) afterOverlap = other.start + delta + other.insert.length;
      delta += other.insert.length - other.deleteCount;
    }
    return afterOverlap ?? end + delta;
  };
  const result: T[] = [];
  const push = (source: T, piece: { start: number; deleteCount: number; insert: string; removed?: string }) => {
    if (!piece.deleteCount && !piece.insert) return;
    const previous = result.at(-1);
    if (previous && previous.start + previous.deleteCount === piece.start) {
      previous.deleteCount += piece.deleteCount;
      previous.insert += piece.insert;
      if (piece.removed !== undefined)
        previous.removed = (previous.removed ?? "") + piece.removed;
      if (source.ambiguous) previous.ambiguous = true;
      return;
    }
    result.push({
      start: piece.start,
      deleteCount: piece.deleteCount,
      insert: piece.insert,
      ...(piece.removed !== undefined ? { removed: piece.removed } : {}),
      ...(source.ambiguous ? { ambiguous: true as const } : {}),
    } as T);
  };
  for (const operation of local) {
    const end = operation.start + operation.deleteCount;
    for (const other of others) {
      const otherEnd = other.start + other.deleteCount;
      if (
        other.ambiguous &&
        other.deleteCount > 0 &&
        (operation.deleteCount === 0
          ? operation.start >= other.start && operation.start < otherEnd
          : operation.start < otherEnd && end > other.start)
      )
        fail(
          "ambiguous_source",
          "An observed raw-file change lost the source identity at this position. Review the retained draft.",
        );
    }
    const tracked = operation.removed !== undefined,
      pieces: { start: number; deleteCount: number; insert: string; removed?: string }[] = [];
    const remove = (from: number, to: number) =>
      pieces.push({
        start: from + shift(from),
        deleteCount: to - from,
        insert: "",
        ...(tracked
          ? { removed: operation.removed!.slice(from - operation.start, to - operation.start) }
          : {}),
      });
    let cursor = operation.start;
    for (const other of others) {
      const otherEnd = other.start + other.deleteCount;
      if (other.start >= end) break;
      // Entirely before the remaining range, or a pure insertion on its boundary.
      if (otherEnd <= cursor && other.start <= cursor) continue;
      if (other.start > cursor) remove(cursor, other.start);
      cursor = Math.max(cursor, otherEnd, other.start);
    }
    if (cursor < end) remove(cursor, end);
    if (operation.insert) {
      const insertion = {
          start: anchor(operation.start, end),
          deleteCount: 0,
          insert: operation.insert,
          ...(tracked ? { removed: "" } : {}),
        },
        index = pieces.findIndex((piece) => piece.start >= insertion.start);
      pieces.splice(index < 0 ? pieces.length : index, 0, insertion);
    }
    for (const piece of pieces) push(operation, piece);
  }
  return result;
}
/** True when two same-base transactions change the same source range; equal-gap insertions are not overlap. */
export function sourceSplicesOverlap(
  local: readonly SourceSplice[],
  remote: readonly SourceSplice[],
): boolean {
  return local.some((operation) => {
    const end = operation.start + operation.deleteCount;
    return remote.some((other) => {
      const otherEnd = other.start + other.deleteCount;
      if (!other.deleteCount && !other.insert) return false;
      if (!other.deleteCount && !operation.deleteCount && operation.start === other.start)
        return false;
      return !(otherEnd <= operation.start || end <= other.start);
    });
  });
}
/** Both sides retain their actual positions; the later local publication precedes canonical ties. */
export function rebaseSourcePair(
  base: string,
  local: readonly SourceSplice[],
  remote: readonly SourceSplice[],
): { local: SourceSplice[]; remote: SourceSplice[] } {
  validateSourceSplices(base, local);
  validateSourceSplices(base, remote);
  const localBody = applySourceSplices(base, local),
    remoteBody = applySourceSplices(base, remote),
    afterRemote = rebaseSourceSplices(local, remote, "before"),
    afterLocal = rebaseSourceSplices(remote, local, "after");
  if (
    applySourceSplices(remoteBody, afterRemote) !==
    applySourceSplices(localBody, afterLocal)
  )
    fail(
      "provenance_mismatch",
      "The actual source transactions cannot be reconciled.",
    );
  return { local: afterRemote, remote: afterLocal };
}
export interface SourceCompositionOptions {
  maxBytes?: number;
  maxTransactions?: number;
  maxOperations?: number;
  maxPieces?: number;
  maxWork?: number;
}
/** Compose actual sequential transactions with source-origin pieces, never a text diff. */
export function composeSourceSplices(
  base: string,
  transactions: readonly (readonly SourceSplice[])[],
  options: SourceCompositionOptions = {},
): SourceSplice[] {
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024,
    maxTransactions = options.maxTransactions ?? 1024,
    maxOperations = options.maxOperations ?? 256,
    maxPieces = options.maxPieces ?? 4096,
    maxWork = options.maxWork ?? 32_000_000;
  if (!isSourceText(base)) fail("invalid_patch");
  if (byteLength(base) > maxBytes || transactions.length > maxTransactions)
    fail("provenance_limit");
  type Piece = { start: number; length: number } | { text: string };
  const pieces: Piece[] = base.length
    ? [{ start: 0, length: base.length }]
    : [];
  let current = base,
    work = 0,
    ambiguous = false;
  const charge = (amount: number) => {
    if ((work += amount) > maxWork) fail("provenance_limit");
  };
  const length = (piece: Piece) =>
    "text" in piece ? piece.text.length : piece.length;
  const split = (offset: number) => {
    let position = 0;
    for (let index = 0; index < pieces.length; index++) {
      charge(1);
      const piece = pieces[index]!,
        end = position + length(piece);
      if (position === offset) return index;
      if (offset < end) {
        const at = offset - position;
        pieces.splice(
          index,
          1,
          ...("text" in piece
            ? [
                { text: piece.text.slice(0, at) },
                { text: piece.text.slice(at) },
              ]
            : [
                { start: piece.start, length: at },
                { start: piece.start + at, length: piece.length - at },
              ]),
        );
        return index + 1;
      }
      position = end;
    }
    if (position !== offset) fail("provenance_mismatch");
    return pieces.length;
  };
  for (const operations of transactions) {
    validateSourceSplices(current, operations, maxOperations);
    ambiguous ||= operations.some((operation) => operation.ambiguous);
    charge(
      current.length +
        operations.reduce((sum, operation) => sum + operation.insert.length, 0),
    );
    for (let index = operations.length - 1; index >= 0; index--) {
      const operation = operations[index]!;
      if (!operation.deleteCount && !operation.insert) continue;
      // Split the start first: splitting it can move the end's piece index.
      const from = split(operation.start),
        to = split(operation.start + operation.deleteCount);
      pieces.splice(
        from,
        to - from,
        ...(operation.insert ? [{ text: operation.insert }] : []),
      );
      if (pieces.length > maxPieces) fail("provenance_limit");
    }
    current = pieces
      .map((piece) =>
        "text" in piece
          ? piece.text
          : base.slice(piece.start, piece.start + piece.length),
      )
      .join("");
    if (byteLength(current) > maxBytes) fail("provenance_limit");
  }
  const result: SourceSplice[] = [];
  let cursor = 0,
    insert = "";
  const flush = (until: number) => {
    if (until > cursor || insert)
      result.push({ start: cursor, deleteCount: until - cursor, insert });
    cursor = until;
    insert = "";
  };
  for (const piece of pieces) {
    if ("text" in piece) insert += piece.text;
    else {
      flush(piece.start);
      cursor += piece.length;
    }
  }
  flush(base.length);
  if (ambiguous) {
    if (!result.length) fail("ambiguous_source");
    for (const operation of result) operation.ambiguous = true;
  }
  if (result.length > maxOperations) fail("provenance_limit");
  if (applySourceSplices(base, result) !== current) fail("provenance_mismatch");
  return result;
}
/** Project a source anchor through one transaction, rejecting removed interiors. */
export function transformSourcePosition(
  position: number,
  operations: readonly SourceSplice[],
  association: -1 | 1 | "left" | "right" = 1,
): number {
  let result = position;
  for (let index = operations.length - 1; index >= 0; index--) {
    const operation = operations[index]!,
      end = operation.start + operation.deleteCount;
    const right = association === 1 || association === "right";
    if (
      operation.ambiguous &&
      operation.deleteCount > 0 &&
      ((result > operation.start && result < end) ||
        (result === operation.start && right) ||
        (result === end && !right))
    )
      fail(
        "ambiguous_source",
        "The raw-file alignment cannot preserve this source anchor. Review before continuing.",
      );
    if (result > operation.start && result < end) fail("position_deleted");
    if (result > end || (result === end && operation.deleteCount > 0))
      result += operation.insert.length - operation.deleteCount;
    else if (
      result === operation.start &&
      (association === 1 || association === "right")
    )
      result += operation.insert.length;
  }
  return result;
}
export function invertSourceSplices(
  operations: readonly AppliedSourceSplice[],
): AppliedSourceSplice[] {
  let shift = 0;
  const result: AppliedSourceSplice[] = [];
  for (const operation of operations) {
    const inverse = {
      start: operation.start + shift,
      deleteCount: operation.insert.length,
      insert: operation.removed,
      removed: operation.insert,
      ...(operation.ambiguous ? { ambiguous: true as const } : {}),
    };
    shift += operation.insert.length - operation.deleteCount;
    const previous = result.at(-1);
    if (
      previous &&
      (previous.start + previous.deleteCount === inverse.start ||
        (previous.start === inverse.start &&
          (!previous.deleteCount || !inverse.deleteCount)))
    ) {
      previous.deleteCount += inverse.deleteCount;
      previous.insert += inverse.insert;
      previous.removed += inverse.removed;
      if (inverse.ambiguous) previous.ambiguous = true;
    } else result.push(inverse);
  }
  return result;
}
/** Legacy outer envelope; callers needing intent-preserving reconciliation use sourceDifferences. */
export function sourceDifference(before: string, after: string): SourceSplice {
  let start = 0,
    endBefore = before.length,
    endAfter = after.length;
  while (
    start < endBefore &&
    start < endAfter &&
    before[start] === after[start]
  )
    start++;
  while (
    endBefore > start &&
    endAfter > start &&
    before[endBefore - 1] === after[endAfter - 1]
  ) {
    endBefore--;
    endAfter--;
  }
  if (!sourceBoundary(before, start) || !sourceBoundary(after, start)) start--;
  if (!sourceBoundary(before, endBefore)) endBefore++;
  if (!sourceBoundary(after, endAfter)) endAfter++;
  return {
    start,
    deleteCount: endBefore - start,
    insert: after.slice(start, endAfter),
  };
}
function codepoints(value: string) {
  const codes = new Uint32Array(value.length),
    offsets = new Uint32Array(value.length + 1);
  let count = 0;
  for (let offset = 0; offset < value.length; ) {
    offsets[count] = offset;
    const code = value.codePointAt(offset)!;
    codes[count++] = code;
    offset += code > 0xffff ? 2 : 1;
  }
  offsets[count] = value.length;
  return {
    codes: codes.subarray(0, count),
    offsets: offsets.subarray(0, count + 1),
  };
}
/** Observed files have no edit coordinates: invalidate equivalent repeated-source alignments. */
export function rawSourceDifferences(
  before: string,
  after: string,
  options: SourceDiffOptions = {},
): SourceSplice[] {
  const operations = sourceDifferences(before, after, options);
  if (!operations.length) return [];
  let work = 0;
  const charge = () => {
    if (++work > (options.maxWork ?? 16_000_000)) fail("diff_limit");
  };
  const previous = (text: string, offset: number) =>
    offset -
    (offset > 1 &&
    text.charCodeAt(offset - 1) >= 0xdc00 &&
    text.charCodeAt(offset - 1) <= 0xdfff
      ? 2
      : 1);
  const next = (text: string, offset: number) =>
    offset + (text.codePointAt(offset)! > 0xffff ? 2 : 1);
  const intervals = operations.map((operation) => {
    let left = operation.start,
      right = operation.start;
    const size = operation.deleteCount;
    if (!size && operation.insert) {
      const token = operation.insert;
      let rotation = 0;
      while (left > 0) {
        charge();
        const at = previous(token, rotation || token.length),
          old = previous(before, left);
        if (token.codePointAt(at) !== before.codePointAt(old)) break;
        rotation = at;
        left = old;
      }
      rotation = 0;
      while (right < before.length) {
        charge();
        if (token.codePointAt(rotation) !== before.codePointAt(right)) break;
        right = next(before, right);
        rotation = next(token, rotation) % token.length;
      }
    } else if (size && !operation.insert) {
      while (left > 0) {
        charge();
        const at = previous(before, left),
          end = previous(before, left + size);
        if (before.codePointAt(at) !== before.codePointAt(end)) break;
        left = at;
      }
      while (right + size < before.length) {
        charge();
        if (before.codePointAt(right) !== before.codePointAt(right + size))
          break;
        right = next(before, right);
      }
    }
    return {
      start: left,
      end: right + size,
      ambiguous: left !== operation.start || right !== operation.start,
    };
  });
  // Opposite alignment catches correlated rotations (e.g. ababa -> babab).
  const reverse = (text: string) => Array.from(text).reverse().join("");
  const alternative = sourceDifferences(
    reverse(before),
    reverse(after),
    options,
  )
    .map((operation) => ({
      start: before.length - operation.start - operation.deleteCount,
      deleteCount: operation.deleteCount,
      insert: reverse(operation.insert),
    }))
    .reverse();
  const same = (a: SourceSplice, b: SourceSplice) =>
    a.start === b.start &&
    a.deleteCount === b.deleteCount &&
    a.insert === b.insert;
  const changed = operations.filter(
    (operation) => !alternative.some((other) => same(operation, other)),
  );
  const otherChanged = alternative.filter(
    (operation) => !operations.some((other) => same(operation, other)),
  );
  if (
    otherChanged.some(
      (operation) =>
        !intervals.some(
          (interval) =>
            interval.ambiguous &&
            operation.start >= interval.start &&
            operation.start + operation.deleteCount <= interval.end,
        ),
    )
  ) {
    const different = [...changed, ...otherChanged];
    intervals.push({
      start: Math.min(...different.map((operation) => operation.start)),
      end: Math.max(
        ...different.map(
          (operation) => operation.start + operation.deleteCount,
        ),
      ),
      ambiguous: true,
    });
  }
  intervals.sort((a, b) => a.start - b.start || a.end - b.end);
  const groups: typeof intervals = [];
  for (const interval of intervals) {
    const prior = groups.at(-1);
    if (prior && interval.start <= prior.end) {
      prior.end = Math.max(prior.end, interval.end);
      prior.ambiguous ||= interval.ambiguous;
    } else groups.push({ ...interval });
  }
  const result: SourceSplice[] = groups.map((interval) => ({
    start: interval.start,
    deleteCount: interval.end - interval.start,
    insert: after.slice(
      transformSourcePosition(interval.start, operations, "left"),
      transformSourcePosition(interval.end, operations, "right"),
    ),
    ...(interval.ambiguous ? { ambiguous: true as const } : {}),
  }));
  validateSourceSplices(before, result);
  if (applySourceSplices(before, result) !== after) fail("diff_invariant");
  return result;
}
/** Bounded exact Myers alignment. Never folds unchanged islands into a replacement. */
export function sourceDifferences(
  before: string,
  after: string,
  options: SourceDiffOptions = {},
): SourceSplice[] {
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024,
    maxOperations = options.maxOperations ?? 256,
    maxWork = options.maxWork ?? 16_000_000,
    maxDistance = options.maxDistance ?? 2048,
    maxTraceCells = options.maxTraceCells ?? 4_500_000;
  if (!isSourceText(before) || !isSourceText(after)) fail("invalid_patch");
  if (byteLength(before) > maxBytes || byteLength(after) > maxBytes)
    fail(
      "diff_limit",
      "This source exceeds the bounded diff limit. Retain the draft for explicit review.",
    );
  if (before === after) return [];
  const envelope = sourceDifference(before, after),
    old = before.slice(envelope.start, envelope.start + envelope.deleteCount),
    next = envelope.insert;
  if (!old || !next) return [envelope];
  const a = codepoints(old),
    b = codepoints(next),
    n = a.codes.length,
    m = b.codes.length,
    trace: Int32Array[] = [];
  let work = 0,
    cells = 0;
  const get = (row: Int32Array, d: number, k: number) =>
    k < -d || k > d ? -1 : row[k + d]!;
  for (let distance = 0; distance <= Math.min(maxDistance, n + m); distance++) {
    cells += 2 * distance + 1;
    if (cells > maxTraceCells) break;
    const row = new Int32Array(2 * distance + 1).fill(-1),
      previous = trace[distance - 1];
    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      if (++work > maxWork)
        fail(
          "diff_limit",
          "The source changes exceed the bounded alignment budget. Retain the draft for explicit review.",
        );
      let x =
        distance === 0
          ? 0
          : diagonal === -distance ||
              (diagonal !== distance &&
                get(previous!, distance - 1, diagonal - 1) <
                  get(previous!, distance - 1, diagonal + 1))
            ? get(previous!, distance - 1, diagonal + 1)
            : get(previous!, distance - 1, diagonal - 1) + 1;
      let y = x - diagonal;
      while (x < n && y < m && a.codes[x] === b.codes[y]) {
        x++;
        y++;
        if (++work > maxWork) fail("diff_limit");
      }
      row[diagonal + distance] = x;
      if (x >= n && y >= m) {
        trace.push(row);
        const atoms: {
          old: number;
          next: number;
          kind: "insert" | "delete";
        }[] = [];
        let endX = n,
          endY = m;
        for (let d = distance; d > 0; d--) {
          const previousRow = trace[d - 1]!,
            k = endX - endY,
            previousK =
              k === -d ||
              (k !== d &&
                get(previousRow, d - 1, k - 1) < get(previousRow, d - 1, k + 1))
                ? k + 1
                : k - 1;
          const previousX = get(previousRow, d - 1, previousK),
            previousY = previousX - previousK;
          while (endX > previousX && endY > previousY) {
            endX--;
            endY--;
          }
          if (endX === previousX) {
            atoms.push({ old: previousX, next: previousY, kind: "insert" });
            endY--;
          } else {
            atoms.push({ old: previousX, next: previousY, kind: "delete" });
            endX--;
          }
        }
        atoms.reverse();
        const groups: {
          oldStart: number;
          oldEnd: number;
          newStart: number;
          newEnd: number;
        }[] = [];
        for (const atom of atoms) {
          const current = groups.at(-1);
          if (
            current &&
            atom.old === current.oldEnd &&
            atom.next === current.newEnd
          ) {
            current.oldEnd += atom.kind === "delete" ? 1 : 0;
            current.newEnd += atom.kind === "insert" ? 1 : 0;
          } else
            groups.push({
              oldStart: atom.old,
              oldEnd: atom.old + (atom.kind === "delete" ? 1 : 0),
              newStart: atom.next,
              newEnd: atom.next + (atom.kind === "insert" ? 1 : 0),
            });
        }
        if (groups.length > maxOperations)
          fail(
            "diff_limit",
            "Too many independent source edits. Retain the draft for review.",
          );
        const operations = groups.map((group) => ({
          start: envelope.start + a.offsets[group.oldStart]!,
          deleteCount: a.offsets[group.oldEnd]! - a.offsets[group.oldStart]!,
          insert: next.slice(
            b.offsets[group.newStart],
            b.offsets[group.newEnd],
          ),
        }));
        validateSourceSplices(before, operations, maxOperations);
        if (applySourceSplices(before, operations) !== after)
          fail("diff_invariant");
        return operations;
      }
    }
    trace.push(row);
  }
  fail(
    "diff_limit",
    "The edit distance exceeds the bounded alignment budget. Retain the draft for explicit review.",
  );
}
