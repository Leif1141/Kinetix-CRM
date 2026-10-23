# KinetixCRM phase 2 part 2 plan (branch phase2-part2)

Part 2 makes the app fast on every click, removes two ways to wipe the live database by accident, and finishes the code clean-up that phase 1 left. No new features. Five steps, one commit each, each verified in the harness before the next starts.

## Where it stands (measured on main, 23.10.2026, harness with the Drive backup)

| Measure | Value | Why it matters |
|---|---|---|
| Full re-render (renderAll) | 840 ms on desktop | Runs after every save and every change from the other user; 38 call sites. On a phone this is a multi-second freeze |
| Of which Organisations / People / Open Items | 286 / 212 / 112 ms | Rendered even when hidden |
| Page size | 23,451 DOM nodes | All ten tabs stay rendered at once |
| JavaScript loaded at start | 583 KB, of which 288 KB seed data | Seed data is only needed for an empty database |
| Inline handlers in markup | about 200 (dashboard 54, index.html 49, pipeline 32) | Forces 464 globals on window; one name clash already broke the favourites star in phase 1 |
| prompt() and confirm() dialogs | 22 | Unusable on a phone for multi-field input (letter sent, pass reason, on-hold revisit date) |
| Reset to seed, Import JSON | Live on the Data tab | With per-record writes, either one replaces all 637 records for both users within a second |

## Steps

| # | Step | Done when |
|---|---|---|
| 1 | Render only what is visible. A change marks all views stale; the active tab, the open record page and the tab badges render at once, the rest render when opened | A Done click and a remote change cost under 100 ms in the harness; every tab still shows current data after switching |
| 2 | Close the two wipe paths. Remove Reset to seed. Import becomes owner-only (leif.berger26@gmail.com), shows the record counts it would replace, downloads an export of the current state first and asks for the word REPLACE | Neither action can run by a single click; Tommy cannot see either |
| 3 | Load seed data only when needed. The 288 KB seed modules load through a dynamic import when the database or the thread list is empty | Start loads about 295 KB of JavaScript; an empty harness database still seeds |
| 4 | Replace prompt() and confirm() with one small in-page dialog (fields, Save, Cancel, Enter, Escape), used for letter sent, pass and on-hold reasons with revisit date, shares, lists, new person from the inbox, delete confirmations | No prompt() or confirm() left; each flow works at 375 px width |
| 5 | Delegated listeners instead of inline handlers, view by view (pipeline, organisations, people, Open Items, inbox, map, reports, data, dashboard, record page remainder, header markup), then remove the window compatibility layer in main.js. The Gmail sync stub goes with it | No on*= attribute left in markup; window carries no module exports; all tabs work |

Every step extends `tools/harness/tests.html` with view-level checks (each tab renders without errors, queue counts, a record field edit gives one write, the phase 0 patch gives 307 made and 48 skipped, export equals the backup), so the walk-through becomes one page of PASS and FAIL lines.

## Not in this part

| Item | Reason |
|---|---|
| German drafts and call guides in Open Items | Record content, stays as written (CLAUDE.md) |
| Finer touch listening | A new email on the largest record (Rettig Family Capital, 150 touches) re-sends its 141 KB touch map to the other client. Acceptable at two users; a flatter layout would need a second migration |
| Validation rules in Firebase | Two trusted users; revisit if the user base grows |

## Decisions for Leif

1. Remove Reset to seed entirely (recommended), or keep it owner-only behind the same REPLACE confirmation as Import.
2. Import stays available to leif.berger26@gmail.com only (recommended), or is removed as well; the Drive backup plus crm_legacy already cover recovery.

## Delivery

Branch `phase2-part2` off main (cd22572), worktree `C:\Users\LeifBerger\Code\Kinetix-CRM-p2b`. Nothing goes to main without Leif's go; a push to main is a live deploy. No store layout change, so no migration and no rules change at cut-over: merge, push, reload.
