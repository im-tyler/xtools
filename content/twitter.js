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
    hideTrending: true,
    hideWhoToFollow: true,
    hideFloatingChat: true,
    hideGrokFab: true,
    hideViews: true,
    hideMetrics: false,
    hideBookmarkBtn: false,
    hideShareBtn: false,
    hideGrokNav: false,
    hideXLogo: true,
    hideJobsNav: true,
    hideCommunitiesNav: false,
    hidePremiumUpsells: true,
    hideArticlesNav: true,
    hideBlueChecks: false,
    hideBookmarksNav: true,
  };

  var rules = {
    followingDefault: function () { return ""; },
    hideForYou: function () { return '[role="tablist"] [role="tab"]:first-child { display: none !important; }'; },
    hideSuggested: function () { return '[data-testid="whoToFollowSspAd"] { display: none !important; }'; },
    hideDiscoverMore: function () { return ""; },
    hideInlinePrompts: function () { return ""; },
    hideSidebar: function () { return '[data-testid="sidebarColumn"] { display: none !important; }'; },
    centerContent: function () { return '[data-testid="sidebarColumn"] { display: none !important; } [data-testid="primaryColumn"] { transform: translateX(var(--aie-tx, 0px)) !important; }'; },
    hideTrending: function () { return '[data-testid="sidebarColumn"] [data-testid="trend"] { display: none !important; }'; },
    hideWhoToFollow: function () { return '[aria-label="Who to follow"], [data-testid="WhoToFollow"], [data-testid="sidebarColumn"] [data-testid="UserCell"] { display: none !important; }'; },
    hideViews: function () { return '[data-testid="views"] { display: none !important; }'; },
    hideMetrics: function () { return '[data-testid="reply"] span, [data-testid="retweet"] span, [data-testid="like"] span, [data-testid="bookmark"] span { visibility: hidden !important; }'; },
    hideBookmarkBtn: function () { return '[data-testid="bookmark"] { display: none !important; }'; },
    hideShareBtn: function () { return '[data-testid="shareBtn"] { display: none !important; }'; },
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

  function applyCSS(settings) {
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
    var isUserListPage = /^\/(search$|[^/]+\/(followers|following)|i\/lists)/.test(path);

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

  var _alignTimer = null;

  function alignNavWithContent() {
    if (!currentSettings.centerContent || currentSettings.enabled === false) return;

    var primary = document.querySelector('[data-testid="primaryColumn"]');

    // Always zero first so stale offsets don't persist on layout changes
    document.documentElement.style.setProperty('--aie-tx', '0px');

    if (!primary) return;

    var colRect = primary.getBoundingClientRect();
    var viewW   = window.innerWidth;
    var colW    = colRect.width;

    // Only center the standard single-column feed (~600px).
    // Grok and DMs use multi-panel layouts with a wider or different-sized
    // primaryColumn — centering there shifts only some elements and causes overflow.
    if (colW < 400 || colW > 750) return;

    var delta = Math.round((viewW - colW) / 2 - colRect.left);
    document.documentElement.style.setProperty('--aie-tx', delta + 'px');
  }

  function resetNavAlignment() {
    document.documentElement.style.removeProperty('--aie-tx');
  }

  function scheduleAlignNav() {
    clearTimeout(_alignTimer);
    _alignTimer = setTimeout(function () {
      requestAnimationFrame(alignNavWithContent);
    }, 100);
  }

  window.addEventListener('resize', function () {
    if (currentSettings.enabled !== false && currentSettings.centerContent) scheduleAlignNav();
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
      if (settings.centerContent) scheduleAlignNav();
      else resetNavAlignment();
    } else {
      resetNavAlignment();
    }
  }

  var observer = null;
  function startObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(function () {
      if (currentSettings.enabled === false) return;
      if (currentSettings.followingDefault) maybeForceFollowingTab();
      if (currentSettings.hideDiscoverMore) hideDiscoverMoreContainers();
      if (currentSettings.hideWhoToFollow) hideWhoToFollowInFeed();
      if (currentSettings.centerContent) scheduleAlignNav();
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

  chrome.storage.sync.get({ twitterSettings: {} }, function (stored) {
    var settings = mergeDefaults(stored.twitterSettings || {});
    applySettings(settings);
    if (document.body) {
      startObserver();
    } else {
      document.addEventListener("DOMContentLoaded", startObserver);
    }
  });

  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg.action === "twitter-update" && msg.settings) {
      applySettings(msg.settings);
    }
  });
})();
