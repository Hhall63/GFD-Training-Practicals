import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Module-level stack of currently-mounted modals, topmost last. A modal opened from inside
// another (e.g. a confirm dialog opened from a form modal) renders as a DOM *descendant* of
// the outer modal's card, not a sibling — so `outerCard.contains(innerActiveElement)` is
// true for every ancestor modal, not just the topmost one. DOM containment can't tell them
// apart; only explicit stack order can. Only the last (topmost) entry handles a keydown.
const modalStack = [];

/** Shared modal shell: dialog semantics, a focus trap, Escape-to-close, backdrop-click-to-
 * close, and focus restoration to whatever triggered it. Replaces the hand-rolled
 * `position:fixed;inset:0` overlay pattern previously duplicated across the app's admin and
 * live-test modals, none of which had any of the above.
 *
 * The caller's heading element must carry `id={titleId}` so aria-labelledby resolves.
 *
 * `dismissible=false` disables Escape/backdrop-click-to-close for a modal that must be
 * resolved through one of its own in-content actions (e.g. a "test complete, pick a next
 * step" screen with no cancel concept) — the focus trap still applies. */
export default function Modal({ titleId, onClose, children, maxWidth = 340, dismissible = true }) {
  const cardRef = useRef(null);
  const triggerRef = useRef(null);
  const selfRef = useRef({});

  useEffect(() => {
    const self = selfRef.current;
    modalStack.push(self);
    triggerRef.current = document.activeElement;
    // querySelectorAll matches by DOM structure alone — a `display:none` file input (e.g. a
    // hidden upload trigger ahead of the visible fields) matches but can never actually take
    // focus; calling .focus() on one is a silent no-op in real browsers. Filtering to
    // offsetParent !== null keeps only elements a real focus() call can land on, so the
    // initial focus steal and the Tab-wrap first/last targets are never a dead element.
    const focusable = Array.from(cardRef.current?.querySelectorAll(FOCUSABLE_SELECTOR) ?? []).filter(
      (el) => el.offsetParent !== null
    );
    focusable[0]?.focus();

    function onKeyDown(e) {
      // Not this modal's turn — a nested modal on top of the stack owns the key instead.
      if (modalStack[modalStack.length - 1] !== self) return;
      if (e.key === "Escape") {
        if (dismissible) onClose();
        return;
      }
      if (e.key !== "Tab" || !focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      modalStack.splice(modalStack.indexOf(self), 1);
      document.removeEventListener("keydown", onKeyDown);
      triggerRef.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--overlay-scrim)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 30,
      }}
      onClick={dismissible ? onClose : undefined}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="card"
        style={{ width: maxWidth, background: "var(--surface)", maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
