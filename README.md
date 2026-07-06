# Full Screenshot + Clean X

A Manifest V3 browser extension: full-page screenshots, Grok conversation export, and a distraction-free X/Twitter.

![License](https://img.shields.io/badge/license-MIT-blue)
![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-4285F4)
![Status](https://img.shields.io/badge/status-beta-green)

## Features

Three tools, one extension:

- **Full Page Screenshot** — capture an entire page (any site) as a single stitched image, not just the visible viewport. Scrolls, captures, and stitches automatically with a progress indicator.
- **Grok Export** — export your Grok conversations as Markdown or HTML. Includes scan, a download queue, and a "delete all chats" action.
- **Clean X** — a distraction-free X/Twitter: default to the Following tab, and hide suggested content, inline prompts, the sidebar, trending, who-to-follow, engagement metrics, Grok/Jobs/Communities/Articles nav, Premium upsells, and verified badges — each toggleable.

## Install (load unpacked)

1. Clone this repo.
2. Open `chrome://extensions` (or `brave://extensions`).
3. Enable **Developer mode**.
4. Click **Load unpacked** and select this folder.

Full-page screenshot works on any site (via `activeTab`); the Grok and Clean X features target X/Twitter.

## How it works

| File | Role |
|---|---|
| `content/twitter.js` | content script on x.com/twitter.com — Clean X DOM tweaks + Grok helpers |
| `background.js` | service worker — screenshot scroll/capture/stitch pipeline, downloads, messaging |
| `popup.html` / `popup.js` | the popup UI (multi-page: screenshot, Grok, Clean X settings) |
| `manifest.json` | MV3 manifest |

## Permissions

| Permission | Why |
|---|---|
| `activeTab`, `tabs` | read/modify the current page for screenshots and Clean X |
| `scripting` | inject content scripts |
| `downloads` | save screenshots and Grok exports |
| `storage` | remember your Clean X settings |

Host access is limited to `x.com` and `twitter.com`; full-page screenshot uses `activeTab` so it works anywhere on demand.

## Status

Beta. Works on current X/Twitter; the Clean X selectors may need updates when X changes its DOM.

## License

MIT — see [LICENSE](LICENSE).
