/**
 * scanParser.js — parses common security-tool output formats into a
 * normalized item list, entirely client-side (DOMParser/JSON.parse, no
 * backend). Feeds the Targets workspace: import items as findings, or
 * save as a scan snapshot for later diffing.
 *
 * Supported formats, auto-detected from content:
 *   - Nmap XML (`nmap -oX`)
 *   - Burp Suite XML issue export
 *   - Nuclei JSONL (`nuclei -jsonl`, one JSON object per line)
 *   - Generic JSON array of objects (best-effort field mapping)
 *
 * Every parser returns the same shape so the UI doesn't need to know which
 * tool produced it:
 *   { tool, items: [{ type, label, detail, severity, host, raw }] }
 * `severity` is normalized to one of CoctusTargets.SEVERITIES where the
 * source tool provides one; otherwise null.
 */
const CoctusScanParser = (() => {
  function normalizeSeverity(s) {
    if (!s) return null;
    const v = String(s).toLowerCase();
    if (['critical', 'crit'].includes(v)) return 'critical';
    if (['high'].includes(v)) return 'high';
    if (['medium', 'med', 'moderate'].includes(v)) return 'medium';
    if (['low'].includes(v)) return 'low';
    if (['info', 'informational', 'information', 'unknown'].includes(v)) return 'info';
    return null;
  }

  // ---------------- Nmap XML ----------------
  function parseNmapXML(doc) {
    const items = [];
    doc.querySelectorAll('host').forEach(host => {
      const addr = host.querySelector('address');
      const ip = addr ? addr.getAttribute('addr') : 'unknown';
      const hostnameEl = host.querySelector('hostnames hostname');
      const hostname = hostnameEl ? hostnameEl.getAttribute('name') : null;
      const label = hostname ? `${hostname} (${ip})` : ip;
      const ports = host.querySelectorAll('port');
      if (!ports.length) {
        items.push({ type: 'host', label, detail: 'Host up, no open ports reported', severity: null, host: ip, raw: null });
        return;
      }
      ports.forEach(port => {
        const state = port.querySelector('state');
        if (state && state.getAttribute('state') !== 'open') return;
        const portid = port.getAttribute('portid');
        const proto = port.getAttribute('protocol');
        const service = port.querySelector('service');
        const svcName = service ? service.getAttribute('name') : '';
        const product = service ? [service.getAttribute('product'), service.getAttribute('version')].filter(Boolean).join(' ') : '';
        items.push({
          type: 'host_port',
          label: `${label} — ${portid}/${proto} ${svcName}`.trim(),
          detail: product || null,
          severity: null,
          host: ip,
          raw: { ip, hostname, port: portid, protocol: proto, service: svcName, product },
        });
      });
    });
    return { tool: 'nmap', items };
  }

  // ---------------- Burp Suite XML ----------------
  function parseBurpXML(doc) {
    const items = [];
    doc.querySelectorAll('issue').forEach(issue => {
      const get = (tag) => { const el = issue.querySelector(tag); return el ? el.textContent.trim() : ''; };
      const name = get('name');
      const severity = normalizeSeverity(get('severity'));
      const host = get('host');
      const path = get('path');
      const detailHtml = get('issueDetail') || get('issueBackground');
      const detail = detailHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
      items.push({
        type: 'burp_issue',
        label: `${name} — ${host}${path}`,
        detail,
        severity,
        host,
        raw: { name, severity: get('severity'), host, path },
      });
    });
    return { tool: 'burp', items };
  }

  // ---------------- Nuclei JSONL ----------------
  function parseNucleiJSONL(text) {
    const items = [];
    text.split('\n').map(l => l.trim()).filter(Boolean).forEach(line => {
      let obj;
      try { obj = JSON.parse(line); } catch (e) { return; }
      const info = obj.info || {};
      const host = obj.host || obj['matched-at'] || obj.matched_at || '';
      items.push({
        type: 'nuclei_finding',
        label: `[${obj['template-id'] || obj.template_id || '?'}] ${info.name || 'finding'} — ${host}`,
        detail: info.description || null,
        severity: normalizeSeverity(info.severity),
        host,
        raw: obj,
      });
    });
    return { tool: 'nuclei', items };
  }

  // ---------------- generic JSON array fallback ----------------
  function parseGenericJSON(data) {
    const arr = Array.isArray(data) ? data : (Array.isArray(data.results) ? data.results : Array.isArray(data.items) ? data.items : null);
    if (!arr) return null;
    const items = arr.map((obj, i) => ({
      type: 'generic',
      label: obj.name || obj.title || obj.host || obj.url || `item ${i + 1}`,
      detail: obj.description || obj.detail || null,
      severity: normalizeSeverity(obj.severity),
      host: obj.host || obj.url || null,
      raw: obj,
    }));
    return { tool: 'generic-json', items };
  }

  /** Auto-detects format and parses. Returns { tool, items } or throws with a clear message. */
  function parse(text) {
    const trimmed = text.trim();
    if (!trimmed) throw new Error('empty input');

    // XML formats
    if (trimmed.startsWith('<?xml') || trimmed.startsWith('<')) {
      const doc = new DOMParser().parseFromString(trimmed, 'text/xml');
      const parseError = doc.querySelector('parsererror');
      if (parseError) throw new Error('not valid XML: ' + parseError.textContent.slice(0, 200));
      if (doc.querySelector('nmaprun')) return parseNmapXML(doc);
      if (doc.querySelector('issues') || doc.querySelector('issue')) return parseBurpXML(doc);
      throw new Error('XML detected but not recognized as Nmap or Burp export');
    }

    // JSONL (nuclei) — multiple lines, each independently valid JSON
    const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      let allJson = true;
      for (const l of lines.slice(0, 5)) { try { JSON.parse(l); } catch (e) { allJson = false; break; } }
      if (allJson) {
        const result = parseNucleiJSONL(trimmed);
        if (result.items.length) return result;
      }
    }

    // Single JSON document
    try {
      const data = JSON.parse(trimmed);
      const generic = parseGenericJSON(data);
      if (generic) return generic;
      throw new Error('JSON parsed but did not contain a recognizable array of results');
    } catch (e) {
      if (e.message.includes('recognizable')) throw e;
      throw new Error('Could not detect format — expected Nmap XML, Burp XML, Nuclei JSONL, or a JSON array of results.');
    }
  }

  return { parse, normalizeSeverity };
})();
