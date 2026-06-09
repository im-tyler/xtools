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

var _grokData = null;

function buildGrokMd(conv) {
  var lines = ['> Exported from Grok on ' + new Date().toLocaleString(), '', '---', '', '# ' + conv.title, ''];
  conv.messages.forEach(function (msg) {
    lines.push(msg.role === 'user' ? '**You**:' : '**Grok**:');
    lines.push('');
    lines.push(msg.content.trim());
    lines.push('');
    lines.push('---');
    lines.push('');
  });
  return lines.join('\n');
}

function buildGrokHtml(conv) {
  var esc = function (s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + esc(conv.title) + '</title>'
    + '<style>body{font-family:system-ui,sans-serif;max-width:800px;margin:0 auto;padding:20px;background:#1a1a2e;color:#eaeaea}'
    + 'h1{color:#e94560}.msg{margin:12px 0;padding:12px 16px;border-radius:8px}'
    + '.user{background:#16213e}.grok{background:#0f3460}'
    + '.role{font-size:11px;font-weight:600;color:#e94560;margin-bottom:4px}'
    + '.content{white-space:pre-wrap;line-height:1.6}</style></head><body>'
    + '<h1>' + esc(conv.title) + '</h1>';
  conv.messages.forEach(function (msg) {
    html += '<div class="msg ' + (msg.role === 'user' ? 'user' : 'grok') + '">'
      + '<div class="role">' + esc(msg.role === 'user' ? 'You' : 'Grok') + '</div>'
      + '<div class="content">' + esc(msg.content) + '</div></div>';
  });
  return html + '</body></html>';
}

function downloadStr(str, filename, mime) {
  var encoded = 'data:' + mime + ';charset=utf-8,' + encodeURIComponent(str);
  chrome.downloads.download({ url: encoded, filename: filename });
}

function sanitize(s) {
  return (s || 'grok_chat').replace(/[^a-z0-9_\-\s]/gi, '').replace(/\s+/g, '_').toLowerCase().slice(0, 60) || 'grok_chat';
}

document.getElementById("btn-grok-scan").addEventListener("click", function () {
  var btn = this;
  var errEl = document.getElementById("grok-error");
  if (!currentTabId) {
    errEl.style.display = "block";
    errEl.textContent = "No active tab found.";
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Scanning...';
  errEl.style.display = "none";
  document.getElementById("grok-results").style.display = "none";

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
        dbg = rel.length ? ' IDs: ' + rel.join(', ') : ' (no relevant test IDs found — check console)';
        console.log('[Grok Export] All data-testids on page:', result.debugIds);
      }
      errEl.textContent = "No messages found — open a conversation first (not just the history list)." + dbg;
      return;
    }
    _grokData = result;
    document.getElementById("grok-count").textContent = result.messages.length + ' messages in "' + result.title + '"';
    document.getElementById("grok-results").style.display = "block";
  });
});

document.getElementById("btn-grok-md").addEventListener("click", function () {
  if (!_grokData) return;
  downloadStr(buildGrokMd(_grokData), sanitize(_grokData.title) + '.md', 'text/markdown');
});

document.getElementById("btn-grok-html").addEventListener("click", function () {
  if (!_grokData) return;
  downloadStr(buildGrokHtml(_grokData), sanitize(_grokData.title) + '.html', 'text/html');
});

document.getElementById("btn-grok-copy").addEventListener("click", function () {
  if (!_grokData) return;
  var btn = this;
  navigator.clipboard.writeText(buildGrokMd(_grokData)).then(function () {
    btn.textContent = 'Copied!';
    setTimeout(function () { btn.textContent = 'Copy to Clipboard'; }, 1500);
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
