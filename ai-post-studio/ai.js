const PROVIDERS = {
  deepseek: {
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    thinking: true,
    keyUrl: "https://platform.deepseek.com/api_keys",
    models: [
      ["deepseek-v4-flash", "V4 Flash  ·  cheapest, fast"],
      ["deepseek-v4-pro", "V4 Pro  ·  stronger"],
    ],
  },
  openai: {
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    thinking: false,
    keyUrl: "https://platform.openai.com/api-keys",
    models: [
      ["gpt-4o-mini", "GPT-4o mini  ·  fast, cheap"],
      ["gpt-4o", "GPT-4o  ·  best voice"],
      ["gpt-4.1-mini", "GPT-4.1 mini"],
      ["gpt-4.1", "GPT-4.1"],
    ],
  },
  custom: {
    label: "Custom (OpenAI-compatible)",
    baseUrl: "",
    thinking: false,
    keyUrl: "",
    models: [],
  },
};

export function getProviders() {
  return PROVIDERS;
}

export function providerOf(name) {
  return PROVIDERS[name] || PROVIDERS.deepseek;
}

export async function generatePosts({ account, count, settings, apiKey, signal, history, topic, length, focus }) {
  if (!apiKey) throw new Error("Add your API key in Settings to generate posts.");
  const examples = sampleExamples(voiceExamplesFrom(account), 12000);
  const voiceGuide = voiceGuideFrom(account);
  const styleRefs = account && account.museInGeneration ? museBlocks(account, 5, 3).join("\n\n") : "";
  const focusMode = ["voice", "balanced", "product"].includes(focus) ? focus : "balanced";
  const rawProductContext = productContextFrom(account);
  if (focusMode === "product" && !rawProductContext) throw new Error("Add product context before generating a product-focused batch.");
  const productContext = focusMode === "voice" ? "" : rawProductContext;
  const charLimit = length === "concise" ? 140 : 280;
  // Over-ask so the dedupe filter below can drop repeats and still fill the request.
  const ask = Math.min(12, count + 2);
  const messages = buildMessages({ examples, voiceGuide, styleRefs, productContext, history, topic, count: ask, tone: settings.tone, mode: "generate", charLimit, focus: focusMode });
  const data = await call({ apiKey, settings, messages, temperature: 0.85, signal, json: true });
  const texts = parseArray(data).map((text) => clean(text, charLimit));
  // Last line of defense: drop anything that reproduces an example or history.
  const knowns = examples.split(/\n\n+/).concat((history && history.recent) || []);
  return dedupeAgainst(texts, knowns).slice(0, count);
}

function normalizeText(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function dedupeAgainst(texts, knowns) {
  const norms = knowns.map(normalizeText).filter(Boolean);
  return texts.filter((t) => {
    const n = normalizeText(t);
    if (!n) return false;
    return !norms.some((k) => k === n || (n.length > 40 && (k.includes(n) || n.includes(k))));
  });
}

export async function remixPost({ text, account, settings, apiKey, signal, history }) {
  if (!apiKey) throw new Error("Add your API key in Settings to remix.");
  const examples = sampleExamples(voiceExamplesFrom(account), 12000);
  const messages = buildMessages({
    text,
    examples,
    voiceGuide: voiceGuideFrom(account),
    productContext: productContextFrom(account),
    history,
    tone: settings.tone,
    mode: "remix",
  });
  const data = await call({ apiKey, settings, messages, temperature: 0.8, signal });
  const t = clean((data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "");
  // A remix that lands on an example or an already-posted item is a repeat, not a remix.
  const knowns = examples.split(/\n\n+/).concat((history && history.recent) || []).filter((k) => k !== text);
  const [ok] = dedupeAgainst([t.slice(0, 280)], knowns);
  return ok || "";
}

/* Generate one sample post from the (possibly unconfirmed) current profile,
 * so the user can judge whether the voice aligns before committing. */
export async function previewPost({ account, settings, apiKey, signal }) {
  const a = Object.assign({}, account, { profileConfirmed: true });
  const texts = await generatePosts({ account: a, count: 1, settings, apiKey, signal });
  return texts[0] || "";
}

export async function generateProfile({ account, settings, apiKey, signal }) {
  if (!apiKey) throw new Error("Add your API key in Settings first.");
  const examples = voiceExamplesFrom(account);
  const museRefs = museBlocks(account, 15, 8).join("\n\n");
  const refs = [((account && account.references) || "").trim(), museRefs].filter(Boolean).join("\n\n");
  const pillars = ((account && account.pillars) || "").trim();
  if (!examples && !refs && !pillars) throw new Error("Add some posts, references, or topics first.");

  const user = [
    "Characterize this author's voice as a concise, actionable style guide.",
    'Return JSON only: {"summary": string, "traits": string[]}.',
    "- summary: 1–2 sentences capturing the overall voice.",
    "- traits: 4–7 discrete one-sentence style statements covering cadence, vocabulary, tone, formatting, and do/don't. Be specific and observational, never generic.",
    "",
    "YOUR POSTS:\n" + (examples || "(none)"),
    "VOICES TO EMULATE:\n" + (refs || "(none)"),
    "TOPICS:\n" + (pillars || "(none)"),
  ].join("\n");

  const data = await call({
    apiKey, settings, temperature: 0.5, signal, json: true,
    messages: [
      { role: "system", content: "You are an expert editor who captures a writer's voice precisely and concisely. Always respond with valid JSON." },
      { role: "user", content: user },
    ],
  });
  const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
  let obj;
  try { obj = JSON.parse(content); } catch (e) {
    const m = content.match(/\{[\s\S]*\}/);
    if (m) { try { obj = JSON.parse(m[0]); } catch (e2) {} }
  }
  if (!obj || typeof obj !== "object") {
    console.warn("[XTools AI Post Studio] could not parse voice profile. Raw content:\n", content);
    throw new Error("Could not parse the voice profile — try again.");
  }
  const summary = String(obj.summary || "").trim();
  const traits = Array.isArray(obj.traits)
    ? obj.traits.map((t) => ({ text: String(t).trim(), included: true })).filter((t) => t.text)
    : [];
  return { summary, traits };
}

/* Sample grounding examples for generation. Pulled posts append to the END of
 * the corpus, so a head-only trim would starve generation of the newest
 * material once the corpus outgrows the budget — alternate newest (tail) and
 * oldest (head) until the budget is spent. Profile generation is not sampled;
 * distillation wants the full set. */
function sampleExamples(text, max) {
  if (!text || text.length <= max) return text;
  const chunks = text.split(/\n\n+/).filter((c) => c.trim());
  const picked = [];
  let len = 0;
  let head = 0;
  let tail = chunks.length - 1;
  let takeTail = true;
  while (head <= tail) {
    const c = takeTail ? chunks[tail--] : chunks[head++];
    if (len + c.length > max) break;
    picked.push(c);
    len += c.length + 2;
    takeTail = !takeTail;
  }
  return picked.join("\n\n");
}

/* Bound a text block on blank-line boundaries, never mid-post. */
function trimChunks(text, max) {
  if (!text || text.length <= max) return text;
  const out = [];
  let len = 0;
  for (const c of text.split(/\n\n+/)) {
    if (len + c.length > max) break;
    out.push(c);
    len += c.length + 2;
  }
  return out.join("\n\n");
}

/* Format collected muse content into labeled per-handle blocks. Posts and
 * replies are labeled separately — reply register usually differs. */
function museBlocks(account, tweetsPer, repliesPer) {
  const muses = (account && account.muses) || [];
  const out = [];
  muses.forEach((m) => {
    if (typeof m.context === "string" && m.context.trim()) {
      out.push("@" + m.handle + ":\n" + trimChunks(m.context.trim(), 6000));
      return;
    }
    const tweets = (m.tweets || []).slice(0, tweetsPer);
    const replies = (m.replies || []).slice(0, repliesPer);
    if (!tweets.length && !replies.length) return;
    let block = "@" + m.handle + ":";
    if (tweets.length) block += "\nPosts:\n" + tweets.join("\n---\n");
    if (replies.length) block += "\nReplies:\n" + replies.join("\n---\n");
    out.push(block);
  });
  return out;
}

/* Build the voice-guide string fed into generation. The confirmed profile is
 * gated on user review; learned preferences (auto-distilled from posting
 * history) are appended as their own section and work either way. */
function voiceGuideFrom(account) {
  let out = "";
  if (account && account.profileConfirmed && account.profile) {
    const p = account.profile;
    const traits = (p.traits || []).filter((t) => t.included && (t.text || "").trim()).map((t) => "- " + t.text.trim()).join("\n");
    out = (p.summary || "").trim();
    if (traits) out += (out ? "\n\n" : "") + traits;
  }
  const learned = ((account && account.learnedTraits && account.learnedTraits.traits) || [])
    .filter((t) => (t || "").trim())
    .map((t) => "- " + t.trim())
    .join("\n");
  if (learned) out += (out ? "\n\n" : "") + "Preferences learned from what the author actually posts, edits, and rejects:\n" + learned;
  return out.trim();
}

function voiceExamplesFrom(account) {
  const personal = ((account && account.context) || "").trim();
  const pulled = ((account && account.ownPosts) || []).map((post) => String(post || "").trim()).filter(Boolean).join("\n\n");
  return [personal, pulled].filter(Boolean).join("\n\n");
}

/* Product context is factual grounding, never voice material. Keep it bounded
 * so a handful of pages cannot crowd out the author's own writing examples. */
function productContextFrom(account) {
  const manual = ((account && account.productContext) || "").trim();
  const sources = ((account && account.productSources) || [])
    .map((source) => {
      const text = String(source && source.text || "").trim();
      if (!text) return "";
      return "Source: " + (source.title || source.url || "Product page") + "\n" + text;
    })
    .filter(Boolean)
    .join("\n\n");
  return trimChunks([manual, sources].filter(Boolean).join("\n\n"), 14000);
}

/* Distill posting preferences from revealed behavior: what got posted, what
 * got discarded, and how drafts were edited before posting. */
export async function learnPreferences({ posted, discarded, edits, settings, apiKey, signal }) {
  if (!apiKey) throw new Error("Add your API key in Settings first.");
  if (!posted.length && !discarded.length && !edits.length) throw new Error("No posting history to learn from yet.");

  const editLines = edits.map((e) => "BEFORE: " + e.from + "\nAFTER: " + e.to).join("\n---\n");
  const user = [
    "Compare what this author actually posted against what they rejected or reworded.",
    'Return JSON only: {"traits": string[]} — 3 to 6 one-sentence preference statements.',
    "Each trait states something the author demonstrably prefers or avoids (topics, angles, formats, length, openers, punctuation). Only claim what the evidence shows; never invent. Do not restate their writing style — that is covered elsewhere — focus on CHOICES.",
    "",
    "POSTED (approved by the author):\n" + (trimChunks(posted.join("\n\n"), 8000) || "(none)"),
    "DISCARDED (rejected drafts):\n" + (trimChunks(discarded.join("\n\n"), 3000) || "(none)"),
    "EDITED BEFORE POSTING (draft → final):\n" + (trimChunks(editLines, 3000) || "(none)"),
  ].join("\n");

  const data = await call({
    apiKey, settings, temperature: 0.4, signal, json: true,
    messages: [
      { role: "system", content: "You are an editor who infers a writer's preferences from their choices. Always respond with valid JSON." },
      { role: "user", content: user },
    ],
  });
  const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
  let obj;
  try { obj = JSON.parse(content); } catch (e) {
    const m = content.match(/\{[\s\S]*\}/);
    if (m) { try { obj = JSON.parse(m[0]); } catch (e2) {} }
  }
  const traits = obj && Array.isArray(obj.traits)
    ? obj.traits.map((t) => String(t).trim()).filter(Boolean).slice(0, 6)
    : [];
  if (!traits.length) throw new Error("Could not distill preferences — try again with more history.");
  return traits;
}

export async function testConnection({ settings, apiKey }) {
  if (!apiKey) throw new Error("Add your API key first.");
  const messages = [
    { role: "system", content: "Reply with exactly: ok" },
    { role: "user", content: "ping" },
  ];
  await call({ apiKey, settings, messages, temperature: 0 });
  return true;
}

function buildMessages({ examples, voiceGuide, styleRefs, productContext, history, topic, count, tone, mode, text, charLimit = 280, focus = "balanced" }) {
  const sys = [
    "You are a ghostwriter that matches an author's voice precisely.",
    "You write short social posts (max " + charLimit + " characters) that read like the author wrote them.",
    "Never invent facts, quotes, mentions, links, or events. Stay original and evergreen.",
    "Example posts show HOW the author writes — never copy, paraphrase, or lightly reword any example. Every post must be a genuinely new idea.",
    tone && tone !== "natural" ? "Lean the tone " + tone + "." : "Keep the tone natural.",
  ].join(" ");

  if (mode === "remix") {
    const parts = ["Rewrite this post in a fresh way — a different angle, hook, or structure — while keeping the author's voice and meaning."];
    if (voiceGuide) parts.push("Voice guide to follow:\n\"\"\"\n" + voiceGuide + "\n\"\"\"");
    if (productContext) parts.push("Product facts to preserve. Do not invent beyond these facts:\n\"\"\"\n" + productContext + "\n\"\"\"");
    parts.push("Keep it under 280 characters. Return ONLY the rewritten post text (no quotes, no labels, no preamble).");
    parts.push("", "ORIGINAL POST:", text);
    if (examples) parts.push("\nGROUNDING EXAMPLES:\n" + examples);
    if (history && history.recent && history.recent.length) {
      parts.push("\nThe rewrite must not match anything already posted:\n" + trimChunks(history.recent.join("\n\n"), 4000));
    }
    return [
      { role: "system", content: sys },
      { role: "user", content: parts.join("\n") },
    ];
  }

  const parts = [];
  if (voiceGuide) parts.push("Write strictly within this voice guide:\n\"\"\"\n" + voiceGuide + "\n\"\"\"");
  if (examples) parts.push("Grounding examples of the voice — voice reference only, their content is off-limits:\n\"\"\"\n" + examples + "\n\"\"\"");
  else if (!voiceGuide) parts.push("No examples provided. Write in a clean, confident, original voice.");
  if (styleRefs) parts.push("Style references from other authors — borrow cadence, structure, and energy only. Never their identity, topics, claims, or specific phrasings:\n\"\"\"\n" + styleRefs + "\n\"\"\"");
  if (productContext) parts.push("Product context is factual grounding only. Use it when relevant, never invent claims beyond it, and do not treat it as voice material:\n\"\"\"\n" + productContext + "\n\"\"\"");
  if (history && history.recent && history.recent.length) {
    parts.push("The author already posted or queued these — never repeat, paraphrase, or re-angle any of them:\n\"\"\"\n" + trimChunks(history.recent.join("\n\n"), 6000) + "\n\"\"\"");
  }
  if (history && history.discarded && history.discarded.length) {
    parts.push("The author rejected these drafts — avoid similar angles and phrasing:\n\"\"\"\n" + trimChunks(history.discarded.join("\n\n"), 2000) + "\n\"\"\"");
  }
  parts.push("");
  if (focus === "voice") parts.push("Focus this batch on the author's own perspective, ideas, and voice. Do not make product-led posts.");
  if (focus === "product") parts.push("Focus every post on the product context: concrete value, audience problems, use cases, or the product-building journey. Keep the author's voice; do not invent claims.");
  if (topic) parts.push("For this batch, write about: " + topic + ". Stay strictly within the voice.");
  parts.push("Write " + count + " new original post" + (count === 1 ? "" : "s") + " in this voice. Each standalone, under " + charLimit + " characters, matching the voice" + (topic ? " and the requested topic" : " and topics above") + ".");
  parts.push('Return strict JSON: {"posts": ["…", "…"]} — an object whose "posts" key holds the post strings. No markdown fences, no commentary.');
  return [
    { role: "system", content: sys },
    { role: "user", content: parts.join("\n\n") },
  ];
}

async function call({ apiKey, settings, messages, temperature, signal, json }) {
  const provider = providerOf(settings.provider);
  const baseUrl =
    (settings.provider === "custom" && settings.baseUrl ? settings.baseUrl : provider.baseUrl) || provider.baseUrl;
  const model = settings.model || (provider.models[0] && provider.models[0][0]) || "";
  if (!baseUrl) throw new Error("No API base URL set. Add one in Settings.");
  const endpoint = baseUrl.replace(/\/$/, "") + "/chat/completions";

  const body = { model, temperature, messages };
  // DeepSeek defaults to thinking mode, which ignores temperature and wastes tokens
  // on short copy. Force non-thinking so temperature works and cost stays minimal.
  if (provider.thinking) body.thinking = { type: "disabled" };
  // Force guaranteed-JSON output for the calls that parse structured results.
  if (json) body.response_format = { type: "json_object" };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  if (signal) signal.addEventListener("abort", () => ctrl.abort());
  let res;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (e && e.name === "AbortError") {
      throw new Error("Request timed out — verify your key, provider, and Base URL in Settings.");
    }
    throw new Error("Network error reaching " + (provider.label || "the API") + " (is the host allowed?): " + ((e && e.message) || e));
  }
  clearTimeout(timer);
  if (!res.ok) {
    let detail = "";
    let raw = "";
    try {
      const j = await res.json();
      detail = (j && j.error && j.error.message) || "";
      raw = JSON.stringify(j).slice(0, 500);
    } catch (e) {}
    console.warn("[XTools AI Post Studio] request failed", res.status, endpoint, "\nbody:", body, "\nresponse:", raw);
    throw new Error((provider.label || "API") + " " + res.status + ": " + (detail || res.statusText));
  }
  return res.json();
}

/* json_object mode guarantees an object, but models still vary the shape:
 * {"posts": [...]}, some other key, an object of numbered strings, or (without
 * the format flag honored) a bare array. Accept all of them. */
function parseArray(data) {
  const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
  let val = null;
  try { val = JSON.parse(content); } catch (e) {
    const m = content.match(/\[[\s\S]*\]/) || content.match(/\{[\s\S]*\}/);
    if (m) { try { val = JSON.parse(m[0]); } catch (e2) {} }
  }
  let arr = null;
  if (Array.isArray(val)) arr = val;
  else if (val && typeof val === "object") {
    arr = Array.isArray(val.posts) ? val.posts : Object.values(val).find(Array.isArray);
    if (!arr) {
      const strs = Object.values(val).filter((s) => typeof s === "string" && s.trim());
      if (strs.length) arr = strs;
    }
  }
  if (!Array.isArray(arr)) {
    console.warn("[XTools AI Post Studio] could not parse posts array. Raw content:\n", content);
    return [];
  }
  return arr
    .map((s) => (typeof s === "string" ? s : s && typeof s === "object" ? String(s.text || s.post || s.content || "") : ""))
    .filter((s) => s.trim());
}

function clean(s, charLimit = 280) {
  return String(s).trim().replace(/^["'“”\s]+|["'“”\s]+$/g, "").slice(0, charLimit);
}
