# Manage Tests Page Tweaks — Design

## Goal

Five small, independent fixes to the test-template management flow. No new
data model, no new components — each is a targeted edit to an existing file.

## 1. Draft tests hidden from the live-test picker (#3)

`HomePage.jsx` currently branches: non-admins query
`where("status","==","published")`, admins query without that constraint and
get a "Draft" badge on draft tiles — which are still clickable and start a
live test.

Fix: drop the `isAdmin` branch. Everyone's query always includes
`where("status","==","published")`. Drafts never appear in the picker,
admins included. The `isDraft` variable and its badge JSX in `HomePage.jsx`
are deleted as dead code. Admins still manage/preview drafts from the Manage
Tests page (`TemplatesAdminPage.jsx`), which already queries by `isActive`
only and shows the Draft/Published badge there.

## 2. "Retire" → "Delete" (#6)

Label-only change in `TemplatesAdminPage.jsx`. The button still calls the
same handler, which sets `isActive: false` (soft-delete — the doc stays in
Firestore so historical results keep resolving the template name/id). No
behavior change, confirmed with the user: soft-delete semantics are kept
specifically so nothing that references old results breaks.

## 3. Subtitles on the Manage Tests list (#8)

`TemplatesAdminPage.jsx`'s list row shows only `template.name` + status
badge today. Add `template.description` as a muted line underneath, same
treatment `HomePage.jsx` already uses for its tiles. No change if a template
has no description (field is optional).

## 4. Save & Exit fix (#10)

`TemplateEditorPage.jsx` line 134: "Save & Exit" navigates to `"/"`
(HomePage) instead of `"/templates"` (Manage Tests). One-line fix:
`navigate("/")` → `navigate("/templates")`.

## 5. Reorder "+ New Test Template" (#11)

`TemplatesAdminPage.jsx`: move the button above the `templates.map(...)`
list instead of below it, so it's the first thing on the page under the
intro copy.

## Files touched

- `web/src/pages/HomePage.jsx`
- `web/src/pages/TemplatesAdminPage.jsx`
- `web/src/pages/TemplateEditorPage.jsx`

No Firestore schema or security-rule changes.
