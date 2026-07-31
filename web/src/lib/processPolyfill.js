// Browser polyfill for the bare `process` global. Several of mdb-reader's Node-oriented
// dependencies (readable-stream's _stream_writable.js/_stream_readable.js,
// process-nextick-args) reference `process.browser`, `process.version`, `process.nextTick`,
// `process.stdout`/`process.stderr` unconditionally at module load time — a pattern that
// Webpack/Browserify auto-shim but Vite/esbuild do not. Without this, importing
// lxrbankParser.js (which imports mdb-reader) anywhere in the app crashes the whole page
// with "ReferenceError: process is not defined", not just the Test Bank screen.
//
// Must be imported before anything that transitively imports mdb-reader — see main.jsx,
// where this is the very first import so it runs before App.jsx's dependency subtree.
if (typeof globalThis.process === "undefined") {
  globalThis.process = {
    env: {},
    version: "v18.0.0",
    browser: true,
    nextTick: (fn, ...args) => Promise.resolve().then(() => fn(...args)),
  };
}
