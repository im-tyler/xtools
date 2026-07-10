# XTools

A Manifest V3 browser extension: full-page screenshots, Grok conversation export, Clean X, and an AI Post Studio for X/Twitter.

![License](https://img.shields.io/badge/license-MIT-blue)
![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-4285F4)
![Status](https://img.shields.io/badge/status-beta-green)

## Features

Four tools, one extension:

- **Full Page Screenshot** — capture an entire page (any site) as a single stitched image, not just the visible viewport. Scrolls, captures, and stitches automatically with a progress indicator.
- **Grok Export** — export your Grok conversations as Markdown or HTML. Includes scan, a download queue, and a "delete all chats" action.
- **Clean X** — a distraction-free X/Twitter: default to the Following tab, and hide suggested content, inline prompts, the sidebar, trending, who-to-follow, engagement metrics, Grok/Jobs/Communities/Articles nav, Premium upsells, and verified badges — each toggleable.
- **AI Post Studio** — create per-account voice profiles, generate and remix original posts with your own OpenAI-compatible API key, review or edit drafts, collect reference-account writing, and post immediately or schedule a rate-limited queue. Posts use your logged-in X browser session; no X API plan is required.

## Install (load unpacked)

1. Clone this repo.
2. Open `chrome://extensions` (or `brave://extensions`).
3. Enable **Developer mode**.
4. Click **Load unpacked** and select this folder.

Full-page screenshot works on any site (via `activeTab`); Grok Export, Clean X, and AI Post Studio target X/Twitter. Open AI Post Studio from the XTools popup.

## How it works

| File | Role |
|---|---|
| `content/twitter.js` | content script on x.com/twitter.com — Clean X DOM tweaks + Grok helpers |
| `content/ai-post-studio.js` | content script on x.com/twitter.com — compose posts and collect profile writing |
| `background.js` / `ai-post-studio/background.js` | the MV3 service worker and its AI Post Studio module — screenshots, downloads, posting, scraping, and queue alarms |
| `ai-post-studio/` | full-page AI Post Studio dashboard (vanilla JS + CSS) |
| `popup.html` / `popup.js` | popup UI (screenshot, AI Post Studio, Grok Export, Clean X settings) |
| `manifest.json` | MV3 manifest |

## Permissions

| Permission | Why |
|---|---|
| `activeTab`, `tabs` | read/modify the current page for screenshots and Clean X |
| `scripting` | inject content scripts |
| `downloads` | save screenshots and Grok exports |
| `storage` | remember your Clean X settings |
| `alarms` | check the AI Post Studio queue once per minute |
| `sidePanel` | make AI Post Studio available in Chrome's side panel |

Host access is limited to `x.com`, `twitter.com`, OpenAI, and DeepSeek. AI Post Studio asks for optional host access only when you configure a custom OpenAI-compatible endpoint. Full-page screenshot uses `activeTab` so it works anywhere on demand.

## AI Post Studio

AI Post Studio stores its accounts, drafts, voice material, queue, and API key in browser extension storage. It can generate through DeepSeek, OpenAI, or a custom OpenAI-compatible endpoint. Open it from the popup in Chrome's side panel, or use **Open in tab** for a full-page workspace. Scheduled posts run only while X is available in the browser and are bounded by the configured rate limit and active-hours window.

Automated posting may violate X rules and depends on X's changing DOM. Review generated copy and use queue automation at your own discretion.

## Status

Beta. Works on current X/Twitter; Clean X and AI Post Studio selectors may need updates when X changes its DOM.

## License

MIT — see [LICENSE](LICENSE).
