import { uid } from "./util.js";

const state = {
  accounts: [],
  posts: [],
  postLogs: {}, // background-owned: { [accountId]: [{text, at}] } — never persisted from here
  settings: {},
  apiKey: "",
  activeAccountId: null,
  view: "feed",
  loaded: false,
};

const listeners = new Set();
let selfWrite = false;

export function defaultSettings() {
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

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((fn) => fn(state));
}

/* ---------- persistence ---------- */

export async function load() {
  const data = await chrome.storage.local.get(null);
  state.accounts = data.accounts || [];
  state.posts = data.posts || [];
  state.postLogs = data.postLogs || {};
  state.settings = { ...defaultSettings(), ...(data.settings || {}) };
  if (!data.settings || !data.settings.provider) {
    state.settings.provider = "deepseek";
    state.settings.model = "deepseek-v4-flash";
  }
  state.apiKey = data.apiKey || "";
  state.activeAccountId = data.activeAccountId || null;
  applyTheme(state.settings.theme);

  if (!state.accounts.length) {
    const a = makeAccount("My account");
    state.accounts = [a];
    state.activeAccountId = a.id;
    await persist();
  }
  if (!state.activeAccountId && state.accounts.length) {
    state.activeAccountId = state.accounts[0].id;
  }
  state.loaded = true;
  notify();
  applyPendingScrapes(); // results from scrapes the dashboard missed (closed mid-collect)
}

export function accountLog(accountId) {
  return state.postLogs[accountId] || [];
}

async function persist() {
  selfWrite = true;
  try {
    await chrome.storage.local.set({
      accounts: state.accounts,
      posts: state.posts,
      settings: state.settings,
      apiKey: state.apiKey,
      activeAccountId: state.activeAccountId,
    });
  } finally {
    setTimeout(() => { selfWrite = false; }, 60);
  }
}

export function initSync() {
  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area !== "local" || selfWrite) return;
    load();
  });
}

function makeAccount(name) {
  return { id: uid(), name: name || "Account", context: "", createdAt: Date.now() };
}

/* ---------- navigation ---------- */

export function setView(view) {
  state.view = view;
  notify();
}

/* ---------- accounts ---------- */

export function getActiveAccount() {
  return state.accounts.find((a) => a.id === state.activeAccountId) || state.accounts[0] || null;
}

export function setActiveAccount(id) {
  state.activeAccountId = id;
  persist();
  notify();
}

export function addAccount(name) {
  const a = makeAccount(name || "New account");
  state.accounts.push(a);
  state.activeAccountId = a.id;
  state.view = "voice";
  persist();
  notify();
  return a;
}

export function renameAccount(id, name) {
  const a = state.accounts.find((x) => x.id === id);
  if (!a) return;
  a.name = name;
  persist();
  notify();
}

/* Link the persona to the real X @handle it posts as. Posting then refuses to
 * fire unless that handle is the logged-in x.com session; the avatar is pulled
 * from the profile to replace the initial-letter placeholder. */
export async function setAccountHandle(id, input) {
  const a = state.accounts.find((x) => x.id === id);
  if (!a) return { ok: false, error: "not_found" };
  if (!String(input || "").trim()) {
    a.handle = "";
    a.avatarUrl = "";
    persist();
    notify();
    return { ok: true, handle: "" };
  }
  const handle = normalizeHandle(input);
  if (!handle) return { ok: false, error: "Enter a valid @handle" };
  a.handle = handle;
  persist();
  notify();
  const res = await chrome.runtime.sendMessage({ type: "FETCH_AVATAR", handle }).catch(() => null);
  if (res && res.ok && res.avatar) {
    a.avatarUrl = res.avatar;
    persist();
    notify();
  }
  return { ok: true, handle, avatar: !!(res && res.ok && res.avatar) };
}

export function deleteAccount(id) {
  if (state.accounts.length <= 1) return;
  state.accounts = state.accounts.filter((a) => a.id !== id);
  state.posts = state.posts.filter((p) => p.accountId !== id);
  if (state.activeAccountId === id) state.activeAccountId = state.accounts[0].id;
  persist();
  notify();
}

/* persist context without triggering a notify (keeps textarea focused while typing) */
export function persistContext(accountId, context) {
  const a = state.accounts.find((x) => x.id === accountId);
  if (!a) return;
  a.context = context;
  persist();
}

/* generic silent field set (used by voice source textareas while typing) */
export function setAccountField(accountId, field, value) {
  const a = state.accounts.find((x) => x.id === accountId);
  if (!a) return;
  a[field] = value;
  persist();
}

/* ---------- voice profile ---------- */

function findAccount(id) {
  return state.accounts.find((x) => x.id === id);
}

/* ---------- muses (X reference accounts) ---------- */

export const MAX_MUSES = 5;

export function normalizeHandle(input) {
  let h = String(input || "").trim();
  h = h.replace(/^https?:\/\/(x|twitter)\.com\//i, "").replace(/[/?].*$/, "");
  h = h.replace(/^@/, "");
  return /^[A-Za-z0-9_]{1,15}$/.test(h) ? h : "";
}

export function addMuse(accountId, input) {
  const a = findAccount(accountId);
  const handle = normalizeHandle(input);
  if (!a || !handle) return { ok: false, error: "Enter a valid @handle" };
  if (!Array.isArray(a.muses)) a.muses = [];
  if (a.muses.length >= MAX_MUSES) return { ok: false, error: "Up to " + MAX_MUSES + " reference accounts" };
  if (a.muses.some((m) => m.handle.toLowerCase() === handle.toLowerCase())) {
    return { ok: false, error: "@" + handle + " is already added" };
  }
  a.muses.push({ handle, tweets: [], replies: [], fetchedAt: null });
  persist();
  notify();
  return { ok: true, handle };
}

export function removeMuse(accountId, handle) {
  const a = findAccount(accountId);
  if (!a || !Array.isArray(a.muses)) return;
  a.muses = a.muses.filter((m) => m.handle.toLowerCase() !== String(handle).toLowerCase());
  persist();
  notify();
}

/* Scrape the account's own linked @handle (tweets + replies) into the "Your
 * posts" voice examples, deduped against what's already there. */
export async function collectOwnPosts(accountId) {
  const a = findAccount(accountId);
  if (!a) return { ok: false, error: "not_found" };
  if (!a.handle) return { ok: false, error: "no_handle" };
  const res = await chrome.runtime
    .sendMessage({ type: "SCRAPE_MUSE", handle: a.handle, tweets: 80, replies: 40, accountId, kind: "own" })
    .catch(() => null);
  if (!res || !res.ok) return res || { ok: false, error: "no_response" };
  const applied = await applyPendingScrapes();
  return { ok: true, count: applied };
}

export async function collectMuse(accountId, handle) {
  const res = await chrome.runtime
    .sendMessage({ type: "SCRAPE_MUSE", handle, accountId, kind: "muse" })
    .catch(() => null);
  if (!res || !res.ok) return res || { ok: false, error: "no_response" };
  const applied = await applyPendingScrapes();
  return { ok: true, count: applied };
}

/* The background parks scrape results in storage (pendingScrapes) so they
 * survive the dashboard closing mid-collect. Single apply path for both the
 * live response and the catch-up on load. Returns items applied. */
export async function applyPendingScrapes() {
  const { pendingScrapes = [] } = await chrome.storage.local.get("pendingScrapes");
  if (!pendingScrapes.length) return 0;
  await chrome.storage.local.set({ pendingScrapes: [] });
  let applied = 0;
  let changed = false;
  for (const s of pendingScrapes) {
    const a = findAccount(s.accountId);
    if (!a) continue;
    if (s.kind === "own") {
      const items = [].concat(s.tweets || [], s.replies || []);
      const existing = (a.context || "").trim();
      const seen = new Set(existing ? existing.split(/\n\n+/).map((x) => x.trim()) : []);
      const fresh = items.filter((t) => t.trim() && !seen.has(t.trim()));
      if (fresh.length) {
        a.context = [existing].concat(fresh).filter(Boolean).join("\n\n");
        applied += fresh.length;
        changed = true;
      }
    } else {
      const m = (a.muses || []).find((x) => x.handle.toLowerCase() === String(s.handle).toLowerCase());
      if (!m) continue;
      // A refresh that came back empty (logged out, DOM change) keeps old data.
      if (!(s.tweets || []).length && !(s.replies || []).length) continue;
      m.tweets = s.tweets || [];
      m.replies = s.replies || [];
      m.fetchedAt = s.at || Date.now();
      applied += m.tweets.length + m.replies.length;
      changed = true;
    }
  }
  if (changed) {
    persist();
    notify();
  }
  return applied;
}

export function setProfile(accountId, profile) {
  const a = findAccount(accountId);
  if (!a) return;
  a.profile = profile;
  a.profileConfirmed = false;
  persist();
  notify();
}

export function setProfileSummarySilent(accountId, value) {
  const a = findAccount(accountId);
  if (!a || !a.profile) return;
  a.profile.summary = value;
  persist();
}

export function toggleTrait(accountId, idx) {
  const a = findAccount(accountId);
  if (!a || !a.profile || !a.profile.traits[idx]) return;
  a.profile.traits[idx].included = !a.profile.traits[idx].included;
  persist();
  notify();
}

export function setTraitText(accountId, idx, text) {
  const a = findAccount(accountId);
  if (!a || !a.profile || !a.profile.traits[idx]) return;
  a.profile.traits[idx].text = text;
  persist();
  notify();
}

export function removeTrait(accountId, idx) {
  const a = findAccount(accountId);
  if (!a || !a.profile) return;
  a.profile.traits.splice(idx, 1);
  persist();
  notify();
}

export function addTrait(accountId) {
  const a = findAccount(accountId);
  if (!a) return;
  if (!a.profile) a.profile = { summary: "", traits: [] };
  a.profile.traits.push({ text: "", included: true });
  persist();
  notify();
}

export function confirmProfile(accountId) {
  const a = findAccount(accountId);
  if (!a || !a.profile) return;
  a.profileConfirmed = true;
  persist();
  notify();
}

/* ---------- preference learning ---------- */

/* Every edit a user makes to a generated draft is a preference signal:
 * (generated → final) pairs feed the learned-preferences distill. */
export function logEdit(accountId, from, to) {
  const a = findAccount(accountId);
  if (!a) return;
  const f = String(from || "").trim();
  const t = String(to || "").trim();
  if (!f || !t || f === t) return;
  if (!Array.isArray(a.editLog)) a.editLog = [];
  a.editLog.push({ from: f, to: t, at: Date.now() });
  if (a.editLog.length > 50) a.editLog = a.editLog.slice(-50);
  persist();
}

export function setLearnedTraits(accountId, traits, basis) {
  const a = findAccount(accountId);
  if (!a) return;
  a.learnedTraits = { traits: traits || [], at: Date.now(), basis: basis || 0 };
  persist();
  notify();
}

export function clearLearnedTraits(accountId) {
  const a = findAccount(accountId);
  if (!a) return;
  a.learnedTraits = null;
  persist();
  notify();
}

/* ---------- posts ---------- */

export function accountPosts(accountId) {
  return state.posts
    .filter((p) => p.accountId === accountId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function addPosts(accountId, texts) {
  const created = Date.now();
  texts.forEach((t, i) => {
    state.posts.push({
      id: uid(),
      accountId,
      text: t,
      status: "draft",
      createdAt: created + i,
    });
  });
  persist();
  notify();
}

export function updatePost(id, patch) {
  const p = state.posts.find((x) => x.id === id);
  if (!p) return;
  Object.assign(p, patch);
  persist();
  notify();
}

export function removePost(id) {
  state.posts = state.posts.filter((p) => p.id !== id);
  persist();
  notify();
}

export async function postNow(postId) {
  const post = state.posts.find((p) => p.id === postId);
  if (!post) return { ok: false, error: "not_found" };
  const res = await chrome.runtime.sendMessage({
    type: "POST_NOW",
    text: post.text,
    postId: post.id,
  });
  if (res && res.ok) {
    updatePost(postId, { status: "posted", postedAt: Date.now(), note: "" });
  }
  return res || { ok: false, error: "no_response" };
}

export async function scrapeVisibleInto(accountId) {
  const res = await chrome.runtime.sendMessage({ type: "RUN_IN_X", payload: { type: "SCRAPE_VISIBLE" } });
  if (!res || !res.ok) return res || { ok: false, error: "no_response" };
  const a = state.accounts.find((x) => x.id === accountId);
  if (a) {
    const joined = res.text && res.text.trim();
    a.context = a.context ? a.context.trim() + "\n\n" + joined : joined;
    persist();
    notify();
  }
  return { ok: true, text: res.text };
}

/* ---------- settings ---------- */

export function setApiKey(key) {
  state.apiKey = (key || "").trim();
  persist();
  notify();
}

export function updateSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  persist();
  notify();
}

/* ---------- theme & onboarding ---------- */

export function applyTheme(theme) {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = theme === "light" ? "light" : "dark";
  }
}

export function setTheme(theme) {
  state.settings.theme = theme === "light" ? "light" : "dark";
  applyTheme(state.settings.theme);
  persist();
  notify();
}

export function completeOnboarding(view = "feed") {
  state.settings.onboarded = true;
  state.view = view;
  persist();
  notify();
}
