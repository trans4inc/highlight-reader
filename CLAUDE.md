# CLAUDE.md

## Project Overview

A reading companion app that lets users highlight words, terms, names, and phrases in a document using Apple Pencil (or touch/mouse), then displays AI-generated explanations in a sidebar. Think of it as an intelligent glossary that builds itself as you read.

**Target platform:** iPad with Apple Pencil (also works on desktop browsers)

**Core interaction:** Draw a line across words → see explanations appear in a side panel

## Key Design Decisions

### Web App vs Native Swift/SwiftUI

We chose **web app** because:
- The core interaction is text selection, not freeform drawing—no need for PencilKit's low-latency ink
- Web gives us cross-platform support (iPad + desktop) for free
- Easier deployment and updates
- The Selection API and Pointer Events handle Pencil input adequately

Native would only be necessary if we needed true drawing/annotation with zero-latency ink response.

### Custom Draw-to-Select (not native text selection)

Safari's native text selection has a ~500ms hold delay to distinguish selection from scrolling. This felt sluggish with the Pencil.

Our solution:
- Wrap each word in a `<span>` for hit detection
- Use Pointer Events API for immediate response on pen-down
- Draw a visible line as feedback during drag
- Snap the line to the text baseline (vertical center of the line of text)
- On pen-up, select all words the line intersects

This gives instant feedback and feels natural to Pencil users.

### Persistent Underline Highlighting

The drawing line becomes a persistent highlight:
- Selected words keep an amber underline matching the drawing line style
- Underlines disappear when the corresponding card is dismissed
- Provides clear visual mapping between document and sidebar

### Card Ordering

Reference cards in the sidebar are sorted by document position, not selection time. If you highlight something in paragraph 4, its card appears below cards from paragraphs 1-3, regardless of when you made the selection.

### Backend Architecture: Vercel Serverless Functions

We evaluated three options for the backend proxy that holds the API key:

1. **Vercel Serverless Functions** (chosen) — Deploy frontend + API together, auto-scaling, free tier, simple local dev with `vercel dev`
2. **Separate Express Server** — More control, no cold starts, but two things to deploy/maintain
3. **Cloudflare Workers** — Fastest, cheapest, global edge, but different runtime and separate deploy

We chose **Vercel** for MVP simplicity: single deploy, minimal configuration, good enough performance. Can re-evaluate after MVP if needed.

### API Key Approach

For MVP: Single API key stored server-side in `.env` file (not committed to git). All users share this key.

Future consideration: Allow users to bring their own API key. The architecture supports this — the frontend could send a user-provided key in the request header, and the backend would use it instead of the default. Not implementing for MVP to avoid over-engineering.

## Technical Approach

### Pointer Events for Pencil Input
```javascript
onPointerDown  → detect line of text, start drawing
onPointerMove  → extend line horizontally, locked to text baseline
onPointerUp    → find intersecting words, create highlight
```

### Word-Level Hit Detection
Each word is wrapped in a span with a ref. On pointer events, we:
1. Get bounding rects for all word spans
2. Group words by approximate Y-center (same line of text)
3. Find which line is closest to the touch point
4. Lock the drawing line to that Y position
5. On release, filter words that horizontally intersect the line span

### Disabling Native Selection
```css
user-select: none;
```
Prevents Safari's contextual menu (Copy, Look Up, etc.) from appearing. We handle selection entirely through our custom system.

### State Management
- `content` — {type, text, title, source} for current document
- `highlights` — array of {id, text, explanation, loading, firstWordIndex}
- `highlightedWordIndices` — maps highlight IDs to arrays of word indices
- `line` — current drawing line {startX, endX, y} or null

### Content Loading
- **URL fetch:** Backend `/api/fetch` uses `@mozilla/readability` + `jsdom` to extract article text
- **File upload:** Client-side FileReader for .txt files (max 1MB)
- When content changes, all highlights are cleared (word indices become invalid)

## Current State

**Working:**
- Draw-to-select with instant Pencil response
- Visual line feedback during selection
- Persistent underline on selected words
- Reference cards in sidebar, sorted by document order
- Dismiss individual cards or clear all
- Works on iPad Safari and desktop browsers
- Real AI explanations via Anthropic Claude API
- **Content Loading:**
  - URL input — paste a URL, fetches and extracts article text using Mozilla Readability
  - Plain text file upload — client-side file reading for .txt files
  - Source bar shows current content source with Load URL / Upload File buttons

## Next Steps

### Content Loading (Future)
- PDF upload (requires server-side parsing)
- DOCX upload
- Browser extension to run on any page

### Persistence
- Save highlights to localStorage for session persistence
- Optional cloud sync for cross-device access

### Enhanced AI Features
- Adjustable explanation depth (quick definition vs deep dive)
- Context-aware explanations (knows what document you're reading)
- Related terms suggestions

## File Structure

```
highlight-reader/
├── api/
│   ├── explain.js   ← Vercel serverless function for AI explanations
│   └── fetch.js     ← Vercel serverless function for URL content fetching
├── src/
│   ├── App.js       ← Main component with all logic
│   ├── App.css      ← Styles including line overlay, source bar
│   └── index.js     ← React entry point
├── .env             ← API key (not committed)
├── package.json
└── CLAUDE.md        ← This file
```

## Running Locally

```bash
vercel dev                       # Start dev server with API support (port 3000)
vercel dev --listen 3001         # Use different port if 3000 is busy
```

Note: `vercel dev` is required to run the serverless functions locally. Plain `npm start` will run the frontend but API calls will fail.

To test on iPad: open `http://<mac-ip>:3000` in Safari (both devices on same network).

## UX Notes

- Line color: amber (#f59e0b) — warm, approachable, visible but not harsh
- Line thickness: 3px — visible feedback without obscuring text
- Animation: 300ms slide-in for new cards
- Empty state: friendly prompt with pencil icon
- The sidebar width is fixed (360px desktop, 320px mobile) to keep cards readable
