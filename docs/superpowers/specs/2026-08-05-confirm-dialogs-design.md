# Confirmation Dialogs on Destructive Actions — Design

Adds a confirmation step before every deactivate/delete/remove action in the
admin app. Second of four sub-projects split from a larger request (see
`docs/superpowers/specs/2026-08-05-nav-labeling-polish-design.md`'s "Related
items" for the full list).

## Problem

No destructive action in the app today asks for confirmation — every
deactivate/delete button fires immediately on click, and `window.confirm`
is used nowhere in the codebase. All six of these actions are Firestore
`updateDoc(..., { isActive: false })` calls, not hard deletes, but five of
the six have no in-app way to undo: their admin lists all query
`where("isActive", "==", true)`, so a deactivated item simply vanishes with
no "Deactivated" screen to recover it from (Recruits is the one exception —
`DeactivatedRecruitsPage.jsx` already lists and reactivates deactivated
recruits). A single mis-click is effectively permanent for five of the six.

## Scope

The six actual call sites, confirmed by reading each one's handler:

| # | File | Button | Handler | Entity name field |
|---|------|--------|---------|---|
| 1 | `TemplatesAdminPage.jsx:65` | "Delete" | `retire(template)` | `template.name` |
| 2 | `ExamsAdminPage.jsx:111` | "Deactivate" | `deactivate(exam)` | `exam.name` |
| 3 | `TestGroupsAdminPage.jsx:68` | "Deactivate" | `deactivate(group)` | `group.name` |
| 4 | `RecruitsAdminPage.jsx:116` | "Deactivate" | `deactivate(recruit)` | `` `${recruit.firstName} ${recruit.lastName}` `` |
| 5 | `RecruitsAdminPage.jsx:224` (inside `RecruitFormModal`) | "Remove Login" | `handleRemoveLogin()` | `existingLogin.email` |
| 6 | `AdminsPage.jsx:144` | "Deactivate" | `deactivate(user)` | `user.displayName` |

Explicitly **not** in scope — confirmed non-destructive:
- `DeactivatedRecruitsPage.jsx`'s "Reactivate" — restorative, not destructive.
- `TestBankBuilder.jsx`'s "Remove" — drops a question from an in-progress,
  unsaved working set; trivially re-added from the browse list, nothing is
  persisted or lost.
- `ObstacleCourseRunner.jsx`'s aggressive-driving confirm flow — a
  different kind of confirmation (recording a critical failure during a
  live test run, not deleting/deactivating an entity) that already has its
  own dialog. Left untouched; not part of this feature.

## Component: `ConfirmDialog.jsx`

New file, `web/src/components/ConfirmDialog.jsx`, built on the existing
`Modal` shell (`web/src/components/Modal.jsx` — already provides dialog
semantics, focus trap, Escape-to-close, backdrop-click-to-close, and focus
restoration, so none of that is reimplemented). Styled to match the
existing ad-hoc confirmation already in `ObstacleCourseRunner.jsx`
(`secondary` Cancel + `primary danger` Confirm — `button.primary.danger`
already exists in `theme.css`), generalized into a reusable component
instead of copied a sixth time.

Props: `titleId`, `title`, `message`, `confirmLabel`, `onConfirm`,
`onCancel`.

Behavior:
- Renders `title` as an `h3` (carrying `id={titleId}` for `Modal`'s
  `aria-labelledby`) and `message` as body text.
- Two buttons: Cancel (calls `onCancel`) and Confirm (calls `onConfirm`,
  labeled with `confirmLabel`, e.g. "Delete", "Deactivate", "Remove Login"
  — matching each site's existing button label instead of a generic
  "Confirm").
- While `onConfirm`'s returned promise is pending, both buttons disable and
  the Confirm button's label switches to "Working…" — prevents a
  double-submit from a second click during the network round-trip.
- If `onConfirm` throws, the dialog stays open (does not call `onCancel`)
  and shows an inline error line above the buttons ("Something went wrong.
  Try again.") instead of failing silently — matches the existing
  try/catch + inline-error pattern already used in `AdminsPage.jsx`'s
  `NewUserModal`. Success does not close the dialog itself; the caller's
  `onConfirm` is expected to clear whatever pending-state triggered
  rendering it (see below), which unmounts it.

## Call-site wiring

Each of the six sites gets one new piece of state — the item currently
awaiting confirmation, or `null` — replacing the button's direct call to
the destructive function with setting that state instead. Example
(`ExamsAdminPage.jsx`; the other five follow the identical shape):

```jsx
const [pendingDeactivate, setPendingDeactivate] = useState(null);

// button:
<button ... onClick={() => setPendingDeactivate(exam)}>Deactivate</button>

// rendered once, near the bottom of the component:
{pendingDeactivate && (
  <ConfirmDialog
    titleId="confirm-deactivate-exam"
    title="Deactivate exam?"
    message={`Deactivate "${pendingDeactivate.name}"? This can't be undone in the app.`}
    confirmLabel="Deactivate"
    onConfirm={async () => {
      await deactivate(pendingDeactivate);
      setPendingDeactivate(null);
    }}
    onCancel={() => setPendingDeactivate(null)}
  />
)}
```

`RecruitFormModal` (site 5) already renders inside a `Modal`; its
`ConfirmDialog` stacks on top the same way `ObstacleCourseRunner.jsx`'s
existing confirm dialog already stacks over live-test UI — no special
handling needed, `Modal`'s `zIndex: 30` layering is consistent throughout
the app.

## Per-site copy

Specific to the item and honest about whether it's recoverable, per the
approved design conversation — not a generic "Are you sure?" everywhere:

| Site | Title | Message | Confirm label |
|---|---|---|---|
| Templates | "Delete practical?" | `Delete "{template.name}"? This can't be undone in the app.` | Delete |
| Exams | "Deactivate exam?" | `Deactivate "{exam.name}"? This can't be undone in the app.` | Deactivate |
| Test Groups | "Deactivate test group?" | `Deactivate "{group.name}"? This can't be undone in the app.` | Deactivate |
| Recruits | "Deactivate recruit?" | `Deactivate {recruit.firstName} {recruit.lastName}? You can reactivate them later from Deactivated Recruits.` | Deactivate |
| Recruit's portal login | "Remove portal login?" | `Remove the portal login for {existingLogin.email}? This can't be undone in the app.` | Remove Login |
| Admins/evaluators | "Deactivate user?" | `Deactivate {user.displayName}? This can't be undone in the app.` | Deactivate |

## Non-goals

- No change to what `retire`/`deactivate`/`handleRemoveLogin` actually do
  (still the same `isActive: false` / same Firestore calls) — this feature
  only gates *when* they run, not their implementation.
- No new "Deactivated" recovery screens for exams, test groups, or
  admins/evaluators (only Recruits has one today) — out of scope; the
  honest "can't be undone" copy is this feature's answer to that gap, not
  building four more recovery screens.
- No "type the name to confirm" friction — a two-button dialog with
  specific copy is proportionate for an internal admin tool used by a
  known, trusted staff group.
- `ObstacleCourseRunner.jsx`'s existing aggressive-driving confirm is not
  refactored onto `ConfirmDialog` — out of scope, not broken, not part of
  this request.

## Testing

Manual verification (no unit-test framework in `web/`, consistent with
this repo's other recent plans):

1. For each of the 6 sites: click the destructive button → a dialog
   appears naming the specific item, action doesn't happen yet (no
   Firestore write, item still visible/listed).
2. Click Cancel (or press Escape, or click the backdrop) → dialog closes,
   nothing changed.
3. Click Confirm → button disables and reads "Working…" → item
   disappears from its list (Firestore write happened) → dialog closes.
4. Simulate a failure (e.g. temporarily throw inside one `onConfirm` while
   testing) → dialog stays open, shows the inline error, buttons re-enable
   for retry.
5. Confirm the Recruits dialog's copy differs from the other five
   (mentions reactivating), and that a recruit deactivated this way still
   appears on `/recruits/deactivated` and can be reactivated from there,
   unchanged from today.
