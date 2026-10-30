# Boards for agents

Boards are visual in the Mac app and accessible to agents through the optional `jumpybrain board` namespace. Memory capture and retrieval stay the CLI's main workflow. Cards are ordinary Markdown notes; the board stores only their IDs, column placement and names.

Each board is a canonical `boards/<UUID>.json` file inside the memory root. The Mac app displays that same organization; the CLI works independently, with no Mac app or board database required. A hosted server reads and writes its server-local board files through the same operations. Boards on a shared brain are shared too.

```sh
jumpybrain board list --root ./memory --json
jumpybrain board status --root ./memory --board "Wedding planning" --json
jumpybrain board show --target-url https://brain.example --board "Wedding planning" --json
```

Every command requires exactly one `--root` or `--target-url` (`--remote-url` is an alias). Remote credentials use `JUMPYBRAIN_API_KEY`; normal CLI read-only target policy applies. `list`, `show` and `status` are reads. All other board commands write to the selected brain and require the same explicit remote-write authorization as notes. The Mac app independently respects its connection's write permission.

`list` includes active and settled boards and a `hashes` map keyed by board ID. `show` returns `{board, contentHash}` without fetching notes. CLI output also identifies the root or target URL. Select by stable board ID or exact, case-sensitive name; duplicate names require the ID. Hashes cover exact file bytes and belong to individual boards, so an edit to one board does not invalidate another.

## Create and maintain a board

```sh
jumpybrain board create --root ./memory --name "Wedding planning" \
  --column "Ideas & decisions" --column "Making it happen" --column "Confirmed" --json

# Substitute the board ID, note ID and latest contentHash from actual results.
jumpybrain board add --root ./memory --board <board-ID> --page <mem_id> --column 1 --if-match <contentHash> --json
jumpybrain board add --root ./memory --board <board-ID> --page <mem_id> --column 2 --if-match <contentHash> --json
jumpybrain board update --root ./memory --board <board-ID> --name "Our wedding" --if-match <contentHash> --json
jumpybrain board update --root ./memory --board <board-ID> --archived true --if-match <contentHash> --json
jumpybrain board update --root ./memory --board <board-ID> --archived false --if-match <contentHash> --json
jumpybrain board remove --root ./memory --board <board-ID> --page <mem_id> --if-match <contentHash> --json
jumpybrain board delete --root ./memory --board <board-ID> --if-match <contentHash> --json
```

`add` appends to the specified 1-based column, moving a note already on the board. Removing a card or deleting a board preserves its notes and their memberships on other boards. `archived: true` corresponds to Settle in the app. `update --column` accepts exactly three names and preserves each column's cards.

Every mutation except creation requires the board hash returned by a prior read or successful save. A concurrent app/agent change fails instead of overwriting it. Read again and reconcile; do not retry blindly. If a create response is lost, inspect `list` before recreating. Mac brain switches also retain the existing generation and pending-save guards.

For a complete prepared layout, use `create --file board.json`. The file contains `name`, optional `archived`, and exactly three `columns`, each with `name` and `pages` (canonical note IDs). `update --file` accepts any of those fields; supplied columns replace the whole column layout. Files cannot change a board ID. Do not combine a file with individual fields.

```json
{
  "name": "Wedding planning",
  "archived": false,
  "columns": [
    { "name": "Ideas & decisions", "pages": [] },
    { "name": "Making it happen", "pages": [] },
    { "name": "Confirmed", "pages": [] }
  ]
}
```

The stored file adds `schemaVersion: 1` and the stable `id` to the definition above. The current format has exactly three columns, at most 100 boards per root, 100 unique cards per column, 100-character names, and a 64 KiB file limit. A note can belong to several boards but appears only once within each board. Membership is a reference to its canonical ID, not duplicated note content or a frontmatter relationship.

Board files live outside `.jumpybrain/` and retrieval `indexRoot`. Include `boards/` when backing up, copying or versioning a brain; rebuilding or deleting indexes preserves boards. The first create makes the directory; reads do not initialize it. Invalid schemas, malformed JSON, mismatched IDs, links and unsafe files fail without resetting data. Writes use a cross-process root lock and atomic per-file replacement. A crash may leave `boards/.write.lock`; remove it only after confirming that no board writer remains. External writers ignoring the lock can race publication; multi-file reads are not transactions.

This is a breaking replacement of the former Mac app-support `collections.json` format and app-only CLI flags. There is no automatic importer or compatibility store. The old file is ignored, not deleted. New boards are managed only inside their brain.

## Answer initiative-status questions

`status` reads current Markdown for up to 12 cards in column/card order, with `--limit 1..50` available explicitly. It returns column totals, note IDs, titles, source paths and content hashes, writing/edit metadata when present, and up to 1,000 characters of whole body lines per inspected card. Its source line numbers include frontmatter. `partial`, `omittedCards`, `unavailableCards` and `truncatedCards` make evidence gaps explicit; a first line exceeding the excerpt bound yields no excerpt and a truncation marker.

Use the excerpts to answer what is decided, in progress, blocked or awaiting a decision. Cite the notes and preserve uncertainty. Column labels are user-defined organization, not verified completion or a reason to invent a completion percentage. `observedAt` is the read time, not when a claim became true. Notes are read separately: there is no multi-file snapshot or retained status history. A layout change during the read fails the command.

For missing detail, use the returned note ID/hash with ordinary `expand` on the **matching root/target**. For cards beyond the status limit, use `board show` to obtain their IDs, then read only relevant notes. Missing/unavailable cards remain on the board; outages are never evidence of completion. Remote status uses the ordinary authenticated CLI read transport and performs no memory writes. Board operations do not run search or indexing.

## Wedding-planning example

For “create me a board to keep an eye on wedding planning,” an agent should:

1. Read `board list --root <memory-root> --json` (or use the intended remote target), verify the intended destination, and reuse an existing board if appropriate.
2. Recall already-known wedding context on that same brain. Preserve unknown date, budget, guest count and booking decisions as unknown.
3. Create useful ordinary notes through `remember`, using its returned canonical IDs. A compact starting set is **Wedding overview**, **Budget & payments**, **Guest list & RSVPs**, **Venue & date**, **Food & drinks**, **Photography & music**, and **Ceremony & day-of plan**. Each note can contain known decisions, open questions, the next action and source links. Checkboxes, concise headings and meaningful titles make the Mac cards useful without a separate board content format.
4. Create the three-column board and add those IDs, or populate one JSON layout and create it in one save. Put confirmed work in Confirmed only when the user's evidence supports it. Starting from no context, leave planning cards in Ideas & decisions and state that dates/budget/bookings are not yet known.
5. Return the board name/ID and what was actually saved. Later “where are we with the wedding?” uses `board status`, followed by targeted evidence reads when necessary.

Creating board organization alone does not create notes. Existing `remember`/`update` authorization and remote write protection still apply to card contents. Board writes also require authorization on a shared brain. The wedding example is illustrative; it does not imply personal facts or create a real wedding board.
