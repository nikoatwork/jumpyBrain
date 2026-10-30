# Boards for agents

Boards are visual in the Mac app and accessible to agents through the optional `jumpybrain board` namespace. Memory capture and retrieval stay the CLI's main workflow. Cards are ordinary Markdown notes; the personal board stores only their IDs, column placement and names.

Open the Mac app and select the intended brain. The CLI uses that running app's private local connection, even when the selected brain is remote. It never switches the app or writes a second board store. Both app and CLI must support this command; older apps fail with update guidance. Closing the window is fine while the app keeps running; quitting the app makes board commands unavailable.

```sh
jumpybrain board list --json
jumpybrain board status --board "Wedding planning" --json
jumpybrain board show --board "Wedding planning" --json
```

`list` includes active and settled boards. `show` returns the layout without fetching notes. A selector is a stable board ID or an exact, case-sensitive name; duplicate names require the ID. Output includes the selected brain profile, root or remote URL, and the **scope-wide board revision**. Use `--brain <profile-ID>` to require that exact selected connection on subsequent calls. There is no `--root`, `--target-url`, named target registry or `run memory:board` recipe.

## Create and maintain a board

```sh
jumpybrain board create --name "Wedding planning" \
  --column "Ideas & decisions" --column "Making it happen" --column "Confirmed" --json

# Substitute the board ID, note ID and latest revision from actual results.
jumpybrain board add --board <board-ID> --page <mem_id> --column 1 --if-match <revision> --json
jumpybrain board add --board <board-ID> --page <mem_id> --column 2 --if-match <revision> --json
jumpybrain board update --board <board-ID> --name "Our wedding" --if-match <revision> --json
jumpybrain board update --board <board-ID> --archived true --if-match <revision> --json
jumpybrain board update --board <board-ID> --archived false --if-match <revision> --json
jumpybrain board remove --board <board-ID> --page <mem_id> --if-match <revision> --json
jumpybrain board delete --board <board-ID> --if-match <revision> --json
```

`add` appends to the specified 1-based column, moving a note already on the board. Removing a card or deleting a board preserves its notes and their memberships on other boards. `archived: true` corresponds to Settle in the app. `update --column` accepts exactly three names and preserves each column's cards.

Every mutation except creation requires the revision returned by a prior read or successful save. A concurrent app/agent change fails instead of overwriting it. Read again and reconcile; do not retry blindly. If a create response is lost, inspect `list` before recreating. Scope changes during a command fail too.

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

The current board format has three columns, at most 100 boards per connection, 100 cards per column, and 100-character names. The gateway's existing 32 KiB save-request limit may be reached before those individual maxima. `--directory` overrides the companion **support directory**, principally for fixtures/nonstandard installations; it is not a memory folder.

## Answer initiative-status questions

`status` reads current Markdown for up to 12 cards in column/card order, with `--limit 1..50` available explicitly. It returns column totals, note IDs, titles, source paths and content hashes, writing/edit metadata when present, and up to 1,000 characters of whole body lines per inspected card. Its source line numbers include frontmatter. `partial`, `omittedCards`, `unavailableCards` and `truncatedCards` make evidence gaps explicit; a first line exceeding the excerpt bound yields no excerpt and a truncation marker.

Use the excerpts to answer what is decided, in progress, blocked or awaiting a decision. Cite the notes and preserve uncertainty. Column labels are user-defined organization, not verified completion or a reason to invent a completion percentage. `observedAt` is the read time, not when a claim became true. Notes are read separately: there is no multi-file snapshot or retained status history. A layout change during the read fails the command.

For missing detail, use the returned note ID/hash with ordinary `expand` on the **matching root/target**. For cards beyond the status limit, use `board show` to obtain their IDs, then read only relevant notes. Missing/unavailable cards remain on the board; outages are never evidence of completion. Remote status uses the app's read capability and credentials, never a remote memory write. Board operations do not run search or indexing.

## Wedding-planning example

For “create me a board to keep an eye on wedding planning,” an agent should:

1. Read `board list --json`, verify the intended destination, and reuse an existing board if appropriate.
2. Recall already-known wedding context on that same brain. Preserve unknown date, budget, guest count and booking decisions as unknown.
3. Create useful ordinary notes through `remember`, using its returned canonical IDs. A compact starting set is **Wedding overview**, **Budget & payments**, **Guest list & RSVPs**, **Venue & date**, **Food & drinks**, **Photography & music**, and **Ceremony & day-of plan**. Each note can contain known decisions, open questions, the next action and source links. Checkboxes, concise headings and meaningful titles make the Mac cards useful without a separate board content format.
4. Create the three-column board and add those IDs, or populate one JSON layout and create it in one save. Put confirmed work in Confirmed only when the user's evidence supports it. Starting from no context, leave planning cards in Ideas & decisions and state that dates/budget/bookings are not yet known.
5. Return the board name/ID and what was actually saved. Later “where are we with the wedding?” uses `board status`, followed by targeted evidence reads when necessary.

Creating board organization alone does not create notes. Existing `remember`/`update` authorization and remote write protection still apply to card contents. Boards remain personal even on a shared brain. Back up application support to preserve layout; copying or reindexing the Markdown vault does not carry boards.
