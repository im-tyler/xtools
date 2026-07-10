(function () {
  var styleEl = null;
  var currentSettings = {};

  var defaults = {
    enabled: true,
    followingDefault: true,
    hideForYou: false,
    hideSuggested: true,
    hideDiscoverMore: true,
    hideInlinePrompts: true,
    hideSidebar: false,
    centerContent: true,
    keepSidebarLeft: true,
    hideTrending: true,
    hideWhoToFollow: true,
    hideFloatingChat: true,
    hideGrokFab: true,
    hideViews: true,
    hideMetrics: false,
    hideBookmarkBtn: false,
    hideShareBtn: false,
    inlineReplyComposer: false,
    hideGrokNav: false,
    hideXLogo: true,
    hideJobsNav: true,
    hideCommunitiesNav: false,
    hidePremiumUpsells: true,
    hideArticlesNav: true,
    hideBlueChecks: false,
    hideBookmarksNav: true,
  };

  function isTimelineLayout() {
    var primary = document.querySelector('[data-testid="primaryColumn"]');
    if (!primary) return true;
    return primary.getBoundingClientRect().width <= 700;
  }

  var rules = {
    followingDefault: function () { return ""; },
    hideForYou: function () { return '[role="tablist"] [role="tab"]:first-child { display: none !important; }'; },
    hideSuggested: function () { return '[data-testid="whoToFollowSspAd"] { display: none !important; }'; },
    hideDiscoverMore: function () { return ""; },
    hideInlinePrompts: function () { return ""; },
    hideSidebar: function () {
      if (!isTimelineLayout()) return '';
      return '[data-testid="sidebarColumn"] { display: none !important; }';
    },
    centerContent: function () {
      if (!isTimelineLayout()) return '';
      return '[data-testid="sidebarColumn"] { display: none !important; } [data-testid="primaryColumn"] { transform: translateX(var(--aie-tx, 0px)) !important; }';
    },
    keepSidebarLeft: function () {
      if (!isTimelineLayout()) return '';
      return '@media (min-width: 900px) { header[role="banner"] { position: fixed !important; left: var(--aie-nav-left, 0px) !important; top: 0 !important; bottom: 0 !important; height: 100vh !important; transform: none !important; z-index: 10 !important; } header[role="banner"] > div { height: 100vh !important; } }';
    },
    hideTrending: function () { return '[data-testid="sidebarColumn"] [data-testid="trend"] { display: none !important; }'; },
    hideWhoToFollow: function () { return '[aria-label="Who to follow"], [data-testid="WhoToFollow"], [data-testid="sidebarColumn"] [data-testid="UserCell"] { display: none !important; }'; },
    hideViews: function () { return '[data-testid="views"] { display: none !important; }'; },
    hideMetrics: function () { return '[data-testid="reply"] span, [data-testid="retweet"] span, [data-testid="like"] span, [data-testid="bookmark"] span { visibility: hidden !important; }'; },
    hideBookmarkBtn: function () { return '[data-testid="bookmark"] { display: none !important; }'; },
    hideShareBtn: function () { return '[data-testid="shareBtn"] { display: none !important; }'; },
    inlineReplyComposer: function () {
      return '[data-xtools-inline-reply] { display:grid !important; grid-template-columns:32px minmax(0,1fr) auto !important; align-items:start !important; gap:10px !important; margin:0 12px 8px !important; padding:10px 0 8px !important; border-bottom:1px solid rgba(83,100,113,.35) !important; } [data-xtools-inline-reply-avatar] { width:32px !important; height:32px !important; border-radius:50% !important; object-fit:cover !important; background:rgb(83,100,113) !important; } [data-xtools-inline-reply-input] { min-width:0 !important; flex:1 !important; resize:vertical !important; min-height:36px !important; max-height:120px !important; padding:6px 0 !important; border:0 !important; border-radius:0 !important; background:transparent !important; color:inherit !important; font:400 15px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif !important; line-height:1.45 !important; } [data-xtools-inline-reply-input]::placeholder { color:rgb(83,100,113) !important; } [data-xtools-inline-reply-input]:focus { outline:0 !important; } [data-xtools-inline-reply-submit] { align-self:center !important; padding:7px 14px !important; border:0 !important; border-radius:999px !important; background:rgb(29,155,240) !important; color:#fff !important; font:700 13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif !important; cursor:pointer !important; } [data-xtools-inline-reply-submit]:disabled { opacity:.55 !important; cursor:wait !important; }';
    },
    hideGrokNav: function () { return 'a[aria-label="Grok"] { display: none !important; }'; },
    hideXLogo: function () { return 'a[aria-label="X"] { display: none !important; }'; },
    hideJobsNav: function () { return 'a[href*="/jobs"] { display: none !important; }'; },
    hideCommunitiesNav: function () { return 'a[href*="/communities"] { display: none !important; }'; },
    hidePremiumUpsells: function () { return 'a[data-testid="premium-hub-tab"], a[href*="/i/premium_sign_up"] { display: none !important; }'; },
    hideArticlesNav: function () { return 'nav[aria-label="Primary"] a[aria-label="Articles"] { display: none !important; }'; },
    hideBlueChecks: function () { return '[data-testid="icon-verified"] { display: none !important; }'; },
    hideBookmarksNav: function () { return 'a[aria-label="Bookmarks"]:not([data-kagi-bookmarks]), a[data-testid="AppTabBar_Bookmarks_Link"]:not([data-kagi-bookmarks]) { display: none !important; }'; },
    hideFloatingChat: function () { return '[data-testid="chat-drawer-root"], [data-testid="chat-drawer-main"], button[aria-label="Chat"] { display: none !important; } div:has(> [data-testid="chat-drawer-root"]):has(> [data-testid="GrokDrawer"]) [data-testid="BottomBar"] { display: none !important; }'; },
    hideGrokFab: function () { return '[data-testid="GrokDrawer"], button[aria-label="Grok"][data-testid="GrokDrawerHeader"] { display: none !important; }'; },
  };

  var _cssTimer = null;
  function scheduleCSSRefresh() {
    clearTimeout(_cssTimer);
    _cssTimer = setTimeout(function () { applyCSS(currentSettings); }, 300);
  }

  function buildCSS(settings) {
    if (settings.enabled === false) return "";
    var css = "";
    Object.keys(rules).forEach(function (key) {
      if (settings[key]) {
        css += rules[key]() + "\n";
      }
    });
    return css;
  }

  var _lastTx = '0px';
  var _lastNavLeft = '0px';

  function applyCSS(settings) {
    document.documentElement.style.setProperty('--aie-tx', _lastTx);
    document.documentElement.style.setProperty('--aie-nav-left', _lastNavLeft);
    if (styleEl) styleEl.remove();
    styleEl = null;
    var css = buildCSS(settings);
    if (!css.trim()) return;
    styleEl = document.createElement("style");
    styleEl.id = "kagi-tools-twitter";
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  var _followingForcedPath = null;

  function forceFollowingTab() {
    var path = location.pathname;
    if (path !== '/' && path !== '/home') return;
    var tabs = document.querySelectorAll('[role="tablist"] [role="tab"]');
    tabs.forEach(function (tab) {
      var text = (tab.textContent || "").trim().toLowerCase();
      if (text === "following") {
        if (tab.getAttribute("aria-selected") !== "true") {
          tab.click();
        }
      }
    });
  }

  function maybeForceFollowingTab() {
    var path = location.pathname;
    if (path === _followingForcedPath) return;
    if (path !== '/' && path !== '/home') return;
    _followingForcedPath = path;
    setTimeout(forceFollowingTab, 300);
  }

  function hideDiscoverMoreContainers() {
    var cells = document.querySelectorAll('[data-testid="cellInnerDiv"]');
    cells.forEach(function (cell) {
      var spans = cell.querySelectorAll("span");
      for (var i = 0; i < spans.length; i++) {
        var t = spans[i].textContent;
        if (t === "Discover more" || t === "More Tweets" || t === "You might like" || t === "Based on your history") {
          cell.style.display = "none";
          break;
        }
      }
    });
  }

  function hideWhoToFollowInFeed() {
    var path = location.pathname;
    // On these pages user cards ARE the content — don't touch them
    var isUserListPage = /^\/(?:search(?:\/|$)|[^/]+\/(?:followers|following|verified_followers)(?:\/|$)|i\/lists(?:\/|$))/.test(path);

    document.querySelectorAll('[data-testid="cellInnerDiv"]').forEach(function (cell) {
      if (cell.style.display === "none") return;

      // Hide the "Who to follow" header cell
      var spans = cell.querySelectorAll("span");
      for (var i = 0; i < spans.length; i++) {
        if (spans[i].childElementCount === 0 && spans[i].textContent.trim() === "Who to follow") {
          cell.style.display = "none";
          break;
        }
      }

      // Hide all user card cells except on pages where they are primary content
      if (!isUserListPage && cell.querySelector('[data-testid="UserCell"]')) {
        cell.style.display = "none";
      }
    });
  }

  function inlineReplyVisible(el) {
    if (!el) return false;
    var rect = el.getBoundingClientRect();
    var style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  }

  function removeInlineReplyComposers() {
    document.querySelectorAll('[data-xtools-inline-reply]').forEach(function (el) { el.remove(); });
    document.querySelectorAll('article[data-testid="tweet"]').forEach(function (tweet) {
      delete tweet.dataset.xtoolsInlineReplyAttached;
    });
  }

  function isFocalTweet(tweet) {
    if (!/\/status\/\d+/.test(location.pathname)) return false;
    var primary = tweet.closest('[data-testid="primaryColumn"]');
    if (!primary) return false;
    return Array.from(primary.querySelectorAll('article[data-testid="tweet"]'))[0] === tweet;
  }

  function inlineReplyAvatar() {
    var avatar = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"] img');
    return avatar && avatar.getAttribute("src") || "";
  }

  function injectInlineReplyComposers() {
    if (currentSettings.enabled === false || !currentSettings.inlineReplyComposer) {
      removeInlineReplyComposers();
      return;
    }
    document.querySelectorAll('[data-xtools-inline-reply]').forEach(function (composer) {
      if (!composer._xtoolsTweet || !composer._xtoolsTweet.isConnected) composer.remove();
    });
    document.querySelectorAll('article[data-testid="tweet"]').forEach(function (tweet) {
      if (tweet.dataset.xtoolsInlineReplyAttached) return;
      if (isFocalTweet(tweet)) return;
      if (!tweet.querySelector('[data-testid="reply"]')) return;
      var composer = document.createElement("div");
      composer.setAttribute("data-xtools-inline-reply", "");
      var avatar = inlineReplyAvatar();
      composer.innerHTML = (avatar ? '<img data-xtools-inline-reply-avatar src="' + avatar + '" alt="">' : '<span data-xtools-inline-reply-avatar></span>') + '<textarea data-xtools-inline-reply-input placeholder="Post your reply"></textarea><button type="button" data-xtools-inline-reply-submit>Reply</button>';
      composer.addEventListener("click", function (event) { event.stopPropagation(); });
      composer.addEventListener("input", function (event) { event.stopPropagation(); });
      composer.querySelector('[data-xtools-inline-reply-submit]').addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        stageInlineReply(tweet, composer);
      });
      composer._xtoolsTweet = tweet;
      tweet.dataset.xtoolsInlineReplyAttached = "true";
      var host = tweet.parentNode;
      host.insertBefore(composer, tweet.nextSibling);
    });
  }

  function waitForReplyTextarea() {
    return new Promise(function (resolve) {
      var start = Date.now();
      (function check() {
        var fields = Array.from(document.querySelectorAll('[data-testid="tweetTextarea_0"]'));
        var visible = fields.filter(inlineReplyVisible).pop();
        if (visible) return resolve(visible);
        if (Date.now() - start > 8000) return resolve(null);
        setTimeout(check, 100);
      })();
    });
  }

  function fillReplyTextarea(textarea, text) {
    textarea.focus();
    var inserted = false;
    try { inserted = document.execCommand("insertText", false, text); } catch (e) {}
    if (!inserted || !textarea.textContent.trim()) {
      textarea.textContent = text;
      textarea.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    }
  }

  function waitForNativeReplyButton(textarea) {
    return new Promise(function (resolve) {
      var start = Date.now();
      (function check() {
        var scope = textarea.closest('[role="dialog"]') || document;
        var buttons = Array.from(scope.querySelectorAll('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]'));
        var reply = buttons.filter(function (button) {
          return inlineReplyVisible(button) && button.getAttribute("disabled") === null && button.getAttribute("aria-disabled") !== "true";
        }).pop();
        if (reply) return resolve(reply);
        if (Date.now() - start > 7000) return resolve(null);
        setTimeout(check, 100);
      })();
    });
  }

  async function stageInlineReply(tweet, composer) {
    var input = composer.querySelector('[data-xtools-inline-reply-input]');
    var button = composer.querySelector('[data-xtools-inline-reply-submit]');
    var text = (input && input.value || "").trim();
    if (!text) { if (input) input.focus(); return; }
    var nativeReply = tweet.querySelector('[data-testid="reply"]');
    if (!nativeReply) return;
    button.disabled = true;
    button.textContent = "Opening...";
    nativeReply.click();
    var textarea = await waitForReplyTextarea();
    if (!textarea) {
      button.disabled = false;
      button.textContent = "Reply";
      return;
    }
    fillReplyTextarea(textarea, text);
    button.textContent = "Replying...";
    var nativeSubmit = await waitForNativeReplyButton(textarea);
    if (!nativeSubmit) {
      button.disabled = false;
      button.textContent = "Review in X";
      return;
    }
    nativeSubmit.click();
    input.value = "";
    button.disabled = false;
    button.textContent = "Replied";
    setTimeout(function () { button.textContent = "Reply"; }, 1800);
  }

  var _alignTimer = null;

  function alignNavWithContent() {
    if (currentSettings.enabled === false) return;

    var primary = document.querySelector('[data-testid="primaryColumn"]');
    var header = document.querySelector('header[role="banner"]');

    if (!primary) return;

    var colRect = primary.getBoundingClientRect();
    var viewW   = window.innerWidth;
    var colW    = colRect.width;

    if (colW < 400 || colW > 750) {
      document.documentElement.style.setProperty('--aie-tx', '0px');
      document.documentElement.style.setProperty('--aie-nav-left', '0px');
      _lastTx = '0px';
      _lastNavLeft = '0px';
      return;
    }

    // getBoundingClientRect includes our previous transform. Measure from the
    // column's natural position so observer-triggered refreshes converge on
    // one offset instead of recalculating from a shifted column.
    var appliedTx = currentSettings.centerContent ? (parseFloat(_lastTx) || 0) : 0;
    var naturalLeft = colRect.left - appliedTx;
    var nextTx = currentSettings.centerContent
      ? Math.max(0, Math.round((viewW - colW) / 2 - naturalLeft)) + 'px'
      : '0px';
    if (_lastTx !== nextTx) {
      _lastTx = nextTx;
      document.documentElement.style.setProperty('--aie-tx', _lastTx);
    }

    if (currentSettings.keepSidebarLeft && header) {
      var navW = Math.round(header.getBoundingClientRect().width || 0);
      var centeredPrimaryLeft = naturalLeft + parseFloat(_lastTx);
      var nextNavLeft = Math.max(0, Math.round(centeredPrimaryLeft - navW)) + 'px';
      if (_lastNavLeft !== nextNavLeft) {
        _lastNavLeft = nextNavLeft;
        document.documentElement.style.setProperty('--aie-nav-left', _lastNavLeft);
      }
    }
  }

  function resetNavAlignment() {
    document.documentElement.style.removeProperty('--aie-tx');
    document.documentElement.style.removeProperty('--aie-nav-left');
    _lastTx = '0px';
    _lastNavLeft = '0px';
  }

  function scheduleAlignNav() {
    clearTimeout(_alignTimer);
    _alignTimer = setTimeout(function () {
      requestAnimationFrame(alignNavWithContent);
    }, 100);
  }

  window.addEventListener('resize', function () {
    if (currentSettings.enabled !== false && (currentSettings.centerContent || currentSettings.keepSidebarLeft)) scheduleAlignNav();
  });

  function injectMoreMenuItem(popup, href, label, markerAttr) {
    if (popup.querySelector('[' + markerAttr + ']')) return;
    var settingsEl = popup.querySelector('a[href*="/settings"]');
    if (!settingsEl) return;
    // Clone an existing item to inherit all of Twitter's CSS/structure
    var refLink = popup.querySelector('a') || popup.firstElementChild;
    if (!refLink) return;
    var refItem = refLink.closest('[role="menuitem"]') || refLink;
    var clone = refItem.cloneNode(true);
    clone.setAttribute(markerAttr, 'true');
    var anchor = clone.tagName === 'A' ? clone : clone.querySelector('a');
    if (anchor) {
      anchor.href = href;
      anchor.setAttribute('aria-label', label);
      anchor.setAttribute(markerAttr, 'true');
    }
    // Update the deepest text-only span with the new label
    var spans = Array.from(clone.querySelectorAll('span'));
    var labelSpan = spans.filter(function (s) {
      return !s.querySelector('span') && s.textContent.trim().length > 1;
    }).pop();
    if (labelSpan) {
      labelSpan.textContent = label;
    } else if (anchor) {
      anchor.textContent = label;
    }
    var insertBefore = settingsEl.closest('[role="menuitem"]') || settingsEl.parentElement;
    insertBefore.parentNode.insertBefore(clone, insertBefore);
  }

  function injectArticlesToMoreMenu() {
    document.querySelectorAll('[role="menu"]').forEach(function (popup) {
      if (!popup.querySelector('a[href*="/settings"]')) return;
      injectMoreMenuItem(popup, '/i/bookmarks', 'Bookmarks', 'data-kagi-bookmarks');
      injectMoreMenuItem(popup, '/compose/articles', 'Articles', 'data-kagi-articles');
    });
  }

  function applySettings(settings) {
    currentSettings = settings;
    applyCSS(settings);
    if (settings.enabled !== false) {
      if (settings.followingDefault) {
        _followingForcedPath = null;
        maybeForceFollowingTab();
      }
      if (settings.hideWhoToFollow) hideWhoToFollowInFeed();
      injectInlineReplyComposers();
      if (settings.centerContent || settings.keepSidebarLeft) scheduleAlignNav();
      else resetNavAlignment();
    } else {
      removeInlineReplyComposers();
      resetNavAlignment();
    }
  }

  var _lastUrl = location.href;

  function onUrlChange() {
    if (location.href === _lastUrl) return;
    _lastUrl = location.href;
    applyCSS(currentSettings);
  }

  var _origPushState = history.pushState;
  history.pushState = function () {
    _origPushState.apply(this, arguments);
    onUrlChange();
  };
  var _origReplaceState = history.replaceState;
  history.replaceState = function () {
    _origReplaceState.apply(this, arguments);
    onUrlChange();
  };
  window.addEventListener('popstate', onUrlChange);

  var observer = null;
  function startObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(function () {
      if (currentSettings.enabled === false) return;
      onUrlChange();
      scheduleCSSRefresh();
      if (currentSettings.followingDefault) maybeForceFollowingTab();
      if (currentSettings.hideDiscoverMore) hideDiscoverMoreContainers();
      if (currentSettings.hideWhoToFollow) hideWhoToFollowInFeed();
      if (currentSettings.inlineReplyComposer) injectInlineReplyComposers();
      if (currentSettings.centerContent || currentSettings.keepSidebarLeft) scheduleAlignNav();
      injectArticlesToMoreMenu();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function mergeDefaults(stored) {
    var merged = {};
    for (var key in defaults) {
      merged[key] = stored[key] !== undefined ? stored[key] : defaults[key];
    }
    return merged;
  }

  function grokSleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function grokStorageGet(keys) {
    return new Promise(function (resolve) { chrome.storage.local.get(keys, resolve); });
  }

  function grokStorageSet(value) {
    return new Promise(function (resolve) { chrome.storage.local.set(value, resolve); });
  }

  function grokStorageRemove(keys) {
    return new Promise(function (resolve) { chrome.storage.local.remove(keys, resolve); });
  }

  function grokDbOpen() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open("kagi_tools_grok_export", 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains("conversations")) {
          db.createObjectStore("conversations", { keyPath: "id" });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function grokDbWithStore(mode, fn) {
    return grokDbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction("conversations", mode);
        var store = tx.objectStore("conversations");
        var result = fn(store);
        tx.oncomplete = function () { db.close(); resolve(result); };
        tx.onerror = function () { db.close(); reject(tx.error); };
        tx.onabort = function () { db.close(); reject(tx.error); };
      });
    });
  }

  function grokDbPutConversation(conv) {
    return grokDbWithStore("readwrite", function (store) {
      store.put(conv);
    });
  }

  function grokDbClear() {
    return grokDbWithStore("readwrite", function (store) {
      store.clear();
    });
  }

  function grokDbGetAll() {
    return grokDbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction("conversations", "readonly");
        var req = tx.objectStore("conversations").getAll();
        req.onsuccess = function () {
          db.close();
          resolve((req.result || []).sort(function (a, b) { return a.order - b.order; }));
        };
        req.onerror = function () { db.close(); reject(req.error); };
      });
    });
  }

  function grokSetOverlay(text, detail) {
    var el = document.getElementById("kagi-grok-export-overlay");
    if (!el) {
      el = document.createElement("div");
      el.id = "kagi-grok-export-overlay";
      el.style.cssText = [
        "position:fixed",
        "right:16px",
        "bottom:16px",
        "z-index:2147483647",
        "max-width:320px",
        "padding:12px 14px",
        "border:1px solid #2f3336",
        "border-radius:8px",
        "background:#000",
        "color:#e7e9ea",
        "font:12px/1.45 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif",
        "box-shadow:0 10px 30px rgba(0,0,0,.35)"
      ].join(";");
      document.documentElement.appendChild(el);
    }
    el.innerHTML = '<div style="font-weight:700;margin-bottom:3px;">Grok history export</div>'
      + '<div>' + grokEsc(text) + '</div>'
      + (detail ? '<div style="color:#8b98a5;margin-top:3px;">' + grokEsc(detail) + '</div>' : "");
  }

  function grokEsc(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function grokText(el) {
    return (el && (el.innerText || el.textContent) || "").trim();
  }

  function grokCleanText(el) {
    var clone = el.cloneNode(true);
    clone.querySelectorAll("script,style,svg,img,button").forEach(function (n) { n.remove(); });
    return (clone.innerText || clone.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
  }

  function grokNormalizeMessageText(text) {
    var lines = String(text || "")
      .replace(/\r/g, "")
      .replace(/\u00a0/g, " ")
      .split("\n")
      .map(function (line) { return line.replace(/[ \t]+$/g, ""); });

    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();

    while (lines.length && /^(Thoughts|Thinking|See new posts)$/i.test(lines[0].trim())) {
      lines.shift();
      while (lines.length && !lines[0].trim()) lines.shift();
    }

    lines = lines.filter(function (line) {
      var t = line.trim();
      return t !== "To view keyboard shortcuts, press question markView keyboard shortcuts"
        && t !== "View keyboard shortcuts"
        && t !== "Show more"
        && t !== "Show less";
    });

    while (lines.length) {
      var tail = lines[lines.length - 1].trim();
      if (/^(Auto|\d+\s+web pages?)$/i.test(tail)) {
        lines.pop();
        continue;
      }
      break;
    }

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function grokIsJunkMessage(text) {
    var t = String(text || "").replace(/\s+/g, " ").trim();
    return !t
      || t === "See new posts"
      || t === "To view keyboard shortcuts, press question markView keyboard shortcuts"
      || t === "View keyboard shortcuts"
      || t === "This post is unavailable.";
  }

  function grokCleanMessages(messages) {
    var out = [];
    messages.forEach(function (msg) {
      var content = grokNormalizeMessageText(msg.content);
      if (grokIsJunkMessage(content)) return;
      var role = msg.role === "user" ? "user" : "Grok";
      var prev = out[out.length - 1];
      if (prev && prev.role === role && prev.content === content) return;
      out.push({ role: role, content: content });
    });
    return out;
  }

  function grokConversationResult(title, messages) {
    return { title: title, messages: grokCleanMessages(messages) };
  }

  function grokHasBg(el) {
    var bg = getComputedStyle(el).backgroundColor;
    if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") return true;
    for (var i = 0; i < el.children.length; i++) {
      var cbg = getComputedStyle(el.children[i]).backgroundColor;
      if (cbg && cbg !== "transparent" && cbg !== "rgba(0, 0, 0, 0)") return true;
    }
    return false;
  }

  function grokGuessRole(el) {
    return grokHasBg(el) ? "user" : "Grok";
  }

  function grokFindConvContainer() {
    var best = null, bestScore = 0;
    var els = document.querySelectorAll("div,section,main");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var oy = getComputedStyle(el).overflowY;
      var scrollable = (oy === "auto" || oy === "scroll" || oy === "overlay")
        || (el.scrollHeight > el.clientHeight + 80);
      if (!scrollable) continue;
      var rect = el.getBoundingClientRect();
      if (rect.height < 150 || rect.width < 200) continue;
      var score = 0;
      for (var j = 0; j < el.children.length; j++) {
        if (grokCleanText(el.children[j]).length > 10) score++;
      }
      if (score > bestScore) { bestScore = score; best = el; }
    }
    return bestScore >= 2 ? best : null;
  }

  function grokFindLargestSiblingGroup() {
    var best = [];
    var seen = new Set();
    document.querySelectorAll("div,section,article").forEach(function (parent) {
      if (seen.has(parent) || parent === document.body) return;
      seen.add(parent);
      var rect = parent.getBoundingClientRect();
      if (rect.width < 200 || rect.height < 80) return;
      var kids = [];
      for (var i = 0; i < parent.children.length; i++) {
        var child = parent.children[i];
        var t = grokCleanText(child);
        if (t.length >= 20 && t.length <= 8000 && child.children.length < 25) kids.push(child);
      }
      if (kids.length > best.length) best = kids;
    });
    return best.length >= 2 ? best : null;
  }

  function grokScrapeConversation() {
    var title = document.title.replace(/\s*[\/|]\s*(X|Grok).*$/i, "").trim() || "Grok Chat";
    var msgs = [];

    (function () {
      var root = document.querySelector('[data-testid="primaryColumn"]') || document.querySelector("main") || document.body;
      function gtxt(el) { return (el.innerText || el.textContent || "").trim(); }
      function bgOf(el) { return getComputedStyle(el).backgroundColor; }
      function opaque(c) {
        if (!c || c === "transparent" || c === "rgba(0, 0, 0, 0)") return false;
        var m = c.match(/rgba?\(([^)]+)\)/); if (!m) return true;
        var p = m[1].split(","); return p.length >= 4 ? parseFloat(p[3]) >= 0.9 : true;
      }
      var baseBg = bgOf(document.body);
      if (!opaque(baseBg)) baseBg = bgOf(document.documentElement);
      function isBubble(el) {
        if (el.tagName !== "DIV") return false;
        if (parseFloat(getComputedStyle(el).borderTopLeftRadius) < 16) return false;
        var c = bgOf(el);
        return opaque(c) && c !== baseBg && gtxt(el).length > 0;
      }

      var M = null, Mlen = 0;
      root.querySelectorAll("div,section,article").forEach(function (el) {
        var t = gtxt(el).length; if (t < 80 || t <= Mlen) return;
        var mc = 0;
        for (var i = 0; i < el.children.length; i++) {
          var ct = gtxt(el.children[i]).length;
          if (ct > mc) mc = ct;
        }
        if (mc <= t * 0.55) { Mlen = t; M = el; }
      });
      if (!M) return;

      var C = null, n = M.parentElement;
      while (n && n !== root.parentElement) {
        var big = 0;
        for (var i = 0; i < n.children.length; i++) {
          if (gtxt(n.children[i]).length > 10) big++;
        }
        if (big >= 2) { C = n; break; }
        if (n === root) break;
        n = n.parentElement;
      }
      if (!C) C = M.parentElement || M;

      var bubbles = [];
      (function find(el) {
        if (el !== C && isBubble(el)) { bubbles.push(el); return; }
        for (var i = 0; i < el.children.length; i++) find(el.children[i]);
      })(C);
      function inBubble(c) {
        for (var i = 0; i < bubbles.length; i++) if (bubbles[i] === c) return true;
        return false;
      }
      function hasBubble(el) {
        for (var i = 0; i < bubbles.length; i++) if (el.contains(bubbles[i])) return true;
        return false;
      }

      var buf = [];
      function flush() {
        var t = buf.join("\n").replace(/\n{3,}/g, "\n\n").trim();
        if (t) msgs.push({ role: "Grok", content: t });
        buf = [];
      }
      (function walk(el) {
        for (var i = 0; i < el.children.length; i++) {
          var c = el.children[i];
          if (inBubble(c)) {
            flush();
            var u = gtxt(c);
            if (u) msgs.push({ role: "user", content: u });
          } else if (hasBubble(c)) {
            walk(c);
          } else {
            var t = gtxt(c);
            if (t) buf.push(t);
          }
        }
      })(C);
      flush();
    })();
    if (msgs.length) {
      var result = grokConversationResult(title, msgs);
      if (result.messages.length) return result;
    }

    function testIdPairs(hSel, gSel) {
      var hEls = document.querySelectorAll(hSel), gEls = document.querySelectorAll(gSel);
      if (!hEls.length && !gEls.length) return [];
      var all = [];
      hEls.forEach(function (e) { all.push({ el: e, role: "user" }); });
      gEls.forEach(function (e) { all.push({ el: e, role: "Grok" }); });
      all.sort(function (a, b) { return a.el.compareDocumentPosition(b.el) & 4 ? -1 : 1; });
      var out = [];
      all.forEach(function (item) {
        var t = grokCleanText(item.el);
        if (t.length > 3) out.push({ role: item.role, content: t });
      });
      return out;
    }
    msgs = testIdPairs(
      '[data-testid="Human_message"],[data-testid="human-message"],[data-testid*="UserMessage"],[data-testid*="userMessage"]',
      '[data-testid="Grok_message"],[data-testid="grok-message"],[data-testid*="GrokResponse"],[data-testid*="AssistantMessage"]'
    );
    if (msgs.length) {
      var result = grokConversationResult(title, msgs);
      if (result.messages.length) return result;
    }

    var log = document.querySelector('[role="log"]');
    if (log) {
      Array.from(log.children).forEach(function (child) {
        var t = grokCleanText(child);
        if (t.length >= 5) msgs.push({ role: grokGuessRole(child), content: t });
      });
      if (msgs.length) {
        var result = grokConversationResult(title, msgs);
        if (result.messages.length) return result;
      }
    }

    function extractFromContainer(container) {
      var out = [];
      Array.from(container.children).forEach(function (child) {
        var t = grokCleanText(child);
        if (t.length < 5) return;
        var textKids = Array.from(child.children).filter(function (c) { return grokCleanText(c).length > 10; });
        if (textKids.length === 1) {
          out.push({ role: grokGuessRole(textKids[0]), content: grokCleanText(textKids[0]) });
        } else {
          out.push({ role: grokGuessRole(child), content: t });
        }
      });
      return out;
    }
    var container = grokFindConvContainer();
    if (container) {
      msgs = extractFromContainer(container);
      if (msgs.length >= 2) {
        var result = grokConversationResult(title, msgs);
        if (result.messages.length) return result;
      }
      msgs = [];
    }

    var root = document.querySelector('[data-testid="primaryColumn"]') || document.querySelector("main") || document.body;
    var conv = root.querySelector('[aria-label*="onversation"],[aria-label*="chat"],[aria-label*="Chat"],[aria-label*="essages"]');
    if (conv) {
      Array.from(conv.children).forEach(function (child) {
        var t = grokCleanText(child);
        if (t.length > 10) msgs.push({ role: grokGuessRole(child), content: t });
      });
      if (msgs.length) {
        var result = grokConversationResult(title, msgs);
        if (result.messages.length) return result;
      }
    }

    var group = grokFindLargestSiblingGroup();
    if (group) {
      group.forEach(function (el) {
        var t = grokCleanText(el);
        if (t.length >= 20) msgs.push({ role: grokGuessRole(el), content: t });
      });
      if (msgs.length >= 2) {
        var result = grokConversationResult(title, msgs);
        if (result.messages.length) return result;
      }
    }

    return { title: title, messages: [] };
  }

  function grokCurrentConversationId() {
    try { return new URL(location.href).searchParams.get("conversation") || ""; }
    catch (e) { return ""; }
  }

  function grokHistoryDialog() {
    var dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
    return dialogs.filter(function (d) {
      return d.querySelector('a[href*="conversation="]') || /History\s+Chats/i.test(grokText(d));
    })[0] || null;
  }

  function grokHistoryScroller(dialog) {
    var best = null, bestScore = 0;
    dialog.querySelectorAll("div").forEach(function (el) {
      var oy = getComputedStyle(el).overflowY;
      var scrollable = (oy === "auto" || oy === "scroll" || oy === "overlay")
        || el.scrollHeight > el.clientHeight + 40;
      if (!scrollable) return;
      var links = el.querySelectorAll('a[href*="conversation="]').length;
      var score = links * 1000 + el.scrollHeight;
      if (score > bestScore) { bestScore = score; best = el; }
    });
    return best;
  }

  function grokCollectHistoryLinks(root, seen, out) {
    root.querySelectorAll('a[href*="conversation="]').forEach(function (a) {
      var raw = a.getAttribute("href") || "";
      var url;
      try { url = new URL(raw, location.origin); } catch (e) { return; }
      var id = url.searchParams.get("conversation");
      if (!id || seen[id]) return;
      var title = grokText(a).replace(/\s+/g, " ").trim() || ("Grok " + id);
      seen[id] = true;
      out.push({ id: id, href: url.href, title: title });
    });
  }

  async function grokHarvestHistoryLinks() {
    grokSetOverlay("Opening history panel...");
    var dialog = grokHistoryDialog();
    if (!dialog) {
      var hist = document.querySelector('button[aria-label="Chat history"]');
      if (!hist) throw new Error('Could not find the "Chat history" button.');
      hist.click();
      await grokSleep(1300);
      dialog = grokHistoryDialog();
    }
    if (!dialog) throw new Error("Could not open the history dialog.");

    var scroller = grokHistoryScroller(dialog);
    if (!scroller) throw new Error("Could not find the history list scroller.");

    scroller.scrollTop = 0;
    await grokSleep(500);

    var seen = {};
    var links = [];
    var stale = 0;
    var lastCount = -1;
    var lastScrollHeight = -1;
    for (var step = 0; step < 350; step++) {
      grokCollectHistoryLinks(scroller, seen, links);
      grokSetOverlay("Reading history list...", links.length + " conversations found");

      var beforeTop = scroller.scrollTop;
      var beforeHeight = scroller.scrollHeight;
      scroller.scrollTop = Math.min(scroller.scrollHeight, scroller.scrollTop + Math.max(240, Math.floor(scroller.clientHeight * 0.85)));
      await grokSleep(550);
      grokCollectHistoryLinks(scroller, seen, links);

      var atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 12;
      var noNew = links.length === lastCount && scroller.scrollHeight === lastScrollHeight && Math.abs(scroller.scrollTop - beforeTop) < 4;
      if (atBottom && noNew) stale++;
      else stale = 0;
      if (stale >= 3) break;

      if (beforeHeight === scroller.scrollHeight && links.length === lastCount && atBottom) stale++;
      lastCount = links.length;
      lastScrollHeight = scroller.scrollHeight;
    }

    grokCollectHistoryLinks(scroller, seen, links);
    if (!links.length) throw new Error("No conversation links were found in history.");
    return links;
  }

  function grokElementLabel(el) {
    return [
      el.getAttribute && el.getAttribute("aria-label"),
      el.getAttribute && el.getAttribute("title"),
      el.getAttribute && el.getAttribute("data-testid"),
      grokText(el)
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }

  function grokIsVisible(el) {
    if (!el) return false;
    var rect = el.getBoundingClientRect();
    var style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function grokHistoryRowForAnchor(anchor, scroller) {
    var node = anchor;
    var best = anchor;
    while (node && node !== scroller && node.parentElement) {
      var rect = node.getBoundingClientRect();
      if (rect.width >= 180 && rect.height >= 20 && rect.height <= 120) best = node;
      node = node.parentElement;
    }
    return best;
  }

  function grokVisibleHistoryItems(scroller) {
    var seen = {};
    var items = [];
    var sr = scroller.getBoundingClientRect();
    scroller.querySelectorAll('a[href*="conversation="]').forEach(function (a) {
      var raw = a.getAttribute("href") || "";
      var url;
      try { url = new URL(raw, location.origin); } catch (e) { return; }
      var id = url.searchParams.get("conversation");
      if (!id || seen[id]) return;
      var ar = a.getBoundingClientRect();
      if (ar.bottom < sr.top || ar.top > sr.bottom) return;
      seen[id] = true;
      items.push({
        id: id,
        title: grokText(a).replace(/\s+/g, " ").trim() || id,
        anchor: a,
        row: grokHistoryRowForAnchor(a, scroller)
      });
    });
    return items;
  }

  function grokDispatchHover(el) {
    ["pointerover", "mouseover", "mouseenter", "pointerenter"].forEach(function (type) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    });
  }

  function grokClick(el) {
    if (!el) return false;
    var anchor = el.closest('a[href]');
    var saved = anchor ? anchor.getAttribute('href') : null;
    if (saved) anchor.removeAttribute('href');
    el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, view: window }));
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    el.click();
    if (saved) setTimeout(function () { anchor.setAttribute('href', saved); }, 200);
    return true;
  }

  function grokFindDeleteTarget(root) {
    var candidates = Array.from(root.querySelectorAll('button,[role="button"],[role="menuitem"],div,span,a'));
    return candidates.filter(grokIsVisible).filter(function (el) {
      var rect = el.getBoundingClientRect();
      if (rect.width > 400 || rect.height > 80 || rect.width < 20 || rect.height < 10) return false;
      var label = grokElementLabel(el);
      if (!/\b(delete|remove)\b/i.test(label)) return false;
      var childMatch = Array.from(el.querySelectorAll('button,[role="button"],[role="menuitem"],div,span')).some(function (child) {
        var cr = child.getBoundingClientRect();
        if (cr.width > 10 && cr.height > 5) {
          var cl = grokElementLabel(child);
          return /\b(delete|remove)\b/i.test(cl);
        }
        return false;
      });
      if (childMatch) return false;
      return true;
    })[0] || null;
  }

  function grokFindOptionsButton(row) {
    var buttons = Array.from(row.querySelectorAll('button,[role="button"]')).filter(grokIsVisible);
    var labeled = buttons.filter(function (el) {
      return /\b(more|option|actions|menu|overflow)\b/i.test(grokElementLabel(el));
    });
    if (labeled.length) return labeled[labeled.length - 1];
    var iconButtons = buttons.filter(function (el) {
      return !grokText(el).trim() && el.querySelector("svg");
    });
    if (iconButtons.length) return iconButtons[iconButtons.length - 1];
    return buttons[buttons.length - 1] || null;
  }

  async function grokConfirmDeleteDialog() {
    for (var i = 0; i < 20; i++) {
      var dialogs = Array.from(document.querySelectorAll('[role="dialog"],[role="alertdialog"]'));
      for (var d = 0; d < dialogs.length; d++) {
        var dialog = dialogs[d];
        if (!/delete|remove/i.test(grokText(dialog))) continue;
        var btn = grokFindDeleteTarget(dialog);
        if (btn) {
          grokClick(btn);
          return true;
        }
      }
      var globalDelete = grokFindDeleteTarget(document.body);
      if (globalDelete && /delete/i.test(grokElementLabel(globalDelete))) {
        grokClick(globalDelete);
        return true;
      }
      await grokSleep(150);
    }
    return false;
  }

  function grokExtractCsrf() {
    var m = document.cookie.match(/ct0=([^;]+)/);
    return m ? m[1] : '';
  }

  async function grokApiDeleteConversation(conversationId, debug) {
    var csrf = grokExtractCsrf();
    var url = '/i/api/graphql/TlKHSWVMVeaa-i7dqQqFQA/ConversationItem_DeleteConversationMutation';
    var body = JSON.stringify({
      variables: { conversationId: conversationId },
      features: {},
    });
    var resp = await fetch(url, {
      method: 'POST',
      headers: {
        'authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
        'x-csrf-token': csrf,
        'x-twitter-active-user': 'yes',
        'x-twitter-auth-type': 'OAuth2Session',
        'x-twitter-client-language': 'en',
        'content-type': 'application/json',
      },
      credentials: 'include',
      body: body,
    });
    var respBody = '';
    try { respBody = await resp.text(); } catch (e) {}
    if (debug) {
      grokSetOverlay('API debug: status=' + resp.status, respBody.slice(0, 300));
    }
    return resp.ok;
  }

  async function grokDeleteHistoryItem(item) {
    try {
      return await grokApiDeleteConversation(item.id);
    } catch (e) {
      return false;
    }
  }

  async function grokDeleteAllChatsRunner() {
    if (window.__kagiGrokDeleteAllRunning) return;
    window.__kagiGrokDeleteAllRunning = true;
    try {
      grokSetOverlay("Harvesting conversation IDs...");
      var links = await grokHarvestHistoryLinks();
      if (!links.length) throw new Error("No conversations found in history.");

      grokSetOverlay("Deleting " + links.length + " conversations...", "0 / " + links.length);
      var deleted = 0;
      var failed = 0;
      for (var i = 0; i < links.length; i++) {
        var item = links[i];
        grokSetOverlay("Deleting " + links.length + " conversations...", (i + 1) + " / " + links.length + " — " + item.title);
        var ok = await grokApiDeleteConversation(item.id, i === 0);
        if (ok) {
          deleted++;
        } else {
          failed++;
        }
        await grokSleep(300);
      }

      grokSetOverlay("Delete-all finished.", deleted + " deleted" + (failed ? ", " + failed + " failed" : ""));
    } catch (err) {
      grokSetOverlay("Delete-all stopped.", err && err.message ? err.message : String(err));
    } finally {
      window.__kagiGrokDeleteAllRunning = false;
    }
  }

  function grokStartDeleteAllChats() {
    if (!/\/i\/grok/.test(location.pathname)) {
      throw new Error("Open x.com/i/grok before deleting Grok chats.");
    }
    setTimeout(grokDeleteAllChatsRunner, 50);
    return { started: true };
  }

  async function grokWaitForConversation(item) {
    var best = null;
    await grokSleep(1000);
    for (var attempt = 0; attempt < 30; attempt++) {
      var conv = grokScrapeConversation();
      if (conv && conv.messages && conv.messages.length) {
        best = conv;
        if (attempt >= 2) break;
      }
      grokSetOverlay("Loading conversation " + (item.order + 1) + " of " + item.total + "...", item.title);
      await grokSleep(700);
    }
    if (!best) best = { title: item.title, messages: [], error: "No messages found" };
    best.id = item.id;
    best.title = item.title || best.title || ("Grok " + item.id);
    best.url = item.href;
    best.order = item.order;
    return best;
  }

  function grokNavigateTo(href) {
    location.href = href;
  }

  function grokBuildCombinedHtml(conversations) {
    var date = new Date().toLocaleString();
    var css = "html{height:100%}"
      + "body{margin:0;font-family:system-ui,sans-serif;background:#1a1a2e;color:#eaeaea;display:flex;min-height:100%}"
      + "nav{width:240px;flex-shrink:0;background:#0d0d1f;padding:20px 14px;position:sticky;top:0;height:100vh;overflow-y:auto;box-sizing:border-box}"
      + "nav h2{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#777;margin-bottom:12px}"
      + "nav a{display:block;font-size:12px;color:#a0a0b0;text-decoration:none;padding:5px 8px;border-radius:4px;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
      + "nav a:hover{background:#16213e;color:#eaeaea}"
      + "main{flex:1;padding:40px;max-width:900px}"
      + "h1.page-title{font-size:22px;color:#e94560;margin-bottom:4px}"
      + ".export-date{font-size:11px;color:#777;margin-bottom:40px}"
      + "section{margin-bottom:60px}"
      + "h2.conv-title{font-size:17px;color:#e94560;margin-bottom:6px;padding-bottom:8px;border-bottom:1px solid #0f3460}"
      + ".source{font-size:11px;color:#777;margin-bottom:18px}"
      + ".msg{margin:16px 0;padding:14px 16px;border-radius:8px;max-width:780px;border:1px solid rgba(255,255,255,.08)}"
      + ".user{background:#16213e;margin-left:auto;border-color:#29477b}.grok{background:#0f3460;margin-right:auto;border-color:#1b5c8a}.missing{background:#3a2430}"
      + ".role{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#e94560;margin-bottom:6px}"
      + ".content{white-space:pre-wrap;line-height:1.65;font-size:14px}";
    var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Grok History Export</title><style>' + css + "</style></head><body>";
    html += "<nav><h2>Conversations</h2>";
    conversations.forEach(function (conv, i) {
      html += '<a href="#conv-' + i + '" title="' + grokEsc(conv.title) + '">' + grokEsc(conv.title) + "</a>";
    });
    html += "</nav><main>";
    html += '<h1 class="page-title">Grok History Export</h1><div class="export-date">' + grokEsc(date) + " &middot; " + conversations.length + " conversations</div>";
    conversations.forEach(function (conv, i) {
      html += '<section id="conv-' + i + '"><h2 class="conv-title">' + grokEsc(conv.title) + "</h2>";
      html += '<div class="source">' + grokEsc(conv.url || "") + "</div>";
      if (!conv.messages || !conv.messages.length) {
        html += '<div class="msg missing"><div class="role">Missing</div><div class="content">' + grokEsc(conv.error || "No messages found") + "</div></div>";
      } else {
        conv.messages.forEach(function (msg) {
          html += '<div class="msg ' + (msg.role === "user" ? "user" : "grok") + '">'
            + '<div class="role">' + grokEsc(msg.role === "user" ? "You" : "Grok") + "</div>"
            + '<div class="content">' + grokEsc(msg.content) + "</div></div>";
        });
      }
      html += "</section>";
    });
    return html + "</main></body></html>";
  }

  function grokBuildCombinedMarkdown(conversations) {
    var lines = ["# Grok History Export", "", "> Exported " + new Date().toLocaleString(), ""];
    conversations.forEach(function (conv) {
      lines.push("## " + conv.title);
      if (conv.url) {
        lines.push("");
        lines.push("<" + conv.url + ">");
      }
      lines.push("");
      if (!conv.messages || !conv.messages.length) {
        lines.push("_No messages found._");
        lines.push("");
        return;
      }
      conv.messages.forEach(function (msg) {
        lines.push("**" + (msg.role === "user" ? "You" : "Grok") + "**");
        lines.push("");
        lines.push((msg.content || "").trim());
        lines.push("");
        lines.push("---");
        lines.push("");
      });
    });
    return lines.join("\n");
  }

  function grokSanitizeFilename(s) {
    return String(s || "grok_chat")
      .replace(/[^a-z0-9_\-\s]/gi, "")
      .replace(/\s+/g, "_")
      .toLowerCase()
      .slice(0, 70) || "grok_chat";
  }

  function grokBuildConversationMarkdown(conv) {
    var lines = ["> Exported from Grok - " + new Date().toLocaleString(), ""];
    lines.push("# " + (conv.title || "Grok Chat"));
    if (conv.url) {
      lines.push("");
      lines.push("<" + conv.url + ">");
    }
    lines.push("");
    if (!conv.messages || !conv.messages.length) {
      lines.push("_No messages found._");
      lines.push("");
      return lines.join("\n");
    }
    conv.messages.forEach(function (msg) {
      lines.push("**" + (msg.role === "user" ? "You" : "Grok") + "**");
      lines.push("");
      lines.push((msg.content || "").trim());
      lines.push("");
      lines.push("---");
      lines.push("");
    });
    return lines.join("\n");
  }

  function grokDownloadBlobFallback(content, filename, type) {
    var blob = new Blob([content], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
  }

  function grokDownloadText(content, filename, type) {
    return new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage({
          action: "download-text",
          content: content,
          filename: filename,
          mime: type
        }, function (resp) {
          if (chrome.runtime.lastError || !resp || resp.ok === false) {
            grokDownloadBlobFallback(content, filename.split("/").pop(), type);
            resolve(false);
            return;
          }
          resolve(true);
        });
      } catch (e) {
        grokDownloadBlobFallback(content, filename.split("/").pop(), type);
        resolve(false);
      }
    });
  }

  async function grokFinishExport() {
    var conversations = await grokDbGetAll();
    var date = new Date().toISOString().slice(0, 10);
    var folder = "grok_history_export_" + date;
    grokSetOverlay("Saving export files...", "HTML plus " + conversations.length + " Markdown files");
    await grokDownloadText(
      grokBuildCombinedHtml(conversations),
      folder + "/grok_history_export_" + date + ".html",
      "text/html"
    );
    for (var i = 0; i < conversations.length; i++) {
      var conv = conversations[i];
      var index = String(i + 1).padStart(3, "0");
      var name = index + "_" + grokSanitizeFilename(conv.title || conv.id) + ".md";
      grokSetOverlay("Saving Markdown files...", (i + 1) + " of " + conversations.length);
      await grokDownloadText(
        grokBuildConversationMarkdown(conv),
        folder + "/md/" + name,
        "text/markdown"
      );
      await grokSleep(120);
    }
    await grokStorageRemove("grokExportJob");
    await grokDbClear();
    grokSetOverlay("Export complete.", folder + " saved");
  }

  async function grokResumeHistoryExport() {
    if (!/\/i\/grok/.test(location.pathname)) return;
    if (window.__kagiGrokExportResumeRunning) return;
    window.__kagiGrokExportResumeRunning = true;
    try {
      var stored = await grokStorageGet({ grokExportJob: null });
      var job = stored.grokExportJob;
      if (!job || !job.running || !job.links || !job.links.length) return;

      if (job.index >= job.links.length) {
        await grokFinishExport();
        return;
      }

      var item = job.links[job.index];
      item.order = job.index;
      item.total = job.links.length;
      if (grokCurrentConversationId() !== item.id) {
        grokSetOverlay("Opening conversation " + (job.index + 1) + " of " + job.links.length + "...", item.title);
        grokNavigateTo(item.href);
        return;
      }

      grokSetOverlay("Exporting conversation " + (job.index + 1) + " of " + job.links.length + "...", item.title);
      var conv = await grokWaitForConversation(item);
      await grokDbPutConversation(conv);
      job.index += 1;
      job.lastUpdated = Date.now();
      await grokStorageSet({ grokExportJob: job });

      if (job.index >= job.links.length) {
        await grokFinishExport();
      } else {
        var next = job.links[job.index];
        grokSetOverlay("Opening conversation " + (job.index + 1) + " of " + job.links.length + "...", next.title);
        await grokSleep(350);
        grokNavigateTo(next.href);
      }
    } catch (err) {
      grokSetOverlay("Export stopped.", err && err.message ? err.message : String(err));
      await grokStorageRemove("grokExportJob");
    } finally {
      window.__kagiGrokExportResumeRunning = false;
    }
  }

  async function grokStartHistoryExport() {
    if (!/\/i\/grok/.test(location.pathname)) {
      throw new Error("Open x.com/i/grok before starting history export.");
    }
    if (window.__kagiGrokExportStartRunning) return { started: true };
    window.__kagiGrokExportStartRunning = true;
    try {
      await grokStorageRemove("grokExportJob");
      await grokDbClear();
      var links = await grokHarvestHistoryLinks();
      var currentId = grokCurrentConversationId();
      var currentIdx = links.findIndex(function (item) { return item.id === currentId; });
      if (currentIdx > 0) {
        var current = links.splice(currentIdx, 1)[0];
        links.unshift(current);
      }
      await grokStorageSet({
        grokExportJob: {
          running: true,
          links: links,
          index: 0,
          startedAt: Date.now(),
          lastUpdated: Date.now()
        }
      });
      grokSetOverlay("History captured.", links.length + " conversations queued");
      setTimeout(grokResumeHistoryExport, 250);
      return { started: true, count: links.length };
    } finally {
      window.__kagiGrokExportStartRunning = false;
    }
  }

  chrome.storage.sync.get({ twitterSettings: {} }, function (stored) {
    var settings = mergeDefaults(stored.twitterSettings || {});
    applySettings(settings);
    if (document.body) {
      startObserver();
    } else {
      document.addEventListener("DOMContentLoaded", startObserver);
    }
  });

  if (/\/i\/grok/.test(location.pathname)) {
    setTimeout(grokResumeHistoryExport, 1200);
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg || !msg.action) return false;
    if (msg.action === "twitter-update" && msg.settings) {
      applySettings(msg.settings);
    } else if (msg.action === "grok-export-history-start") {
      grokStartHistoryExport().then(function (result) {
        sendResponse(result || { started: true });
      }).catch(function (err) {
        sendResponse({ started: false, error: err && err.message ? err.message : String(err) });
      });
      return true;
    } else if (msg.action === "grok-delete-all-chats-start") {
      try {
        sendResponse(grokStartDeleteAllChats());
      } catch (err) {
        sendResponse({ started: false, error: err && err.message ? err.message : String(err) });
      }
      return true;
    }
  });
})();
