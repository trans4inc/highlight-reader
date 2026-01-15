import React, { useState, useCallback, useRef, useEffect } from 'react';
import './App.css';

const sampleText = `The Renaissance was a fervent period of European cultural, artistic, political and economic "rebirth" following the Middle Ages. Generally described as taking place from the 14th century to the 17th century, the Renaissance promoted the rediscovery of classical philosophy, literature and art.

Some of the greatest thinkers, authors, statesmen, scientists and artists in human history thrived during this era, while global exploration opened up new lands and cultures to European commerce. The Renaissance is credited with bridging the gap between the Middle Ages and modern-day civilization.

Florence, Italy, was the birthplace of the Renaissance. The Medici family, a wealthy banking dynasty, were notable patrons of the arts and sciences, funding works by artists like Michelangelo and Leonardo da Vinci. Their influence helped transform Florence into the cultural capital of Europe.

The invention of the printing press by Johannes Gutenberg around 1440 revolutionized the spread of knowledge. Books became more accessible, literacy rates increased, and new ideas could spread across Europe with unprecedented speed. This democratization of knowledge was fundamental to the Renaissance spirit of inquiry and humanism.`;

export default function App() {
  const [highlights, setHighlights] = useState([]);
  const [loadingId, setLoadingId] = useState(null);
  const [line, setLine] = useState(null); // { startX, endX, y }
  const [isDrawing, setIsDrawing] = useState(false);
  const [highlightedWordIndices, setHighlightedWordIndices] = useState({}); // { highlightId: [wordIndices] }
  
  const articleRef = useRef(null);
  const wordRefs = useRef([]);
  const lineYRef = useRef(null);
  const startXRef = useRef(null);

  // Get all word elements and their bounding boxes
  const getWordData = useCallback(() => {
    return wordRefs.current
      .map((el, index) => el ? {
        el,
        index,
        text: el.textContent,
        rect: el.getBoundingClientRect()
      } : null)
      .filter(w => w !== null);
  }, []);

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
    
    return words.filter(w => {
      // Check if word is on the same line (within tolerance)
      const wordCenterY = (w.rect.top + w.rect.bottom) / 2;
      if (Math.abs(wordCenterY - lineY) > 15) return false;
      
      // Check horizontal overlap
      return w.rect.right >= minX && w.rect.left <= maxX;
    });
  }, [getWordData]);

  const handlePointerDown = useCallback((e) => {
    // Only respond to pen or touch, not mouse (for easier testing, include mouse too)
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    
    const articleRect = articleRef.current?.getBoundingClientRect();
    if (!articleRect) return;
    
    // Check if pointer is within article bounds
    if (e.clientX < articleRect.left || e.clientX > articleRect.right ||
        e.clientY < articleRect.top || e.clientY > articleRect.bottom) {
      return;
    }

    const lineY = findLineY(e.clientY);
    if (!lineY) return;

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

    const intersecting = findIntersectingWords(line.startX, line.endX, line.y);
    
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
      }
    }

    setIsDrawing(false);
    setLine(null);
    lineYRef.current = null;
    startXRef.current = null;
  }, [isDrawing, line, findIntersectingWords, highlights]);

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
    // Simulate API delay for testing
    await new Promise(resolve => setTimeout(resolve, 800));
    
    setHighlights(prev => 
      prev.map(h => 
        h.id === id 
          ? { ...h, explanation: `This is a placeholder explanation for "${text}". In production, this would be a real AI-generated response about this term from the Renaissance period.`, loading: false }
          : h
      )
    );
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

  // Render text with each word wrapped in a span
  const renderText = (text) => {
    const paragraphs = text.split('\n\n');
    let wordIndex = 0;
    
    // Get all currently highlighted word indices
    const allHighlightedIndices = new Set(
      Object.values(highlightedWordIndices).flat()
    );
    
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
        <header className="document-header">
          <h1>The Renaissance</h1>
          <p>Draw a line across any words to learn more</p>
        </header>
        
        <main 
          className="document-content"
          onPointerDown={handlePointerDown}
          ref={articleRef}
          style={{ touchAction: 'none' }}
        >
          <article>
            {renderText(sampleText)}
          </article>
        </main>
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
                      <p>{highlight.explanation}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}