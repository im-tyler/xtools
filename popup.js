var currentTabId = null;

document.querySelectorAll("[data-page]").forEach(function (el) {
  el.addEventListener("click", function () {
    var target = el.getAttribute("data-page");
    document.querySelectorAll(".page").forEach(function (p) { p.classList.remove("active"); });
    document.getElementById(target).classList.add("active");
  });
});

chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
  if (!tabs || !tabs[0]) return;
  currentTabId = tabs[0].id;
  var url = tabs[0].url || "";
  var dot = document.getElementById("grok-dot");
  var status = document.getElementById("grok-status");
  var actions = document.getElementById("grok-actions");
  var note = document.getElementById("grok-note");
  var isXTab = url.includes("x.com") || url.includes("twitter.com");
  var isGrokPage = url.includes("/i/grok") || url.includes("/grok");
  if (!isXTab) {
    dot.className = "dot inactive";
    status.textContent = "Not on X.com";
    note.style.display = "block";
    return;
  }
  if (isGrokPage) {
    dot.className = "dot active";
    status.textContent = "Grok page detected";
  } else {
    dot.className = "dot inactive";
    status.textContent = "Navigate to x.com/i/grok first";
  }
  actions.style.display = "flex";
});

var _grokQueue = []; // accumulated conversations across scans

function sanitize(s) {
  return (s || 'grok_chat').replace(/[^a-z0-9_\-\s]/gi, '').replace(/\s+/g, '_').toLowerCase().slice(0, 60) || 'grok_chat';
}

function buildGrokMd(conv) {
  var lines = ['> Exported from Grok — ' + new Date().toLocaleString(), '', '# ' + conv.title, ''];
  conv.messages.forEach(function (msg) {
    lines.push('**' + (msg.role === 'user' ? 'You' : 'Grok') + '**');
    lines.push('');
    lines.push(msg.content.trim());
    lines.push('');
    lines.push('---');
    lines.push('');
  });
  return lines.join('\n');
}

function buildCombinedHtml(conversations) {
  var esc = function (s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
  var date = new Date().toLocaleString();
  var css = 'html{height:100%}'
    + 'body{margin:0;font-family:system-ui,sans-serif;background:#1a1a2e;color:#eaeaea;display:flex;min-height:100%}'
    + 'nav{width:220px;flex-shrink:0;background:#0d0d1f;padding:20px 14px;position:sticky;top:0;height:100vh;overflow-y:auto;box-sizing:border-box}'
    + 'nav h2{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#555;margin-bottom:12px}'
    + 'nav a{display:block;font-size:12px;color:#a0a0b0;text-decoration:none;padding:5px 8px;border-radius:4px;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + 'nav a:hover{background:#16213e;color:#eaeaea}'
    + 'main{flex:1;padding:40px;max-width:860px}'
    + 'h1.page-title{font-size:22px;color:#e94560;margin-bottom:4px}'
    + '.export-date{font-size:11px;color:#555;margin-bottom:40px}'
    + 'section{margin-bottom:60px}'
    + 'h2.conv-title{font-size:17px;color:#e94560;margin-bottom:20px;padding-bottom:8px;border-bottom:1px solid #0f3460}'
    + '.msg{margin:10px 0;padding:12px 16px;border-radius:8px}'
    + '.user{background:#16213e}.grok{background:#0f3460}'
    + '.role{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#e94560;margin-bottom:6px}'
    + '.content{white-space:pre-wrap;line-height:1.65;font-size:14px}';
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Grok Export</title><style>' + css + '</style></head><body>';
  html += '<nav><h2>Conversations</h2>';
  conversations.forEach(function (conv, i) {
    html += '<a href="#conv-' + i + '" title="' + esc(conv.title) + '">' + esc(conv.title) + '</a>';
  });
  html += '</nav><main>';
  html += '<h1 class="page-title">Grok Export</h1><div class="export-date">' + esc(date) + ' &middot; ' + conversations.length + ' conversation' + (conversations.length !== 1 ? 's' : '') + '</div>';
  conversations.forEach(function (conv, i) {
    html += '<section id="conv-' + i + '"><h2 class="conv-title">' + esc(conv.title) + '</h2>';
    conv.messages.forEach(function (msg) {
      html += '<div class="msg ' + (msg.role === 'user' ? 'user' : 'grok') + '">'
        + '<div class="role">' + esc(msg.role === 'user' ? 'You' : 'Grok') + '</div>'
        + '<div class="content">' + esc(msg.content) + '</div></div>';
    });
    html += '</section>';
  });
  return html + '</main></body></html>';
}

function downloadStr(str, filename, mime) {
  var encoded = 'data:' + mime + ';charset=utf-8,' + encodeURIComponent(str);
  chrome.downloads.download({ url: encoded, filename: filename });
}

function renderQueue() {
  var queueEl = document.getElementById('grok-queue');
  var labelEl = document.getElementById('grok-queue-label');
  var listEl  = document.getElementById('grok-queue-list');
  if (!_grokQueue.length) { queueEl.style.display = 'none'; return; }
  queueEl.style.display = 'block';
  var n = _grokQueue.length;
  labelEl.textContent = n + ' conversation' + (n !== 1 ? 's' : '') + ' queued';
  listEl.innerHTML = '';
  _grokQueue.forEach(function (conv, i) {
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:3px 0;';
    var title = document.createElement('span');
    title.style.cssText = 'font-size:11px;color:#c9c9d9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;';
    title.textContent = conv.title;
    var count = document.createElement('span');
    count.style.cssText = 'font-size:10px;color:#555;margin-left:8px;flex-shrink:0;';
    count.textContent = conv.messages.length + ' msg';
    row.appendChild(title);
    row.appendChild(count);
    listEl.appendChild(row);
  });
}

document.getElementById("btn-grok-scan").addEventListener("click", function () {
  var btn = this;
  var errEl = document.getElementById("grok-error");
  var successEl = document.getElementById("grok-success");
  if (!currentTabId) {
    errEl.style.display = "block";
    errEl.textContent = "No active tab found.";
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Scanning...';
  errEl.style.display = "none";
  successEl.style.display = "none";

  chrome.scripting.executeScript({
    target: { tabId: currentTabId },
    func: function () {
      function cleanText(el) {
        var clone = el.cloneNode(true);
        clone.querySelectorAll('script,style,svg,img,button').forEach(function (n) { n.remove(); });
        return (clone.innerText || clone.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
      }

      function hasBg(el) {
        var bg = getComputedStyle(el).backgroundColor;
        if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') return true;
        for (var i = 0; i < el.children.length; i++) {
          var cbg = getComputedStyle(el.children[i]).backgroundColor;
          if (cbg && cbg !== 'transparent' && cbg !== 'rgba(0, 0, 0, 0)') return true;
        }
        return false;
      }

      // Role by background: user messages have a bubble background, Grok responses don't
      function guessRole(el) {
        return hasBg(el) ? 'user' : 'Grok';
      }

      // Find the best scrollable container holding conversation messages.
      // Checks explicit overflow AND implicit scroll (scrollHeight > clientHeight).
      function findConvContainer() {
        var best = null, bestScore = 0;
        var els = document.querySelectorAll('div,section,main');
        for (var i = 0; i < els.length; i++) {
          var el = els[i];
          var oy = getComputedStyle(el).overflowY;
          var scrollable = (oy === 'auto' || oy === 'scroll' || oy === 'overlay')
                        || (el.scrollHeight > el.clientHeight + 80);
          if (!scrollable) continue;
          var rect = el.getBoundingClientRect();
          if (rect.height < 150 || rect.width < 200) continue;
          var score = 0;
          for (var j = 0; j < el.children.length; j++) {
            if (cleanText(el.children[j]).length > 10) score++;
          }
          if (score > bestScore) { bestScore = score; best = el; }
        }
        return bestScore >= 2 ? best : null;
      }

      // Fallback: find the largest set of text-bearing siblings in the document.
      // Works even if the container has no scrollable styling.
      function findLargestSiblingGroup() {
        var best = [];
        var seen = new Set();
        document.querySelectorAll('div,section,article').forEach(function (parent) {
          if (seen.has(parent) || parent === document.body) return;
          seen.add(parent);
          var rect = parent.getBoundingClientRect();
          if (rect.width < 200 || rect.height < 80) return;
          var kids = [];
          for (var i = 0; i < parent.children.length; i++) {
            var child = parent.children[i];
            var t = cleanText(child);
            // Message-like: enough text, not a huge wrapper
            if (t.length >= 20 && t.length <= 8000 && child.children.length < 25) kids.push(child);
          }
          if (kids.length > best.length) best = kids;
        });
        return best.length >= 2 ? best : null;
      }

      var title = document.title.replace(/\s*[\/|]\s*(X|Grok).*$/i, '').trim() || 'Grok Chat';
      var msgs = [];

      // Strategy 0 (primary): bubble-segmented transcript.
      // Grok renders each answer as a flat list of markdown blocks (no testids) and wraps
      // each user message in an opaque "bubble" background. Container children don't map 1:1
      // to turns (an answer + the next question can share one child), so we locate the turn
      // container, find the user bubbles, then walk in document order: text outside a bubble
      // is Grok, text inside a bubble is the user.
      (function () {
        var root = document.querySelector('[data-testid="primaryColumn"]') || document.querySelector('main') || document.body;
        function gtxt(el) { return (el.innerText || el.textContent || '').trim(); }
        function bgOf(el) { return getComputedStyle(el).backgroundColor; }
        function opaque(c) {
          if (!c || c === 'transparent' || c === 'rgba(0, 0, 0, 0)') return false;
          var m = c.match(/rgba?\(([^)]+)\)/); if (!m) return true;
          var p = m[1].split(','); return p.length >= 4 ? parseFloat(p[3]) >= 0.9 : true;
        }
        var baseBg = bgOf(document.body);
        if (!opaque(baseBg)) baseBg = bgOf(document.documentElement);
        // A user message sits in a rounded <div> bubble (border-radius ~24px). Code blocks
        // (<pre>) and table rows (<tr>) also have opaque backgrounds but are square-ish and
        // non-div, so require a div with a sizable corner radius to avoid splitting them out.
        function isBubble(el) {
          if (el.tagName !== "DIV") return false;
          if (parseFloat(getComputedStyle(el).borderTopLeftRadius) < 16) return false;
          var c = bgOf(el);
          return opaque(c) && c !== baseBg && gtxt(el).length > 0;
        }

        // Largest "solid" block = one message (text not dominated by a single child).
        var M = null, Mlen = 0;
        root.querySelectorAll('div,section,article').forEach(function (el) {
          var t = gtxt(el).length; if (t < 80 || t <= Mlen) return;
          var mc = 0;
          for (var i = 0; i < el.children.length; i++) { var ct = gtxt(el.children[i]).length; if (ct > mc) mc = ct; }
          if (mc <= t * 0.55) { Mlen = t; M = el; }
        });
        if (!M) return;

        // Turn container = lowest ancestor of M with >=2 text-bearing children.
        var C = null, n = M.parentElement;
        while (n && n !== root.parentElement) {
          var big = 0;
          for (var i = 0; i < n.children.length; i++) { if (gtxt(n.children[i]).length > 10) big++; }
          if (big >= 2) { C = n; break; }
          if (n === root) break;
          n = n.parentElement;
        }
        if (!C) C = M.parentElement || M;

        // Outermost user-bubble elements (don't descend once a bubble is found).
        var bubbles = [];
        (function find(el) {
          if (el !== C && isBubble(el)) { bubbles.push(el); return; }
          for (var i = 0; i < el.children.length; i++) find(el.children[i]);
        })(C);
        function inBubble(c) { for (var i = 0; i < bubbles.length; i++) if (bubbles[i] === c) return true; return false; }
        function hasBubble(el) { for (var i = 0; i < bubbles.length; i++) if (el.contains(bubbles[i])) return true; return false; }

        var buf = [];
        function flush() { var t = buf.join('\n').replace(/\n{3,}/g, '\n\n').trim(); if (t) msgs.push({ role: 'Grok', content: t }); buf = []; }
        (function walk(el) {
          for (var i = 0; i < el.children.length; i++) {
            var c = el.children[i];
            if (inBubble(c)) { flush(); var u = gtxt(c); if (u) msgs.push({ role: 'user', content: u }); }
            else if (hasBubble(c)) walk(c);
            else { var t = gtxt(c); if (t) buf.push(t); }
          }
        })(C);
        flush();
      })();
      if (msgs.length) return { title: title, messages: msgs };

      // Strategy 1: data-testid (Twitter may add these in future updates)
      function testIdPairs(hSel, gSel) {
        var hEls = document.querySelectorAll(hSel), gEls = document.querySelectorAll(gSel);
        if (!hEls.length && !gEls.length) return [];
        var all = [];
        hEls.forEach(function (e) { all.push({ el: e, role: 'user' }); });
        gEls.forEach(function (e) { all.push({ el: e, role: 'Grok' }); });
        all.sort(function (a, b) { return a.el.compareDocumentPosition(b.el) & 4 ? -1 : 1; });
        var out = [];
        all.forEach(function (item) { var t = cleanText(item.el); if (t.length > 3) out.push({ role: item.role, content: t }); });
        return out;
      }
      msgs = testIdPairs(
        '[data-testid="Human_message"],[data-testid="human-message"],[data-testid*="UserMessage"],[data-testid*="userMessage"]',
        '[data-testid="Grok_message"],[data-testid="grok-message"],[data-testid*="GrokResponse"],[data-testid*="AssistantMessage"]'
      );
      if (msgs.length) return { title: title, messages: msgs };

      // Strategy 2: ARIA role="log"
      var log = document.querySelector('[role="log"]');
      if (log) {
        Array.from(log.children).forEach(function (child) {
          var t = cleanText(child);
          if (t.length >= 5) msgs.push({ role: guessRole(child), content: t });
        });
        if (msgs.length) return { title: title, messages: msgs };
      }

      // Strategy 3: scrollable container (Grok's primary pattern — no data-testid)
      function extractFromContainer(container) {
        var out = [];
        Array.from(container.children).forEach(function (child) {
          var t = cleanText(child);
          if (t.length < 5) return;
          // One level deeper if child looks like a wrapper (only 1 text-bearing child)
          var textKids = Array.from(child.children).filter(function (c) { return cleanText(c).length > 10; });
          if (textKids.length === 1) {
            out.push({ role: guessRole(textKids[0]), content: cleanText(textKids[0]) });
          } else {
            out.push({ role: guessRole(child), content: t });
          }
        });
        return out;
      }
      var container = findConvContainer();
      if (container) {
        msgs = extractFromContainer(container);
        if (msgs.length >= 2) return { title: title, messages: msgs };
        msgs = [];
      }

      // Strategy 4: aria-label conversation
      var root = document.querySelector('[data-testid="primaryColumn"]') || document.querySelector('main') || document.body;
      var conv = root.querySelector('[aria-label*="onversation"],[aria-label*="chat"],[aria-label*="Chat"],[aria-label*="essages"]');
      if (conv) {
        Array.from(conv.children).forEach(function (child) {
          var t = cleanText(child);
          if (t.length > 10) msgs.push({ role: guessRole(child), content: t });
        });
        if (msgs.length) return { title: title, messages: msgs };
      }

      // Strategy 5: largest sibling group anywhere in the document
      var group = findLargestSiblingGroup();
      if (group) {
        group.forEach(function (el) {
          var t = cleanText(el);
          if (t.length >= 20) msgs.push({ role: guessRole(el), content: t });
        });
        if (msgs.length >= 2) return { title: title, messages: msgs };
      }

      var allIds = [];
      document.querySelectorAll('[data-testid]').forEach(function (el) {
        var id = el.getAttribute('data-testid');
        if (allIds.indexOf(id) === -1) allIds.push(id);
      });
      return { title: title, messages: [], debugIds: allIds };
    }
  }, function (results) {
    btn.disabled = false;
    btn.textContent = 'Scan Conversation';
    if (chrome.runtime.lastError || !results || !results[0]) {
      errEl.style.display = "block";
      errEl.textContent = chrome.runtime.lastError ? chrome.runtime.lastError.message : "Could not access page.";
      return;
    }
    var result = results[0].result;
    if (!result || !result.messages || !result.messages.length) {
      errEl.style.display = "block";
      var dbg = '';
      if (result && result.debugIds && result.debugIds.length) {
        var rel = result.debugIds.filter(function (id) {
          var l = id.toLowerCase();
          return l.includes('message') || l.includes('grok') || l.includes('human')
              || l.includes('conv') || l.includes('chat') || l.includes('turn')
              || l.includes('response') || l.includes('query') || l.includes('user');
        });
        dbg = rel.length ? ' IDs: ' + rel.join(', ') : ' (no relevant test IDs — check console)';
        console.log('[Grok Export] All data-testids on page:', result.debugIds);
      }
      errEl.textContent = "No messages found — open a conversation first (not just the history list)." + dbg;
      return;
    }
    // Replace existing entry with same title, or append
    var idx = _grokQueue.findIndex(function (c) { return c.title === result.title; });
    if (idx >= 0) {
      _grokQueue[idx] = result;
      successEl.textContent = 'Updated "' + result.title + '" (' + result.messages.length + ' messages)';
    } else {
      _grokQueue.push(result);
      successEl.textContent = 'Added "' + result.title + '" (' + result.messages.length + ' messages)';
    }
    successEl.style.display = "block";
    renderQueue();
  });
});

document.getElementById("btn-grok-export").addEventListener("click", function () {
  if (!_grokQueue.length) return;
  var date = new Date().toISOString().slice(0, 10);
  // Combined HTML — all conversations in one file
  downloadStr(buildCombinedHtml(_grokQueue), 'grok_export_' + date + '.html', 'text/html');
  // Individual MD files — staggered to avoid browser blocking
  _grokQueue.forEach(function (conv, i) {
    setTimeout(function () {
      downloadStr(buildGrokMd(conv), sanitize(conv.title) + '.md', 'text/markdown');
    }, 400 + i * 300);
  });
});

document.getElementById("btn-grok-clear").addEventListener("click", function () {
  _grokQueue = [];
  document.getElementById("grok-success").style.display = "none";
  document.getElementById("grok-error").style.display = "none";
  renderQueue();
});

document.getElementById("btn-grok-debug").addEventListener("click", function () {
  var btn = this;
  var errEl = document.getElementById("grok-error");
  var successEl = document.getElementById("grok-success");
  if (!currentTabId) {
    errEl.style.display = "block";
    errEl.textContent = "No active tab found.";
    return;
  }
  btn.disabled = true;
  btn.textContent = "Dumping...";
  errEl.style.display = "none";
  successEl.style.display = "none";

  chrome.scripting.executeScript({
    target: { tabId: currentTabId },
    func: function () {
      function txt(el) { return (el.innerText || el.textContent || "").trim(); }
      var lines = [];
      lines.push("URL: " + location.href);
      lines.push("");

      // --- History links: any anchor pointing at a Grok conversation ---
      lines.push("=== CONVERSATION LINKS (<a href> containing grok/conversation) ===");
      var linkCount = 0;
      document.querySelectorAll("a[href]").forEach(function (a) {
        var h = a.getAttribute("href") || "";
        if (!/grok|conversation/i.test(h)) return;
        linkCount++;
        if (linkCount <= 60) lines.push("  href=" + h + "  text=\"" + txt(a).slice(0, 40).replace(/\s+/g, " ") + "\"");
      });
      lines.push("total conversation links: " + linkCount);
      lines.push("");

      // --- Dialog / history panel structure ---
      lines.push("=== role=dialog PANELS ===");
      document.querySelectorAll('[role="dialog"]').forEach(function (d, di) {
        var dr = d.getBoundingClientRect();
        lines.push("dialog[" + di + "] W=" + Math.round(dr.width) + " H=" + Math.round(dr.height)
          + " text0=\"" + txt(d).slice(0, 50).replace(/\s+/g, " ") + "\"");
        // find a scrollable descendant (the history list)
        d.querySelectorAll("div").forEach(function (el) {
          var oy = getComputedStyle(el).overflowY;
          if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 40) {
            lines.push("  SCROLLER kids=" + el.childElementCount
              + " scrollH=" + el.scrollHeight + " clientH=" + el.clientHeight
              + " testid=" + (el.getAttribute("data-testid") || "-"));
            // sample first few row children
            var rows = el.children.length ? el.children[0].children : [];
            for (var i = 0; i < Math.min(rows.length, 6); i++) {
              var row = rows[i];
              var link = row.querySelector ? row.querySelector("a[href]") : null;
              lines.push("    row[" + i + "] <" + row.tagName.toLowerCase() + ">"
                + " tag-a=" + (link ? (link.getAttribute("href") || "yes") : "none")
                + " testid=" + (row.getAttribute && row.getAttribute("data-testid") || "-")
                + " \"" + txt(row).slice(0, 40).replace(/\s+/g, " ") + "\"");
            }
          }
        });
      });
      lines.push("");

      // --- Fallback: elements that look like history rows (have a conversation link) ---
      lines.push("=== SAMPLE CLICKABLE HISTORY ROWS ===");
      var rc = 0;
      document.querySelectorAll('[role="link"],[role="button"],[data-testid]').forEach(function (el) {
        if (rc >= 25) return;
        var t = txt(el);
        if (t.length < 3 || t.length > 80) return;
        var r = el.getBoundingClientRect();
        if (r.left < 150 || r.width > 400) return; // history sits in a narrow side panel
        rc++;
        lines.push("  <" + el.tagName.toLowerCase() + "> role=" + (el.getAttribute("role") || "-")
          + " testid=" + (el.getAttribute("data-testid") || "-")
          + " L=" + Math.round(r.left) + " W=" + Math.round(r.width)
          + " \"" + t.slice(0, 45).replace(/\s+/g, " ") + "\"");
      });

      var out = lines.join("\n");
      var blob = new Blob([out], { type: "text/plain" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = "grok_debug.txt";
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
      return true;
    }
  }, function () {
    btn.disabled = false;
    btn.textContent = "Dump DOM (debug)";
    if (chrome.runtime.lastError) {
      errEl.style.display = "block";
      errEl.textContent = chrome.runtime.lastError.message;
      return;
    }
    successEl.style.display = "block";
    successEl.textContent = "Saved grok_debug.txt — send me its contents.";
  });
});

document.getElementById("btn-screenshot").addEventListener("click", function () {
  if (!currentTabId) return;
  document.getElementById("btn-screenshot").disabled = true;
  var el = document.getElementById("ss-progress");
  var txt = document.getElementById("ss-progress-text");
  var fill = document.getElementById("ss-progress-fill");
  var res = document.getElementById("ss-result");
  el.style.display = "block";
  txt.textContent = "Taking full page screenshot...";
  fill.style.width = "0%";
  res.style.display = "none";
  chrome.runtime.sendMessage({ action: "screenshot", tabId: currentTabId });
});

chrome.runtime.onMessage.addListener(function (msg) {
  if (msg.action === "progress") {
    var el = document.getElementById("ss-progress");
    var txt = document.getElementById("ss-progress-text");
    var fill = document.getElementById("ss-progress-fill");
    if (el) { el.style.display = "block"; txt.textContent = msg.data.text; fill.style.width = msg.data.pct + "%"; }
  } else if (msg.action === "done") {
    var ssBtn = document.getElementById("btn-screenshot");
    if (ssBtn) ssBtn.disabled = false;
    var el = document.getElementById("ss-progress");
    var res = document.getElementById("ss-result");
    if (el) el.style.display = "none";
    if (res) { res.style.display = "block"; res.textContent = msg.data.text; res.style.color = "#22c55e"; }
  }
});

var defaultTwitterSettings = {
  enabled: true,
  followingDefault: true,
  hideForYou: false,
  hideSuggested: true,
  hideDiscoverMore: true,
  hideInlinePrompts: true,
  hideSidebar: false,
  centerContent: true,
  hideTrending: true,
  hideWhoToFollow: true,
  hideFloatingChat: true,
  hideGrokFab: true,
  hideViews: true,
  hideMetrics: false,
  hideBookmarkBtn: false,
  hideShareBtn: false,
  hideGrokNav: true,
  hideXLogo: true,
  hideJobsNav: true,
  hideCommunitiesNav: false,
  hidePremiumUpsells: true,
  hideBlueChecks: false,
  hideBookmarksNav: true,
  hideArticlesNav: true,
};

document.querySelectorAll("#twitter-toggles input[type=checkbox]").forEach(function (cb) {
  var key = cb.getAttribute("data-key");
  cb.checked = defaultTwitterSettings[key] || false;
  cb.addEventListener("change", function () {
    saveAndSendTwitter();
  });
});

var masterToggle = document.getElementById("twitter-master");
masterToggle.checked = defaultTwitterSettings.enabled;
masterToggle.addEventListener("change", function () {
  var on = masterToggle.checked;
  document.querySelectorAll("#twitter-toggles input[type=checkbox]").forEach(function (c) {
    c.disabled = !on;
  });
  document.getElementById("twitter-toggles").style.opacity = on ? "1" : "0.4";
  saveAndSendTwitter();
});

function saveAndSendTwitter() {
  var settings = { enabled: masterToggle.checked };
  document.querySelectorAll("#twitter-toggles input[type=checkbox]").forEach(function (c) {
    settings[c.getAttribute("data-key")] = c.checked;
  });
  chrome.storage.sync.set({ twitterSettings: settings });
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (!tabs || !tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, { action: "twitter-update", settings: settings }).catch(function () {});
  });
}

document.getElementById("btn-twitter-scan").addEventListener("click", function () {
  if (!currentTabId) return;
  chrome.runtime.sendMessage({ action: "twitter-scan", tabId: currentTabId });
});

chrome.storage.sync.get({ twitterSettings: defaultTwitterSettings }, function (stored) {
  var s = stored.twitterSettings || defaultTwitterSettings;
  masterToggle.checked = s.enabled !== false;
  var on = s.enabled !== false;
  document.getElementById("twitter-toggles").style.opacity = on ? "1" : "0.4";
  document.querySelectorAll("#twitter-toggles input[type=checkbox]").forEach(function (cb) {
    var key = cb.getAttribute("data-key");
    if (s[key] !== undefined) cb.checked = s[key];
    cb.disabled = !on;
  });
});
