import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import './App.css';
import { renderMarkdownToHtml } from './markdownRenderer';

// Sanitize HTML to only allow <strong> and <em> tags
const sanitizeHtml = (html) => {
  if (!html) return '';
  // Remove all HTML tags except <strong>, </strong>, <em>, </em>
  return html
    .replace(/<(?!\/?(?:strong|em)(?:\s|>))[^>]*>/gi, '')
    .replace(/</g, (match, offset, str) => {
      // Check if this < is part of an allowed tag
      const rest = str.slice(offset);
      if (/^<\/?(?:strong|em)(?:\s|>)/i.test(rest)) {
        return match;
      }
      return '&lt;';
    });
};

const sampleText = `The Renaissance was a fervent period of European cultural, artistic, political and economic "rebirth" following the Middle Ages. Generally described as taking place from the 14th century to the 17th century, the Renaissance promoted the rediscovery of classical philosophy, literature and art.

Some of the greatest thinkers, authors, statesmen, scientists and artists in human history thrived during this era, while global exploration opened up new lands and cultures to European commerce. The Renaissance is credited with bridging the gap between the Middle Ages and modern-day civilization.

Florence, Italy, was the birthplace of the Renaissance. The Medici family, a wealthy banking dynasty, were notable patrons of the arts and sciences, funding works by artists like Michelangelo and Leonardo da Vinci. Their influence helped transform Florence into the cultural capital of Europe.

The invention of the printing press by Johannes Gutenberg around 1440 revolutionized the spread of knowledge. Books became more accessible, literacy rates increased, and new ideas could spread across Europe with unprecedented speed. This democratization of knowledge was fundamental to the Renaissance spirit of inquiry and humanism.`;

export default function App() {
  // Content state
  const [content, setContent] = useState({
    type: 'sample',  // 'sample' | 'url' | 'file'
    text: sampleText,
    title: 'The Renaissance',
    source: null,
    isMarkdown: false,
  });
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState(null);

  // UI state for URL input
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInputValue, setUrlInputValue] = useState('');

  // UI state for paste content
  const [pasteMode, setPasteMode] = useState(false); // Shows paste zone in content area
  const [showPasteConfirm, setShowPasteConfirm] = useState(false); // Confirmation dialog before entering paste mode

  // Highlight state
  const [highlights, setHighlights] = useState([]);
  const [loadingId, setLoadingId] = useState(null);
  const [line, setLine] = useState(null); // { startX, endX, y }
  const [isDrawing, setIsDrawing] = useState(false);
  const [highlightedWordIndices, setHighlightedWordIndices] = useState({}); // { highlightId: [wordIndices] }

  const articleRef = useRef(null);
  const wordRefs = useRef([]);
  const lineYRef = useRef(null);
  const startXRef = useRef(null);
  const fileInputRef = useRef(null);
  const urlInputRef = useRef(null);
  const pasteZoneRef = useRef(null);

  // Get all word elements and their bounding boxes
  const getWordData = useCallback(() => {
    // For markdown content, query DOM directly to get fresh elements
    // For plain text, use the refs
    let elements;
    if (content.isMarkdown && articleRef.current) {
      elements = Array.from(articleRef.current.querySelectorAll('.word'));
    } else {
      elements = wordRefs.current;
    }

    const data = elements
      .map((el, index) => {
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        // Get the data-index attribute for markdown elements
        const dataIndex = el.getAttribute('data-index');
        const idx = dataIndex !== null ? parseInt(dataIndex, 10) : index;
        return {
          el,
          index: idx,
          text: el.textContent,
          rect
        };
      })
      .filter(w => w !== null && w.rect.width > 0);
    return data;
  }, [content.isMarkdown]);

  // Find the text line (Y center) closest to a point
  const findLineY = useCallback((clientY) => {
    const words = getWordData();
    if (words.length === 0) return null;

    // Group words by their approximate Y center (same line)
    const lineGroups = {};
    words.forEach(w => {
      const centerY = Math.round((w.rect.top + w.rect.bottom) / 2);
      // Group within 5px tolerance
      const key = Math.round(centerY / 10) * 10;
      if (!lineGroups[key]) lineGroups[key] = [];
      lineGroups[key].push({ ...w, centerY });
    });

    // Find the line closest to the touch point
    let closestLine = null;
    let closestDist = Infinity;
    
    Object.values(lineGroups).forEach(group => {
      const avgY = group.reduce((sum, w) => sum + w.centerY, 0) / group.length;
      const dist = Math.abs(clientY - avgY);
      if (dist < closestDist) {
        closestDist = dist;
        closestLine = avgY;
      }
    });

    return closestLine;
  }, [getWordData]);

  // Find words that intersect with the horizontal line span
  const findIntersectingWords = useCallback((startX, endX, lineY) => {
    const words = getWordData();
    const minX = Math.min(startX, endX);
    const maxX = Math.max(startX, endX);

    const matching = words.filter(w => {
      // Check if word is on the same line (within tolerance)
      const wordCenterY = (w.rect.top + w.rect.bottom) / 2;
      if (Math.abs(wordCenterY - lineY) > 15) return false;

      // Check horizontal overlap
      return w.rect.right >= minX && w.rect.left <= maxX;
    });

    return matching;
  }, [getWordData]);

  const handlePointerDown = useCallback((e) => {
    // Draw-to-select activates for:
    // - Pen/stylus input (always)
    // - Mouse without Shift key (regular click/drag)
    // Shift+mouse uses native text selection (for copy/paste)
    const isPen = e.pointerType === 'pen';
    const isMouse = e.pointerType === 'mouse';
    const isShiftHeld = e.shiftKey;

    // Skip draw-to-select if Shift is held (allow native selection)
    if (isMouse && isShiftHeld) return;
    // Only activate for pen or mouse (not touch without pen)
    if (!isPen && !isMouse) return;

    const articleRect = articleRef.current?.getBoundingClientRect();
    if (!articleRect) return;

    // Check if pointer is within article bounds
    if (e.clientX < articleRect.left || e.clientX > articleRect.right ||
        e.clientY < articleRect.top || e.clientY > articleRect.bottom) {
      return;
    }

    const lineY = findLineY(e.clientY);
    // lineY of 0 could be valid if text is at top, but null means no words found
    if (lineY === null) return;

    e.preventDefault();
    setIsDrawing(true);
    lineYRef.current = lineY;
    startXRef.current = e.clientX;
    
    setLine({
      startX: e.clientX,
      endX: e.clientX,
      y: lineY
    });
  }, [findLineY]);

  const handlePointerMove = useCallback((e) => {
    if (!isDrawing || lineYRef.current === null) return;
    
    e.preventDefault();
    setLine(prev => prev ? {
      ...prev,
      endX: e.clientX
    } : null);
  }, [isDrawing]);

  const handlePointerUp = useCallback((e) => {
    if (!isDrawing || !line) {
      setIsDrawing(false);
      setLine(null);
      return;
    }

    // Use the refs for the actual values since they're more reliable
    const actualStartX = startXRef.current ?? line.startX;
    const actualY = lineYRef.current ?? line.y;

    const intersecting = findIntersectingWords(actualStartX, line.endX, actualY);

    if (intersecting.length > 0) {
      const selectedText = intersecting.map(w => w.text).join(' ');
      const wordIndices = intersecting.map(w => w.index);
      
      // Check if already highlighted
      if (!highlights.some(h => h.text.toLowerCase() === selectedText.toLowerCase())) {
        const newHighlight = {
          id: Date.now(),
          text: selectedText,
          explanation: null,
          loading: true,
          firstWordIndex: Math.min(...wordIndices)
        };
        
        setHighlights(prev => {
          const updated = [newHighlight, ...prev];
          // Sort by position in document
          return updated.sort((a, b) => a.firstWordIndex - b.firstWordIndex);
        });
        setHighlightedWordIndices(prev => ({
          ...prev,
          [newHighlight.id]: wordIndices
        }));
        setLoadingId(newHighlight.id);
        fetchExplanation(newHighlight.id, selectedText);

        // For markdown content, immediately apply highlight class to DOM
        if (content.isMarkdown) {
          wordIndices.forEach(idx => {
            const span = articleRef.current?.querySelector(`.word[data-index="${idx}"]`);
            if (span) {
              span.classList.add('word-highlighted');
            }
          });
        }
      }
    }

    setIsDrawing(false);
    setLine(null);
    lineYRef.current = null;
    startXRef.current = null;
    // Clear any browser text selection that might have occurred
    window.getSelection()?.removeAllRanges();
  }, [isDrawing, line, findIntersectingWords, highlights, content.isMarkdown]);

  // Add global pointer event listeners
  useEffect(() => {
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    
    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  const fetchExplanation = async (id, text) => {
    try {
      const response = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch explanation');
      }

      setHighlights(prev =>
        prev.map(h =>
          h.id === id
            ? { ...h, explanation: data.explanation, loading: false }
            : h
        )
      );
    } catch (error) {
      console.error('Error fetching explanation:', error);
      setHighlights(prev =>
        prev.map(h =>
          h.id === id
            ? { ...h, explanation: `Error: ${error.message}`, loading: false }
            : h
        )
      );
    }
    setLoadingId(null);
  };

  const removeHighlight = (id) => {
    setHighlights(prev => prev.filter(h => h.id !== id));
    setHighlightedWordIndices(prev => {
      const newIndices = { ...prev };
      delete newIndices[id];
      return newIndices;
    });
  };

  const clearAll = () => {
    setHighlights([]);
    setHighlightedWordIndices({});
  };

  // Load new content and reset all highlight state
  const loadNewContent = useCallback((newContent) => {
    setHighlights([]);
    setHighlightedWordIndices({});
    wordRefs.current = [];
    setLine(null);
    setIsDrawing(false);
    setContent(newContent);
    setContentError(null);
    articleRef.current?.scrollTo(0, 0);
    // Clear any browser text selection
    window.getSelection()?.removeAllRanges();
  }, []);

  // Handle file upload
  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const isMarkdown = file.name.endsWith('.md') || file.type === 'text/markdown';
    const isText = file.name.endsWith('.txt') || file.type === 'text/plain';

    if (!isMarkdown && !isText) {
      setContentError('Please upload a .txt or .md file');
      return;
    }

    // Validate file size (max 1MB)
    if (file.size > 1024 * 1024) {
      setContentError('File too large. Maximum size is 1MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      if (!text || text.trim().length === 0) {
        setContentError('File appears to be empty');
        return;
      }
      loadNewContent({
        type: 'file',
        text: text,
        title: file.name.replace(/\.(txt|md)$/, ''),
        source: file.name,
        isMarkdown: isMarkdown,
      });
    };
    reader.onerror = () => {
      setContentError('Failed to read file');
    };
    reader.readAsText(file);

    // Reset input so same file can be re-selected
    e.target.value = '';
  }, [loadNewContent]);

  // Handle URL fetch
  const fetchUrl = useCallback(async (url) => {
    // Basic URL validation
    try {
      new URL(url);
    } catch {
      setContentError('Please enter a valid URL');
      return;
    }

    setContentLoading(true);
    setContentError(null);

    try {
      const response = await fetch('/api/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch URL');
      }

      if (!data.content || data.content.trim().length === 0) {
        throw new Error('No readable content found at this URL');
      }

      loadNewContent({
        type: 'url',
        text: data.content,
        title: data.title || 'Untitled',
        source: url,
      });

      setShowUrlInput(false);
      setUrlInputValue('');
    } catch (error) {
      setContentError(error.message);
    } finally {
      setContentLoading(false);
    }
  }, [loadNewContent]);

  // Reset to sample text
  const loadSampleText = useCallback(() => {
    loadNewContent({
      type: 'sample',
      text: sampleText,
      title: 'The Renaissance',
      source: null,
    });
  }, [loadNewContent]);

  // Convert HTML to markdown-like format
  const convertHtmlToMarkdown = useCallback((html) => {
    // Create a temporary element to parse HTML
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const body = doc.body;

    // Remove style and script tags
    body.querySelectorAll('style, script').forEach(el => el.remove());

    // Process the content
    let result = '';

    const processNode = (node, depth = 0) => {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return '';
      }

      const tag = node.tagName.toLowerCase();
      let content = '';

      // Process children first
      for (const child of node.childNodes) {
        content += processNode(child, depth);
      }

      // Apply formatting based on tag
      switch (tag) {
        case 'h1':
          return `\n# ${content.trim()}\n\n`;
        case 'h2':
          return `\n## ${content.trim()}\n\n`;
        case 'h3':
          return `\n### ${content.trim()}\n\n`;
        case 'h4':
          return `\n#### ${content.trim()}\n\n`;
        case 'h5':
          return `\n##### ${content.trim()}\n\n`;
        case 'h6':
          return `\n###### ${content.trim()}\n\n`;
        case 'p':
          return `${content.trim()}\n\n`;
        case 'br':
          return '\n';
        case 'strong':
        case 'b':
          return `**${content}**`;
        case 'em':
        case 'i':
          return `*${content}*`;
        case 'code':
          // Check if parent is pre (code block) or inline
          if (node.parentElement?.tagName.toLowerCase() === 'pre') {
            return content;
          }
          return `\`${content}\``;
        case 'pre':
          return `\n\`\`\`\n${content.trim()}\n\`\`\`\n\n`;
        case 'blockquote':
          return `\n> ${content.trim().replace(/\n/g, '\n> ')}\n\n`;
        case 'ul':
          return `\n${content}`;
        case 'ol':
          return `\n${content}`;
        case 'li':
          // Check if parent is ol or ul
          const parent = node.parentElement?.tagName.toLowerCase();
          if (parent === 'ol') {
            const index = Array.from(node.parentElement.children).indexOf(node) + 1;
            return `${index}. ${content.trim()}\n`;
          }
          return `- ${content.trim()}\n`;
        case 'a':
          const href = node.getAttribute('href');
          // Only include links with http/https protocols
          if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
            return `[${content}](${href})`;
          }
          return content;
        case 'div':
        case 'span':
        case 'article':
        case 'section':
          return content;
        case 'hr':
          return '\n---\n\n';
        default:
          return content;
      }
    };

    result = processNode(body);

    // Clean up extra whitespace
    result = result
      .replace(/\n{3,}/g, '\n\n')  // Max 2 newlines
      .replace(/^\s+/, '')          // Trim start
      .replace(/\s+$/, '');         // Trim end

    return result;
  }, []);

  // Detect if text looks like markdown
  const detectMarkdown = useCallback((text) => {
    // Check for common markdown patterns
    const markdownPatterns = [
      /^#{1,6}\s+.+/m,           // Headers: # Header
      /\*\*[^*]+\*\*/,           // Bold: **text**
      /\*[^*]+\*/,               // Italic: *text*
      /^[-*+]\s+.+/m,            // Unordered lists: - item
      /^\d+\.\s+.+/m,            // Ordered lists: 1. item
      /```[\s\S]*?```/,          // Code blocks: ```code```
      /`[^`]+`/,                 // Inline code: `code`
      /^\s*>\s+.+/m,             // Blockquotes: > quote
      /\[.+\]\(.+\)/,            // Links: [text](url)
    ];

    return markdownPatterns.some(pattern => pattern.test(text));
  }, []);

  // Handle clicking the Paste Content button
  const handlePasteButtonClick = useCallback(() => {
    // If there are existing highlights, show confirmation first
    if (highlights.length > 0) {
      setShowPasteConfirm(true);
    } else {
      // Enter paste mode directly
      setPasteMode(true);
    }
  }, [highlights.length]);

  // Confirm entering paste mode (clears highlights)
  const confirmEnterPasteMode = useCallback(() => {
    setShowPasteConfirm(false);
    setPasteMode(true);
  }, []);

  // Cancel entering paste mode
  const cancelPasteConfirm = useCallback(() => {
    setShowPasteConfirm(false);
  }, []);

  // Exit paste mode without pasting
  const exitPasteMode = useCallback(() => {
    setPasteMode(false);
  }, []);

  // Handle paste event in paste zone
  const handlePasteZonePaste = useCallback((e) => {
    e.preventDefault();

    // Try to get HTML first (richer formatting from web pages/chat interfaces)
    const html = e.clipboardData?.getData('text/html');
    const text = e.clipboardData?.getData('text');

    if (!text || text.trim().length === 0) {
      setContentError('Clipboard appears to be empty');
      return;
    }

    // If we have HTML content, convert it to markdown-like format
    let finalText = text;
    let isMarkdown = false;

    if (html && html.trim().length > 0) {
      // Convert HTML to a simpler markdown-like format
      finalText = convertHtmlToMarkdown(html);
      isMarkdown = true;
    } else {
      // Check if raw text looks like markdown
      isMarkdown = detectMarkdown(text);
    }

    const newContent = {
      type: 'paste',
      text: finalText.trim(),
      title: 'Pasted Content',
      source: 'Clipboard',
      isMarkdown: isMarkdown,
    };

    loadNewContent(newContent);
    setPasteMode(false);
  }, [convertHtmlToMarkdown, detectMarkdown, loadNewContent]);

  // Focus URL input when shown
  useEffect(() => {
    if (showUrlInput && urlInputRef.current) {
      urlInputRef.current.focus();
    }
  }, [showUrlInput]);

  // Focus paste zone when shown
  useEffect(() => {
    if (pasteMode && pasteZoneRef.current) {
      pasteZoneRef.current.focus();
    }
  }, [pasteMode]);

  // Get all currently highlighted word indices
  const allHighlightedIndices = useMemo(() => new Set(
    Object.values(highlightedWordIndices).flat()
  ), [highlightedWordIndices]);

  // Render markdown to HTML with word spans AND highlights baked in
  const markdownHtml = useMemo(() => {
    if (!content.isMarkdown) return null;
    // Pass highlighted indices so they're baked into the HTML
    const { html } = renderMarkdownToHtml(content.text, allHighlightedIndices);
    return html;
  }, [content.isMarkdown, content.text, allHighlightedIndices]);

  // Populate wordRefs from DOM after markdown renders
  useEffect(() => {
    if (content.isMarkdown && articleRef.current) {
      // Use requestAnimationFrame to ensure DOM is painted
      const rafId = requestAnimationFrame(() => {
        const wordSpans = articleRef.current?.querySelectorAll('.word');
        if (wordSpans) {
          wordRefs.current = Array.from(wordSpans);
        }
      });
      return () => cancelAnimationFrame(rafId);
    }
  }, [content.isMarkdown, markdownHtml]);

  // Note: Highlights are now baked into markdownHtml via renderMarkdownToHtml

  // Render text with each word wrapped in a span (for plain text)
  const renderText = (text) => {
    const paragraphs = text.split('\n\n');
    let wordIndex = 0;

    return paragraphs.map((paragraph, pIdx) => (
      <p key={pIdx}>
        {paragraph.split(/(\s+)/).map((segment, sIdx) => {
          if (/^\s+$/.test(segment)) {
            return <span key={`${pIdx}-${sIdx}`}>{segment}</span>;
          }
          const idx = wordIndex++;
          const isHighlighted = allHighlightedIndices.has(idx);
          return (
            <span
              key={`${pIdx}-${sIdx}`}
              ref={el => wordRefs.current[idx] = el}
              className={`word ${isHighlighted ? 'word-highlighted' : ''}`}
            >
              {segment}
            </span>
          );
        })}
      </p>
    ));
  };

  return (
    <div className="container">
      {/* Drawing line overlay */}
      {line && (
        <svg className="line-overlay">
          <line
            x1={line.startX}
            y1={line.y}
            x2={line.endX}
            y2={line.y}
            stroke="#f59e0b"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      )}

      {/* Document Panel */}
      <div className="document-panel">
        {/* Source Bar */}
        <div className="source-bar">
          <div className="source-indicator">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>
              {content.type === 'sample' && 'Sample Text'}
              {content.type === 'url' && (content.source ? new URL(content.source).hostname : 'URL')}
              {content.type === 'file' && content.source}
              {content.type === 'paste' && 'Pasted Content'}
            </span>
          </div>

          <div className="source-buttons">
            <div className="url-input-wrapper">
              <button
                onClick={() => setShowUrlInput(!showUrlInput)}
                className="source-button"
                disabled={contentLoading}
              >
                Load URL
              </button>
              {showUrlInput && (
                <div className="url-input-popover">
                  <input
                    ref={urlInputRef}
                    type="url"
                    value={urlInputValue}
                    onChange={(e) => setUrlInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && urlInputValue.trim()) {
                        fetchUrl(urlInputValue.trim());
                      }
                      if (e.key === 'Escape') {
                        setShowUrlInput(false);
                        setUrlInputValue('');
                      }
                    }}
                    placeholder="https://example.com/article"
                    className="url-input-field"
                    disabled={contentLoading}
                  />
                  <div className="url-input-actions">
                    <button
                      onClick={() => {
                        setShowUrlInput(false);
                        setUrlInputValue('');
                      }}
                      className="url-cancel-button"
                      disabled={contentLoading}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => urlInputValue.trim() && fetchUrl(urlInputValue.trim())}
                      className="url-fetch-button"
                      disabled={contentLoading || !urlInputValue.trim()}
                    >
                      {contentLoading ? 'Loading...' : 'Fetch'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handlePasteButtonClick}
              className={`source-button ${pasteMode ? 'source-button-active' : ''}`}
              disabled={contentLoading || pasteMode}
            >
              {pasteMode ? 'Paste Mode' : 'Paste Content'}
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="source-button"
              disabled={contentLoading}
            >
              Upload File
            </button>
            <input
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              ref={fileInputRef}
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />

            {(content.type !== 'sample') && (
              <button
                onClick={loadSampleText}
                className="source-button source-button-secondary"
                disabled={contentLoading}
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Error message */}
        {contentError && (
          <div className="content-error">
            <span>{contentError}</span>
            <button onClick={() => setContentError(null)} className="error-dismiss">
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <header className="document-header">
          <h1>{content.title}</h1>
          <p>Draw across words to highlight (Shift+click for text selection)</p>
        </header>

        {contentLoading ? (
          <div className="content-loading">
            <div className="loading-dots">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
            <span>Fetching content...</span>
          </div>
        ) : pasteMode ? (
          <div
            className="paste-zone"
            ref={pasteZoneRef}
            tabIndex={0}
            onPaste={handlePasteZonePaste}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                exitPasteMode();
              }
            }}
          >
            <div className="paste-zone-content">
              <div className="paste-zone-icon">
                <svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <h2>Paste your content</h2>
              <p>Press <kbd>⌘V</kbd> (Mac) or <kbd>Ctrl+V</kbd> (Windows) to paste</p>
              <p className="paste-zone-hint">Supports plain text and markdown</p>
              <button onClick={exitPasteMode} className="paste-zone-cancel">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <main
            className="document-content"
            onPointerDown={handlePointerDown}
            ref={articleRef}
            style={{ touchAction: 'none' }}
          >
            {content.isMarkdown ? (
              <article dangerouslySetInnerHTML={{ __html: markdownHtml }} />
            ) : (
              <article>
                {renderText(content.text)}
              </article>
            )}
          </main>
        )}
      </div>

      {/* Sidebar */}
      <aside className="sidebar">
        <header className="sidebar-header">
          <div>
            <h2>Reference Cards</h2>
            <p className="subtitle">
              {highlights.length === 0 ? 'No selections yet' : `${highlights.length} item${highlights.length === 1 ? '' : 's'}`}
            </p>
          </div>
          {highlights.length > 0 && (
            <button onClick={clearAll} className="clear-button">
              Clear all
            </button>
          )}
        </header>

        <div className="sidebar-content">
          {highlights.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </div>
              <p>Draw across any words in the document to see an explanation here</p>
            </div>
          ) : (
            <div className="cards-container">
              {highlights.map((highlight) => (
                <div
                  key={highlight.id}
                  className={`card ${highlight.id === loadingId ? 'card-new' : ''}`}
                >
                  <div className="card-header">
                    <span className="highlight-badge">
                      {highlight.text}
                    </span>
                    <button
                      onClick={() => removeHighlight(highlight.id)}
                      className="remove-button"
                    >
                      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="card-content">
                    {highlight.loading ? (
                      <div className="loading">
                        <div className="loading-dots">
                          <span className="dot" />
                          <span className="dot" />
                          <span className="dot" />
                        </div>
                        <span>Generating explanation...</span>
                      </div>
                    ) : (
                      <p dangerouslySetInnerHTML={{ __html: sanitizeHtml(highlight.explanation) }} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Confirmation Dialog */}
      {showPasteConfirm && (
        <div className="confirm-dialog-overlay">
          <div className="confirm-dialog">
            <h3>Replace Content?</h3>
            <p>This will replace the current content and clear your {highlights.length} highlight{highlights.length === 1 ? '' : 's'}.</p>
            <div className="confirm-dialog-actions">
              <button onClick={cancelPasteConfirm} className="url-cancel-button">
                Cancel
              </button>
              <button onClick={confirmEnterPasteMode} className="url-fetch-button">
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}