/* AI Post Studio background worker.
 * Owns: install init, message routing, posting orchestration, queue alarms.
 */

const X_HOME = "https://x.com/home";
const QUEUE_ALARM = "xtools-ai-post-studio-queue-check";

chrome.runtime.onInstalled.addListener(async () => {
  await initDefaults();
  await migratePostLogs();
  await ensureQueueAlarm();
});
chrome.runtime.onStartup && chrome.runtime.onStartup.addListener(ensureQueueAlarm);

/* ---------------- defaults ---------------- */

async function initDefaults() {
  const data = await chrome.storage.local.get(["accounts", "settings", "posts", "apiKey", "activeAccountId"]);
  if (!data.accounts || data.accounts.length === 0) {
    const acc = makeAccount("My account");
    await chrome.storage.local.set({ accounts: [acc], activeAccountId: acc.id });
  }
  if (!data.settings) {
    await chrome.storage.local.set({ settings: defaultSettings() });
  }
  if (!Array.isArray(data.posts)) {
    await chrome.storage.local.set({ posts: [] });
  }
}

function defaultSettings() {
  return {
    provider: "deepseek",
    model: "deepseek-v4-flash",
    baseUrl: "",
    generateCount: 5,
    tone: "natural",
    rateLimitPerHour: 2,
    jitterSeconds: 600,
    activeStart: 8,
    activeEnd: 23,
    autoLearn: false,
    acceptedTosWarning: false,
    theme: "dark",
    onboarded: false,
  };
}

/* One-time move of per-account postLog arrays into the dedicated postLogs key.
 * The log must live outside `accounts`: the dashboard persists accounts
 * wholesale from memory, which silently clobbered background-written entries. */
async function migratePostLogs() {
  const { accounts = [], postLogs = {} } = await chrome.storage.local.get(["accounts", "postLogs"]);
  let changed = false;
  for (const a of accounts) {
    if (Array.isArray(a.postLog) && a.postLog.length) {
      postLogs[a.id] = (postLogs[a.id] || []).concat(a.postLog).slice(-300);
    }
    if (a.postLog !== undefined) { delete a.postLog; changed = true; }
  }
  if (changed) await chrome.storage.local.set({ accounts, postLogs });
}

function makeAccount(name) {
  return { id: uid(), name: name || "Account", context: "", createdAt: Date.now() };
}

function uid() {
  return "p" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/* ---------------- alarms ---------------- */

async function ensureQueueAlarm() {
  const existing = await chrome.alarms.get(QUEUE_ALARM);
  if (!existing) {
    chrome.alarms.create(QUEUE_ALARM, { periodInMinutes: 1 });
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === QUEUE_ALARM) fireDuePosts();
});

/* ---------------- message router ---------------- */

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || !msg.type) return false;
  (async () => {
    try {
      switch (msg && msg.type) {
        case "POST_NOW":
          sendResponse(await postNow(msg.text, msg.postId));
          break;
        case "RUN_IN_X":
          sendResponse(await runInXTab(msg.payload || {}));
          break;
        case "SCRAPE_MUSE":
          sendResponse(await scrapeMuse(msg));
          break;
        case "FETCH_AVATAR":
          sendResponse(await fetchAvatar(msg.handle));
          break;
        case "OPEN_DASHBOARD":
          chrome.tabs.create({ url: chrome.runtime.getURL("ai-post-studio/index.html") });
          sendResponse({ ok: true });
          break;
        default:
          return;
      }
    } catch (e) {
      sendResponse({ ok: false, error: String((e && e.message) || e) });
    }
  })();
  return true; // keep channel open for async
});

/* ---------------- posting orchestration ---------------- */

async function postNow(text, postId) {
  const expected = postId ? await handleForPost(postId) : "";
  const res = await runInXTab({ type: "POST_TWEET", text, expected });
  if (res.ok && postId) {
    await patchPost(postId, { status: "posted", postedAt: Date.now(), note: "" });
    await appendPostLog(postId, text);
  }
  return res;
}

/* Durable per-account log of everything actually posted. Lives in its own
 * storage key (postLogs) that only the background writes — the dashboard
 * persists `accounts` wholesale, so anything stored there gets clobbered. */
async function appendPostLog(postId, text) {
  const { posts = [], postLogs = {} } = await chrome.storage.local.get(["posts", "postLogs"]);
  const post = posts.find((p) => p.id === postId);
  if (!post || !post.accountId) return;
  const log = postLogs[post.accountId] || [];
  log.push({ text: String(text || ""), at: Date.now() });
  postLogs[post.accountId] = log.slice(-300);
  await chrome.storage.local.set({ postLogs });
}

/* The linked @handle of the account a post belongs to ("" = no guard). */
async function handleForPost(postId) {
  const { posts = [], accounts = [] } = await chrome.storage.local.get(["posts", "accounts"]);
  const post = posts.find((p) => p.id === postId);
  const acc = post && accounts.find((a) => a.id === post.accountId);
  return (acc && acc.handle) || "";
}

async function runInXTab(payload) {
  const tab = await ensureXTab();
  if (!tab.ok) return tab;
  await waitForTabLoad(tab.id);
  await sleep(tab.created ? 1500 : 500); // let the content script settle
  return await chrome.tabs
    .sendMessage(tab.id, payload)
    .catch((e) => ({ ok: false, error: "content_script_unreachable: " + String((e && e.message) || e) }));
}

async function ensureXTab() {
  const tabs = await chrome.tabs.query({ url: ["https://x.com/*", "https://twitter.com/*"] });
  if (tabs.length) {
    // Prefer the active x.com tab (so scraping reads what the user is viewing),
    // then a home tab (best for the inline composer), then any.
    const preferred =
      tabs.find((t) => t.active) || tabs.find((t) => /\/home/.test(t.url || "")) || tabs[0];
    return { ok: true, id: preferred.id, created: false };
  }
  const tab = await chrome.tabs.create({ url: X_HOME, active: false });
  return { ok: true, id: tab.id, created: true };
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") finish();
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((t) => {
      if (t && t.status === "complete") finish();
    }, () => finish());
    setTimeout(finish, 15000);
  });
}

/* ---------------- muse scraping ---------------- */

/* Collect a reference account's recent tweets + replies in a dedicated
 * background tab (never the user's active tab), then close it. Results are
 * written to storage (pendingScrapes) before responding, so a 1–2 minute
 * scrape survives the dashboard being closed mid-collect — the dashboard
 * applies pending entries on its next load. */
async function scrapeMuse(msg) {
  const h = String(msg.handle || "").replace(/^@/, "").trim();
  if (!h) return { ok: false, error: "no_handle" };
  const tab = await chrome.tabs.create({ url: "https://x.com/" + h, active: false });
  let tweets = [];
  let replies = [];
  let scrapeError = "";
  try {
    const tweetResult = await scrapeInTab(tab.id, h, "/" + h, msg.tweets || 30);
    tweets = tweetResult.items;
    scrapeError = tweetResult.error;
    await chrome.tabs.update(tab.id, { url: "https://x.com/" + h + "/with_replies" });
    const replyResult = await scrapeInTab(tab.id, h, "/with_replies", msg.replies || 20);
    replies = replyResult.items;
    scrapeError = scrapeError || replyResult.error;
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
  if (msg.accountId && msg.kind) {
    const { pendingScrapes = [] } = await chrome.storage.local.get("pendingScrapes");
    pendingScrapes.push({ accountId: msg.accountId, kind: msg.kind, handle: h, tweets, replies, at: Date.now() });
    await chrome.storage.local.set({ pendingScrapes });
  }
  return { ok: true, count: tweets.length + replies.length, error: scrapeError };
}

async function scrapeInTab(tabId, handle, pathSubstr, limit) {
  await waitForTabNav(tabId, pathSubstr);
  await sleep(2000); // SPA hydration after document complete
  const res = await chrome.tabs
    .sendMessage(tabId, { type: "SCRAPE_PROFILE", handle, limit })
    .catch((e) => ({ ok: false, error: String((e && e.message) || e) }));
  return res && res.ok
    ? { items: res.items || [], error: "" }
    : { items: [], error: (res && res.error) || "content_script_unreachable" };
}

/* Grab an account's profile picture URL from its profile page. */
async function fetchAvatar(handle) {
  const h = String(handle || "").replace(/^@/, "").trim();
  if (!h) return { ok: false, error: "no_handle" };
  const tab = await chrome.tabs.create({ url: "https://x.com/" + h, active: false });
  try {
    await waitForTabNav(tab.id, "/" + h);
    await sleep(1500);
    const res = await chrome.tabs
      .sendMessage(tab.id, { type: "PROFILE_META", handle: h })
      .catch(() => null);
    return res && res.ok ? { ok: true, avatar: res.avatar || "" } : { ok: false, error: "profile_unreachable" };
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

/* waitForTabLoad alone can fire on the *previous* page's "complete" right after
 * tabs.update — poll until the URL actually matches the target path. */
function waitForTabNav(tabId, pathSubstr) {
  return new Promise((resolve) => {
    const start = Date.now();
    (async function tick() {
      let t = null;
      try { t = await chrome.tabs.get(tabId); } catch (e) { return resolve(); }
      if (t && t.status === "complete" && (t.url || "").toLowerCase().includes(pathSubstr.toLowerCase())) return resolve();
      if (Date.now() - start > 20000) return resolve();
      setTimeout(tick, 250);
    })();
  });
}

/* ---------------- queue ---------------- */

function withinActiveHours(settings) {
  const start = Number.isFinite(+settings.activeStart) ? +settings.activeStart : 8;
  const end = Number.isFinite(+settings.activeEnd) ? +settings.activeEnd : 23;
  if (start === end) return true; // window disabled
  const h = new Date().getHours();
  return start < end ? h >= start && h < end : h >= start || h < end;
}

async function fireDuePosts() {
  const { posts = [], settings = defaultSettings() } = await chrome.storage.local.get(["posts", "settings"]);
  if (!withinActiveHours(settings)) return;
  const now = Date.now();
  const due = posts
    .filter((p) => p.status === "queued" && p.scheduledFor && p.scheduledFor <= now)
    .sort((a, b) => a.scheduledFor - b.scheduledFor);
  if (!due.length) return;

  const posted = posts.filter((p) => p.status === "posted");
  const rate = settings.rateLimitPerHour || 2;
  const recent = posted.filter((p) => p.postedAt && p.postedAt > now - 3600000).length;
  if (recent >= rate) return;

  // Drip, never burst: at most one post per alarm tick, and never closer than
  // ~70% of the even hourly spacing to the previous post. Overdue posts stay
  // queued and fire on later ticks as the gap allows.
  const gapMs = Math.floor(3600000 / rate) * 0.7;
  const lastPostedAt = posted.reduce((m, p) => Math.max(m, p.postedAt || 0), 0);
  if (lastPostedAt && now - lastPostedAt < gapMs) return;

  const postedTexts = new Set(posted.map((p) => (p.text || "").trim().toLowerCase()));

  for (const p of due) {
    const key = (p.text || "").trim().toLowerCase();
    if (postedTexts.has(key)) {
      await patchPost(p.id, { status: "discarded", note: "duplicate" });
      continue;
    }
    const res = await postNow(p.text, p.id);
    if (!res.ok) {
      await patchPost(p.id, { status: "failed", note: "post_failed: " + (res.error || "unknown") });
      continue;
    }
    break;
  }
}

async function patchPost(postId, patch) {
  const { posts = [] } = await chrome.storage.local.get("posts");
  const idx = posts.findIndex((p) => p.id === postId);
  if (idx === -1) return;
  posts[idx] = { ...posts[idx], ...patch };
  await chrome.storage.local.set({ posts });
}

/* ---------------- utils ---------------- */

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
