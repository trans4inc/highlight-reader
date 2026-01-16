import { marked } from 'marked';

/**
 * Renders markdown to HTML with each word wrapped in a span for draw-to-select.
 *
 * Strategy: First render markdown to HTML normally, then post-process to wrap
 * text nodes in word spans while preserving HTML structure.
 *
 * @param {string} markdown - The markdown content to render
 * @param {Set} highlightedIndices - Set of word indices that are highlighted
 * @returns {{ html: string, wordCount: number }} - HTML string with word spans
 */
// Helper to escape HTML entities (used for error fallback)
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderMarkdownToHtml(markdown, highlightedIndices = new Set()) {
  // Configure marked for GFM
  marked.setOptions({
    breaks: true,
    gfm: true,
  });

  // First, render markdown to standard HTML
  let html;
  try {
    html = marked.parse(markdown);
  } catch (error) {
    console.error('Markdown parsing error:', error);
    html = `<p>${escapeHtml(markdown)}</p>`;
  }

  // Now post-process the HTML to wrap words in spans
  let wordIndex = 0;

  // Helper to wrap words in a text string
  // Note: text already has HTML entities from marked, don't double-escape
  function wrapWordsInText(text) {
    if (!text) return '';

    // Split by whitespace, keeping the whitespace as separate tokens
    // Also keep HTML entities together (e.g., &quot; &amp; &#39;)
    const parts = text.split(/(\s+)/);

    return parts.map(part => {
      // If it's whitespace only, return as-is
      if (/^\s*$/.test(part)) return part;

      // If it's a word, wrap in span (text is already escaped by marked)
      const idx = wordIndex++;
      const isHighlighted = highlightedIndices.has(idx);
      const className = isHighlighted ? 'word word-highlighted' : 'word';

      return `<span class="${className}" data-index="${idx}">${part}</span>`;
    }).join('');
  }

  // Process HTML to wrap text content in word spans
  // We need to find text that's not inside tags and wrap those words
  // This regex-based approach handles the common cases

  const processedHtml = html.replace(
    // Match text between tags (but not the tags themselves)
    />([^<]+)</g,
    (match, textContent) => {
      // Don't process if it's only whitespace
      if (/^\s*$/.test(textContent)) {
        return match;
      }
      return '>' + wrapWordsInText(textContent) + '<';
    }
  );

  return { html: processedHtml, wordCount: wordIndex };
}
