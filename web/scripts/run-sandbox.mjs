#!/usr/bin/env node
// Invoked by `firebase emulators:exec` (see package.json's "sandbox" script) only after the
// Auth/Firestore emulators are confirmed up and accepting connections — no manual
// "wait for ready" polling needed here. Seeds fresh data, then starts the sandbox dev
// server. Ctrl+C stops the dev server and this script; emulators:exec then tears the
// emulators down on its own — no custom process-tree cleanup needed here.
import { spawnSync } from "node:child_process";

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
// shell: true is required on Windows: since Node's CVE-2024-27980 fix, spawn/spawnSync
// refuses to run .cmd/.bat files (npm ships as npm.cmd on Windows) unless shell is set,
// or it fails immediately with EINVAL. Safe here because the argv below are fixed string
// literals, not user input, so there is nothing to escape/inject.
const spawnOpts = { stdio: "inherit", shell: process.platform === "win32" };

const seed = spawnSync(npmCmd, ["run", "seed:sandbox"], spawnOpts);
if (seed.status !== 0) {
  process.exit(seed.status ?? 1);
}

const dev = spawnSync(npmCmd, ["run", "dev:sandbox"], spawnOpts);
process.exit(dev.status ?? 0);
