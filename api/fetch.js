import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "url" field' });
  }

  // Validate URL format
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Invalid protocol');
    }
  } catch {
    return res.status(400).json({ error: 'Invalid URL format. Please provide a valid HTTP or HTTPS URL.' });
  }

  try {
    // Fetch the page with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HighlightReader/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 404) {
        return res.status(404).json({ error: 'Page not found at this URL.' });
      }
      if (response.status === 403 || response.status === 401) {
        return res.status(403).json({ error: 'This website doesn\'t allow content fetching.' });
      }
      return res.status(response.status).json({ error: `Failed to fetch URL (status ${response.status})` });
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return res.status(400).json({ error: 'This URL doesn\'t point to a readable web page.' });
    }

    const html = await response.text();

    // Parse with jsdom and extract with Readability
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article || !article.textContent || article.textContent.trim().length === 0) {
      return res.status(422).json({ error: 'No readable content found at this URL.' });
    }

    // Clean up the text content - preserve paragraph structure
    const cleanText = article.textContent
      .replace(/\n{3,}/g, '\n\n')  // Normalize multiple newlines
      .replace(/[ \t]+/g, ' ')     // Normalize spaces
      .trim();

    return res.status(200).json({
      title: article.title || 'Untitled',
      content: cleanText,
      byline: article.byline || null,
      excerpt: article.excerpt || null,
    });
  } catch (error) {
    console.error('Fetch error:', error);

    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'Request timed out. The page may be too slow or unavailable.' });
    }

    return res.status(500).json({ error: 'Failed to fetch and parse the URL.' });
  }
}
