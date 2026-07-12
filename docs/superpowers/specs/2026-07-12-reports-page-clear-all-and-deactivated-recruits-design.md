# Reports Page: Clear All + Deactivated Recruits — Design

## Goal

Two independent additions to recruit/results lifecycle management:
1. A guarded bulk-delete of all test results, for starting a fresh training
   cycle without touching the roster or test templates.
2. A place to see recruits that have been deactivated (they're never hard-
   deleted, per `RecruitsAdminPage.jsx`'s existing `deactivate()` — sets
   `isActive: false`), since today they simply vanish from the admin view.

## 1. Clear All (results only) — `ReportingHomePage.jsx` (#1)

Confirmed scope: this deletes every document in the `sessions` collection
(and each session's `lineResults` subcollection) — all pass/fail history,
for every recruit, all time. **Recruits and test templates are untouched.**
Firestore rules already permit staff to write/delete `sessions`
(`firestore.rules:101`), but this button is admin-only in the UI given the
blast radius — matches how `TemplatesAdminPage`/`RecruitsAdminPage` restrict
their destructive actions.

- Button: "Clear All Results", admin-only, placed in the `Reports` quick-
  link section of `ReportingHomePage.jsx`, styled danger (red, matches
  existing `--brand-red` destructive button convention).
- Confirmation: per the product's "destructive actions are guarded"
  principle, a modal requires typing `CLEAR` into a text field before the
  confirm button enables (not just Yes/No — this is irreversible and wipes
  every recruit's history). Modal states plainly: "This permanently deletes
  all test results for every recruit. Recruits and test templates are not
  affected. This cannot be undone."
- Implementation: new `clearAllSessions()` in `web/src/lib/reportsData.js`.
  Query all `sessions` docs, for each fetch its `lineResults` subcollection,
  delete both in `writeBatch` chunks of ≤500 writes (Firestore batch limit).
  Show a simple in-modal progress state ("Deleting… N sessions") since a
  large history may take multiple batches.

## 2. Deactivated Recruits page (#5)

New page `web/src/pages/DeactivatedRecruitsPage.jsx`, route
`/recruits/deactivated`. Same query shape as `RecruitsAdminPage.jsx` but
`where("isActive","==",false)`, excluding the practice recruit the same way
(`!r.isPractice && r.id !== PRACTICE_RECRUIT_ID`).

- Reached via a small link/button on `RecruitsAdminPage.jsx` (e.g. "View
  Deactivated" near the search field).
- Each row shows the same tile info (photo/initials, name, cohort) plus a
  **Reactivate** button (`updateDoc(..., { isActive: true })`) — the direct
  inverse of "Deactivate," included since a deactivate-only one-way door
  would make this a dead end for a roster fix (recruit re-enrolled, or
  deactivated by mistake).
- No delete option here — the point of this page is exactly that deactivated
  recruit data cannot be deleted (roster/results integrity).

## Files touched / added

- `web/src/pages/reporting/ReportingHomePage.jsx` (Clear All button + modal)
- `web/src/lib/reportsData.js` (`clearAllSessions()`)
- `web/src/pages/DeactivatedRecruitsPage.jsx` (new)
- `web/src/pages/RecruitsAdminPage.jsx` (link to new page)
- `web/src/App.jsx` (or wherever routes are declared — add the new route)

No Firestore rule changes needed (existing admin/staff write rules on
`sessions` and `recruits` already cover both operations).
