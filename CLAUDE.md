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
- `highlights` — array of {id, text, explanation, loading, firstWordIndex}
- `highlightedWordIndices` — maps highlight IDs to arrays of word indices
- `line` — current drawing line {startX, endX, y} or null

## Current State

**Working:**
- Draw-to-select with instant Pencil response
- Visual line feedback during selection
- Persistent underline on selected words
- Reference cards in sidebar, sorted by document order
- Dismiss individual cards or clear all
- Works on iPad Safari and desktop browsers

**Mocked:**
- AI explanations (placeholder text with 800ms simulated delay)
- API calls fail due to CORS/no API key in browser

## Next Steps

### 1. Backend Proxy for AI Calls
Need a simple Express server to:
- Hold the Anthropic API key securely
- Proxy requests from the frontend
- Handle CORS

### 2. Content Loading
Currently uses hardcoded sample text. Options to add:
- URL input → fetch and display web page content
- Document upload (PDF, DOCX, plain text)
- Browser extension to run on any page

### 3. Persistence
- Save highlights to localStorage for session persistence
- Optional cloud sync for cross-device access

### 4. Enhanced AI Features
- Adjustable explanation depth (quick definition vs deep dive)
- Context-aware explanations (knows what document you're reading)
- Related terms suggestions

## File Structure

```
highlight-reader/
├── src/
│   ├── App.js       ← Main component with all logic
│   ├── App.css      ← Styles including line overlay
│   └── index.js     ← React entry point
├── package.json
└── CLAUDE.md        ← This file
```

## Running Locally

```bash
npm start                    # Start dev server on port 3000
PORT=3001 npm start          # Use different port if 3000 is busy
HOST=0.0.0.0 npm start       # Allow connections from other devices (iPad)
```

To test on iPad: open `http://<mac-ip>:3000` in Safari (both devices on same network).

## UX Notes

- Line color: amber (#f59e0b) — warm, approachable, visible but not harsh
- Line thickness: 3px — visible feedback without obscuring text
- Animation: 300ms slide-in for new cards
- Empty state: friendly prompt with pencil icon
- The sidebar width is fixed (360px desktop, 320px mobile) to keep cards readable
