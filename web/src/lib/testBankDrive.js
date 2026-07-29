// File System Access API wrapper for the physically-secured test bank thumbdrive. Nothing
// here ever sends drive content anywhere — every function operates on a local
// FileSystemDirectoryHandle and either returns data to the caller or writes back to the
// same drive. See docs/superpowers/specs/2026-07-28-test-bank-lxrbank-import-design.md.

const DB_NAME = "gfd-testbank";
const STORE_NAME = "handles";
const HANDLE_KEY = "driveDirectoryHandle";

export const AUTH_MARKER_FILENAME = ".gfd-testbank-auth";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function idbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Opens the native folder picker and remembers the chosen folder (in IndexedDB) so future
 * visits don't need to re-prompt — see getStoredDriveHandle. Requests read+write up front
 * since editing a question later writes an overrides file back to the same folder. */
export async function connectDrive() {
  const dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
  await idbSet(HANDLE_KEY, dirHandle);
  return dirHandle;
}

/** Re-uses a previously granted folder handle if the browser still honors it. Returns null
 * if nothing was ever connected, or if the user denies the re-grant prompt. */
export async function getStoredDriveHandle() {
  const dirHandle = await idbGet(HANDLE_KEY);
  if (!dirHandle) return null;
  const granted = await dirHandle.queryPermission({ mode: "readwrite" });
  if (granted === "granted") return dirHandle;
  const requested = await dirHandle.requestPermission({ mode: "readwrite" });
  return requested === "granted" ? dirHandle : null;
}

/** Simple shared-secret check, not cryptographic — see the design doc's Security section
 * for why that tradeoff is acceptable here. Missing file, wrong token, or any read error
 * all mean "not authorized." */
export async function authenticateDrive(dirHandle) {
  try {
    const fileHandle = await dirHandle.getFileHandle(AUTH_MARKER_FILENAME);
    const file = await fileHandle.getFile();
    const token = (await file.text()).trim();
    return token.length > 0 && token === import.meta.env.VITE_TESTBANK_DRIVE_TOKEN;
  } catch {
    return false;
  }
}

export async function listBankFiles(dirHandle) {
  const names = [];
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === "file" && name.toLowerCase().endsWith(".lxrbank")) {
      names.push(name);
    }
  }
  return names.sort((a, b) => a.localeCompare(b));
}

export async function readBankFile(dirHandle, fileName) {
  const fileHandle = await dirHandle.getFileHandle(fileName);
  const file = await fileHandle.getFile();
  return file.arrayBuffer();
}

function overridesFileName(bankFileName) {
  return `${bankFileName}.overrides.json`;
}

/** Returns {} (no overrides) if the sidecar file doesn't exist yet — a bank that has never
 * been edited in-app has no overrides file at all. A file that exists but is corrupted or
 * unparseable throws instead of silently returning {} — losing that error would risk a
 * caller later overwriting the corrupted file with only its newly-accumulated edits,
 * permanently discarding whatever was there before. */
export async function readOverrides(dirHandle, bankFileName) {
  let fileHandle;
  try {
    fileHandle = await dirHandle.getFileHandle(overridesFileName(bankFileName));
  } catch {
    return {};
  }
  const file = await fileHandle.getFile();
  const text = await file.text();
  return text.trim() ? JSON.parse(text) : {};
}

/** overrides is the FULL accumulated map (not a delta) — callers merge new edits into the
 * existing object themselves before calling this. */
export async function writeOverrides(dirHandle, bankFileName, overrides) {
  const fileHandle = await dirHandle.getFileHandle(overridesFileName(bankFileName), { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(overrides, null, 2));
  await writable.close();
}
