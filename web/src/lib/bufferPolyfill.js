// Browser polyfill for the bare `Buffer` global. Several of mdb-reader's Node-oriented
// dependencies expect Node's ambient `Buffer` global to exist without an explicit import — a
// pattern Webpack/Browserify auto-shim but Vite/esbuild do not. lxrbankParser.js itself
// imports { Buffer } from "buffer" for its own use, but that only creates a local binding in
// that module; it doesn't make Buffer available as a global for other code deeper in
// mdb-reader's dependency chain. Without this, connecting a bank crashes with
// "ReferenceError: Buffer is not defined".
//
// Must be imported before anything that transitively imports mdb-reader — see main.jsx.
import { Buffer } from "buffer";

if (typeof globalThis.Buffer === "undefined") {
  globalThis.Buffer = Buffer;
}
