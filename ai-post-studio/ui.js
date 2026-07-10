import {
  getState, getActiveAccount, setView, setActiveAccount, addAccount,
  renameAccount, deleteAccount, persistContext, accountPosts, addPosts,
  updatePost, removePost, postNow, scrapeVisibleInto, setApiKey, updateSettings,
  applyTheme, setTheme, completeOnboarding, setAccountField, setProfile,
  setProfileSummarySilent, toggleTrait, setTraitText, removeTrait, addTrait,
  confirmProfile, addMuse, removeMuse, collectMuse, MAX_MUSES, setAccountHandle,
  collectOwnPosts, accountLog, logEdit, setLearnedTraits, clearLearnedTraits,
} from "./store.js";
import { generatePosts, remixPost, testConnection, previewPost, generateProfile, learnPreferences, getProviders, providerOf } from "./ai.js";
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
      <div class="ob-brand">${ic.logo(36)}</div>
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
      <p class="ob-sub">Build a voice, generate on-brand posts, and post or queue them — without a $100/mo API. Takes about a minute.</p>
      <button class="btn-primary ob-cta" data-action="ob-next">Get started</button>`;
  }
  if (step === 1) {
    return `
      <h2>Name this profile</h2>
      <p class="ob-sub">Each profile holds its own voice, feed, and queue. You can add more later.</p>
      <input class="input" id="ob-name" value="${escapeAttr((acc && acc.name) || "My account")}">
      <div class="ob-actions">
        <button class="btn-ghost" data-action="ob-back">Back</button>
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
        <button class="btn-ghost" id="ob-test-btn" data-action="ob-test">Test connection</button>
        <button class="btn-primary" data-action="ob-next">Continue</button>
      </div>`;
  }
  const ctx = (acc && acc.context) || "";
  return `
    <h2>Start your voice</h2>
    <p class="ob-sub">Paste a few posts now, then continue to the full Voice studio to pull from your @handle, add reference accounts, generate a profile, preview it, and make it yours.</p>
    <textarea class="voice-area" id="ob-voice" placeholder="Paste example posts, separated by a blank line…">${escapeText(ctx)}</textarea>
    <div class="ob-actions">
      <button class="btn-ghost" data-action="ob-back">Back</button>
      <button class="btn-ghost" data-action="ob-skip">Set up later</button>
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
      <div class="brand-inline">${ic.logo(20)}<span>XTools / AI Post Studio</span></div>
      <div class="top-actions">
        <button class="btn-icon topbar-theme" data-action="toggle-theme" title="Toggle theme">${themeIcon}</button>
        ${accountSwitcher(state, acc)}
      </div>
    </div>
    <nav class="tabs">
      ${tab("feed", "Feed")}
      ${tab("queue", queued > 0 ? `Queue<span class="tab-count">${queued}</span>` : "Queue")}
      ${tab("voice", "Voice")}
      ${tab("settings", "Settings")}
    </nav>
    <div class="top-sub">${subtitleFor(state, acc)}</div>`;
}

function subtitleFor(state, acc) {
  if (state.view === "feed") {
    const n = accountPosts(acc && acc.id).filter((p) => p.status === "draft").length;
    return n ? n + " draft" + (n === 1 ? "" : "s") + " ready" : "Generated posts land here";
  }
  if (state.view === "queue") {
    const n = state.posts.filter((p) => p.status === "queued").length;
    return n ? n + " scheduled" + (n === 1 ? "" : "s") : "Scheduled posts fire automatically";
  }
  if (state.view === "voice") return "Teach AI Post Studio how you write";
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
    case "queue": html = viewQueue(state, acc); break;
    case "voice": html = viewVoice(state, acc); break;
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
      </div>
    </div>
    <div class="gen-steer">
      <input class="input" id="genTopic" placeholder="Steer this batch (optional) — a topic, angle, or idea" value="${escapeAttr(uiState.topic || "")}">
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

function viewVoice(state, acc) {
  if (!acc) return `<div class="wrap"></div>`;
  const examples = acc.context || "";
  const refs = acc.references || "";
  const pillars = acc.pillars || "";
  const rich = voiceRichness(examples);

  const sources = `
    <section class="panel">
      <div class="panel-head">
        <h2><span class="sec-ico">${ic.voice(18)}</span>Voice sources</h2>
        <span class="richness ${rich.cls}"><span class="rdot"></span>${rich.label} source</span>
      </div>
      <div class="panel-body">
        <label class="field">
          <div class="field-row">
            <span class="field-label">Your posts</span>
            <button class="btn-ghost sm" data-action="pull-own" ${scrapeBusy() ? "disabled" : ""}>
              ${ic.remix(14)}<span>${uiState.pullingOwn ? "Collecting…" : acc.handle ? "Pull from @" + escapeText(acc.handle) : "Pull from your @handle"}</span>
            </button>
          </div>
          <textarea class="voice-area" id="voiceExamples" placeholder="Paste 3–10 of your own posts, separated by a blank line — or pull them from your linked @handle…">${escapeText(examples)}</textarea>
        </label>
        <div class="grid2">
          <label class="field">
            <span class="field-label">Voices to emulate</span>
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

  return `<div class="wrap">${sources}${profile}${learnedPanel(state, acc)}</div>`;
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
    return `<div class="muse ${busy ? "busy" : ""}">
      <span class="muse-handle">@${escapeText(m.handle)}</span>
      <span class="muse-meta">${escapeText(meta)}</span>
      <button class="btn-icon" data-action="collect-muse" data-handle="${escapeAttr(m.handle)}" title="${m.fetchedAt ? "Refresh" : "Collect"} posts & replies" ${scrapeBusy() ? "disabled" : ""}>${busy ? ic.clock(16) : ic.remix(16)}</button>
      <button class="btn-icon danger" data-action="remove-muse" data-handle="${escapeAttr(m.handle)}" title="Remove" ${busy ? "disabled" : ""}>${ic.trash(16)}</button>
    </div>`;
  }).join("");
  const addRow = muses.length < MAX_MUSES
    ? `<div class="key-row">
        <input class="input" id="museHandle" placeholder="@handle or profile URL">
        <button class="btn-ghost sm" data-action="add-muse">${ic.plus(16)}<span>Add</span></button>
      </div>`
    : "";
  const hasContent = muses.some((m) => (m.tweets || []).length || (m.replies || []).length);
  const toggle = hasContent
    ? `<label class="check">
        <input type="checkbox" data-role="muse-gen" ${acc.museInGeneration ? "checked" : ""}>
        <span>Also feed reference samples directly into generation (heavier mimicry — can dilute your own voice)</span>
      </label>`
    : "";
  return `<div class="field">
    <span class="field-label">Additional voice context — up to ${MAX_MUSES} X accounts</span>
    ${chips ? `<div class="muses">${chips}</div>` : ""}
    ${addRow}
    <span class="field-hint">AI Post Studio opens their profile in a background tab and collects recent posts + replies as "voices to emulate" for the profile. You must be logged into x.com.</span>
    ${toggle}
  </div>`;
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
    ${section("Pith migration", ic.external(18), `
      <label class="field">
        <span class="field-label">Import a Pith backup</span>
        <input class="input" id="pithImport" type="file" accept="application/json,.json">
        <span class="field-hint">Export the backup from Pith's popup first. Importing replaces this studio's accounts, drafts, queue, voice material, posting history, and API key. The backup file is sensitive; delete it after confirming the migration.</span>
      </label>
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
  });
}

function onGlobalClick(e) {
  const t = e.target.closest("[data-action]");
  if (!t) {
    if (uiState.menuOpen && !e.target.closest(".acct")) { uiState.menuOpen = false; render(getState()); }
    return;
  }
  const action = t.dataset.action;
  const id = t.dataset.id;

  switch (action) {
    case "nav": setView(t.dataset.view); uiState.menuOpen = false; break;
    case "toggle-menu": uiState.menuOpen = !uiState.menuOpen; render(getState()); break;
    case "select-account": setActiveAccount(id); uiState.menuOpen = false; break;
    case "new-account": addAccount("New account"); break;
    case "goto-settings": setView("settings"); uiState.menuOpen = false; break;
    case "goto-voice": setView("voice"); break;
    case "generate": doGenerate(); break;
    case "count-inc": updateSettings({ generateCount: Math.min(10, (getState().settings.generateCount || 5) + 1) }); break;
    case "count-dec": updateSettings({ generateCount: Math.max(1, (getState().settings.generateCount || 5) - 1) }); break;
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
    case "ob-skip": obFinish(null); break;
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
    default: break;
  }
}

function onGlobalInput(e) {
  const t = e.target;
  const acc = getActiveAccount();
  const fieldMap = { voiceExamples: "context", voiceRefs: "references", voicePillars: "pillars" };
  if (acc && fieldMap[t.id]) {
    setAccountField(acc.id, fieldMap[t.id], t.value);
    flashSaved();
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
  if (t.id === "pithImport") {
    importPithBackup(t.files && t.files[0]);
    t.value = "";
    return;
  }
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
    chrome.permissions.request({ origins: [origin] }, () => {});
  } catch (e) {}
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
  uiState.generating = true;
  uiState.genError = null;
  render(state);
  try {
    const texts = await generatePosts({ account: acc, count: state.settings.generateCount, settings: state.settings, apiKey: state.apiKey, history: buildHistory(acc), topic: (uiState.topic || "").trim() });
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
    else if (res && res.ok) toast("Nothing collected from @" + handle + " — check the handle and that you're logged into x.com", "warn");
    else toast("Collect failed: " + ((res && res.error) || "unknown"), "error");
  } finally {
    uiState.collectingMuse = null;
    render(getState());
  }
}

/* ---------- Pith migration ---------- */

async function importPithBackup(file) {
  if (!file) return;
  if (!window.confirm("Import this Pith backup? It replaces the current AI Post Studio accounts, drafts, queue, voice material, posting history, and API key.")) return;
  try {
    const backup = JSON.parse(await file.text());
    const data = backup && backup.format === "pith-backup" && backup.version === 1 ? backup.data : null;
    if (!data || !Array.isArray(data.accounts) || !Array.isArray(data.posts)) {
      throw new Error("This is not a valid Pith backup.");
    }
    const accounts = data.accounts;
    const activeAccountId = accounts.some((account) => account.id === data.activeAccountId)
      ? data.activeAccountId
      : (accounts[0] && accounts[0].id) || null;
    await chrome.storage.local.set({
      accounts,
      posts: data.posts,
      postLogs: data.postLogs && typeof data.postLogs === "object" ? data.postLogs : {},
      settings: { ...(data.settings || {}), onboarded: true },
      apiKey: typeof data.apiKey === "string" ? data.apiKey : "",
      activeAccountId,
      pendingScrapes: Array.isArray(data.pendingScrapes) ? data.pendingScrapes : [],
    });
    setView("voice");
    toast("Pith backup imported. Review your voice profile before generating.", "ok");
  } catch (e) {
    toast((e && e.message) || "Could not import the Pith backup", "error");
  }
}

/* ---------- onboarding ---------- */

function obNext() {
  const step = uiState.obStep || 0;
  const acc = getActiveAccount();
  if (step === 1) {
    const nameEl = document.getElementById("ob-name");
    if (nameEl && acc) renameAccount(acc.id, (nameEl.value || "My account").trim() || "My account");
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

function obFinish(voice) {
  const acc = getActiveAccount();
  if (acc && voice != null) persistContext(acc.id, voice);
  uiState.obStep = 0;
  completeOnboarding("voice");
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
