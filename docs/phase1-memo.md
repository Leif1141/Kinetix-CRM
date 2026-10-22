# KinetixCRM phase 1: what changed and how to cut over

Branch `phase1-shell`, six commits on top of phase 0. Nothing is pushed. A push to main deploys to GitHub Pages, so the cut-over order below matters.

## What changed

| Area | Before | Now |
|---|---|---|
| Code | One index.html, 3,075 lines | index.html holds the markup, styles.css the CSS, src/ holds 35 ES modules (config, constants, state, util, store, sync, views). No build step; Pages serves the files as they are |
| Store | One `crm` node, 3.2 MB rewritten on every save, last writer wins for the whole database | crm/companies, advisors, people, touches, threads, inbox, dash, meta, each record its own node. A save sends only the fields that changed (a Done click is about 400 bytes). Each client listens per collection and merges remote changes field by field into the live records |
| Home | Overview with follow-up tables, suggestions, favourites, lists | Today: one queue (overdue, promises, due today, letter cadence; then live deals without next step, stale deals, revisit dates) with Done, +1w, +1m, Ignore, Set action, Dismiss. Weekly scorecard: letters out vs 10, replies, meetings, names from partners, live deals without next step. Recent activity collapsed. Global search stays at the top |
| Record | Modal with about 50 inputs and a Save button | Page per record at #rec/{id}: click a value, edit, Enter or blur saves that field, Escape cancels, Tab moves on. Next step with open promises that can be ticked off. Letter and cadence, people, files, shared names, log activity, activity chart, contact history, delete |
| Palette | none | Ctrl+K: type a name, Enter opens, Tab switches to Log call or Set next action, which run inside the palette |
| Phone | 870 px tables, full header | Below 720 px: menu button, connection bar behind a toggle, tabs scroll sideways, tables and the queue render as stacked cards, pipeline board scrolls sideways, record page stacks |
| Language | Mixed | UI chrome in English. Record content, drafts and notes stay as written |

Unchanged: the patch op vocabulary (`applyPatchOps`), the Drive proxy, the Apps Script backup, `KinetixCRM Backup.json` shape (the exporter rebuilds it from the new store), sync_diff.py, _outlook_bridge.py, _linkedin_build.py, Outlook and Granola sync, Pipeline, Open Items, Inbox, Map, Reports, Dashboard, Data tab.

Side effects worth knowing:

- The favourites star in the Organisations and People tables works again (two functions with the same name had overwritten each other).
- Dashboard to-do and decision filters call functions instead of writing globals from inline handlers.
- Record arrays come back from the store in id order, not insertion order. No view depended on the old order.
- Threads and dashboard items carry a hidden `_ord` field in the store; the exporter strips it.

## Verified in the local harness

Data: the Drive `KinetixCRM Backup.json` of 22.10.2026 (113 companies, 241 advisors, 282 people, 2,678 touches, 198 threads, 245 to-dos).

- Every tab renders without console errors; the record page, palette and phone layout exercised by script.
- Migration (tools/migrate.html) against the blob: shard, copy to crm_legacy, write, read back, compare: identical.
- Export of the migrated store equals the input backup (records compared as sets by id).
- The phase 0 taxonomy patch applies with the same counts on the old and the new code (307 made, 48 skipped).
- Save after a Done click: 4 fields, 397 bytes. Record field edit: 1 field. Logged call: 1 touch node.
- A change written by a second client lands in the open record without a reload.
- A database still in the old layout opens read-only with a status line saying so.

Not verified: live Firebase (rules, auth, latency), MSAL and Google scripts (stubbed), Chart.js and Leaflet from the CDN inside the harness were loaded but not visually inspected on every tab, Tommy's browser.

## Running the harness

```
python tools/harness/build.py "C:\Users\LeifBerger\My Drive\Investments\Dynamo\0. Admin\3. CRM\KinetixCRM Backup.json"
python tools/harness/serve.py 8765
```

Then open http://localhost:8765/_harness.html?mode=sharded (new layout) or ?mode=blob (old layout). The data copy under tools/harness/data and the generated _harness*.html files are gitignored.

## Decisions still open

1. Store layout as built (crm replaced in place, crm_legacy copy, dash split under crm/dash). Built on the assumption that this is approved.
2. Tommy's address in `src/config.js` and `database.rules.json`: both carry tommy@kinetix-industries.com, the address that was in the app. If the Google account is tommybennett012@gmail.com, add it to both before publishing the rules.

## Cut-over

1. Review the branch; merge into main locally, do not push yet.
2. Firebase console, Realtime Database, Rules: paste `database.rules.json`, publish.
3. Close every open CRM tab (Leif and Tommy).
4. Serve the merged main locally or push a preview; open tools/migrate.html, sign in as Leif, run steps 1 to 4, read the verification line ("identical").
5. Push main. Reload the app. The status line must not say "old layout".
6. Trigger a Sync (or wait for the auto backup) and check that `KinetixCRM Backup.json` in Drive has a fresh timestamp and still opens in sync_diff.py.
7. After a week without issues, delete `crm_legacy` in the console.

Rollback at any point before step 5: nothing changed in main. After step 5: push the previous main again (the old app reads the blob; copy `crm_legacy` back to `crm` in the console first).

## Known gaps for phase 2

- Inline onclick handlers remain in the older views; main.js exposes module exports on window for them. New views (Today, record page, palette) use listeners.
- The undo stack still snapshots the whole state per save.
- Drafts and call guides in Open Items are German text data, not translated.
- No tests run outside the browser harness; there is no node on the machine.
