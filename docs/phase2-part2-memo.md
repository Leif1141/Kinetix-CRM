# KinetixCRM phase 2 part 2: what changed and how to ship it

Branch `phase2-part2`, six commits on main cd22572; main has not moved, so the merge is a fast-forward. Nothing is pushed. The store layout and the Firebase rules are unchanged, so shipping is merge, push, reload.

## Result (harness, backup of 23.10.2026, desktop browser)

| Measure | Before (main) | After |
|---|---|---|
| Full re-render after a change | 840 ms | 32 ms |
| +1w click on Today | about 118 ms | 35 to 80 ms |
| Save of one change | about 50 ms | 10 to 30 ms |
| Opening Organizations / People / Open Items | 286 / 212 / 112 ms | 40 / 88 / 44 ms |
| JavaScript loaded at start | 583 KB | 307 KB |
| Inline handlers in the page | about 200 | 0 |
| Module functions on window | 464 globals | 0 |
| prompt() and confirm() | 22 | 0 |
| Ways to replace the whole CRM in one click | 2 (Reset, Import) | 0 |

## What changed

| Step | Change |
|---|---|
| 1 | Only the visible tab renders; other tabs render when opened, tab badges are counted separately. Last-contact and people lookups are cached while a render runs, and only then. Snoozing looks up one record's suggestions. The save diff compares values directly. |
| 2 | Reset to seed is gone. Import is visible and usable only for leif.berger26@gmail.com; it checks the file, shows current and incoming counts, downloads the current state first and needs the word REPLACE. |
| 3 | The two seed modules (293 KB) load only for an empty database or an empty thread list. |
| 4 | One in-page dialog replaces every prompt() and confirm(): letter sent, pass and on hold, shared with, set action, lists, new person from the inbox, notes, links, delete, patch re-apply, restore archived, import. Fits a 375 px screen; Escape closes only the dialog. |
| 5 | Buttons, fields and drag and drop work through one delegated dispatcher (src/events.js) and a registry of module actions; nothing is put on window. The dead Gmail sync code is removed, and the Inbox note now names Outlook and Granola. |

Side effects worth knowing:

- Cancelling the pass or on-hold dialog now snaps the pipeline dropdown back to the stored stage; before, it kept showing the new stage although nothing was saved.
- Visible em and en dashes are replaced by hyphens and colons (empty-value placeholders, five toasts, the timeline sender).
- The backup of 23.10.2026 contains empty values (an adviser with `links: []` and `lists: []`, three empty thread states) that Firebase never stores. Nothing is lost; the tests now treat empty values as absent, as the store does.

## Verified

- `tools/harness/tests.html`: 22 module tests and 42 view checks pass (each tab renders; badges; timings; a remote change reaches a stale tab; one write per field edit; the phase 0 patch gives 307 made and 48 skipped; export equals the backup; Reset gone and Import gated; no seed load with live data; no prompt() or confirm(); five dialog flows; Escape scope; no inline handler; no window exports; every action in every tab resolves; click, typing, checkbox, Enter and details-toggle behaviour).
- By hand: a real import with REPLACE; the Data tab as Tommy (no Import button); an empty database still seeds 75 companies, 80 advisors, 325 people and 187 threads; Dashboard filters, to-dos, sections and sub-tabs; record page list toggle, link add and remove, log activity, star, timeline period; pipeline drag and drop with a cancelled on-hold dialog; map row opening a record; second click on a tab resetting its filters; a Sync run without connections.

Not verified: live Firebase, Outlook and Drive connections (stubbed in the harness), real phones and Tommy's browser.

## Ship

1. Merge `phase2-part2` into main (fast-forward) and push. This deploys.
2. Both users reload the app.
3. Rollback if needed: push the previous main (cd22572); no data change is involved.
