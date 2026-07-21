// File location in your Vercel project: /api/market-news.js
//
// SETUP: Vercel dashboard -> your project -> Settings -> Environment Variables, add:
//   MARKETAUX_API_KEY = your Marketaux API token
//
// Then register it in vercel.json (builds + routes), same pattern as the other API files.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const apiKey = process.env.MARKETAUX_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server missing MARKETAUX_API_KEY environment variable.' });
  }

  const symbols = req.query.symbols || 'NIFTY';

  try {
    const url = `https://api.marketaux.com/v1/news/all?symbols=${encodeURIComponent(symbols)}&filter_entities=true&language=en&limit=20&api_token=${apiKey}`;
    const upstreamResp = await fetch(url);
    const data = await upstreamResp.json();
    return res.status(upstreamResp.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
