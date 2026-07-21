# Batch Grade "+ Add New" — Free-Text Form Instead of Test Picker

## Context

`BatchGradePage.jsx`'s "+ Add New" button opens `AddNewBatchTestModal`, which currently
lists every published, non-batch, non-exam template (`officialTests`) as a scrollable
picker. Clicking a tile seeds a new batch-grade template from that test's `name`/
`description` via `createBatchGradeTemplate(name, description)`.

This reverts that flow to a plain-entry form: a title field and a description field,
submitted directly — no picking from an existing test list. This is also what the
original feature spec (`2026-07-12-batch-grade-feature-design.md`) called for before the
picker was added.

## Change

**`web/src/pages/BatchGradePage.jsx`**

1. `AddNewBatchTestModal` UI: replace the `officialTests` listbox with:
   - `Test Name` text `<input>` (required)
   - `Description (optional)` `<textarea>`, rows=2
   - Cancel / Create buttons (`secondary` / `primary` classes), Create disabled while
     `!name.trim()` or while saving, showing `"Creating…"` label mid-save — matching the
     convention in `TemplatesAdminPage.jsx`'s `NewTemplateModal`.
2. On Create: call the existing `createBatchGradeTemplate(name, description)`
   (`web/src/lib/batchGrade.js`) directly. No changes to `batchGrade.js` — its signature
   already takes a plain name/description pair.
3. Remove the now-unused `officialTests` state (`BatchGradePage.jsx:15`), its Firestore
   query effect (`BatchGradePage.jsx:34-52`), and the `officialTests` prop passed into
   `AddNewBatchTestModal` (`BatchGradePage.jsx:137`) — nothing else in the file reads it.

## Out of scope

- No changes to `batchGrade.js`, Firestore document shape, or the batch-grade seed
  templates.
- No changes to the "Select a Test" picker modal (the one listing existing batch-grade
  templates) — only the "+ Add New" creation modal changes.
- No changes to `TestGroupsAdminPage.jsx` or `TemplatesAdminPage.jsx`, which have their
  own independent copies of similar list/form UI.

## Testing

Manual verification: open Batch Grade screen → "+ Add New" → confirm a Title +
Description form appears (no list) → enter a title, submit → new entry appears in the
"Select a Test" picker and can be selected to start grading.
