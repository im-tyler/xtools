/* AI Post Studio content script for x.com / twitter.com.
 * Executes tweet posting and scrapes visible tweet text.
 * Guarded so re-injection is a no-op.
 */
(function () {
  if (window.__xtoolsAiPostStudioInjected) return;
  window.__xtoolsAiPostStudioInjected = true;

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || !msg.type) return false;
    (async () => {
      try {
        if (msg && msg.type === "POST_TWEET") {
          sendResponse(await postTweet(msg.text, msg.expected));
        } else if (msg && msg.type === "SCRAPE_VISIBLE") {
          sendResponse({ ok: true, text: scrapeVisibleTweets() });
        } else if (msg && msg.type === "SCRAPE_REPLY_CANDIDATES") {
          sendResponse({ ok: true, items: scrapeReplyCandidates(msg.limit) });
        } else if (msg && msg.type === "POST_REPLY") {
          sendResponse(await postReply(msg.text, msg.url, msg.expected));
        } else if (msg && msg.type === "SCRAPE_PROFILE") {
          sendResponse(await scrapeProfile(msg.handle, msg.limit || 30));
        } else if (msg && msg.type === "PROFILE_META") {
          sendResponse(await profileMeta(msg.handle));
        } else {
          return;
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

  function insertText(textarea, text) {
    textarea.focus();
    let inserted = false;
    try { inserted = document.execCommand("insertText", false, text); } catch (e) {}
    if (!inserted || !textarea.textContent.trim()) {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(textarea);
      range.collapse(false);
      if (sel) { sel.removeAllRanges(); sel.addRange(range); }
      try { inserted = document.execCommand("insertText", false, text); } catch (e) {}
      if (!inserted || !textarea.textContent.trim()) {
        textarea.textContent = text;
        textarea.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
      }
    }
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

    await sleep(60);
    insertText(textarea, text);

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

  function scrapeReplyCandidates(limit) {
    const own = loggedInHandle();
    const seen = new Set();
    const items = [];
    const max = Math.min(12, Math.max(1, Number(limit) || 8));
    document.querySelectorAll('article[data-testid="tweet"]').forEach((article) => {
      if (items.length >= max || article.querySelector('[data-testid="socialContext"]')) return;
      const header = (article.innerText || "").split("\n").slice(0, 6).join(" ");
      if (/\bReplying to\s+@/i.test(header)) return;
      const textEl = article.querySelector('[data-testid="tweetText"]');
      const text = textEl ? (textEl.textContent || "").trim().slice(0, 1200) : "";
      const author = authorOf(article);
      const link = Array.from(article.querySelectorAll('a[href*="/status/"]')).find((a) => /\/status\/\d+/.test(a.getAttribute("href") || ""));
      if (!text || !author || author === own || !link) return;
      const url = new URL(link.getAttribute("href"), location.origin).href;
      if (seen.has(url)) return;
      seen.add(url);
      const images = Array.from(article.querySelectorAll('img[src*="pbs.twimg.com/media"]')).map((img) => ({
        url: img.getAttribute("src") || "",
        alt: img.getAttribute("alt") || "",
      })).filter((image, index, all) => image.url && all.findIndex((other) => other.url === image.url) === index).slice(0, 4);
      const videos = Array.from(article.querySelectorAll('video')).map((video) => ({
        poster: video.getAttribute("poster") || "",
        description: video.getAttribute("aria-label") || "",
      })).filter((video, index, all) => (video.poster || video.description) && all.findIndex((other) => other.poster === video.poster && other.description === video.description) === index).slice(0, 2);
      const avatar = article.querySelector('[data-testid^="UserAvatar-Container-"] img');
      items.push({ id: url, url, author, text, images, videos, avatar: avatar && avatar.getAttribute("src") || "" });
    });
    return items;
  }

  async function postReply(text, url, expected) {
    if (!text || !text.trim()) return { ok: false, error: "empty_text" };
    if (expected) {
      const want = String(expected).replace(/^@/, "").toLowerCase();
      const cur = loggedInHandle();
      if (!cur) return { ok: false, error: "account_unverified" };
      if (cur !== want) return { ok: false, error: "wrong_account: logged in as @" + cur };
    }
    let path;
    try { path = new URL(url, location.origin).pathname; } catch (e) { return { ok: false, error: "invalid_target" }; }
    const article = Array.from(document.querySelectorAll('article[data-testid="tweet"]')).find((tweet) =>
      Array.from(tweet.querySelectorAll('a[href*="/status/"]')).some((a) => new URL(a.getAttribute("href"), location.origin).pathname === path)
    );
    if (!article) return { ok: false, error: "target_not_visible: scroll the post back into view" };
    const reply = article.querySelector('[data-testid="reply"]');
    if (!reply) return { ok: false, error: "reply_button_not_found" };
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
    reply.click();
    const textarea = await waitFor(() => {
      const fresh = Array.from(document.querySelectorAll('[role="dialog"]')).filter((dialog) => !dialogs.includes(dialog));
      for (const dialog of fresh.reverse()) {
        const field = dialog.querySelector('[data-testid="tweetTextarea_0"]');
        if (field && isVisible(field)) return field;
      }
      return null;
    }, { timeout: 8000, interval: 100 });
    if (!textarea) return { ok: false, error: "reply_composer_not_found" };
    await sleep(80);
    insertText(textarea, text.trim());
    const submit = await waitFor(() => {
      const dialog = textarea.closest('[role="dialog"]') || document;
      return Array.from(dialog.querySelectorAll('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]')).find((button) =>
        isVisible(button) && button.getAttribute("disabled") === null && button.getAttribute("aria-disabled") !== "true"
      );
    }, { timeout: 7000, interval: 100 });
    if (!submit) return { ok: false, error: "reply_submit_not_ready" };
    submit.click();
    return { ok: true };
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
    const userName = article.querySelector('[data-testid="User-Name"]');
    if (!userName) return "";
    const links = userName.querySelectorAll('a[href^="/"]');
    for (const link of links) {
      const m = (link.getAttribute("href") || "").match(/^\/([A-Za-z0-9_]{1,20})(?:\/|$)/);
      if (m) return m[1].toLowerCase();
    }
    // X occasionally omits the profile anchor while a timeline is hydrating.
    const text = userName.textContent || "";
    const match = text.match(/@([A-Za-z0-9_]{1,20})/);
    return match ? match[1].toLowerCase() : "";
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
