import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { formatSeconds, lineDisplayLabel, LINE_TYPES, RESULT } from "./constants";
import { summarizeObstacleCourseLines } from "./obstacleCourse";

/**
 * Failure-notification emails, kept free of charge two ways:
 *
 * 1. Automatic sending uses EmailJS's free tier (200 emails/month, no credit card) — a
 *    service built specifically for sending email straight from a web page with no
 *    server. It only activates when the three VITE_EMAILJS_* values are present in .env;
 *    see .env.example for the one-time setup.
 * 2. When EmailJS isn't configured, the Results screen falls back to a prefilled
 *    "compose email" (mailto:) button, which costs nothing and needs no setup — the
 *    evaluator just taps Send in their own mail app.
 */

const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

export function isEmailConfigured() {
  return Boolean(EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID && EMAILJS_PUBLIC_KEY);
}

/** Active administrators who checked "Notify with failures" on their account. Sends to the
 * admin's `notificationEmail` when set (so failures can go to a work address that differs
 * from their login), otherwise their login `email`. */
export async function fetchNotifyRecipients() {
  const q = query(
    collection(db, "admins"),
    where("isActive", "==", true),
    where("notifyOnFailures", "==", true)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data().notificationEmail || d.data().email).filter(Boolean);
}

export function buildFailureSubject(session) {
  return `FAILED TEST: ${session.recruitName} — ${session.templateName}`;
}

function scoreLine(session) {
  const possible = session.totalPointsPossible ?? 0;
  const earned = session.totalPointsEarned ?? 0;
  const pct = possible > 0 ? Math.round((earned / possible) * 100) : 0;
  return `${earned} / ${possible} points (${pct}% — needed ${session.passingPercentageSnapshot ?? "?"}% to pass)`;
}

/** Plain-text failed-test sheet: the requested opening line, then every step with its
 * result, time, points, and the evaluator's comments. Used for both the email body and
 * the mailto fallback. */
export function buildFailureBody(session, lineResults) {
  const lines = [];
  lines.push(
    `Recruit ${session.recruitName} failed the ${session.templateName} with a score of ${scoreLine(session)}.`
  );
  lines.push("");
  lines.push(`Attempt: ${session.attemptType === "retake" ? "Retake" : "1st Attempt"}`);
  lines.push(`Evaluator: ${session.evaluatorName}`);
  const when = session.startedAt?.toDate?.() ?? new Date();
  lines.push(`Date: ${when.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`);
  if (session.criticalFailure) {
    lines.push("CRITICAL FAILURE: a step marked critical was failed — automatic test failure.");
  }
  lines.push("");
  lines.push("--- FULL TEST SHEET ---");

  for (const line of lineResults) {
    lines.push("");
    if (line.lineTypeSnapshot === LINE_TYPES.INSTRUCTION) {
      lines.push(`[Instruction] ${lineDisplayLabel(line)}`);
      continue;
    }
    const result = line.result === RESULT.PASS ? "PASS" : line.result === RESULT.FAIL ? "FAIL" : "—";
    const critical = line.isCriticalSnapshot && line.result === RESULT.FAIL ? " (CRITICAL)" : "";
    lines.push(`[${result}${critical}] ${lineDisplayLabel(line)}`);
    if (line.timerElapsedSeconds != null) {
      const threshold = line.passThresholdSecondsSnapshot != null ? ` (pass at ≤ ${line.passThresholdSecondsSnapshot}s)` : "";
      lines.push(`    Time: ${formatSeconds(line.timerElapsedSeconds)}s${threshold}`);
    }
    lines.push(`    Points: ${line.pointsEarned ?? 0} / ${line.pointsSnapshot ?? 0}`);
    if (line.lineTypeSnapshot === LINE_TYPES.OBSTACLE_COURSE && line.obstacleCourseConfigSnapshot) {
      for (const detail of summarizeObstacleCourseLines(line.obstacleCourseConfigSnapshot, line.obstacleTallies)) {
        lines.push(`    ${detail}`);
      }
    }
    if (line.note) {
      lines.push(`    Evaluator comments: ${line.note}`);
    }
    if (line.photoURLs?.length > 0) {
      lines.push(`    Photos: ${line.photoURLs.length} attached — view in the app (Reports > Recruit History)`);
    }
  }

  return lines.join("\n");
}

/** mailto: link that opens the evaluator's own mail app prefilled — the zero-setup path. */
export function buildFailureMailto(recipients, session, lineResults) {
  const subject = encodeURIComponent(buildFailureSubject(session));
  const body = encodeURIComponent(buildFailureBody(session, lineResults));
  return `mailto:${recipients.join(",")}?subject=${subject}&body=${body}`;
}

/**
 * Attempts automatic delivery via EmailJS. Returns a status string that gets stored on
 * the session and surfaced on the Results screen:
 *   "sent:<n>"        emailed n admins automatically
 *   "not-configured"  EmailJS not set up — Results screen offers the mailto button
 *   "no-recipients"   no admin has "Notify with failures" checked
 *   "failed"          the send call errored — Results screen offers the mailto button
 */
export async function sendFailureEmail(session, lineResults) {
  let recipients;
  try {
    recipients = await fetchNotifyRecipients();
  } catch {
    return "failed";
  }
  if (recipients.length === 0) return "no-recipients";
  if (!isEmailConfigured()) return "not-configured";

  try {
    const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: {
          to_email: recipients.join(","),
          subject: buildFailureSubject(session),
          message: buildFailureBody(session, lineResults),
        },
      }),
    });
    return res.ok ? `sent:${recipients.length}` : "failed";
  } catch {
    return "failed";
  }
}
