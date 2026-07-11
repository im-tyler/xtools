import {
  getState, getActiveAccount, setView, setActiveAccount, addAccount,
  renameAccount, deleteAccount, persistContext, accountPosts, addPosts,
  updatePost, removePost, postNow, scrapeVisibleInto, scanReplyCandidates, sendReply, setApiKey, updateSettings,
  applyTheme, setTheme, completeOnboarding, setAccountField, setProfile,
  setProfileSummarySilent, toggleTrait, setTraitText, removeTrait, addTrait,
  confirmProfile, addMuse, removeMuse, collectMuse, MAX_MUSES, setAccountHandle,
  collectOwnPosts, accountLog, logEdit, setLearnedTraits, clearLearnedTraits, setMuseContext,
} from "./store.js";
import { generatePosts, remixPost, draftReply, testConnection, previewPost, generateProfile, learnPreferences, getProviders, providerOf } from "./ai.js";
import { fmtTime, fmtRelative, linkify } from "./util.js";
import * as ic from "./icons.js";

const uiState = {
  generating: false,
  busyId: null,
  editingId: null,
  menuOpen: false,
  lastScrape: null,
  obStep: 0,
  genError: null,
  genProfile: false,
  previewing: false,
  preview: null,
  collectingMuse: null,
  pullingOwn: false,
  learning: false,
  topic: "",
  steerMode: "guidance",
  steerEnabled: false,
  genOptionsOpen: false,
  contextTab: "voice",
  productFetching: false,
  replyCandidates: [],
  replyScanning: false,
  replyGenerating: false,
  replyBusyId: null,
};

/* Only one profile scrape at a time — parallel background-tab scrapes are the
 * one read pattern that looks mechanical. */
function scrapeBusy() {
  return !!(uiState.collectingMuse || uiState.pullingOwn);
}

let wired = false;

const TONES = ["natural", "punchy", "thoughtful", "playful", "professional"];
const PROVIDERS = getProviders();

/* ============================ entry ============================ */

export function render(state) {
  applyTheme(state.settings.theme);
  if (!wired) { wireGlobal(); wired = true; }
  const app = document.getElementById("app");
  if (!state.settings.onboarded) {
    app.innerHTML = onboardingHtml(state);
    return;
  }
  if (!app.querySelector(".app")) {
    app.innerHTML = shellHtml();
  }
  renderTopbar(state);
  renderContent(state);
}

/* ============================ onboarding ============================ */

function onboardingHtml(state) {
  const step = uiState.obStep || 0;
  const themeIcon = state.settings.theme === "light" ? ic.moon(18) : ic.sun(18);
  return `<div class="ob">
    <button class="ob-theme btn-icon" data-action="toggle-theme" title="Toggle theme">${themeIcon}</button>
    <div class="ob-card">
      ${obStepHtml(step, state)}
      <div class="ob-dots">${[0, 1, 2, 3].map((i) => `<span class="dot-s ${i === step ? "active" : ""}"></span>`).join("")}</div>
    </div>
    <p class="ob-foot">No X API required · posts as your browser session · bring your own key</p>
  </div>`;
}

function obStepHtml(step, state) {
  const acc = getActiveAccount();
  if (step === 0) {
    return `
      <h1>AI Post Studio for X</h1>
      <p class="ob-sub">Build a voice, generate on-brand posts, and post or queue them without an X API. Set it up now, or start with the basics and configure it whenever you are ready.</p>
      <div class="ob-actions">
        <button class="btn-ghost" data-action="ob-later">Set up later</button>
        <button class="btn-primary" data-action="ob-next">Set up now</button>
      </div>`;
  }
  if (step === 1) {
    return `
      <h2>Profile and account</h2>
      <p class="ob-sub">Give this persona a name and optionally link its X handle. The handle lets AI Post Studio pull your posts and prevents posting through the wrong account.</p>
      <label class="field">
        <span class="field-label">Profile name</span>
        <input class="input" id="ob-name" value="${escapeAttr((acc && acc.name) || "My account")}">
      </label>
      <label class="field">
        <span class="field-label">Your X handle <span class="meta">optional</span></span>
        <input class="input" id="ob-handle" placeholder="@yourhandle" value="${acc && acc.handle ? "@" + escapeAttr(acc.handle) : ""}">
      </label>
      <div class="ob-actions">
        <button class="btn-ghost" data-action="ob-back">Back</button>
        <button class="btn-ghost" data-action="ob-later">Set up later</button>
        <button class="btn-primary" data-action="ob-next">Continue</button>
      </div>`;
  }
  if (step === 2) {
    return `
      <h2>Connect your model</h2>
      <p class="ob-sub">Bring your own key. DeepSeek V4 Flash is cheapest — fractions of a cent per generate.</p>
      <label class="field">
        <span class="field-label">Provider</span>
        <select class="input" id="ob-provider">${Object.entries(PROVIDERS).map(([k, v]) => `<option value="${k}" ${k === state.settings.provider ? "selected" : ""}>${v.label}</option>`).join("")}</select>
      </label>
      <label class="field">
        <span class="field-label">API key</span>
        <input class="input" type="password" id="ob-key" placeholder="sk-…" value="${escapeAttr(state.apiKey)}">
      </label>
      <div class="ob-actions">
        <button class="btn-ghost" data-action="ob-back">Back</button>
        <button class="btn-ghost" data-action="ob-later">Set up later</button>
        <button class="btn-ghost" id="ob-test-btn" data-action="ob-test">Test connection</button>
        <button class="btn-primary" data-action="ob-next">Continue</button>
      </div>`;
  }
  const ctx = (acc && acc.context) || "";
  const pullOwnControl = acc && acc.handle
    ? `<button class="btn-ghost sm" data-action="pull-own" ${uiState.pullingOwn ? "disabled" : ""}>
        ${ic.remix(14)}<span>${uiState.pullingOwn ? "Collecting…" : "Pull from @" + escapeText(acc.handle)}</span>
      </button>`
    : `<span class="meta">Link your handle on the previous step to pull posts.</span>`;
  return `
    <h2>Build your voice</h2>
    <p class="ob-sub">Use your own writing first, then add reference accounts for cadence and structure. You can refine everything in Voice after setup.</p>
    <label class="field">
      <div class="field-row">
        <span class="field-label">Your posts</span>
        ${pullOwnControl}
      </div>
      <textarea class="voice-area" id="ob-voice" placeholder="Paste example posts, separated by a blank line…">${escapeText(ctx)}</textarea>
    </label>
    ${musesHtml(acc)}
    <div class="ob-actions">
      <button class="btn-ghost" data-action="ob-back">Back</button>
      <button class="btn-ghost" data-action="ob-later">Set up later</button>
      <button class="btn-primary" data-action="ob-next">Open Voice studio</button>
    </div>`;
}

/* ============================ shell ============================ */

function shellHtml() {
  return `
  <div class="app">
    <header class="topbar"><div class="topbar-inner" id="topbarInner"></div></header>
    <main class="main">
      <section class="content" id="content"></section>
    </main>
  </div>`;
}

/* ============================ topbar ============================ */

function renderTopbar(state) {
  const acc = getActiveAccount();
  const el = document.getElementById("topbarInner");
  const themeIcon = state.settings.theme === "light" ? ic.moon(18) : ic.sun(18);
  const queued = state.posts.filter((p) => p.status === "queued").length;
  const tab = (v, label) =>
    `<button class="tab ${v === state.view ? "active" : ""}" data-action="nav" data-view="${v}">${label}</button>`;
  el.innerHTML = `
    <div class="top-row">
      <nav class="tabs">
        ${tab("feed", "Feed")}
        ${tab("replies", "Replies")}
        ${tab("queue", queued > 0 ? `Queue<span class="tab-count">${queued}</span>` : "Queue")}
        ${tab("context", "Context")}
        ${tab("settings", "Settings")}
      </nav>
      <div class="top-actions">
        <button class="btn-icon topbar-theme" data-action="toggle-theme" title="Toggle theme">${themeIcon}</button>
        ${accountSwitcher(state, acc)}
      </div>
    </div>
    <div class="top-sub">${subtitleFor(state, acc)}</div>`;
}

function subtitleFor(state, acc) {
  if (state.view === "feed") {
    const n = accountPosts(acc && acc.id).filter((p) => p.status === "draft").length;
    return n ? n + " draft" + (n === 1 ? "" : "s") + " ready" : "Generated posts land here";
  }
  if (state.view === "replies") return uiState.replyCandidates.length ? uiState.replyCandidates.length + " visible post" + (uiState.replyCandidates.length === 1 ? "" : "s") + " queued for review" : "Scan visible X posts to draft replies";
  if (state.view === "queue") {
    const n = state.posts.filter((p) => p.status === "queued").length;
    return n ? n + " scheduled" + (n === 1 ? "" : "s") : "Scheduled posts fire automatically";
  }
  if (state.view === "context") return uiState.contextTab === "product" ? "Product facts used for generation" : "Teach AI Post Studio how you write";
  if (state.view === "settings") return "Connection, generation, and safety";
  return "";
}

function avatarHtml(acc, cls) {
  const inner = acc && acc.avatarUrl
    ? `<img src="${escapeAttr(acc.avatarUrl)}" alt="">`
    : ((acc && acc.name) || "A").trim().charAt(0).toUpperCase();
  return `<span class="avatar ${cls || ""}">${inner}</span>`;
}

function accountSwitcher(state, acc) {
  return `
  <div class="acct ${uiState.menuOpen ? "open" : ""}">
    <button class="acct-btn" data-action="toggle-menu" title="Switch account">
      ${avatarHtml(acc)}
      <span class="acct-name">${escapeText(acc && acc.name)}</span>
      ${ic.chevron(16)}
    </button>
    ${uiState.menuOpen ? `<div class="menu">
      ${state.accounts.map((a) => `
        <button class="menu-item ${a.id === state.activeAccountId ? "sel" : ""}" data-action="select-account" data-id="${a.id}">
          ${avatarHtml(a, "sm")}
          <span class="menu-label">${escapeText(a.name)}</span>
          ${a.id === state.activeAccountId ? ic.check(16) : ""}
        </button>`).join("")}
      <div class="menu-sep"></div>
      <button class="menu-item" data-action="new-account">${ic.plus(16)}<span class="menu-label">New account</span></button>
      <button class="menu-item" data-action="goto-settings">${ic.gear(16)}<span class="menu-label">Manage accounts</span></button>
    </div>` : ""}
  </div>`;
}

/* ============================ content ============================ */

function renderContent(state) {
  const content = document.getElementById("content");
  const viewChanged = uiState.lastView !== state.view;
  uiState.lastView = state.view;
  const y = viewChanged ? 0 : window.scrollY;
  const acc = getActiveAccount();
  let html;
  switch (state.view) {
    case "feed": html = viewFeed(state, acc); break;
    case "replies": html = viewReplies(state, acc); break;
    case "queue": html = viewQueue(state, acc); break;
    case "context": html = viewContext(state, acc); break;
    case "settings": html = viewSettings(state); break;
    default: html = "";
  }
  content.innerHTML = html;
  window.scrollTo(0, y);
}

/* ----------------------------- FEED ----------------------------- */

function viewFeed(state, acc) {
  const keyBanner = !state.apiKey
    ? banner("Add your API key to start generating", "goto-settings", "Open Settings", ic.key(18), "warn")
    : "";
  const errBanner = uiState.genError
    ? banner("Generation failed: " + uiState.genError, "generate", "Retry", ic.alert(18), "warn")
    : "";
  const count = state.settings.generateCount || 5;
  const length = acc && acc.generationLength === "concise" ? "concise" : "standard";
  const hasProductContext = !!(acc && ((acc.productContext || "").trim() || (acc.productSources || []).some((source) => (source.text || "").trim())));
  const focus = acc && ["voice", "balanced", "product"].includes(acc.generationFocus) ? acc.generationFocus : "balanced";
  const choice = (kind, value, label, disabled) => `<button class="gen-choice ${value === (kind === "length" ? length : focus) ? "active" : ""}" data-action="gen-${kind}" data-value="${value}" ${disabled ? "disabled" : ""}>${label}</button>`;
  const gen = `
    <div class="panel-head">
      <div class="gen-control">
        <div class="stepper" role="group" aria-label="Number of posts">
          <button class="step" data-action="count-dec" ${count <= 1 ? "disabled" : ""}>−</button>
          <span class="step-val">${count}</span>
          <button class="step" data-action="count-inc" ${count >= 10 ? "disabled" : ""}>+</button>
        </div>
        <button class="btn-primary" data-action="generate" ${uiState.generating ? "disabled" : ""}>
          ${ic.spark(18)}<span>${uiState.generating ? "Generating…" : "Generate"}</span>
        </button>
        <div class="gen-options-wrap">
          <button class="btn-ghost sm" data-action="toggle-gen-options" aria-expanded="${uiState.genOptionsOpen}">Options</button>
          ${uiState.genOptionsOpen ? `<div class="gen-options-menu">
            <div class="gen-option"><span>Length</span><div class="gen-segment">${choice("length", "concise", "Concise")}${choice("length", "standard", "Standard")}</div></div>
            <div class="gen-option"><span>Focus</span><div class="gen-segment">${choice("focus", "voice", "Voice")}${choice("focus", "balanced", "Balanced")}${choice("focus", "product", "Product", !hasProductContext)}</div></div>
            <div class="gen-option"><span>Steer batch</span><button class="gen-choice ${uiState.steerEnabled ? "active" : ""}" data-action="toggle-steer">${uiState.steerEnabled ? "On" : "Off"}</button></div>
            ${uiState.steerEnabled ? `<input class="input gen-steer-input" id="genTopic" placeholder="Topic, angle, or instruction" value="${escapeAttr(uiState.topic || "")}">
            <div class="gen-option"><span>Mode</span><div class="gen-segment"><button class="gen-choice ${uiState.steerMode === "specific" ? "" : "active"}" data-action="steer-mode" data-value="guidance">Guidance</button><button class="gen-choice ${uiState.steerMode === "specific" ? "active" : ""}" data-action="steer-mode" data-value="specific">Specific</button></div></div>` : ""}
          </div>` : ""}
        </div>
      </div>
    </div>`;

  const posts = accountPosts(acc && acc.id).filter((p) => p.status !== "discarded");

  let body;
  if (uiState.generating) {
    body = `<div class="feed">${Array.from({ length: count }).map(skeletonTweet).join("")}</div>`;
  } else if (!posts.length) {
    body = emptyState(
      ic.spark(26),
      "Nothing here yet",
      acc && acc.context ? "Generate posts in your voice, then post, remix, or queue." : "Add a few example posts in Voice, then generate.",
      acc && acc.context ? [{ label: "Generate", action: "generate", primary: true }] : [{ label: "Add your voice", action: "goto-voice", primary: true }]
    );
  } else {
    body = `<div class="feed">${posts.map((p) => feedCard(p, acc)).join("")}</div>`;
  }

  return `<div class="wrap narrow">${keyBanner}${errBanner}${gen}${body}</div>`;
}

function feedCard(p, acc) {
  const handle = acc && acc.handle ? "@" + acc.handle : xHandle(acc && acc.name);
  const name = escapeText((acc && acc.name) || "Account");

  if (uiState.editingId === p.id) {
    return `<article class="tweet editing" data-id="${p.id}">
      <div class="tweet-avatar">${avatarHtml(acc)}</div>
      <div class="tweet-main">
        <div class="tweet-head"><span class="t-name">${name}</span><span class="t-handle">${handle}</span></div>
        <textarea class="tweet-edit" rows="4" data-role="edit-text">${escapeAttr(p.text)}</textarea>
        <div class="tweet-actions">
          <span class="t-counter" data-role="edit-count">${p.text.length}/280</span>
          <span class="t-spacer"></span>
          <button class="xact x-post" data-action="save-edit" data-id="${p.id}">${ic.check(16)}<span>Save</span></button>
          <button class="xact" data-action="cancel-edit">${ic.close(16)}<span>Cancel</span></button>
        </div>
      </div>
    </article>`;
  }

  const busy = uiState.busyId === p.id;
  const st = tweetStatus(p);
  return `<article class="tweet" data-id="${p.id}">
    <div class="tweet-avatar">${avatarHtml(acc)}</div>
    <div class="tweet-main">
      <div class="tweet-head">
        <span class="t-name">${name}</span>
        <span class="t-handle">${handle}</span>
        <span class="t-dot">·</span>
        <span class="t-time ${st.cls}">${st.time}</span>
        <span class="t-spacer"></span>
        <span class="t-meta">${st.meta}</span>
      </div>
      <div class="tweet-body">${linkify(p.text)}</div>
      <div class="tweet-actions">
        <button class="xact x-remix" data-action="remix" data-id="${p.id}" title="Remix">${ic.remix(18)}</button>
        <button class="xact x-edit" data-action="edit" data-id="${p.id}" title="Edit">${ic.edit(18)}</button>
        <button class="xact x-queue" data-action="queue" data-id="${p.id}" title="Add to queue">${ic.clock(18)}</button>
        <button class="xact x-copy" data-action="copy" data-id="${p.id}" title="Copy">${ic.copy(18)}</button>
        ${p.status === "queued" ? `<button class="xact" data-action="unqueue" data-id="${p.id}" title="Remove from queue">${ic.close(18)}</button>` : ""}
        <span class="t-spacer"></span>
        <button class="xact x-discard" data-action="discard" data-id="${p.id}" title="Discard">${ic.trash(18)}</button>
        <button class="xact x-post" data-action="post-now" data-id="${p.id}" title="Post now" ${busy ? "disabled" : ""}>${busy ? ic.clock(18) : ic.send(18)}</button>
      </div>
    </div>
  </article>`;
}

function xHandle(name) {
  const h = (name || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return "@" + (h.slice(0, 15) || "you");
}

function tweetStatus(p) {
  if (p.status === "queued" && p.scheduledFor) return { cls: "", time: "Queued · " + fmtRelative(p.scheduledFor), meta: fmtTime(p.scheduledFor) };
  if (p.status === "posted" && p.postedAt) return { cls: "", time: "Posted " + fmtRelative(p.postedAt), meta: "" };
  if (p.status === "failed") return { cls: "fail", time: "Failed", meta: escapeText(p.note || "") };
  return { cls: "draft", time: "Draft", meta: p.text.length + "/280" };
}

function skeletonTweet() {
  return `<article class="tweet">
    <div class="tweet-avatar"><span class="sk-avatar"></span></div>
    <div class="tweet-main">
      <div class="sk-line w25"></div>
      <div class="sk-line w95"></div>
      <div class="sk-line w80"></div>
      <div class="sk-line w55"></div>
    </div>
  </article>`;
}

/* ---------------------------- REPLIES ---------------------------- */

function viewReplies(state, acc) {
  const scanning = uiState.replyScanning;
  const generating = uiState.replyGenerating;
  const candidates = uiState.replyCandidates;
  const scan = `<div class="panel-head reply-toolbar">
    <div><h2><span class="sec-ico">${ic.remix(18)}</span>Reply lab</h2><p class="muted">Scan original posts visible in X, then draft replies you can edit, send, or skip.</p></div>
    <div class="reply-toolbar-actions"><button class="btn-ghost" data-action="scan-replies" ${scanning || generating ? "disabled" : ""}>${ic.remix(16)}<span>${scanning ? "Scanning…" : "Scan"}</span></button><button class="btn-primary" data-action="generate-replies" ${!candidates.length || scanning || generating ? "disabled" : ""}>${ic.spark(16)}<span>${generating ? "Generating…" : "Generate replies"}</span></button></div>
  </div>`;
  const body = !candidates.length
    ? emptyState(ic.remix(26), "No posts scanned", "Open X, scroll to posts you genuinely want to engage with, then scan them here.", [])
    : `<div class="reply-list">${candidates.map((candidate) => replyCard(candidate, acc)).join("")}</div>`;
  return `<div class="wrap narrow"><section class="panel">${scan}</section>${body}</div>`;
}

function replyCard(candidate, acc) {
  const busy = uiState.replyBusyId === candidate.id || uiState.replyGenerating;
  const draft = candidate.draft || "";
  return `<article class="tweet reply-draft" data-id="${escapeAttr(candidate.id)}">
    <div class="tweet-avatar"><span class="reply-author-avatar">${escapeText(candidate.author.charAt(0).toUpperCase())}</span></div>
    <div class="tweet-main">
      <div class="tweet-head"><span class="t-name">@${escapeText(candidate.author)}</span><span class="t-spacer"></span><a class="reply-open" href="${escapeAttr(candidate.url)}" target="_blank" rel="noreferrer">Open post</a></div>
      <div class="tweet-body">${linkify(candidate.text)}</div>
      <textarea class="tweet-edit reply-draft-input" rows="3" data-role="reply-draft" data-id="${escapeAttr(candidate.id)}" placeholder="Draft a reply, or write one yourself…">${escapeText(draft)}</textarea>
      <div class="tweet-actions">
        <button class="xact x-remix" data-action="draft-reply" data-id="${escapeAttr(candidate.id)}" ${busy ? "disabled" : ""}>${ic.spark(16)}<span>${busy ? "Working…" : draft ? "Remix" : "Draft"}</span></button>
        <button class="xact x-post" data-action="send-reply" data-id="${escapeAttr(candidate.id)}" ${busy || !draft.trim() ? "disabled" : ""}>${ic.send(16)}<span>Send</span></button>
        <span class="t-spacer"></span><button class="xact" data-action="skip-reply" data-id="${escapeAttr(candidate.id)}">${ic.close(16)}<span>Skip</span></button>
      </div>
    </div>
  </article>`;
}

/* ----------------------------- QUEUE ----------------------------- */

function viewQueue(state, acc) {
  const items = state.posts
    .filter((p) => p.status === "queued")
    .sort((a, b) => (a.scheduledFor || 0) - (b.scheduledFor || 0));

  const s = state.settings;
  const cap = s.rateLimitPerHour || 2;
  const hours = s.activeStart === s.activeEnd ? "" : ` between ${s.activeStart}:00 and ${s.activeEnd}:00`;
  const safe = banner(
    `Queue fires automatically while an x.com tab is open${hours}. Capped at ${cap}/hour, dripped one at a time.`,
    null, null, ic.alert(16), "info"
  );

  let body;
  if (!items.length) {
    body = emptyState(ic.queue(26), "Queue is empty", "Queue posts from the Feed to schedule them for later.", []);
  } else {
    body = `<div class="cards">${items.map(queueCard).join("")}</div>`;
  }
  return `<div class="wrap">${safe}${body}</div>`;
}

function queueCard(p) {
  const local = toLocalInput(p.scheduledFor || Date.now() + 3600000);
  return `<article class="card st-queued" data-id="${p.id}">
    <div class="card-body">${linkify(p.text)}</div>
    <div class="card-foot">
      <span class="badge queued">Queued</span>
      <input class="sched" type="datetime-local" value="${local}" data-action="reschedule" data-id="${p.id}">
      <span class="meta">${fmtRelative(p.scheduledFor)}</span>
      <span class="spacer"></span>
      <div class="actions">
        <button class="btn-icon" data-action="post-now" data-id="${p.id}" title="Post now">${ic.send(18)}</button>
        <button class="btn-icon" data-action="unqueue" data-id="${p.id}" title="Back to drafts">${ic.remix(18)}</button>
        <button class="btn-icon danger" data-action="delete" data-id="${p.id}" title="Delete">${ic.trash(18)}</button>
      </div>
    </div>
  </article>`;
}

/* ----------------------------- VOICE ----------------------------- */

function viewContext(state, acc) {
  const active = uiState.contextTab === "product" ? "product" : "voice";
  const tab = (id, label) => `<button class="context-tab ${active === id ? "active" : ""}" data-action="context-tab" data-context-tab="${id}">${label}</button>`;
  const body = active === "product" ? viewProductContext(acc) : viewVoice(state, acc);
  return `<div class="wrap">
    <div class="context-tabs">${tab("voice", "Voice")}${tab("product", "Product")}</div>
    ${body}
  </div>`;
}

function viewVoice(state, acc) {
  if (!acc) return "";
  const examples = acc.context || "";
  const ownPosts = (acc.ownPosts || []).join("\n\n");
  const refs = acc.references || "";
  const pillars = acc.pillars || "";
  const rich = voiceRichness([examples, ownPosts].filter(Boolean).join("\n\n"));

  const sources = `
    <section class="panel">
      <div class="panel-head">
        <h2><span class="sec-ico">${ic.voice(18)}</span>Voice sources</h2>
        <span class="richness ${rich.cls}"><span class="rdot"></span>${rich.label} source</span>
      </div>
      <div class="panel-body">
        <label class="field">
          <span class="field-label">Personal notes and examples</span>
          <textarea class="voice-area sm" id="voiceExamples" placeholder="Paste your own writing, positioning notes, or themes, separated by blank lines…">${escapeText(examples)}</textarea>
        </label>
        <label class="field">
          <div class="field-row">
            <span class="field-label">Posts from your X account</span>
            <button class="btn-ghost sm" data-action="pull-own" ${scrapeBusy() ? "disabled" : ""}>
              ${ic.remix(14)}<span>${uiState.pullingOwn ? "Collecting…" : acc.handle ? "Pull from @" + escapeText(acc.handle) : "Pull from your @handle"}</span>
            </button>
          </div>
          <textarea class="voice-area" id="ownPostsContext" placeholder="Link your X handle in Settings, then pull posts here. You can edit the saved snapshot directly.">${escapeText(ownPosts)}</textarea>
        </label>
        <div class="grid2">
          <label class="field">
            <span class="field-label">Writing references to emulate</span>
            <textarea class="voice-area sm" id="voiceRefs" placeholder="Paste writing you like, or describe a style — e.g. 'concise and aphoristic like @naval'">${escapeText(refs)}</textarea>
          </label>
          <label class="field">
            <span class="field-label">What you post about</span>
            <textarea class="voice-area sm" id="voicePillars" placeholder="Themes & topics — e.g. 'systems thinking, building in public, Go'">${escapeText(pillars)}</textarea>
          </label>
        </div>
        ${musesHtml(acc)}
        <div class="panel-foot">
          <span class="meta">AI Post Studio learns your voice from these. More specific is better.</span>
          <button class="btn-primary" data-action="generate-profile" ${uiState.genProfile ? "disabled" : ""}>
            ${ic.spark(18)}<span>${uiState.genProfile ? "Analyzing…" : "Generate voice profile"}</span>
          </button>
        </div>
      </div>
    </section>`;

  let profile = "";
  if (uiState.genProfile) profile = profileSkeleton();
  else if (acc.profile) profile = profilePanel(acc);

  return `${sources}${profile}${learnedPanel(state, acc)}`;
}

function viewProductContext(acc) {
  if (!acc) return "";
  const sources = acc.productSources || [];
  const sourceRows = sources.length
    ? `<div class="product-sources">${sources.map((source, index) => `<div class="product-source">
        <div class="product-source-head">
          <div class="product-source-copy">
            <strong>${escapeText(source.title || source.url)}</strong>
            <span>${escapeText(source.url)} · ${source.text ? source.text.length.toLocaleString() + " characters" : "no text"}</span>
          </div>
          <div class="product-source-actions">
            <button class="btn-ghost sm" data-action="refresh-product-source" data-id="${index}" ${uiState.productFetching ? "disabled" : ""}>${ic.remix(14)}<span>${uiState.productFetching ? "Reading…" : "Refresh"}</span></button>
            <button class="btn-icon danger" data-action="remove-product-source" data-id="${index}" title="Remove source">${ic.trash(16)}</button>
          </div>
        </div>
        <textarea class="voice-area sm product-source-text" data-role="product-source-text" data-id="${index}" aria-label="Context from ${escapeAttr(source.title || source.url)}">${escapeText(source.text || "")}</textarea>
      </div>`).join("")}</div>`
    : `<span class="meta">No product pages yet. Add a homepage, pricing page, documentation, or product page to ground generated posts in real details.</span>`;
  return `<section class="panel">
    <div class="panel-head"><h2><span class="sec-ico">${ic.hash(18)}</span>Product context</h2></div>
    <div class="panel-body">
      <label class="field">
        <span class="field-label">Product brief</span>
        <textarea class="voice-area sm" id="productContext" placeholder="The product, audience, differentiators, launch context, claims to avoid, and any current priorities…">${escapeText(acc.productContext || "")}</textarea>
        <span class="field-hint">This is factual generation context. It never changes the voice profile.</span>
      </label>
      <div class="field">
        <span class="field-label">Product pages</span>
        <div class="key-row">
          <input class="input" id="productSourceUrl" placeholder="https://example.com/product">
          <button class="btn-ghost sm" data-action="add-product-source" ${uiState.productFetching ? "disabled" : ""}>${ic.plus(16)}<span>${uiState.productFetching ? "Reading…" : "Add page"}</span></button>
        </div>
        <span class="field-hint">XTools asks once for each new domain, saves a snapshot locally, and never re-fetches it while generating.</span>
      </div>
      ${sourceRows}
    </div>
  </section>`;
}

function learnedPanel(state, acc) {
  const lt = acc.learnedTraits;
  const hasTraits = !!(lt && lt.traits && lt.traits.length);
  const logN = accountLog(acc.id).length;
  const body = hasTraits
    ? `<ul class="learned-list">${lt.traits.map((t) => `<li>${escapeText(t)}</li>`).join("")}</ul>
       <span class="meta">Learned ${fmtRelative(lt.at)} from ${lt.basis} logged post${lt.basis === 1 ? "" : "s"}</span>`
    : `<span class="meta">Nothing learned yet. Post, edit, and discard a few drafts, then hit Learn now.${state.settings.autoLearn ? "" : " Enable auto-learn in Settings to refresh this automatically."}</span>`;
  return `<section class="panel">
    <div class="panel-head">
      <h2><span class="sec-ico">${ic.spark(18)}</span>Learned preferences</h2>
      <span class="meta">${logN} post${logN === 1 ? "" : "s"} logged</span>
    </div>
    <div class="panel-body">
      ${body}
      <div class="panel-foot">
        <span class="meta">Distilled from what you post, edit, and reject — appended to the voice guide, never touching your confirmed traits.</span>
        <div class="actions">
          ${hasTraits ? `<button class="btn-ghost" data-action="clear-learned">${ic.trash(16)}<span>Clear</span></button>` : ""}
          <button class="btn-ghost" data-action="learn-now" ${uiState.learning ? "disabled" : ""}>${ic.spark(16)}<span>${uiState.learning ? "Learning…" : "Learn now"}</span></button>
        </div>
      </div>
    </div>
  </section>`;
}

function musesHtml(acc) {
  const muses = acc.muses || [];
  const chips = muses.map((m) => {
    const n = (m.tweets || []).length + (m.replies || []).length;
    const busy = uiState.collectingMuse === m.handle;
    const meta = busy ? "collecting…" : m.fetchedAt ? n + " collected · " + fmtRelative(m.fetchedAt) : "not collected yet";
    const snapshot = museSnapshot(m);
    return `<div class="muse ${busy ? "busy" : ""}">
      <div class="muse-head">
        <span class="muse-handle">@${escapeText(m.handle)}</span>
        <span class="muse-meta">${escapeText(meta)}</span>
        <button class="btn-icon" data-action="collect-muse" data-handle="${escapeAttr(m.handle)}" title="${m.fetchedAt ? "Refresh" : "Collect"} posts & replies" ${scrapeBusy() ? "disabled" : ""}>${busy ? ic.clock(16) : ic.remix(16)}</button>
        <button class="btn-icon danger" data-action="remove-muse" data-handle="${escapeAttr(m.handle)}" title="Remove" ${busy ? "disabled" : ""}>${ic.trash(16)}</button>
      </div>
      ${snapshot ? `<details class="muse-context"><summary>View and edit collected context</summary><textarea class="voice-area sm" data-role="muse-context" data-handle="${escapeAttr(m.handle)}" aria-label="Context from @${escapeAttr(m.handle)}">${escapeText(snapshot)}</textarea></details>` : ""}
    </div>`;
  }).join("");
  const addRow = muses.length < MAX_MUSES
    ? `<div class="key-row">
        <input class="input" id="museHandle" placeholder="@handle or profile URL">
        <button class="btn-ghost sm" data-action="add-muse">${ic.plus(16)}<span>Add</span></button>
      </div>`
    : "";
  const hasContent = muses.some((m) => museSnapshot(m));
  const toggle = hasContent
    ? `<label class="check">
        <input type="checkbox" data-role="muse-gen" ${acc.museInGeneration ? "checked" : ""}>
        <span>Also feed reference samples directly into generation (heavier mimicry — can dilute your own voice)</span>
      </label>`
    : "";
  return `<div class="field">
    <span class="field-label">X accounts to emulate — up to ${MAX_MUSES}</span>
    ${chips ? `<div class="muses">${chips}</div>` : ""}
    ${addRow}
    <span class="field-hint">AI Post Studio opens their profile in a background tab and collects recent posts + replies as "voices to emulate" for the profile. You must be logged into x.com.</span>
    ${toggle}
  </div>`;
}

function museSnapshot(muse) {
  if (typeof muse.context === "string") return muse.context;
  const posts = (muse.tweets || []).filter(Boolean).join("\n\n");
  const replies = (muse.replies || []).filter(Boolean).join("\n\n");
  return [posts ? "Posts:\n" + posts : "", replies ? "Replies:\n" + replies : ""].filter(Boolean).join("\n\n");
}

function voiceRichness(ex) {
  const n = (ex || "").trim().length;
  if (n < 280) return { cls: "thin", label: "Thin" };
  if (n < 1000) return { cls: "ok", label: "Decent" };
  return { cls: "rich", label: "Rich" };
}

function profileSkeleton() {
  return `<section class="panel">
    <div class="panel-head"><h2><span class="sec-ico">${ic.spark(18)}</span>Analyzing your voice…</h2></div>
    <div class="panel-body skel-lines">
      <div class="sk-line w80"></div>
      <div class="sk-line w55"></div>
      <div class="sk-line w90"></div>
      <div class="sk-line w50"></div>
      <div class="sk-line w70"></div>
    </div>
  </section>`;
}

function profilePanel(acc) {
  const p = acc.profile;
  const confirmed = !!acc.profileConfirmed;
  const previewCard = uiState.preview
    ? `<article class="card preview"><div class="card-body">${linkify(uiState.preview)}</div>
        <div class="card-foot"><span class="meta"><span class="dot soon"></span>Sample written in this voice</span></div></article>`
    : "";
  const previewLoading = uiState.previewing
    ? `<div class="skel-lines"><div class="sk-line w80"></div><div class="sk-line w60"></div></div>`
    : "";
  return `
    <section class="panel">
      <div class="panel-head">
        <h2><span class="sec-ico">${ic.spark(18)}</span>Voice profile ${confirmed ? `<span class="badge posted">In use</span>` : ""}</h2>
        ${!confirmed ? `<span class="meta">Review, then confirm to use it</span>` : ""}
      </div>
      <div class="panel-body">
        <label class="field">
          <span class="field-label">Summary</span>
          <textarea class="voice-area sm" id="profileSummary" placeholder="Overall voice in a sentence or two…">${escapeText(p.summary || "")}</textarea>
        </label>
        <div class="field">
          <span class="field-label">Style traits — toggle the ones that fit</span>
          <div class="traits">
            ${(p.traits || []).length
      ? (p.traits || []).map((t, i) => traitRow(t, i)).join("")
      : `<span class="meta">No traits yet — add one or regenerate.</span>`}
          </div>
          <button class="btn-ghost sm" data-action="add-trait">${ic.plus(16)}<span>Add trait</span></button>
        </div>
        ${previewCard}
        ${previewLoading}
        <div class="panel-foot">
          <span class="meta">${confirmed ? '<span class="dot ok"></span>Used for generation' : "Tip: Preview writes a real sample to test the fit"}</span>
          <div class="actions">
            <button class="btn-ghost" data-action="preview-voice" ${uiState.previewing ? "disabled" : ""}>${ic.feed(16)}<span>${uiState.previewing ? "Writing…" : "Preview"}</span></button>
            <button class="btn-ghost" data-action="generate-profile">${ic.remix(16)}<span>Regenerate</span></button>
            <button class="btn-primary" data-action="confirm-voice">${ic.check(18)}<span>${confirmed ? "Update" : "Use this voice"}</span></button>
          </div>
        </div>
      </div>
    </section>`;
}

function traitRow(t, i) {
  return `<div class="trait ${t.included ? "" : "off"}">
    <button class="trait-toggle" data-action="toggle-trait" data-id="${i}" title="${t.included ? "Included — click to drop" : "Dropped — click to include"}">
      ${t.included ? ic.check(16) : ic.close(16)}
    </button>
    <input class="input trait-text" data-role="edit-trait" data-id="${i}" value="${escapeAttr(t.text)}" placeholder="Describe a trait…">
    <button class="btn-icon danger" data-action="remove-trait" data-id="${i}" title="Remove trait">${ic.trash(16)}</button>
  </div>`;
}

/* ----------------------------- SETTINGS ----------------------------- */

function viewSettings(state) {
  const s = state.settings;
  const accounts = state.accounts;
  return `<div class="wrap">
    ${section("Connection", ic.key(18), connectionSection(state, s))}
    ${section("Generation", ic.spark(18), `
      <div class="grid2">
        <label class="field">
          <span class="field-label">Posts per generate</span>
          <input type="number" class="input" min="1" max="10" data-role="setting" data-key="generateCount" value="${s.generateCount}">
        </label>
        <label class="field">
          <span class="field-label">Tone</span>
          <select class="input" data-role="setting" data-key="tone">
            ${TONES.map((t) => `<option ${t === s.tone ? "selected" : ""}>${t}</option>`).join("")}
          </select>
        </label>
      </div>
      <label class="check">
        <input type="checkbox" data-role="setting" data-key="autoLearn" ${s.autoLearn ? "checked" : ""}>
        <span>Auto-learn preferences from posting history — refreshes each account's learned traits after every ~10 posts. Your confirmed voice profile is never modified.</span>
      </label>
    `)}
    ${section("Safety", ic.alert(18), `
      <div class="grid2">
        <label class="field">
          <span class="field-label">Max posts per hour</span>
          <input type="number" class="input" min="1" max="50" data-role="setting" data-key="rateLimitPerHour" value="${s.rateLimitPerHour}">
          <span class="field-hint">Rolling limit to reduce automation risk.</span>
        </label>
        <label class="field">
          <span class="field-label">Queue jitter (seconds)</span>
          <input type="number" class="input" min="0" max="900" data-role="setting" data-key="jitterSeconds" value="${s.jitterSeconds}">
          <span class="field-hint">Random offset added to scheduled times.</span>
        </label>
      </div>
      <div class="grid2">
        <label class="field">
          <span class="field-label">Queue active from (hour)</span>
          <input type="number" class="input" min="0" max="23" data-role="setting" data-key="activeStart" value="${s.activeStart}">
        </label>
        <label class="field">
          <span class="field-label">Queue active until (hour)</span>
          <input type="number" class="input" min="0" max="23" data-role="setting" data-key="activeEnd" value="${s.activeEnd}">
          <span class="field-hint">Scheduled posts only fire inside this window — no 4am posts. Same value in both = always on.</span>
        </label>
      </div>
      <label class="check">
        <input type="checkbox" data-role="setting" data-key="acceptedTosWarning" ${s.acceptedTosWarning ? "checked" : ""}>
        <span>I understand automated posting can risk my X account, and I use XTools at my own discretion.</span>
      </label>
    `)}
    ${section("Accounts", ic.voice(18), `
      <div class="acct-list">
        ${accounts.map((a) => `
          <div class="acct-row">
            ${avatarHtml(a, "sm")}
            <input class="input" data-role="rename" data-id="${a.id}" value="${escapeAttr(a.name)}">
            <input class="input acct-handle" data-role="acct-handle" data-id="${a.id}" placeholder="@handle" value="${a.handle ? "@" + escapeAttr(a.handle) : ""}">
            <button class="btn-icon danger" data-action="delete-account" data-id="${a.id}" title="Delete" ${accounts.length <= 1 ? "disabled" : ""}>${ic.trash(18)}</button>
          </div>`).join("")}
      </div>
      <span class="field-hint">Link the X @handle each profile posts as. Posting then refuses to fire unless that account is the logged-in x.com session, and the profile picture fills in automatically. Leave blank to skip the check.</span>
      <button class="btn-ghost" data-action="new-account">${ic.plus(16)}<span>New account</span></button>
    `)}
    <p class="footer-note">XTools v1.1.0 · AI Post Studio for X · No X API required</p>
  </div>`;
}

/* ============================ shared bits ============================ */

function section(title, icon, inner) {
  return `<section class="panel">
    <div class="panel-head"><h2><span class="sec-ico">${icon}</span>${title}</h2></div>
    <div class="panel-body">${inner}</div>
  </section>`;
}

function connectionSection(state, s) {
  const p = providerOf(s.provider);
  const providerOptions = Object.entries(PROVIDERS)
    .map(([k, v]) => `<option value="${k}" ${k === s.provider ? "selected" : ""}>${v.label}</option>`)
    .join("");
  const modelField =
    s.provider === "custom"
      ? `<input class="input" data-role="setting" data-key="model" value="${escapeAttr(s.model)}" placeholder="model name">`
      : `<select class="input" data-role="setting" data-key="model">${p.models
          .map(([v, l]) => `<option value="${v}" ${v === s.model ? "selected" : ""}>${l}</option>`)
          .join("")}</select>`;
  const customBaseUrl =
    s.provider === "custom"
      ? `<label class="field">
          <span class="field-label">Base URL</span>
          <input class="input" data-role="setting" data-key="baseUrl" placeholder="https://your-host/v1" value="${escapeAttr(s.baseUrl)}">
          <span class="field-hint">Any OpenAI-compatible endpoint. You'll be asked to grant access to the domain.</span>
        </label>`
      : "";
  const keyHint = p.keyUrl
    ? `Stored only in your browser. Get a key at <a href="${p.keyUrl}" target="_blank" rel="noreferrer">${p.keyUrl.replace(/^https?:\/\//, "")}</a>.`
    : "Stored only in your browser.";
  return `
    <label class="field">
      <span class="field-label">Provider</span>
      <select class="input" data-role="setting" data-key="provider">${providerOptions}</select>
    </label>
    ${customBaseUrl}
    <label class="field">
      <span class="field-label">${p.label} API key</span>
      <div class="key-row">
        <input type="password" class="input" id="apiKey" placeholder="sk-…" value="${escapeAttr(state.apiKey)}">
        <button class="btn-ghost sm" data-action="reveal-key" data-target="apiKey">${ic.external(16)}</button>
      </div>
      <span class="field-hint">${keyHint}</span>
    </label>
    <label class="field">
      <span class="field-label">Model</span>
      ${modelField}
    </label>
    <div><button class="btn-ghost" data-action="test-connection">${ic.check(16)}<span>Test connection</span></button></div>`;
}

function banner(text, action, cta, icon, tone) {
  return `<div class="banner ${tone || "info"}">
    <span class="bn-ico">${icon || ic.alert(16)}</span>
    <span class="bn-text">${escapeText(text)}</span>
    ${action ? `<button class="banner-btn" data-action="${action}">${escapeText(cta)}</button>` : ""}
  </div>`;
}

function emptyState(icon, title, sub, actions) {
  const acts = (actions || []).map((a) =>
    `<button class="${a.primary ? "btn-primary" : "btn-ghost"}" data-action="${a.action}">${escapeText(a.label)}</button>`
  ).join("");
  return `<div class="empty">
    <div class="empty-ico">${icon}</div>
    <h3>${escapeText(title)}</h3>
    <p>${escapeText(sub)}</p>
    ${acts ? `<div class="empty-acts">${acts}</div>` : ""}
  </div>`;
}

/* ============================ wiring ============================ */

function wireGlobal() {
  document.addEventListener("click", onGlobalClick, true);
  document.addEventListener("input", onGlobalInput, true);
  document.addEventListener("change", onGlobalChange, true);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      uiState.menuOpen = false;
      uiState.editingId = null;
      render(getState());
    }
    if (e.key === "Enter" && e.target && e.target.id === "museHandle") {
      e.preventDefault();
      doAddMuse();
    }
    if (e.key === "Enter" && e.target && e.target.id === "productSourceUrl") {
      e.preventDefault();
      doAddProductSource();
    }
  });
}

function onGlobalClick(e) {
  const t = e.target.closest("[data-action]");
  if (!t) {
    if (uiState.menuOpen && !e.target.closest(".acct")) { uiState.menuOpen = false; render(getState()); }
    if (uiState.genOptionsOpen && !e.target.closest(".gen-options-wrap")) { uiState.genOptionsOpen = false; render(getState()); }
    return;
  }
  const action = t.dataset.action;
  const id = t.dataset.id;

  switch (action) {
    case "nav": uiState.menuOpen = false; uiState.genOptionsOpen = false; setView(t.dataset.view); break;
    case "toggle-menu": uiState.menuOpen = !uiState.menuOpen; render(getState()); break;
    case "select-account": setActiveAccount(id); uiState.menuOpen = false; break;
    case "new-account": addAccount("New account"); break;
    case "goto-settings": setView("settings"); uiState.menuOpen = false; break;
    case "goto-voice": uiState.contextTab = "voice"; setView("context"); break;
    case "context-tab": uiState.contextTab = t.dataset.contextTab === "product" ? "product" : "voice"; render(getState()); break;
    case "generate": doGenerate(); break;
    case "scan-replies": doScanReplies(); break;
    case "generate-replies": doGenerateReplies(); break;
    case "draft-reply": doDraftReply(id); break;
    case "send-reply": doSendReply(id); break;
    case "skip-reply": removeReplyCandidate(id); break;
    case "count-inc": updateSettings({ generateCount: Math.min(10, (getState().settings.generateCount || 5) + 1) }); break;
    case "count-dec": updateSettings({ generateCount: Math.max(1, (getState().settings.generateCount || 5) - 1) }); break;
    case "toggle-gen-options": uiState.genOptionsOpen = !uiState.genOptionsOpen; render(getState()); break;
    case "gen-length": { const a = getActiveAccount(); if (a) { setAccountField(a.id, "generationLength", t.dataset.value === "concise" ? "concise" : "standard"); render(getState()); } break; }
    case "gen-focus": { const a = getActiveAccount(); if (a) { setAccountField(a.id, "generationFocus", ["voice", "balanced", "product"].includes(t.dataset.value) ? t.dataset.value : "balanced"); render(getState()); } break; }
    case "toggle-steer": uiState.steerEnabled = !uiState.steerEnabled; render(getState()); break;
    case "steer-mode": uiState.steerMode = t.dataset.value === "specific" ? "specific" : "guidance"; render(getState()); break;
    case "post-now": doPostNow(id); break;
    case "remix": doRemix(id); break;
    case "queue": doQueue(id); break;
    case "unqueue": updatePost(id, { status: "draft", scheduledFor: null }); break;
    case "copy": doCopy(id); break;
    case "discard": updatePost(id, { status: "discarded" }); break;
    case "delete": removePost(id); break;
    case "delete-account": deleteAccount(id); break;
    case "edit": uiState.editingId = id; render(getState()); focusEdit(); break;
    case "save-edit": saveEdit(id); break;
    case "cancel-edit": uiState.editingId = null; render(getState()); break;
    case "pull-page": doPullPage(); break;
    case "reveal-key": revealKey(t.dataset.target); break;
    case "toggle-theme": setTheme(getState().settings.theme === "light" ? "dark" : "light"); break;
    case "ob-next": obNext(); break;
    case "ob-back": uiState.obStep = Math.max(0, (uiState.obStep || 0) - 1); render(getState()); break;
    case "ob-later": obFinish(null, "feed"); break;
    case "ob-test": obTest(); break;
    case "test-connection": doTestConnection(); break;
    case "generate-profile": doGenerateProfile(); break;
    case "toggle-trait": { const a = getActiveAccount(); if (a) toggleTrait(a.id, +id); break; }
    case "remove-trait": { const a = getActiveAccount(); if (a) removeTrait(a.id, +id); break; }
    case "add-trait": { const a = getActiveAccount(); if (a) addTrait(a.id); break; }
    case "confirm-voice": doConfirmVoice(); break;
    case "preview-voice": doPreviewVoice(); break;
    case "pull-own": doPullOwn(); break;
    case "learn-now": doLearnPrefs(false); break;
    case "clear-learned": { const a = getActiveAccount(); if (a) clearLearnedTraits(a.id); break; }
    case "add-muse": doAddMuse(); break;
    case "collect-muse": doCollectMuse(t.dataset.handle); break;
    case "remove-muse": { const a = getActiveAccount(); if (a) removeMuse(a.id, t.dataset.handle); break; }
    case "add-product-source": doAddProductSource(); break;
    case "refresh-product-source": doRefreshProductSource(+id); break;
    case "remove-product-source": removeProductSource(+id); break;
    default: break;
  }
}

function onGlobalInput(e) {
  const t = e.target;
  const acc = getActiveAccount();
  const fieldMap = { voiceExamples: "context", voiceRefs: "references", voicePillars: "pillars", productContext: "productContext" };
  if (acc && fieldMap[t.id]) {
    setAccountField(acc.id, fieldMap[t.id], t.value);
    flashSaved();
  }
  if (acc && t.id === "ownPostsContext") {
    setAccountField(acc.id, "ownPosts", t.value.split(/\n\n+/).map((post) => post.trim()).filter(Boolean));
    flashSaved();
  }
  if (acc && t.dataset.role === "product-source-text") {
    updateProductSourceText(acc, +t.dataset.id, t.value);
    flashSaved();
  }
  if (acc && t.dataset.role === "muse-context") {
    setMuseContext(acc.id, t.dataset.handle, t.value);
    flashSaved();
  }
  if (t.dataset.role === "reply-draft") {
    const candidate = uiState.replyCandidates.find((item) => item.id === t.dataset.id);
    if (candidate) candidate.draft = t.value;
  }
  if (acc && t.id === "profileSummary") {
    setProfileSummarySilent(acc.id, t.value);
  }
  if (t.dataset.role === "edit-text") {
    const cnt = t.closest(".tweet, .card").querySelector('[data-role="edit-count"]');
    if (cnt) cnt.textContent = t.value.length + "/280";
  }
  if (t.id === "genTopic") {
    uiState.topic = t.value;
  }
  if (t.id === "apiKey") {
    clearTimeout(keyTimer);
    keyTimer = setTimeout(() => setApiKey(t.value), 500);
  }
}

function onGlobalChange(e) {
  const t = e.target;
  if (t.dataset.role === "setting") {
    const key = t.dataset.key;
    let val = t.type === "checkbox" ? t.checked : t.value;
    if (t.type === "number") val = Math.max(+t.min || 0, Math.min(+t.max || 9999, parseInt(val, 10) || 0));
    if (key === "provider") {
      const prov = providerOf(val);
      updateSettings({ provider: val, model: prov.models[0] ? prov.models[0][0] : "" });
    } else if (key === "baseUrl" && val) {
      updateSettings({ baseUrl: val });
      requestOriginPermission(val);
    } else {
      updateSettings({ [key]: val });
    }
    return;
  }
  if (t.dataset.role === "rename") renameAccount(t.dataset.id, t.value);
  if (t.dataset.role === "acct-handle") doSetHandle(t.dataset.id, t.value);
  if (t.dataset.role === "muse-gen" && getActiveAccount()) setAccountField(getActiveAccount().id, "museInGeneration", t.checked);
  if (t.dataset.role === "edit-trait" && getActiveAccount()) setTraitText(getActiveAccount().id, +t.dataset.id, t.value);
  if (t.id === "profileSummary") { /* handled silently on input */ }
  if (t.dataset.action === "reschedule") {
    const ms = fromLocalInput(t.value);
    updatePost(t.dataset.id, { scheduledFor: ms });
  }
}

function requestOriginPermission(url) {
  try {
    const origin = new URL(url).origin + "/*";
    const permissions = { origins: [origin] };
    return chrome.permissions.contains(permissions).then((granted) =>
      granted ? true : chrome.permissions.request(permissions)
    );
  } catch (e) {
    return Promise.resolve(false);
  }
}

/* ============================ actions ============================ */

/* What generation must not repeat (posted log + live posted/queued/drafts) and
 * what it should steer away from (drafts the author discarded). */
function buildHistory(acc) {
  const posts = accountPosts(acc.id);
  const active = posts
    .filter((p) => p.status === "posted" || p.status === "queued" || p.status === "draft")
    .map((p) => p.text);
  const logged = accountLog(acc.id).map((e) => e.text);
  const recent = Array.from(new Set(logged.concat(active))).slice(-40);
  const discarded = posts.filter((p) => p.status === "discarded").slice(0, 12).map((p) => p.text);
  return { recent, discarded };
}

async function doGenerate() {
  const state = getState();
  const acc = getActiveAccount();
  if (!acc) return;
  if (!state.apiKey) { toast("Add your API key in Settings first", "warn"); setView("settings"); return; }
  uiState.genOptionsOpen = false;
  uiState.generating = true;
  uiState.genError = null;
  render(state);
  try {
    const texts = await generatePosts({ account: acc, count: state.settings.generateCount, settings: state.settings, apiKey: state.apiKey, history: buildHistory(acc), topic: uiState.steerEnabled ? (uiState.topic || "").trim() : "", steerMode: uiState.steerMode, length: acc.generationLength, focus: acc.generationFocus });
    if (!texts.length) { uiState.genError = "Nothing new came back — the model may be repeating existing posts. Try again."; toast(uiState.genError, "warn"); }
    else { addPosts(acc.id, texts); toast("Generated " + texts.length + " post" + (texts.length === 1 ? "" : "s"), "ok"); }
  } catch (err) {
    uiState.genError = err.message || "Generation failed";
    toast(uiState.genError, "error");
  } finally {
    uiState.generating = false;
    render(getState());
  }
}

async function doScanReplies() {
  if (uiState.replyScanning) return;
  uiState.replyScanning = true;
  render(getState());
  try {
    const res = await scanReplyCandidates();
    if (!res || !res.ok) throw new Error((res && res.error) || "Could not scan the active X tab");
    uiState.replyCandidates = (res.items || []).map((item) => ({ ...item, draft: "" }));
    if (!uiState.replyCandidates.length) toast("No reply candidates found - scroll X to posts with text and try again", "warn");
    else toast("Found " + uiState.replyCandidates.length + " posts to review", "ok");
  } catch (e) {
    toast((e && e.message) || "Could not scan visible posts", "error");
  } finally {
    uiState.replyScanning = false;
    render(getState());
  }
}

async function doDraftReply(id) {
  const candidate = uiState.replyCandidates.find((item) => item.id === id);
  const state = getState();
  const acc = getActiveAccount();
  if (!candidate || !acc) return;
  if (!state.apiKey) { toast("Add your API key in Settings first", "warn"); setView("settings"); return; }
  uiState.replyBusyId = id;
  render(state);
  try {
    const draft = await draftReply({ candidate, account: acc, settings: state.settings, apiKey: state.apiKey });
    if (!draft) throw new Error("Reply draft came back empty");
    candidate.draft = draft;
  } catch (e) {
    toast((e && e.message) || "Could not draft a reply", "error");
  } finally {
    uiState.replyBusyId = null;
    render(getState());
  }
}

async function doGenerateReplies() {
  const state = getState();
  const acc = getActiveAccount();
  if (!acc || !uiState.replyCandidates.length || uiState.replyGenerating) return;
  if (!state.apiKey) { toast("Add your API key in Settings first", "warn"); setView("settings"); return; }
  uiState.replyGenerating = true;
  render(state);
  let drafted = 0;
  try {
    for (const candidate of uiState.replyCandidates) {
      uiState.replyBusyId = candidate.id;
      render(getState());
      try {
        const draft = await draftReply({ candidate, account: acc, settings: state.settings, apiKey: state.apiKey });
        if (draft) { candidate.draft = draft; drafted++; }
      } catch (e) {}
    }
    if (drafted) toast("Drafted " + drafted + " repl" + (drafted === 1 ? "y" : "ies") + " for review", "ok");
    else toast("Could not draft replies for these posts", "error");
  } finally {
    uiState.replyGenerating = false;
    uiState.replyBusyId = null;
    render(getState());
  }
}

async function doSendReply(id) {
  const candidate = uiState.replyCandidates.find((item) => item.id === id);
  const acc = getActiveAccount();
  if (!candidate || !acc || !candidate.draft.trim()) return;
  uiState.replyBusyId = id;
  render(getState());
  try {
    const res = await sendReply(candidate.draft, candidate.url, acc.id);
    if (!res || !res.ok) throw new Error((res && res.error) || "Reply failed");
    removeReplyCandidate(id, false);
    toast("Reply sent", "ok");
  } catch (e) {
    toast((e && e.message) || "Could not send reply", "error");
  } finally {
    uiState.replyBusyId = null;
    render(getState());
  }
}

function removeReplyCandidate(id, rerender = true) {
  uiState.replyCandidates = uiState.replyCandidates.filter((item) => item.id !== id);
  if (rerender) render(getState());
}

async function doPostNow(id) {
  const post = getState().posts.find((p) => p.id === id);
  if (!post) return;
  uiState.busyId = id;
  render(getState());
  const res = await postNow(id);
  uiState.busyId = null;
  render(getState());
  if (res && res.ok) toast("Posted", "ok");
  else toast("Could not post: " + (res && res.error ? res.error : "unknown"), "error");
}

async function doRemix(id) {
  const state = getState();
  const post = state.posts.find((p) => p.id === id);
  if (!post) return;
  if (!state.apiKey) { toast("Add your OpenAI key in Settings first", "warn"); setView("settings"); return; }
  uiState.busyId = id;
  render(getState());
  try {
    const acc = getActiveAccount();
    const text = await remixPost({ text: post.text, account: acc, settings: state.settings, apiKey: state.apiKey, history: acc ? buildHistory(acc) : null });
    if (text) { addPosts(post.accountId, [text]); toast("Remixed", "ok"); }
    else toast("Remix came back empty", "warn");
  } catch (err) {
    toast(err.message || "Remix failed", "error");
  } finally {
    uiState.busyId = null;
    render(getState());
  }
}

function doQueue(id) {
  const state = getState();
  const jitter = (state.settings.jitterSeconds || 0) * 1000;
  const base = Date.now() + 3600000;
  const offset = jitter ? Math.floor((Math.random() * 2 - 1) * jitter) : 0;
  updatePost(id, { status: "queued", scheduledFor: base + offset });
  toast("Added to queue", "ok");
}

async function doCopy(id) {
  const post = getState().posts.find((p) => p.id === id);
  if (!post) return;
  try { await navigator.clipboard.writeText(post.text); toast("Copied", "ok"); }
  catch (e) { toast("Copy failed", "error"); }
}

async function doPullPage() {
  const acc = getActiveAccount();
  if (!acc) return;
  toast("Reading tweets from the open x.com tab…", "info");
  const res = await scrapeVisibleInto(acc.id);
  if (res && res.ok) toast("Pulled " + ((res.text || "").trim() ? "tweets into your voice" : "nothing new — scroll a profile first"), res.text ? "ok" : "warn");
  else toast("Open x.com first, then pull", "warn");
}

/* ---------- learned preferences ---------- */

async function doLearnPrefs(auto) {
  const state = getState();
  const acc = getActiveAccount();
  if (!acc || uiState.learning) return;
  if (!state.apiKey) {
    if (!auto) { toast("Add your API key first", "warn"); setView("settings"); }
    return;
  }
  const posts = accountPosts(acc.id);
  const logged = accountLog(acc.id).map((e) => e.text);
  const livePosted = posts.filter((p) => p.status === "posted").map((p) => p.text);
  const posted = Array.from(new Set(logged.concat(livePosted))).slice(-50);
  const discarded = posts.filter((p) => p.status === "discarded").slice(0, 20).map((p) => p.text);
  const edits = (acc.editLog || []).slice(-15);
  if (!posted.length && !discarded.length && !edits.length) {
    if (!auto) toast("No posting history yet — post, edit, or discard a few drafts first", "warn");
    return;
  }
  uiState.learning = true;
  render(state);
  try {
    const traits = await learnPreferences({ posted, discarded, edits, settings: state.settings, apiKey: state.apiKey });
    setLearnedTraits(acc.id, traits, accountLog(acc.id).length);
    if (!auto) toast("Learned " + traits.length + " preference" + (traits.length === 1 ? "" : "s") + " — added to the voice guide", "ok");
  } catch (e) {
    if (!auto) toast(e.message || "Learning failed", "error");
  } finally {
    uiState.learning = false;
    render(getState());
  }
}

/* Auto-distill on dashboard open when the toggle is on and enough new posts
 * accumulated since the last learn. Called once from dashboard.js. */
export function maybeAutoLearn() {
  const state = getState();
  if (!state.settings.autoLearn || !state.apiKey) return;
  const acc = getActiveAccount();
  if (!acc) return;
  const basis = (acc.learnedTraits && acc.learnedTraits.basis) || 0;
  if (accountLog(acc.id).length - basis >= 10) doLearnPrefs(true);
}

/* ---------- account handle ---------- */

async function doSetHandle(id, value) {
  const linking = !!String(value || "").trim();
  if (linking) toast("Linking — fetching the profile picture in a background tab…", "info");
  const res = await setAccountHandle(id, value);
  if (!res || !res.ok) { toast((res && res.error) || "Invalid handle", "warn"); return; }
  if (!res.handle) { toast("Handle unlinked — posting no longer checks the logged-in account", "info"); return; }
  if (res.avatar) toast("Linked @" + res.handle, "ok");
  else toast("Linked @" + res.handle + " — couldn't fetch the profile picture (check the handle and your x.com login)", "warn");
}

/* ---------- muses ---------- */

async function doPullOwn() {
  const acc = getActiveAccount();
  if (!acc || scrapeBusy()) return;
  if (!acc.handle) {
    toast("Link this profile's @handle in Settings first", "warn");
    setView("settings");
    return;
  }
  uiState.pullingOwn = true;
  render(getState());
  toast("Collecting your posts from @" + acc.handle + " in a background tab — takes a minute or two", "info");
  try {
    const res = await collectOwnPosts(acc.id);
    if (res && res.ok && res.count) toast("Added " + res.count + " of your posts to the voice examples", "ok");
    else if (res && res.ok && res.error) toast("Could not reach the X profile: " + res.error, "error");
    else if (res && res.ok) toast("Nothing new found on @" + acc.handle + " — already collected, or check your x.com login", "warn");
    else toast("Collect failed: " + ((res && res.error) || "unknown"), "error");
  } finally {
    uiState.pullingOwn = false;
    render(getState());
  }
}

function doAddMuse() {
  const acc = getActiveAccount();
  const el = document.getElementById("museHandle");
  if (!acc || !el || !el.value.trim()) return;
  const res = addMuse(acc.id, el.value);
  if (!res.ok) { toast(res.error, "warn"); return; }
  doCollectMuse(res.handle);
}

async function doCollectMuse(handle) {
  const acc = getActiveAccount();
  if (!acc || !handle || scrapeBusy()) return;
  uiState.collectingMuse = handle;
  render(getState());
  toast("Collecting @" + handle + " in a background tab — takes ~30s", "info");
  try {
    const res = await collectMuse(acc.id, handle);
    if (res && res.ok && res.count) toast("Collected " + res.count + " from @" + handle, "ok");
    else if (res && res.ok && res.error) toast("Could not reach @" + handle + ": " + res.error, "error");
    else if (res && res.ok) toast("Nothing collected from @" + handle + " — check the handle and that you're logged into x.com", "warn");
    else toast("Collect failed: " + ((res && res.error) || "unknown"), "error");
  } finally {
    uiState.collectingMuse = null;
    render(getState());
  }
}

/* ---------- product sources ---------- */

async function doAddProductSource() {
  const acc = getActiveAccount();
  const input = document.getElementById("productSourceUrl");
  if (!acc || !input || !input.value.trim() || uiState.productFetching) return;
  try {
    const parsed = productSourceUrl(input.value);
    if ((acc.productSources || []).some((source) => source.url === parsed.href)) {
      toast("That page is already included", "warn");
      return;
    }
    const granted = await requestOriginPermission(parsed.href);
    if (!granted) throw new Error("Permission is required to read that product page.");
    uiState.productFetching = true;
    render(getState());
    const source = await fetchProductSource(parsed.href);
    const sources = (acc.productSources || []).concat(source);
    setAccountField(acc.id, "productSources", sources.slice(-6));
    toast("Added product page context", "ok");
  } catch (e) {
    toast((e && e.message) || "Could not read that product page", "error");
  } finally {
    uiState.productFetching = false;
    render(getState());
  }
}

async function doRefreshProductSource(index) {
  const acc = getActiveAccount();
  const source = acc && (acc.productSources || [])[index];
  if (!acc || !source || uiState.productFetching) return;
  try {
    const granted = await requestOriginPermission(source.url);
    if (!granted) throw new Error("Permission is required to refresh that product page.");
    uiState.productFetching = true;
    render(getState());
    const refreshed = await fetchProductSource(source.url);
    const sources = (acc.productSources || []).slice();
    sources[index] = refreshed;
    setAccountField(acc.id, "productSources", sources);
    toast("Product page context refreshed", "ok");
  } catch (e) {
    toast((e && e.message) || "Could not refresh that product page", "error");
  } finally {
    uiState.productFetching = false;
    render(getState());
  }
}

function productSourceUrl(value) {
  let url = String(value || "").trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  const parsed = new URL(url);
  if (!/^https?:$/.test(parsed.protocol)) throw new Error("Use an http or https URL.");
  return parsed;
}

async function fetchProductSource(url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error("Page returned " + response.status + ".");
  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const title = (doc.querySelector("meta[property='og:title']") || {}).content || doc.title || new URL(response.url).hostname;
  const description = [
    (doc.querySelector("meta[name='description']") || {}).content,
    (doc.querySelector("meta[property='og:description']") || {}).content,
  ].filter(Boolean).join(" ");
  const structured = Array.from(doc.querySelectorAll("script[type='application/ld+json']"))
    .map((el) => el.textContent || "")
    .join(" ");
  doc.querySelectorAll("script,style,noscript,svg,nav,footer,form,button").forEach((el) => el.remove());
  const pageText = [doc.querySelector("main"), doc.querySelector("article"), doc.querySelector("[role=main]"), doc.body]
    .filter(Boolean)
    .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
    .sort((a, b) => b.length - a.length)[0] || "";
  const text = [title, description, structured, pageText].filter(Boolean).join("\n\n").slice(0, 12000);
  if (text.length < 80) throw new Error("Could not read enough product text from that page.");
  return { url: response.url, title: title.trim().slice(0, 180), text, fetchedAt: Date.now() };
}

function updateProductSourceText(acc, index, text) {
  if (!Number.isInteger(index) || !(acc.productSources || [])[index]) return;
  const sources = (acc.productSources || []).slice();
  sources[index] = { ...sources[index], text };
  setAccountField(acc.id, "productSources", sources);
}

function removeProductSource(index) {
  const acc = getActiveAccount();
  if (!acc || !Number.isInteger(index)) return;
  setAccountField(acc.id, "productSources", (acc.productSources || []).filter((_source, i) => i !== index));
  render(getState());
}

/* ---------- onboarding ---------- */

async function obNext() {
  const step = uiState.obStep || 0;
  const acc = getActiveAccount();
  if (step === 1) {
    const nameEl = document.getElementById("ob-name");
    if (nameEl && acc) renameAccount(acc.id, (nameEl.value || "My account").trim() || "My account");
    const handleEl = document.getElementById("ob-handle");
    if (handleEl && handleEl.value.trim() && acc) {
      const res = await setAccountHandle(acc.id, handleEl.value);
      if (!res || !res.ok) {
        toast((res && res.error) || "Could not link that X handle", "warn");
        return;
      }
    }
  } else if (step === 2) {
    const provEl = document.getElementById("ob-provider");
    const keyEl = document.getElementById("ob-key");
    const provider = (provEl && provEl.value) || "deepseek";
    const prov = providerOf(provider);
    updateSettings({ provider, model: prov.models[0] ? prov.models[0][0] : "" });
    if (keyEl) setApiKey(keyEl.value);
  } else if (step === 3) {
    const voiceEl = document.getElementById("ob-voice");
    obFinish(voiceEl ? voiceEl.value : "");
    return;
  }
  uiState.obStep = step + 1;
  render(getState());
}

function obFinish(voice, view = "context") {
  const acc = getActiveAccount();
  if (acc && voice != null) persistContext(acc.id, voice);
  uiState.obStep = 0;
  completeOnboarding(view);
}

async function obTest() {
  const provEl = document.getElementById("ob-provider");
  const keyEl = document.getElementById("ob-key");
  const btn = document.getElementById("ob-test-btn");
  const provider = (provEl && provEl.value) || "deepseek";
  const key = keyEl ? keyEl.value.trim() : "";
  if (!key) { toast("Enter your API key first", "warn"); return; }
  if (btn) { btn.disabled = true; btn.textContent = "Testing…"; }
  const prov = providerOf(provider);
  const settings = { ...getState().settings, provider, model: prov.models[0] ? prov.models[0][0] : "" };
  try {
    await testConnection({ settings, apiKey: key });
    toast("Connected — provider is working", "ok");
  } catch (e) {
    toast(e.message || "Connection failed", "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Test connection"; }
  }
}

async function doTestConnection() {
  const state = getState();
  const keyEl = document.getElementById("apiKey");
  const key = keyEl ? keyEl.value.trim() : state.apiKey;
  if (key) setApiKey(key);
  toast("Testing connection…", "info");
  try {
    await testConnection({ settings: getState().settings, apiKey: key });
    toast("Connected — provider is working", "ok");
  } catch (e) {
    toast(e.message || "Connection failed", "error");
  }
}

/* ---------- voice profile ---------- */

async function doGenerateProfile() {
  const state = getState();
  const acc = getActiveAccount();
  if (!acc) return;
  if (!state.apiKey) { toast("Add your API key first", "warn"); setView("settings"); return; }
  uiState.genProfile = true;
  uiState.preview = null;
  render(state);
  try {
    const profile = await generateProfile({ account: acc, settings: state.settings, apiKey: state.apiKey });
    if (!profile.summary && !profile.traits.length) {
      toast("Could not derive a profile — add more source material", "warn");
    } else {
      setProfile(acc.id, profile);
      toast("Voice profile generated — review the traits", "ok");
    }
  } catch (e) {
    toast(e.message || "Profile generation failed", "error");
  } finally {
    uiState.genProfile = false;
    render(getState());
  }
}

async function doPreviewVoice() {
  const state = getState();
  const acc = getActiveAccount();
  if (!acc || !acc.profile) return;
  if (!state.apiKey) { toast("Add your API key first", "warn"); setView("settings"); return; }
  uiState.previewing = true;
  uiState.preview = null;
  render(state);
  try {
    const sample = await previewPost({ account: acc, settings: state.settings, apiKey: state.apiKey });
    uiState.preview = sample || null;
    if (!sample) toast("Could not write a sample", "warn");
  } catch (e) {
    toast(e.message || "Preview failed", "error");
  } finally {
    uiState.previewing = false;
    render(getState());
  }
}

function doConfirmVoice() {
  const acc = getActiveAccount();
  if (!acc || !acc.profile) return;
  const sumEl = document.getElementById("profileSummary");
  if (sumEl) setProfileSummarySilent(acc.id, sumEl.value);
  const p = acc.profile;
  const hasAny = (p.summary || "").trim() || (p.traits || []).some((t) => t.included && (t.text || "").trim());
  if (!hasAny) { toast("Add a summary or at least one trait first", "warn"); return; }
  confirmProfile(acc.id);
  toast("Voice saved — generation will use it", "ok");
}

function saveEdit(id) {
  const ta = document.querySelector('[data-role="edit-text"]');
  if (!ta) return;
  const text = ta.value.trim().slice(0, 280);
  const post = getState().posts.find((p) => p.id === id);
  if (post && post.text !== text) logEdit(post.accountId, post.text, text);
  uiState.editingId = null;
  updatePost(id, { text });
}

function focusEdit() {
  setTimeout(() => {
    const ta = document.querySelector('[data-role="edit-text"]');
    if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  }, 0);
}

function revealKey(targetId) {
  const el = document.getElementById(targetId);
  if (!el) return;
  el.type = el.type === "password" ? "text" : "password";
}

/* ============================ helpers ============================ */

let keyTimer = null;
function flashSaved() {
  const flag = document.getElementById("savedFlag");
  if (!flag) return;
  flag.classList.add("show");
  clearTimeout(flashSaved._t);
  flashSaved._t = setTimeout(() => flag.classList.remove("show"), 1200);
}

function toLocalInput(ms) {
  const d = new Date(ms);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}
function fromLocalInput(val) {
  if (!val) return Date.now() + 3600000;
  return new Date(val).getTime();
}

function escapeText(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) { return escapeText(s).replace(/"/g, "&quot;"); }

/* ============================ toast ============================ */

let toastTimer = null;
export function toast(msg, tone) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.className = "toast " + (tone || "info");
  el.innerHTML = `<span class="toast-dot"></span><span>${escapeText(msg)}</span>`;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3500);
}
