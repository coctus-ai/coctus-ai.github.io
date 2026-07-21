/**
 * workspace.js — a virtual, in-memory multi-file "project" the agent can
 * build up across a conversation via the write_file tool, as opposed to
 * one-off code blocks that only exist inside a single reply. This is what
 * makes a request like "scaffold a small Android app" or "build a web app
 * with a few files" produce an actual coherent project — a real file tree
 * you can browse, view individually, or download as one .zip — instead of
 * several disconnected code blocks scattered across a long reply.
 *
 * Deliberately session-scoped and in-memory only (like the scratchpad tool)
 * rather than persisted to localStorage: project files can be large, and
 * silently persisting arbitrary generated code across reloads/quota limits
 * adds real complexity for a feature whose main value is "download it when
 * it's ready." Cleared on New Chat or a page reload — download the zip
 * before either if you want to keep it.
 */

const CoctusWorkspace = (() => {
  const files = new Map(); // normalized path -> { content, updated }

  function normalizePath(p) {
    return String(p || '')
      .trim()
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/\.\.+\//g, ''); // no path traversal out of the virtual root
  }

  function writeFile(path, content) {
    const p = normalizePath(path);
    if (!p) return { ok: false, error: 'path must not be empty' };
    files.set(p, { content: String(content ?? ''), updated: Date.now() });
    return { ok: true, path: p };
  }

  function readFile(path) {
    const f = files.get(normalizePath(path));
    return f ? f.content : null;
  }

  function deleteFile(path) {
    return files.delete(normalizePath(path));
  }

  function listFiles() {
    return [...files.keys()].sort().map(path => ({ path, size: files.get(path).content.length }));
  }

  function fileCount() { return files.size; }
  function isEmpty() { return files.size === 0; }
  function clear() { files.clear(); }

  function totalBytes() {
    let n = 0;
    for (const f of files.values()) n += f.content.length;
    return n;
  }

  /** Builds a downloadable .zip Blob of the whole project via JSZip (already loaded for document export). */
  async function exportZip() {
    if (typeof JSZip === 'undefined') throw new Error('JSZip is not loaded — cannot build a .zip.');
    const zip = new JSZip();
    for (const [path, f] of files) zip.file(path, f.content);
    return zip.generateAsync({ type: 'blob' });
  }

  return { writeFile, readFile, deleteFile, listFiles, fileCount, isEmpty, clear, totalBytes, exportZip, normalizePath };
})();
