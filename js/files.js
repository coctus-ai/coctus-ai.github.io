/**
 * files.js — turns whatever the user drops into the composer into
 * something the model (and the chat history) can actually use.
 * Everything runs client-side: text/code files are read directly,
 * PDFs/DOCX/XLSX/ZIP are parsed with in-browser libraries, images become
 * base64 for vision-capable models, and anything else is attached as
 * metadata only (name/type/size) since there's no backend to store or
 * convert arbitrary binaries.
 */

const CoctusFiles = (() => {
  const TEXT_EXT = [
    'txt', 'md', 'markdown', 'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'py', 'json', 'csv', 'tsv',
    'html', 'htm', 'css', 'scss', 'yml', 'yaml', 'xml', 'sh', 'bash', 'c', 'h', 'cpp', 'hpp',
    'java', 'go', 'rs', 'rb', 'php', 'sql', 'ini', 'env', 'log', 'toml', 'svg',
  ];
  const MAX_TEXT_CHARS = 40000;
  const MAX_ZIP_ENTRIES = 30;
  const MAX_ZIP_TOTAL_CHARS = 60000;
  const MAX_ZIP_PER_FILE_CHARS = 4000;

  let pdfWorkerReady = false;
  function ensurePdfWorker() {
    if (pdfWorkerReady || !window.pdfjsLib) return;
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    pdfWorkerReady = true;
  }

  function extOf(name) {
    const m = (name || '').match(/\.([a-z0-9]+)$/i);
    return m ? m[1].toLowerCase() : '';
  }

  function readAsText(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error || new Error('read failed'));
      r.readAsText(file);
    });
  }
  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error || new Error('read failed'));
      r.readAsDataURL(file);
    });
  }
  function readAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error || new Error('read failed'));
      r.readAsArrayBuffer(file);
    });
  }

  async function extractPdfText(arrayBuffer) {
    if (!window.pdfjsLib) return '(PDF text extraction unavailable — pdf.js did not load)';
    ensurePdfWorker();
    try {
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let text = '';
      const pageCount = Math.min(pdf.numPages, 25);
      for (let i = 1; i <= pageCount; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(it => it.str).join(' ') + '\n\n';
        if (text.length > MAX_TEXT_CHARS) break;
      }
      if (pdf.numPages > pageCount) text += `\n[...${pdf.numPages - pageCount} more page(s) not extracted...]`;
      return text.slice(0, MAX_TEXT_CHARS) || '(No extractable text — this PDF may be scanned images.)';
    } catch (err) {
      return `(Could not extract PDF text: ${err.message})`;
    }
  }

  async function extractDocxText(arrayBuffer) {
    if (!window.mammoth) return '(DOCX text extraction unavailable — mammoth.js did not load)';
    try {
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value.slice(0, MAX_TEXT_CHARS);
    } catch (err) {
      return `(Could not extract DOCX text: ${err.message})`;
    }
  }

  function extractSheetText(arrayBuffer) {
    if (!window.XLSX) return '(Spreadsheet extraction unavailable — SheetJS did not load)';
    try {
      const wb = XLSX.read(arrayBuffer, { type: 'array' });
      let out = '';
      wb.SheetNames.slice(0, 5).forEach(name => {
        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
        out += `--- Sheet: ${name} ---\n${csv}\n\n`;
      });
      return out.slice(0, MAX_TEXT_CHARS);
    } catch (err) {
      return `(Could not read spreadsheet: ${err.message})`;
    }
  }

  async function extractZipSummary(file) {
    if (!window.JSZip) return '(ZIP extraction unavailable — JSZip did not load)';
    try {
      const zip = await JSZip.loadAsync(file);
      const names = Object.keys(zip.files).filter(n => !zip.files[n].dir).slice(0, MAX_ZIP_ENTRIES);
      let total = 0;
      const parts = [];
      for (const name of names) {
        const ext = extOf(name);
        if (TEXT_EXT.includes(ext) && total < MAX_ZIP_TOTAL_CHARS) {
          const text = await zip.files[name].async('string');
          const clipped = text.slice(0, MAX_ZIP_PER_FILE_CHARS);
          parts.push(`### ${name}\n\`\`\`\n${clipped}\n\`\`\``);
          total += clipped.length;
        } else {
          parts.push(`- ${name} (not extracted — binary or over the size cap)`);
        }
      }
      const more = Object.keys(zip.files).length - names.length;
      let summary = parts.join('\n\n');
      if (more > 0) summary += `\n\n[...${more} more entr${more === 1 ? 'y' : 'ies'} not listed...]`;
      return summary;
    } catch (err) {
      return `(Could not read ZIP: ${err.message})`;
    }
  }

  /**
   * Process one File into a structured attachment.
   * Returns { kind: 'image'|'text'|'unsupported', name, mime, size, ...}
   *  - image:       { dataUrl }
   *  - text:        { text }
   *  - unsupported: {} (metadata only — name/mime/size still present)
   */
  async function process(file) {
    const ext = extOf(file.name);
    const mime = file.type || '';
    const base = { name: file.name, mime, size: file.size };

    try {
      if (mime.startsWith('image/')) {
        const dataUrl = await readAsDataURL(file);
        return { ...base, kind: 'image', dataUrl };
      }
      if (ext === 'zip' || mime === 'application/zip') {
        const summary = await extractZipSummary(file);
        return { ...base, kind: 'text', text: `[ZIP contents of ${file.name}]\n\n${summary}` };
      }
      if (ext === 'pdf' || mime === 'application/pdf') {
        const buf = await readAsArrayBuffer(file);
        const text = await extractPdfText(buf);
        return { ...base, kind: 'text', text };
      }
      if (ext === 'docx') {
        const buf = await readAsArrayBuffer(file);
        const text = await extractDocxText(buf);
        return { ...base, kind: 'text', text };
      }
      if (['xlsx', 'xls'].includes(ext)) {
        const buf = await readAsArrayBuffer(file);
        const text = extractSheetText(buf);
        return { ...base, kind: 'text', text };
      }
      if (TEXT_EXT.includes(ext) || mime.startsWith('text/') || mime === 'application/json') {
        const text = await readAsText(file);
        return { ...base, kind: 'text', text: text.slice(0, MAX_TEXT_CHARS) };
      }
      return { ...base, kind: 'unsupported' };
    } catch (err) {
      return { ...base, kind: 'unsupported', error: err.message };
    }
  }

  return { process, extOf };
})();
