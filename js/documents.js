/**
 * documents.js — turns a session (or a single message / code block) into
 * a downloadable document. Runs fully client-side: jsPDF for PDF,
 * html-docx-js for Word, JSZip for bundling multiple files, and plain
 * Blob downloads for everything else.
 */

const LocxyDocuments = (() => {

  const EXT_BY_LANG = {
    javascript: 'js', js: 'js', jsx: 'jsx', typescript: 'ts', ts: 'ts', tsx: 'tsx',
    python: 'py', py: 'py', html: 'html', css: 'css', scss: 'scss', json: 'json',
    markdown: 'md', md: 'md', bash: 'sh', sh: 'sh', shell: 'sh', java: 'java', c: 'c',
    cpp: 'cpp', 'c++': 'cpp', csharp: 'cs', 'c#': 'cs', go: 'go', golang: 'go', rust: 'rs',
    ruby: 'rb', php: 'php', sql: 'sql', yaml: 'yml', yml: 'yml', xml: 'xml', toml: 'toml',
    swift: 'swift', kotlin: 'kt', text: 'txt', plaintext: 'txt', '': 'txt',
  };

  function download(filename, content, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function safeName(title) {
    return (title || 'locxy-file').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'locxy-file';
  }

  function extFor(lang) {
    return EXT_BY_LANG[(lang || '').toLowerCase()] || 'txt';
  }

  // ---------- whole-session export (unchanged behavior) ----------
  function toMarkdown(session) {
    const lines = [`# ${session.title}`, '', `_Exported from Coctus AI — ${new Date(session.updated).toLocaleString()}_`, ''];
    for (const m of session.messages) {
      lines.push(m.role === 'user' ? '### You' : '### Coctus AI');
      lines.push('');
      lines.push(m.content);
      lines.push('');
    }
    return lines.join('\n');
  }

  function toPlainText(session) {
    const lines = [session.title, '='.repeat(session.title.length), ''];
    for (const m of session.messages) {
      lines.push(m.role === 'user' ? 'You:' : 'Coctus AI:');
      lines.push(m.content);
      lines.push('');
    }
    return lines.join('\n');
  }

  function toJson(session) {
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      session,
      memoryFacts: LocxyMemory.getFacts(),
    }, null, 2);
  }

  function toPdfText(doc, marginX, maxWidth, lineHeight, pageHeight, startY, blocks) {
    let y = startY;
    function ensureSpace(needed) {
      if (y + needed > pageHeight - 48) { doc.addPage(); y = 56; }
    }
    for (const block of blocks) {
      if (block.heading) {
        ensureSpace(24);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
        doc.text(block.heading, marginX, y);
        y += 16;
      }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
      const plain = block.text
        .replace(/```[\s\S]*?```/g, s => s.replace(/```\w*\n?/g, '').replace(/```/g, ''))
        .replace(/[*_#>`]/g, '');
      const wrapped = doc.splitTextToSize(plain, maxWidth);
      for (const line of wrapped) {
        ensureSpace(lineHeight);
        doc.text(line, marginX, y);
        y += lineHeight;
      }
      y += 12;
    }
    return y;
  }

  function toPdf(session) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const marginX = 48;
    const pageWidth = doc.internal.pageSize.getWidth();
    const maxWidth = pageWidth - marginX * 2;
    const pageHeight = doc.internal.pageSize.getHeight();

    doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
    doc.text(session.title, marginX, 56);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(120);
    doc.text(`Exported from Coctus AI — ${new Date(session.updated).toLocaleString()}`, marginX, 78);
    doc.setTextColor(20);

    const blocks = session.messages.map(m => ({ heading: m.role === 'user' ? 'You' : 'Coctus AI', text: m.content }));
    toPdfText(doc, marginX, maxWidth, 15, pageHeight, 104, blocks);
    doc.save(`${safeName(session.title)}.pdf`);
  }

  /** Very small, dependency-free markdown→HTML fallback for export paths that can't rely on marked being loaded. */
  function crudeMarkdownToHtml(text) {
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return String(text || '')
      .split(/\n{2,}/)
      .map(block => {
        if (/^```/.test(block)) return `<pre><code>${esc(block.replace(/^```\w*\n?/, '').replace(/```$/, ''))}</code></pre>`;
        if (/^#{1,6}\s/.test(block)) {
          const level = block.match(/^#{1,6}/)[0].length;
          return `<h${level}>${esc(block.replace(/^#{1,6}\s*/, ''))}</h${level}>`;
        }
        return `<p>${esc(block).replace(/\n/g, '<br>')}</p>`;
      })
      .join('\n');
  }

  function toDocx(session) {
    if (!window.htmlDocx) { console.warn('Coctus: html-docx-js not loaded, cannot export .docx.'); return; }
    const usesMarked = typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined';
    const parts = [`<h1>${session.title}</h1>`, `<p><em>Exported from Coctus AI — ${new Date(session.updated).toLocaleString()}</em></p>`];
    for (const m of session.messages) {
      parts.push(`<h3>${m.role === 'user' ? 'You' : 'Coctus AI'}</h3>`);
      parts.push(usesMarked ? DOMPurify.sanitize(marked.parse(m.content || '')) : crudeMarkdownToHtml(m.content));
    }
    const full = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${session.title}</title></head><body>${parts.join('\n')}</body></html>`;
    download(`${safeName(session.title)}.docx`, htmlDocx.asBlob(full), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  }

  /** One row per message, plus a best-effort pass that lifts any markdown tables in assistant replies into their own sheet. */
  function toXlsx(session) {
    if (!window.XLSX) { console.warn('Coctus: SheetJS (xlsx) not loaded, cannot export .xlsx.'); return; }
    const wb = XLSX.utils.book_new();
    const rows = [['#', 'Role', 'Content']];
    session.messages.forEach((m, i) => rows.push([i + 1, m.role === 'user' ? 'You' : 'Coctus AI', m.content || '']));
    const mainSheet = XLSX.utils.aoa_to_sheet(rows);
    mainSheet['!cols'] = [{ wch: 4 }, { wch: 10 }, { wch: 100 }];
    XLSX.utils.book_append_sheet(wb, mainSheet, 'Conversation');

    let tableCount = 0;
    session.messages.forEach((m, i) => {
      if (m.role !== 'assistant' || !m.content) return;
      const tableBlocks = m.content.match(/^\|.+\|\n\|[\s:-]+\|\n(\|.+\|\n?)+/gm);
      if (!tableBlocks) return;
      tableBlocks.forEach(block => {
        const lines = block.trim().split('\n').filter((_, idx) => idx !== 1); // drop the |---|---| separator row
        const grid = lines.map(line => line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
        tableCount++;
        const sheet = XLSX.utils.aoa_to_sheet(grid);
        XLSX.utils.book_append_sheet(wb, sheet, `Table ${tableCount} (msg ${i + 1})`.slice(0, 31));
      });
    });

    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    download(`${safeName(session.title)}.xlsx`, new Blob([out], { type: 'application/octet-stream' }), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  /** One slide per message. Long messages are chunked across multiple slides rather than truncated. */
  function toPptx(session) {
    const Ctor = window.PptxGenJS;
    if (!Ctor) { console.warn('Coctus: pptxgenjs not loaded, cannot export .pptx.'); return; }
    const pptx = new Ctor();
    pptx.defineLayout({ name: 'LOCXY', width: 10, height: 5.63 });
    pptx.layout = 'LOCXY';

    const title = pptx.addSlide();
    title.background = { color: '0E1016' };
    title.addText(session.title || 'Coctus AI conversation', { x: 0.5, y: 2.1, w: 9, h: 1, fontSize: 30, bold: true, color: 'FFFFFF', fontFace: 'Arial' });
    title.addText(`Exported from Coctus AI — ${new Date(session.updated).toLocaleString()}`, { x: 0.5, y: 3.0, w: 9, h: 0.5, fontSize: 12, color: '9AA1B2', fontFace: 'Arial' });

    const CHARS_PER_SLIDE = 900;
    session.messages.forEach((m, i) => {
      const who = m.role === 'user' ? 'You' : 'Coctus AI';
      const plain = (m.content || '').replace(/```[\s\S]*?```/g, s => '\n' + s.replace(/```\w*\n?/g, '').replace(/```/g, '') + '\n').replace(/[*_#>`]/g, '');
      const chunks = [];
      for (let c = 0; c < plain.length; c += CHARS_PER_SLIDE) chunks.push(plain.slice(c, c + CHARS_PER_SLIDE));
      if (!chunks.length) chunks.push('');
      chunks.forEach((chunk, part) => {
        const slide = pptx.addSlide();
        slide.addText(`${who}${chunks.length > 1 ? ` (${part + 1}/${chunks.length})` : ''}`, { x: 0.4, y: 0.3, w: 9.2, h: 0.5, fontSize: 16, bold: true, color: m.role === 'user' ? '4FD8C4' : 'E9EAF0', fontFace: 'Arial' });
        slide.addText(chunk, { x: 0.4, y: 0.9, w: 9.2, h: 4.4, fontSize: 12, color: 'D6D9E3', fontFace: 'Arial', valign: 'top' });
      });
    });

    pptx.writeFile({ fileName: `${safeName(session.title)}.pptx` });
  }

  function exportSession(session, format) {
    if (!session || !session.messages.length) return;
    const name = safeName(session.title);
    switch (format) {
      case 'md': return download(`${name}.md`, toMarkdown(session), 'text/markdown');
      case 'txt': return download(`${name}.txt`, toPlainText(session), 'text/plain');
      case 'json': return download(`${name}.json`, toJson(session), 'application/json');
      case 'pdf': return toPdf(session);
      case 'docx': return toDocx(session);
      case 'xlsx': return toXlsx(session);
      case 'pptx': return toPptx(session);
    }
  }

  // ---------- single code block ----------
  function downloadCodeBlock(code, lang, filenameHint) {
    const ext = extFor(lang);
    const name = filenameHint ? filenameHint : `locxy-snippet.${ext}`;
    download(name, code, 'text/plain');
  }

  // ---------- bundle multiple code blocks into one .zip ----------
  async function downloadBlocksAsZip(blocks, zipTitle) {
    if (!window.JSZip) { console.warn('Coctus: JSZip not loaded, cannot bundle.'); return; }
    const zip = new JSZip();
    const usedNames = new Set();
    blocks.forEach((b, i) => {
      let name = b.filename || `file-${i + 1}.${extFor(b.lang)}`;
      let unique = name, n = 2;
      while (usedNames.has(unique)) { unique = name.replace(/(\.[^.]+)?$/, `-${n}$1`); n++; }
      usedNames.add(unique);
      zip.file(unique, b.code);
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    download(`${safeName(zipTitle)}.zip`, blob, 'application/zip');
  }

  // ---------- single message export ----------
  function downloadMessageAsMarkdown(text, title) {
    download(`${safeName(title)}.md`, text, 'text/markdown');
  }

  function downloadMessageAsPdf(text, title) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const marginX = 48;
    const pageWidth = doc.internal.pageSize.getWidth();
    const maxWidth = pageWidth - marginX * 2;
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
    doc.text(title || 'Coctus AI response', marginX, 56);
    doc.setTextColor(20);
    toPdfText(doc, marginX, maxWidth, 15, pageHeight, 84, [{ text }]);
    doc.save(`${safeName(title)}.pdf`);
  }

  /** html should already be rendered+sanitized markdown (caller owns marked/DOMPurify). */
  function downloadMessageAsDocx(html, title) {
    if (!window.htmlDocx) { console.warn('Coctus: html-docx-js not loaded, cannot export .docx.'); return; }
    const full = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title || 'Coctus AI'}</title></head><body>${html}</body></html>`;
    const blob = htmlDocx.asBlob(full);
    download(`${safeName(title)}.docx`, blob, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  }

  return {
    exportSession,
    downloadCodeBlock,
    downloadBlocksAsZip,
    downloadMessageAsMarkdown,
    downloadMessageAsPdf,
    downloadMessageAsDocx,
    extFor,
  };
})();

