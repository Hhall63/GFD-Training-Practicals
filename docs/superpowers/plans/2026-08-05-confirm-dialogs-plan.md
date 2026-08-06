# Confirmation Dialogs on Destructive Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a confirmation dialog before all six deactivate/delete/remove actions in the admin app, replacing their immediate no-confirmation Firestore writes.

**Architecture:** One new shared component (`ConfirmDialog.jsx`, built on the existing `Modal` shell) plus six small wiring edits, one per call site, each replacing a button's direct call to its destructive function with setting local "pending" state that conditionally renders `ConfirmDialog`.

**Tech Stack:** React (existing components/hooks), `firebase/firestore` (existing, unchanged calls), no new dependencies.

## Global Constraints

- `ConfirmDialog` props: `titleId`, `title`, `message`, `confirmLabel`, `onConfirm`, `onCancel` — no other props (no `danger` toggle; every use in this app is destructive).
- While `onConfirm`'s promise is pending, both buttons disable and the confirm button reads `"Working…"`.
- If `onConfirm` throws, the dialog stays open, buttons re-enable, and an inline error (`"Something went wrong. Try again."`) renders above the buttons — it does NOT call `onCancel` on failure.
- On success, `ConfirmDialog` does not close itself — the caller's `onConfirm` clears the pending-state that's conditionally rendering it, which unmounts it.
- Exact per-site copy (from `docs/superpowers/specs/2026-08-05-confirm-dialogs-design.md`):

  | Site | `titleId` | `title` | `message` | `confirmLabel` |
  |---|---|---|---|---|
  | Templates | `confirm-delete-template` | `Delete practical?` | `` Delete "${template.name}"? This can't be undone in the app. `` | `Delete` |
  | Exams | `confirm-deactivate-exam` | `Deactivate exam?` | `` Deactivate "${exam.name}"? This can't be undone in the app. `` | `Deactivate` |
  | Test Groups | `confirm-deactivate-test-group` | `Deactivate test group?` | `` Deactivate "${group.name}"? This can't be undone in the app. `` | `Deactivate` |
  | Recruits | `confirm-deactivate-recruit` | `Deactivate recruit?` | `` Deactivate ${recruit.firstName} ${recruit.lastName}? You can reactivate them later from Deactivated Recruits. `` | `Deactivate` |
  | Recruit's portal login | `confirm-remove-login` | `Remove portal login?` | `` Remove the portal login for ${existingLogin.email}? This can't be undone in the app. `` | `Remove Login` |
  | Admins/evaluators | `confirm-deactivate-user` | `Deactivate user?` | `` Deactivate ${user.displayName}? This can't be undone in the app. `` | `Deactivate` |

- Do not change what `retire`/`deactivate`/`handleRemoveLogin` actually do (still the same `updateDoc(..., { isActive: false })` calls) — only gate when they run.
- Do not touch `DeactivatedRecruitsPage.jsx`'s Reactivate, `TestBankBuilder.jsx`'s Remove, or `ObstacleCourseRunner.jsx`'s existing aggressive-driving confirm — all explicitly out of scope.
- No unit-test framework exists in `web/` — verification is via grep + `npm run build` per task, plus a live end-to-end browser pass in the final task (this repo's established convention; do not add a test framework for this change).

---

### Task 1: The shared `ConfirmDialog` component

**Files:**
- Create: `web/src/components/ConfirmDialog.jsx`

**Interfaces:**
- Consumes: `Modal` from `./Modal.jsx` — existing component, props `{ titleId, onClose, children, maxWidth }` (unchanged, already in the repo).
- Produces: `export default function ConfirmDialog({ titleId, title, message, confirmLabel, onConfirm, onCancel })` — a React component. Tasks 2–6 import and render it with exactly these six props.

- [ ] **Step 1: Confirm the building block this reuses**

```bash
cd web && grep -n "export default function Modal" src/components/Modal.jsx
```

Expected: one match — confirms `Modal` exists and is the default export before building on top of it.

- [ ] **Step 2: Create `web/src/components/ConfirmDialog.jsx`**

```jsx
import { useState } from "react";
import Modal from "./Modal";

/** Generic destructive-action confirmation, built on the shared Modal shell (focus trap,
 * Escape-to-close, backdrop-click-to-close, focus restoration — see Modal.jsx). Every
 * deactivate/delete/remove action in the admin app routes through this instead of firing
 * immediately — see docs/superpowers/specs/2026-08-05-confirm-dialogs-design.md. */
export default function ConfirmDialog({ titleId, title, message, confirmLabel, onConfirm, onCancel }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  async function handleConfirm() {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      // No setPending(false) here on success: the caller's onConfirm clears the
      // pending-state that's rendering this component at all, which unmounts it.
    } catch {
      setError("Something went wrong. Try again.");
      setPending(false);
    }
  }

  return (
    <Modal titleId={titleId} onClose={onCancel}>
      <h3 id={titleId} style={{ marginTop: 0 }}>
        {title}
      </h3>
      <p className="muted" style={{ marginTop: 0 }}>
        {message}
      </p>
      {error && <p style={{ color: "var(--brand-red)", fontSize: 13 }}>{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="secondary" disabled={pending} onClick={onCancel}>
          Cancel
        </button>
        <button className="primary danger" disabled={pending} onClick={handleConfirm}>
          {pending ? "Working…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 3: Confirm the file matches the required interface**

```bash
cd web && grep -n "export default function ConfirmDialog\|titleId, title, message, confirmLabel, onConfirm, onCancel" src/components/ConfirmDialog.jsx
```

Expected: two matches (the function declaration and its destructured props).

- [ ] **Step 4: Build clean**

```bash
cd web && npm run build
```

Expected: clean build (the file isn't imported anywhere yet, so this only catches syntax errors — the six call sites wire it in over the following tasks).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ConfirmDialog.jsx && git commit -m "$(cat <<'EOF'
feat: add shared ConfirmDialog component

Built on the existing Modal shell. Shows a title, message, and
Cancel/Confirm buttons; disables both and shows "Working…" while
the async onConfirm is in flight; on failure keeps the dialog open
with an inline error instead of failing silently. Not wired into
any page yet — that's Tasks 2-6.
EOF
)"
```

---

### Task 2: Wire the Templates ("Delete") confirmation

**Files:**
- Modify: `web/src/pages/TemplatesAdminPage.jsx`

**Interfaces:**
- Consumes: `ConfirmDialog` (Task 1) with the Templates row from the Global Constraints copy table.
- Produces: nothing new for other files — each of Tasks 2–6 is independent.

- [ ] **Step 1: Confirm the current unconfirmed click**

```bash
cd web && grep -n 'onClick={() => retire(template)}' src/pages/TemplatesAdminPage.jsx
```

Expected: one match — the "Delete" button fires `retire(template)` directly today.

- [ ] **Step 2: Add the import**

Change line 5 of `web/src/pages/TemplatesAdminPage.jsx` from:

```jsx
import TopBar from "../components/TopBar";
```

to:

```jsx
import TopBar from "../components/TopBar";
import ConfirmDialog from "../components/ConfirmDialog";
```

- [ ] **Step 3: Add pending-delete state**

Change line 10 (the `showNew` state) from:

```jsx
  const [showNew, setShowNew] = useState(false);
```

to:

```jsx
  const [showNew, setShowNew] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null); // template awaiting confirmation, or null
```

- [ ] **Step 4: Route the button through the pending state instead of calling `retire` directly**

Change:

```jsx
                <button
                  className="secondary"
                  style={{ width: "auto", padding: "6px 12px", color: "var(--brand-red)" }}
                  onClick={() => retire(template)}
                >
                  Delete
                </button>
```

to:

```jsx
                <button
                  className="secondary"
                  style={{ width: "auto", padding: "6px 12px", color: "var(--brand-red)" }}
                  onClick={() => setPendingDelete(template)}
                >
                  Delete
                </button>
```

- [ ] **Step 5: Render the dialog**

Change:

```jsx
      {showNew && (
        <NewTemplateModal
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setShowNew(false);
            navigate(`/templates/${id}`);
          }}
        />
      )}
    </div>
  );
}
```

to:

```jsx
      {showNew && (
        <NewTemplateModal
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setShowNew(false);
            navigate(`/templates/${id}`);
          }}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          titleId="confirm-delete-template"
          title="Delete practical?"
          message={`Delete "${pendingDelete.name}"? This can't be undone in the app.`}
          confirmLabel="Delete"
          onConfirm={async () => {
            await retire(pendingDelete);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Confirm the click no longer fires `retire` directly, and the dialog is wired**

```bash
cd web && grep -c 'onClick={() => retire(template)}' src/pages/TemplatesAdminPage.jsx; grep -n 'setPendingDelete(template)\|pendingDelete &&\|ConfirmDialog' src/pages/TemplatesAdminPage.jsx
```

Expected: first command prints `0` (old direct call gone); second finds the import, the `setPendingDelete(template)` click handler, and the `{pendingDelete && (` conditional render.

- [ ] **Step 7: Build clean**

```bash
cd web && npm run build
```

Expected: clean build.

- [ ] **Step 8: Commit**

```bash
git add web/src/pages/TemplatesAdminPage.jsx && git commit -m "$(cat <<'EOF'
feat: confirm before deleting a practical (test template)

"Delete" no longer calls retire() immediately — it opens a
ConfirmDialog naming the template first. retire()'s own behavior
(isActive: false) is unchanged.
EOF
)"
```

---

### Task 3: Wire the Exams ("Deactivate") confirmation

**Files:**
- Modify: `web/src/pages/ExamsAdminPage.jsx`

**Interfaces:**
- Consumes: `ConfirmDialog` (Task 1) with the Exams row from the Global Constraints copy table.
- Produces: nothing new for other files.

- [ ] **Step 1: Confirm the current unconfirmed click**

```bash
cd web && grep -n 'onClick={() => deactivate(exam)}' src/pages/ExamsAdminPage.jsx
```

Expected: one match.

- [ ] **Step 2: Add the import**

Change line 7 from:

```jsx
import Modal from "../components/Modal";
```

to:

```jsx
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
```

- [ ] **Step 3: Add pending-deactivate state**

Change line 14 (the `showNew` state) from:

```jsx
  const [showNew, setShowNew] = useState(false);
```

to:

```jsx
  const [showNew, setShowNew] = useState(false);
  const [pendingDeactivate, setPendingDeactivate] = useState(null); // exam awaiting confirmation, or null
```

- [ ] **Step 4: Route the button through the pending state**

Change:

```jsx
                    <button
                      className="secondary"
                      style={{ width: "auto", padding: "4px 10px", color: "var(--brand-red)" }}
                      onClick={() => deactivate(exam)}
                    >
                      Deactivate
                    </button>
```

to:

```jsx
                    <button
                      className="secondary"
                      style={{ width: "auto", padding: "4px 10px", color: "var(--brand-red)" }}
                      onClick={() => setPendingDeactivate(exam)}
                    >
                      Deactivate
                    </button>
```

- [ ] **Step 5: Render the dialog**

Change:

```jsx
      {showNew && <NewExamModal categories={categories} onClose={() => setShowNew(false)} />}
    </div>
  );
}
```

to:

```jsx
      {showNew && <NewExamModal categories={categories} onClose={() => setShowNew(false)} />}

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
    </div>
  );
}
```

- [ ] **Step 6: Confirm the click no longer fires `deactivate` directly, and the dialog is wired**

```bash
cd web && grep -c 'onClick={() => deactivate(exam)}' src/pages/ExamsAdminPage.jsx; grep -n 'setPendingDeactivate(exam)\|pendingDeactivate &&\|ConfirmDialog' src/pages/ExamsAdminPage.jsx
```

Expected: first command prints `0`; second finds the import, the click handler, and the conditional render.

- [ ] **Step 7: Build clean**

```bash
cd web && npm run build
```

Expected: clean build.

- [ ] **Step 8: Commit**

```bash
git add web/src/pages/ExamsAdminPage.jsx && git commit -m "$(cat <<'EOF'
feat: confirm before deactivating a written exam (Test Bank)

"Deactivate" no longer calls deactivate() immediately — it opens a
ConfirmDialog naming the exam first. deactivate()'s own behavior
(isActive: false) is unchanged.
EOF
)"
```

---

### Task 4: Wire the Test Groups ("Deactivate") confirmation

**Files:**
- Modify: `web/src/pages/TestGroupsAdminPage.jsx`

**Interfaces:**
- Consumes: `ConfirmDialog` (Task 1) with the Test Groups row from the Global Constraints copy table.
- Produces: nothing new for other files.

- [ ] **Step 1: Confirm the current unconfirmed click**

```bash
cd web && grep -n 'onClick={() => deactivate(group)}' src/pages/TestGroupsAdminPage.jsx
```

Expected: one match.

- [ ] **Step 2: Add the import**

Change line 6 from:

```jsx
import Modal from "../components/Modal";
```

to:

```jsx
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
```

- [ ] **Step 3: Add pending-deactivate state**

Change line 12 (the `showNew` state) from:

```jsx
  const [showNew, setShowNew] = useState(false);
```

to:

```jsx
  const [showNew, setShowNew] = useState(false);
  const [pendingDeactivate, setPendingDeactivate] = useState(null); // group awaiting confirmation, or null
```

- [ ] **Step 4: Route the button through the pending state**

Change:

```jsx
              <button
                className="secondary"
                style={{ width: "auto", padding: "6px 12px", color: "var(--brand-red)" }}
                onClick={() => deactivate(group)}
              >
                Deactivate
              </button>
```

to:

```jsx
              <button
                className="secondary"
                style={{ width: "auto", padding: "6px 12px", color: "var(--brand-red)" }}
                onClick={() => setPendingDeactivate(group)}
              >
                Deactivate
              </button>
```

- [ ] **Step 5: Render the dialog**

Change:

```jsx
      {showNew && <NewTestGroupModal templates={templates} onClose={() => setShowNew(false)} />}
    </div>
  );
}
```

to:

```jsx
      {showNew && <NewTestGroupModal templates={templates} onClose={() => setShowNew(false)} />}

      {pendingDeactivate && (
        <ConfirmDialog
          titleId="confirm-deactivate-test-group"
          title="Deactivate test group?"
          message={`Deactivate "${pendingDeactivate.name}"? This can't be undone in the app.`}
          confirmLabel="Deactivate"
          onConfirm={async () => {
            await deactivate(pendingDeactivate);
            setPendingDeactivate(null);
          }}
          onCancel={() => setPendingDeactivate(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Confirm the click no longer fires `deactivate` directly, and the dialog is wired**

```bash
cd web && grep -c 'onClick={() => deactivate(group)}' src/pages/TestGroupsAdminPage.jsx; grep -n 'setPendingDeactivate(group)\|pendingDeactivate &&\|ConfirmDialog' src/pages/TestGroupsAdminPage.jsx
```

Expected: first command prints `0`; second finds the import, the click handler, and the conditional render.

- [ ] **Step 7: Build clean**

```bash
cd web && npm run build
```

Expected: clean build.

- [ ] **Step 8: Commit**

```bash
git add web/src/pages/TestGroupsAdminPage.jsx && git commit -m "$(cat <<'EOF'
feat: confirm before deactivating a test group

"Deactivate" no longer calls deactivate() immediately — it opens a
ConfirmDialog naming the group first. deactivate()'s own behavior
(isActive: false) is unchanged.
EOF
)"
```

---

### Task 5: Wire both Recruits confirmations (Deactivate recruit, Remove Login)

**Files:**
- Modify: `web/src/pages/RecruitsAdminPage.jsx`

**Interfaces:**
- Consumes: `ConfirmDialog` (Task 1) with the Recruits and Recruit's-portal-login rows from the Global Constraints copy table.
- Produces: nothing new for other files.

This file has two independent call sites: `RecruitsAdminPage` itself (the "Deactivate" button on each recruit tile) and `RecruitFormModal` (the "Remove Login" button, only shown when editing a recruit that already has a portal login). Both are wired in this one task since they're in the same file.

- [ ] **Step 1: Confirm both current unconfirmed clicks**

```bash
cd web && grep -n 'onClick={() => deactivate(recruit)}\|onClick={handleRemoveLogin}' src/pages/RecruitsAdminPage.jsx
```

Expected: two matches, one per site.

- [ ] **Step 2: Add the import**

Change line 15 from:

```jsx
import TopBar from "../components/TopBar";
```

to:

```jsx
import TopBar from "../components/TopBar";
import ConfirmDialog from "../components/ConfirmDialog";
```

- [ ] **Step 3: Add pending-deactivate state to `RecruitsAdminPage`**

Change line 33 (the `editing` state) from:

```jsx
  const [editing, setEditing] = useState(null); // null = closed, {} = new, {...} = editing existing
```

to:

```jsx
  const [editing, setEditing] = useState(null); // null = closed, {} = new, {...} = editing existing
  const [pendingDeactivate, setPendingDeactivate] = useState(null); // recruit awaiting confirmation, or null
```

- [ ] **Step 4: Route the recruit-tile "Deactivate" button through the pending state**

Change:

```jsx
                <button
                  type="button"
                  className="secondary"
                  style={{ width: "100%", marginTop: 10, padding: "12px 12px", color: "var(--brand-red)" }}
                  onClick={() => deactivate(recruit)}
                >
                  Deactivate
                </button>
```

to:

```jsx
                <button
                  type="button"
                  className="secondary"
                  style={{ width: "100%", marginTop: 10, padding: "12px 12px", color: "var(--brand-red)" }}
                  onClick={() => setPendingDeactivate(recruit)}
                >
                  Deactivate
                </button>
```

- [ ] **Step 5: Render the recruit-deactivate dialog in `RecruitsAdminPage`**

Change:

```jsx
      {editing && (
        <RecruitFormModal
          recruit={editing}
          existingLogin={loginByRecruitId[editing.id]}
          onClose={() => setEditing(null)}
          requestPasswordReset={requestPasswordReset}
        />
      )}
    </div>
  );
}
```

to:

```jsx
      {editing && (
        <RecruitFormModal
          recruit={editing}
          existingLogin={loginByRecruitId[editing.id]}
          onClose={() => setEditing(null)}
          requestPasswordReset={requestPasswordReset}
        />
      )}

      {pendingDeactivate && (
        <ConfirmDialog
          titleId="confirm-deactivate-recruit"
          title="Deactivate recruit?"
          message={`Deactivate ${pendingDeactivate.firstName} ${pendingDeactivate.lastName}? You can reactivate them later from Deactivated Recruits.`}
          confirmLabel="Deactivate"
          onConfirm={async () => {
            await deactivate(pendingDeactivate);
            setPendingDeactivate(null);
          }}
          onCancel={() => setPendingDeactivate(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Add pending-remove-login state to `RecruitFormModal`**

Change line 154 (the `welcomeStatus` state, last state declared in `RecruitFormModal`) from:

```jsx
  const [welcomeStatus, setWelcomeStatus] = useState(null); // null, "sending", "sent", "not-configured", or "failed" — only ever set when a new portal login is created in this save
```

to:

```jsx
  const [welcomeStatus, setWelcomeStatus] = useState(null); // null, "sending", "sent", "not-configured", or "failed" — only ever set when a new portal login is created in this save
  const [showRemoveLoginConfirm, setShowRemoveLoginConfirm] = useState(false);
```

- [ ] **Step 7: Route the "Remove Login" button through the pending state**

Change:

```jsx
              <button
                type="button"
                className="secondary"
                style={{ width: "auto", padding: "8px 12px", color: "var(--brand-red)" }}
                onClick={handleRemoveLogin}
              >
                Remove Login
              </button>
```

to:

```jsx
              <button
                type="button"
                className="secondary"
                style={{ width: "auto", padding: "8px 12px", color: "var(--brand-red)" }}
                onClick={() => setShowRemoveLoginConfirm(true)}
              >
                Remove Login
              </button>
```

- [ ] **Step 8: Render the remove-login dialog in `RecruitFormModal`**

`RecruitFormModal`'s own overlay div and `ConfirmDialog`'s `Modal`-rendered overlay both use `position: fixed` + `zIndex: 30`. This still stacks correctly: CSS resolves fixed-position stacking order by nesting depth in the DOM among elements sharing the same z-index, and `ConfirmDialog` is rendered as a later child within `RecruitFormModal`'s own tree, so it paints on top — the same mechanism `ObstacleCourseRunner.jsx`'s existing (unrelated) confirm dialog already relies on. Task 7's live browser pass confirms this visually.

Change (the closing of `RecruitFormModal`'s return):

```jsx
        {welcomeStatus ? (
          <button className="primary" style={{ width: "100%" }} disabled={welcomeStatus === "sending"} onClick={onClose}>
            Done
          </button>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="secondary" onClick={onClose}>Cancel</button>
            <button className="primary" disabled={!canSave || saving} onClick={handleSave}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

to:

```jsx
        {welcomeStatus ? (
          <button className="primary" style={{ width: "100%" }} disabled={welcomeStatus === "sending"} onClick={onClose}>
            Done
          </button>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="secondary" onClick={onClose}>Cancel</button>
            <button className="primary" disabled={!canSave || saving} onClick={handleSave}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>

      {showRemoveLoginConfirm && (
        <ConfirmDialog
          titleId="confirm-remove-login"
          title="Remove portal login?"
          message={`Remove the portal login for ${existingLogin.email}? This can't be undone in the app.`}
          confirmLabel="Remove Login"
          onConfirm={async () => {
            await handleRemoveLogin();
            setShowRemoveLoginConfirm(false);
          }}
          onCancel={() => setShowRemoveLoginConfirm(false)}
        />
      )}
    </div>
  );
}
```

Note: on success this only closes the confirm dialog, not the whole `RecruitFormModal` — the "Portal Login" section within the still-open form naturally switches to the "add a new login" fields once the parent's Firestore listener refreshes `existingLogin` to `undefined` (same live-update mechanism every other list in this app already relies on), so there's no need to force-close the form.

- [ ] **Step 9: Confirm both clicks no longer fire their handlers directly, and both dialogs are wired**

```bash
cd web && grep -c 'onClick={() => deactivate(recruit)}\|onClick={handleRemoveLogin}' src/pages/RecruitsAdminPage.jsx; grep -n 'setPendingDeactivate(recruit)\|setShowRemoveLoginConfirm(true)\|pendingDeactivate &&\|showRemoveLoginConfirm &&\|ConfirmDialog' src/pages/RecruitsAdminPage.jsx
```

Expected: first command prints `0`; second finds the import (once) and both wiring pairs (click handler + conditional render) for both sites.

- [ ] **Step 10: Build clean**

```bash
cd web && npm run build
```

Expected: clean build.

- [ ] **Step 11: Commit**

```bash
git add web/src/pages/RecruitsAdminPage.jsx && git commit -m "$(cat <<'EOF'
feat: confirm before deactivating a recruit or removing a portal login

Both "Deactivate" (recruit roster) and "Remove Login" (a recruit's
portal login, inside the edit-recruit form) now open a ConfirmDialog
naming the specific recruit/email first instead of firing
immediately. Neither underlying Firestore write changes.
EOF
)"
```

---

### Task 6: Wire the Admins/Evaluators ("Deactivate") confirmation

**Files:**
- Modify: `web/src/pages/AdminsPage.jsx`

**Interfaces:**
- Consumes: `ConfirmDialog` (Task 1) with the Admins/evaluators row from the Global Constraints copy table.
- Produces: nothing new for other files — this is the last wiring task.

- [ ] **Step 1: Confirm the current unconfirmed click**

```bash
cd web && grep -n 'onClick={() => deactivate(user)}' src/pages/AdminsPage.jsx
```

Expected: one match.

- [ ] **Step 2: Add the import**

Change line 7 from:

```jsx
import TopBar from "../components/TopBar";
```

to:

```jsx
import TopBar from "../components/TopBar";
import ConfirmDialog from "../components/ConfirmDialog";
```

- [ ] **Step 3: Add pending-deactivate state**

Change line 26 (the `showNewUser` state) from:

```jsx
  const [showNewUser, setShowNewUser] = useState(searchParams.get("new") === "1");
```

to:

```jsx
  const [showNewUser, setShowNewUser] = useState(searchParams.get("new") === "1");
  const [pendingDeactivate, setPendingDeactivate] = useState(null); // user awaiting confirmation, or null
```

- [ ] **Step 4: Route the button through the pending state**

Change:

```jsx
                {!isSelf && (
                  <button
                    className="secondary"
                    style={{ width: "auto", padding: "8px 12px", color: "var(--brand-red)" }}
                    onClick={() => deactivate(user)}
                  >
                    Deactivate
                  </button>
                )}
```

to:

```jsx
                {!isSelf && (
                  <button
                    className="secondary"
                    style={{ width: "auto", padding: "8px 12px", color: "var(--brand-red)" }}
                    onClick={() => setPendingDeactivate(user)}
                  >
                    Deactivate
                  </button>
                )}
```

- [ ] **Step 5: Render the dialog**

Change:

```jsx
      {showNewUser && <NewUserModal onClose={closeNewUserModal} />}
    </div>
  );
}
```

to:

```jsx
      {showNewUser && <NewUserModal onClose={closeNewUserModal} />}

      {pendingDeactivate && (
        <ConfirmDialog
          titleId="confirm-deactivate-user"
          title="Deactivate user?"
          message={`Deactivate ${pendingDeactivate.displayName}? This can't be undone in the app.`}
          confirmLabel="Deactivate"
          onConfirm={async () => {
            await deactivate(pendingDeactivate);
            setPendingDeactivate(null);
          }}
          onCancel={() => setPendingDeactivate(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Confirm the click no longer fires `deactivate` directly, and the dialog is wired**

```bash
cd web && grep -c 'onClick={() => deactivate(user)}' src/pages/AdminsPage.jsx; grep -n 'setPendingDeactivate(user)\|pendingDeactivate &&\|ConfirmDialog' src/pages/AdminsPage.jsx
```

Expected: first command prints `0`; second finds the import, the click handler, and the conditional render.

- [ ] **Step 7: Build clean**

```bash
cd web && npm run build
```

Expected: clean build.

- [ ] **Step 8: Commit**

```bash
git add web/src/pages/AdminsPage.jsx && git commit -m "$(cat <<'EOF'
feat: confirm before deactivating an admin or evaluator

"Deactivate" no longer calls deactivate() immediately — it opens a
ConfirmDialog naming the user first. deactivate()'s own behavior
(isActive: false) is unchanged.
EOF
)"
```

---

### Task 7: End-to-end browser verification, then push

**Files:** none — verification only, using the app's existing local sandbox harness (per `docs/superpowers/specs/2026-07-28-local-emulator-sandbox-design.md`), same approach as the prior `nav-labeling-polish` plan's final task.

**Interfaces:** none.

- [ ] **Step 1: Build clean one more time from the full set of changes**

```bash
cd web && npm run build
```

Expected: clean build.

- [ ] **Step 2: Drive the actual app in a browser and confirm all six sites, plus dialog mechanics**

Use the project's `web:verify` skill (or manually run `npm run dev:sandbox` with seeded data via `npm run seed:sandbox`) to walk through:

1. **Templates** (`/templates`): click "Delete" on a test template → dialog reads `Delete practical?` / `Delete "{name}"? This can't be undone in the app.` → template still listed (no write yet).
2. **Exams** (`/exams`): click "Deactivate" on an exam → dialog reads `Deactivate exam?` / `Deactivate "{name}"? This can't be undone in the app.`
3. **Test Groups** (`/test-groups`): click "Deactivate" on a test group → dialog reads `Deactivate test group?` / `Deactivate "{name}"? This can't be undone in the app.`
4. **Recruits** (`/recruits`): click "Deactivate" on a recruit tile → dialog reads `Deactivate recruit?` / `Deactivate {first} {last}? You can reactivate them later from Deactivated Recruits.` — note this is the one site whose copy differs from the rest.
5. **Recruit's portal login**: open a recruit that has a portal login (edit → "Remove Login") → dialog reads `Remove portal login?` / `Remove the portal login for {email}? This can't be undone in the app.` → confirm it visually stacks above the edit-recruit form, not behind it.
6. **Admins/evaluators** (`/admins`): click "Deactivate" on a non-self user → dialog reads `Deactivate user?` / `Deactivate {displayName}? This can't be undone in the app.`
7. **Cancel mechanics** (check at least twice, different sites): clicking Cancel, pressing Escape, and clicking the backdrop all close the dialog with no Firestore write — item still listed/present afterward.
8. **Confirm mechanics** (check at least twice, different sites): clicking Confirm disables both buttons, the confirm button reads "Working…" briefly, then the dialog closes and the item disappears from its list (the underlying `isActive: false` write happened).
9. **Error path** (at least one site — e.g. temporarily rename the `db` import or throw inside one `onConfirm` to force a rejection, then revert): confirm the dialog stays open, shows "Something went wrong. Try again.", and both buttons re-enable.
10. **Regression check**: confirm `DeactivatedRecruitsPage.jsx`'s "Reactivate" button and `TestBankBuilder.jsx`'s "Remove" (working-set) button still fire immediately with no dialog — unchanged, as intended.

- [ ] **Step 3: Push the branch**

```bash
git push -u origin HEAD
```

Expected: pushes all commits from Tasks 1–6 to a new remote branch (first push on this branch — use `-u` to set upstream, matching this repo's convention of local `worktree-*` branches pushing to an identically-named remote branch).
