# xtools — Plan

## What this is

A Manifest V3 Chrome extension bundling four tools: **Full Page Screenshot** (any site), **Grok Export** (Markdown/HTML), **Clean X** (distraction-free X/Twitter), and **AI Post Studio** (voice-guided X posting). One extension, four features, MV3-clean.

## Current state

**Beta.** All four features work:
- Full Page Screenshot: scrolls, captures, stitches, with progress UI
- Grok Export: scan + download queue + "delete all chats" action; Markdown or HTML
- Clean X: toggleable hides for suggested content, sidebar, trending, who-to-follow, metrics, Grok/Jobs/Communities/Articles nav, Premium upsells, verified badges; defaults to Following tab
- AI Post Studio: per-account voice profiles, bring-your-own-model generation, drafts, direct posting, and rate-limited scheduling through the logged-in X session

Loaded as unpacked extension; not yet published to the Chrome Web Store.

## Architecture

| File | Role |
|---|---|
| `content/twitter.js` | content script on x.com/twitter.com — Clean X DOM tweaks + Grok helpers |
| `content/ai-post-studio.js` | content script on x.com/twitter.com — compose posts and collect profile writing |
| `background.js` / `ai-post-studio/background.js` | MV3 service worker and AI Post Studio module — screenshots, downloads, posting, scraping, and queue alarms |
| `ai-post-studio/` | full-page AI Post Studio dashboard |
| `popup.html` / `popup.js` | popup UI (screenshot, AI Post Studio, Grok Export, Clean X settings) |
| `manifest.json` | MV3 manifest |
| `icons/` | extension icons |

Full-page screenshot uses `activeTab` so it only runs on the current tab when invoked. X/Twitter and the configured AI provider are the only persistent host permissions.

## Roadmap

### Shipped
- All three features functional
- Toggleable Clean X settings (each hide is independently controllable)
- Stitched full-page capture with progress indicator
- Grok Markdown + HTML export
- AI Post Studio with local-only provider keys and queue controls

### Next (v1.0)
- Chrome Web Store publication (requires privacy policy, single-purpose justification, screenshots)
- Edge Add-ons publication (MV3 port should be near-trivial)
- Firefox MV3 port (verify `browser.*` vs `chrome.*` parity)
- Better error handling for partial captures (lazy-loaded images, iframes, fixed elements)

### Later (v1.x)
- Per-site Clean X profiles (different hide sets for power users vs casual readers)
- Grok export to JSON (for archival / re-import) in addition to Markdown/HTML
- Screenshot annotation (crop, highlight, blur sensitive regions before download)
- Optional sync of Clean X settings via Chrome sync

## Out of scope (deliberate)

- **Fully unattended X operation** — AI Post Studio runs only through an open, logged-in browser session
- **Non-X platforms for Clean X** — Clean X is X-specific, not a generic site cleaner
- **AI summarization / analysis of Grok exports** — out of scope; users export raw and process elsewhere
- **Firefox MV2 support** — MV3 only going forward

## Design decisions to defend

1. **Four tools, one extension.** Each is small enough that splitting into separate extensions creates more install/permission overhead than it saves.
2. **`activeTab` over `host_permissions`.** Privacy-preserving — screenshot only runs when invoked, not on every page load.
3. **Clean X hides are toggleable, not opinionated.** Users opt in to each modification rather than getting our preferences forced.
4. **MV3-only.** MV2 is sunsetting; no point carrying legacy support.

## Open questions

- Whether Grok Export violates X's ToS in any jurisdiction — needs review before Web Store publication
- Whether to charge for any of this or keep fully free (currently free, MIT)
- Whether to bundle as Firefox-compatible from day one or port later

## License

MIT — see [LICENSE](LICENSE).
