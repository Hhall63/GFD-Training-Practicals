# Batch Grade "+ Add New" Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "+ Add New" modal on the Batch Grade screen — currently a picker
listing every published instructor-graded test — with a plain Title + Description form
that creates a new batch-grade entry directly.

**Architecture:** Single-file change to `web/src/pages/BatchGradePage.jsx`. The
`AddNewBatchTestModal` sub-component swaps its `officialTests` listbox for two controlled
inputs and calls the existing `createBatchGradeTemplate(name, description)` from
`web/src/lib/batchGrade.js` on submit (no changes to that function — its signature
already matches). The `officialTests` Firestore query and state in the parent
`BatchGradePage` component are deleted since nothing else reads them.

**Tech Stack:** React 18 (JSX, no TypeScript), Vite, Firebase/Firestore client SDK,
`react-router-dom` v6. No test runner is configured in this repo (`web/package.json` has
no `test` script and there are no `*.test.*`/`*.spec.*` files) — verification is manual,
via this project's `.claude/worktrees/plans-evd-batch-aggressive/web:verify` skill
(emulator-backed harness for driving the app end-to-end).

## Global Constraints

- Only `web/src/pages/BatchGradePage.jsx` changes. No changes to
  `web/src/lib/batchGrade.js`, Firestore document shapes, the batch-grade seed templates,
  the "Select a Test" picker modal, `TestGroupsAdminPage.jsx`, or
  `TemplatesAdminPage.jsx`.
- Match the existing form convention from `NewTemplateModal` in
  `web/src/pages/TemplatesAdminPage.jsx:103-152`: `field`-classed wrapper divs, a text
  `<input>` for name and a `<textarea rows={2}>` for description, `secondary`/`primary`
  button classes, Create disabled while `!name.trim()` or while saving, with a
  `"Creating…"` label mid-save.
- `createBatchGradeTemplate(name, description)` (already implemented in
  `web/src/lib/batchGrade.js`) is called with the raw description string (it already
  handles an empty/optional description internally — pass `description` as typed, no need
  to coerce `""` vs `undefined`).

---

### Task 1: Replace the test-picker modal with a Title + Description form

**Files:**
- Modify: `web/src/pages/BatchGradePage.jsx:9-187`

**Interfaces:**
- Consumes: `createBatchGradeTemplate(name, description)` from
  `web/src/lib/batchGrade.js` (already imported at line 7; signature unchanged).
- Produces: `AddNewBatchTestModal` now takes props `{ onClose, onCreated }` (drops
  `officialTests`); `onCreated(id)` is called with the new template's doc id exactly as
  before, so the parent's existing `onCreated` handler (line 139-142, sets `selectedId`
  and closes the modal) needs no changes.

- [x] **Step 1: Remove the unused `officialTests` state and its Firestore query effect**

  In `web/src/pages/BatchGradePage.jsx`, delete line 15
  (`const [officialTests, setOfficialTests] = useState([]);`) and the entire effect at
  lines 34-52 (the comment block plus the `useEffect` that queries `templates` where
  `isActive == true && status == "published"` and filters into `officialTests`).

  Also remove the now-unused imports this leaves dangling: check whether `where` and
  `query`/`collection`/`onSnapshot` from `"firebase/firestore"` (line 3) are still used
  elsewhere in the file — they are (the `templates` query at lines 21-32 still uses all
  four), so leave the import line unchanged.

- [x] **Step 2: Stop passing `officialTests` into the modal**

  At lines 135-144, change:

  ```jsx
  {showAddNew && (
    <AddNewBatchTestModal
      officialTests={officialTests}
      onClose={() => setShowAddNew(false)}
      onCreated={(id) => {
        setShowAddNew(false);
        setSelectedId(id);
      }}
    />
  )}
  ```

  to:

  ```jsx
  {showAddNew && (
    <AddNewBatchTestModal
      onClose={() => setShowAddNew(false)}
      onCreated={(id) => {
        setShowAddNew(false);
        setSelectedId(id);
      }}
    />
  )}
  ```

- [x] **Step 3: Rewrite `AddNewBatchTestModal` as a Title + Description form**

  Replace the entire function at lines 149-187 with:

  ```jsx
  function AddNewBatchTestModal({ onClose, onCreated }) {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [saving, setSaving] = useState(false);

    async function handleCreate() {
      setSaving(true);
      try {
        const created = await createBatchGradeTemplate(name.trim(), description.trim());
        onCreated(created.id);
      } finally {
        setSaving(false);
      }
    }

    return (
      <Modal titleId="add-new-batch-test-title" onClose={onClose} maxWidth={420}>
        <h3 id="add-new-batch-test-title" style={{ marginTop: 0 }}>Add Batch Grade Test</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Create a new entry for the Batch Grade list.
        </p>
        <div className="field">
          <input
            type="text"
            placeholder="Test Name (e.g. Ladder Raise Evolution)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <textarea
            placeholder="Description (optional)"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={!name.trim() || saving}
            onClick={handleCreate}
          >
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </Modal>
    );
  }
  ```

  This mirrors `NewTemplateModal` in `web/src/pages/TemplatesAdminPage.jsx:103-152`
  (same `field` wrapper divs, same disabled/saving-label convention). The
  `role="listbox"`/`test-tile` picker UI and the `handlePick`/`creatingId` state it used
  are gone entirely — there is no list to pick from anymore.

- [x] **Step 4: Check the file for leftover references**

  Search `web/src/pages/BatchGradePage.jsx` for `officialTests` and `test-tile` inside
  `AddNewBatchTestModal` — there should be zero matches left in this file. (`test-tile`
  still legitimately appears once, in the unrelated "Select a Test" picker modal at
  lines 110-133 — leave that alone.)

- [x] **Step 5: Commit**

  ```bash
  git add web/src/pages/BatchGradePage.jsx
  git commit -m "feat: replace batch grade add-new picker with title/description form"
  ```

---

### Task 2: Manually verify the new flow end-to-end

**Files:** none (verification only)

**Interfaces:** none

- [x] **Step 1: Load the `.claude/worktrees/plans-evd-batch-aggressive/web:verify` skill**

  Use the project's `web:verify` skill (Vite dev server + Firestore emulator harness) to
  build and run the app, per that skill's instructions.

- [x] **Step 2: Drive the Batch Grade screen**

  Navigate to `/batch-grade`. Click "+ Add New". Confirm:
  - The modal shows a "Test Name" text input and a "Description (optional)" textarea —
    no scrollable list of existing tests.
  - "Create" is disabled when the name field is empty.

  Verified via Playwright: 0 `[role=listbox]` elements in the add-new modal, 1 name
  input, 1 description textarea, Create disabled with empty name, enabled after
  filling name.

- [x] **Step 3: Create a new entry and confirm it persists**

  Type a distinctive test name (e.g. `"Verify Add New Form"`), optionally a description,
  click "Create". Confirm:
  - The modal closes and the "Test" picker on the main screen now shows the new name as
    selected.
  - Reopen the "Test" picker ("Select a Test" modal) — the new entry appears in the list
    (proves it was written to Firestore via `createBatchGradeTemplate`, not just local
    state).
  - "Start Grading" is enabled and navigates to `/batch-grade/:templateId` for the new
    template without error.

  Verified via Playwright against the emulator harness: created "Verify Add New Form
  X7Q9", modal closed, main screen showed it selected, it appeared in the Select-a-Test
  picker, Start Grading was enabled and navigated to `/batch-grade/<newId>`.

- [x] **Step 4: Confirm no regressions in the existing "Select a Test" picker**

  Confirm the separate "Select a Test" modal (opened via the `Test` field button, not
  "+ Add New") is unaffected — it still lists existing batch-grade templates and still
  works as before.

  Verified — the picker listed both the seed templates and the newly created entry, and
  selecting it worked as before.
