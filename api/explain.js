import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text } = req.body;

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "text" field' });
  }

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: `You are a helpful reading assistant. The user is reading a document and has highlighted the following text: "${text}"

Provide a brief, clear explanation of this term or phrase. If it's a person, give a short bio. If it's a concept, define it. If it's an event, summarize it. Keep the explanation to 2-3 sentences, suitable for a sidebar reference card.

Use <strong> tags for emphasis when mentioning the highlighted term or important names/concepts. Do not use markdown formatting or any other HTML tags.`
        }
      ]
    });

    const explanation = message.content[0].text;
    return res.status(200).json({ explanation });
  } catch (error) {
    console.error('Anthropic API error:', error);
    return res.status(500).json({ error: 'Failed to generate explanation' });
  }
}
