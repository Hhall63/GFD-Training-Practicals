# Nav / Labeling Polish — Design

Three small, unrelated-but-cohesive nav/UI fixes on the admin side: rename
three menu labels, fill in two missing dashboard icons, and add a way back
to the admin dashboard from the "Select a Test" screen. First of four
sub-projects split out from a larger request (see "Related items" below).

## Problem

- Three admin nav labels don't match current terminology: "Enter Exam
  Scores" should read "Written Test Gradebook," "Manage Tests" should read
  "Manage Practicals," and "Manage Exams" should read "Test Bank" (the
  admin dashboard's grid already calls the underlying feature "Test Bank"
  everywhere else it's referenced).
- `AdminDashboardPage.jsx`'s dashboard grid renders a per-tile icon via an
  `ICON_BY_PATH` lookup, but `/exams` and `/exam-scores` have no entry —
  those two tiles currently render with no icon at all.
- The "Select a Test" screen (`HomePage.jsx`) has no way back to the admin
  dashboard. It's reachable two ways: as `/` (an evaluator's actual home —
  fine, nothing to fix there) and as `/start-test` (a sub-screen admins
  reach by clicking "Start a Test" on their dashboard — here there's
  currently no way back except the browser's back button).

## Scope

Admin-side labeling and navigation only. No data model changes, no new
routes, no new components.

## Changes

### 1. Renames

Source of truth for nav labels is `getAdminNavItems()` in `navItems.js`;
two pages additionally hardcode a matching `TopBar` title that needs to
change alongside it.

- `navItems.js`:
  - `"Manage Tests"` → `"Manage Practicals"` (`/templates`)
  - `"Manage Exams"` → `"Test Bank"` (`/exams`)
  - `"Enter Exam Scores"` → `"Written Test Gradebook"` (`/exam-scores`)
- `ExamsAdminPage.jsx`: `TopBar title="Manage Exams"` → `"Test Bank"`
- `ExamScoresPage.jsx`: `TopBar title="Enter Exam Scores"` →
  `"Written Test Gradebook"`

`TemplatesAdminPage.jsx`'s `TopBar title` already reads `"Test Templates"`,
not `"Manage Tests"` — that string is unrelated to this rename and is left
untouched.

### 2. Icons

Two new cases added to the existing `Icon` component in
`AdminDashboardPage.jsx`, matching its established style (24px, `1.75`
stroke, `currentColor`, no fill except where the existing icons already use
one):

- `/exams` (Test Bank): an archive-box icon (lidded box with a slot line) —
  reads as "a bank of stored items," visually distinct from the existing
  stacked-layers icon already used for Test Groups.
- `/exam-scores` (Written Test Gradebook): an open-book icon — reads as
  "gradebook," visually distinct from the existing checkmark-clipboard icon
  already used for Batch Grade.

Both get an entry added to `ICON_BY_PATH`.

### 3. Return-to-dashboard button

`HomePage.jsx` uses `useLocation()` to check whether the current path is
`/start-test`. When it is, it passes `onBack={() => navigate("/")}` to
`<TopBar>` — the same back-arrow affordance every other admin page already
uses (`ExamsAdminPage`, `ExamScoresPage`, `TemplatesAdminPage` all do
exactly this today). When the path is `/` instead (an evaluator's home),
`onBack` stays unset, matching today's behavior with no added button.

## Non-goals

- No changes to `TemplatesAdminPage.jsx`'s own page title.
- No new icon component, icon library, or icon style system — reuses the
  existing inline-SVG `Icon` switch in place.
- No changes to routing, permissions, or any other page's title.

## Testing

Manual verification (no unit-test framework in `web/`, consistent with
this repo's other recent plans):

1. Log in as admin → dashboard grid shows "Manage Practicals," "Test
   Bank," and "Written Test Gradebook" tiles, each with a distinct icon (no
   blank icon slots).
2. Open the admin `⋯` menu from any admin page → same three renamed labels
   appear in the dropdown.
3. Navigate to Test Bank (`/exams`) and Written Test Gradebook
   (`/exam-scores`) directly → each page's own header now reads the new
   name too.
4. From the admin dashboard, click "Start a Test" → the Select a Test
   screen shows a back arrow that returns to the dashboard.
5. Log in as an evaluator (non-admin) → their landing screen (Select a
   Test, at `/`) shows no back arrow, unchanged from today.

## Related items

Split from a larger request; the other three sub-projects (each its own
future spec):

- Confirmation dialogs before delete/deactivate actions app-wide.
- Practicals grading logic: notes-required-on-failure rules, default
  checklist view.
- Add-evaluator wizard with scheduled auto-deactivation and a QR-code
  password-setup invite flow.
