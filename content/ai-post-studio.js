/* AI Post Studio content script for x.com / twitter.com.
 * Executes tweet posting and scrapes visible tweet text.
 * Guarded so re-injection is a no-op.
 */
(function () {
  if (window.__xtoolsAiPostStudioInjected) return;
  window.__xtoolsAiPostStudioInjected = true;

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
      try {
        if (msg && msg.type === "POST_TWEET") {
          sendResponse(await postTweet(msg.text, msg.expected));
        } else if (msg && msg.type === "SCRAPE_VISIBLE") {
          sendResponse({ ok: true, text: scrapeVisibleTweets() });
        } else if (msg && msg.type === "SCRAPE_PROFILE") {
          sendResponse(await scrapeProfile(msg.handle, msg.limit || 30));
        } else if (msg && msg.type === "PROFILE_META") {
          sendResponse(await profileMeta(msg.handle));
        } else {
          sendResponse({ ok: false, error: "unknown" });
        }
      } catch (e) {
        sendResponse({ ok: false, error: String((e && e.message) || e) });
      }
    })();
    return true;
  });

  /* ---------- helpers ---------- */

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const q = (sel) => document.querySelector(sel);

  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 4 && r.height > 4;
  }

  function waitFor(fn, { timeout = 12000, interval = 150 } = {}) {
    return new Promise((resolve) => {
      const start = Date.now();
      (function tick() {
        const el = fn();
        if (el) return resolve(el);
        if (Date.now() - start >= timeout) return resolve(null);
        setTimeout(tick, interval);
      })();
    });
  }

  /* ---------- session identity ---------- */

  /* Handle of the currently logged-in x.com user. The account-switcher avatar
   * carries it in its data-testid; the profile nav link is the fallback. */
  function loggedInHandle() {
    const av = q('[data-testid="SideNav_AccountSwitcher_Button"] [data-testid^="UserAvatar-Container-"]');
    if (av) {
      const m = (av.getAttribute("data-testid") || "").match(/^UserAvatar-Container-(.+)$/);
      if (m) return m[1].toLowerCase();
    }
    const link = q('[data-testid="AppTabBar_Profile_Link"]');
    if (link) {
      const m = (link.getAttribute("href") || "").match(/^\/([A-Za-z0-9_]{1,15})/);
      if (m) return m[1].toLowerCase();
    }
    return "";
  }

  /* ---------- posting ---------- */

  async function postTweet(text, expected) {
    if (!text || !text.trim()) return { ok: false, error: "empty_text" };

    // If the persona is linked to an @handle, refuse to post as anyone else.
    if (expected) {
      const want = String(expected).replace(/^@/, "").toLowerCase();
      const cur = loggedInHandle();
      if (!cur) return { ok: false, error: "account_unverified: could not read the logged-in @handle — clear the profile's linked handle to skip this check" };
      if (cur !== want) return { ok: false, error: "wrong_account: logged in as @" + cur + ", this profile posts as @" + want };
    }

    // Prefer the inline composer (present on /home). Fall back to the modal.
    let textarea = q('[data-testid="tweetTextarea_0"]');
    let button = q('[data-testid="tweetButtonInline"]') || q('[data-testid="tweetButton"]');

    if (!textarea || !isVisible(textarea)) {
      const opener = await waitFor(() => q('[data-testid="SideNav_NewTweet_Button"]'));
      if (!opener) return { ok: false, error: "composer_not_found" };
      opener.click();
      textarea = await waitFor(() => q('[data-testid="tweetTextarea_0"]'));
      if (!textarea) return { ok: false, error: "textarea_not_found" };
      button = await waitFor(() => q('[data-testid="tweetButton"]'), { timeout: 6000 });
    }

    textarea.focus();
    await sleep(60);

    // execCommand dispatches a trusted input event the editor accepts.
    let inserted = false;
    try { inserted = document.execCommand("insertText", false, text); } catch (e) {}

    if (!inserted || textarea.textContent.trim() === "") {
      textarea.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(textarea);
      range.collapse(false);
      if (sel) { sel.removeAllRanges(); sel.addRange(range); }
      try { inserted = document.execCommand("insertText", false, text); } catch (e) {}
      if (!inserted || textarea.textContent.trim() === "") {
        textarea.textContent = text;
        textarea.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
      }
    }

    // Wait for the post button to enable.
    const ready = await waitFor(() => {
      const b = q('[data-testid="tweetButtonInline"]') || q('[data-testid="tweetButton"]');
      if (!b || !isVisible(b)) return null;
      if (b.getAttribute("disabled") !== null) return null;
      if (b.getAttribute("aria-disabled") === "true") return null;
      return b;
    }, { timeout: 7000 });

    if (!ready) return { ok: false, error: "post_button_disabled" };

    ready.click();

    const confirmed = await waitForSuccess();
    return confirmed ? { ok: true } : { ok: false, error: "post_unconfirmed" };
  }

  function waitForSuccess() {
    return new Promise((resolve) => {
      const start = Date.now();
      (function tick() {
        const t = q('[data-testid="tweetTextarea_0"]');
        // Composer cleared or modal textarea gone => posted.
        if (!t || t.textContent.trim() === "") return resolve(true);
        if (Date.now() - start >= 8000) return resolve(false);
        setTimeout(tick, 200);
      })();
    });
  }

  /* ---------- scraping ---------- */

  function scrapeVisibleTweets() {
    const nodes = document.querySelectorAll('[data-testid="tweetText"]');
    const seen = new Set();
    const out = [];
    nodes.forEach((n) => {
      const t = (n.textContent || "").trim();
      if (t && !seen.has(t)) { seen.add(t); out.push(t); }
    });
    return out.join("\n\n");
  }

  /* Scroll a profile timeline (or /with_replies) and collect tweets authored by
   * `handle` only. On /with_replies each reply renders under the other person's
   * tweet, and profiles mix in retweets/pinned posts — author matching plus the
   * socialContext skip keeps foreign text out of the voice context. */
  async function scrapeProfile(handle, limit) {
    const want = String(handle || "").replace(/^@/, "").toLowerCase();
    if (!want) return { ok: false, error: "no_handle" };

    // The timeline hydrates well after document load.
    const first = await waitFor(() => q('article[data-testid="tweet"]'), { timeout: 15000 });
    if (!first) return { ok: true, items: [] };

    const seen = new Set();
    const items = [];
    let idleRounds = 0;
    // Scale scroll depth to the requested limit, but keep the pace human:
    // variable scroll distance, jittered delays, an occasional longer "reading"
    // pause, and a hard time cap. Reading your own profile at this rate is
    // indistinguishable from scrolling it by hand.
    const maxRounds = Math.min(40, Math.ceil(limit / 2) + 8);
    const deadline = Date.now() + 120000;

    for (let round = 0; round < maxRounds && items.length < limit && idleRounds < 4 && Date.now() < deadline; round++) {
      const before = items.length;
      document.querySelectorAll('article[data-testid="tweet"]').forEach((art) => {
        if (items.length >= limit) return;
        if (art.querySelector('[data-testid="socialContext"]')) return; // retweet / pinned
        if (authorOf(art) !== want) return;
        const textEl = art.querySelector('[data-testid="tweetText"]');
        const t = textEl ? (textEl.textContent || "").trim().slice(0, 800) : "";
        if (!t || seen.has(t)) return;
        seen.add(t);
        items.push(t);
      });
      if (items.length === before) {
        idleRounds++;
        await sleep(1000 + Math.random() * 800); // timeline may still be fetching
      } else {
        idleRounds = 0;
      }
      if (items.length >= limit) break;
      window.scrollBy(0, window.innerHeight * (1.2 + Math.random()));
      await sleep(800 + Math.random() * 900);
      if (round > 0 && round % 6 === 0) await sleep(1500 + Math.random() * 2000);
    }
    return { ok: true, items };
  }

  function authorOf(article) {
    const link = article.querySelector('[data-testid="User-Name"] a[href^="/"]');
    if (!link) return "";
    const m = (link.getAttribute("href") || "").match(/^\/([A-Za-z0-9_]{1,20})/);
    return m ? m[1].toLowerCase() : "";
  }

  /* On a profile page: the avatar URL for `handle` (testid suffix is the
   * canonical handle, so match case-insensitively). */
  async function profileMeta(handle) {
    const want = String(handle || "").replace(/^@/, "").toLowerCase();
    if (!want) return { ok: false, error: "no_handle" };
    const img = await waitFor(() => {
      const els = document.querySelectorAll('[data-testid^="UserAvatar-Container-"]');
      for (const el of els) {
        const suffix = (el.getAttribute("data-testid") || "").slice("UserAvatar-Container-".length);
        if (suffix.toLowerCase() !== want) continue;
        const i = el.querySelector("img");
        if (i && i.getAttribute("src")) return i;
      }
      return null;
    }, { timeout: 15000 });
    if (!img) return { ok: true, avatar: "" };
    const src = (img.getAttribute("src") || "").replace(/_(normal|x96|bigger)(\.\w+)$/, "_200x200$2");
    return { ok: true, avatar: src };
  }
})();
