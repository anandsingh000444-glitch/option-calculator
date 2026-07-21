// File location in your Vercel project: /api/market-news.js
//
// Combines 3 news providers with automatic fallback: if one is down or hits its
// daily quota, the next one is tried. No free provider is truly unlimited — this
// just pools their separate quotas together so a single limit doesn't block you.
//
// SETUP: Vercel dashboard -> your project -> Settings -> Environment Variables, add
// whichever of these you have (at least one is required, more = better fallback):
//   GNEWS_API_KEY
//   NEWSAPI_API_KEY   (NOTE: NewsAPI.org's free Developer plan is documented as
//                      development/localhost use only — using it from this deployed
//                      proxy may go against their free-tier terms. Fine for personal/
//                      hobby testing, but don't rely on it for anything commercial.)
//   MARKETAUX_API_KEY

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const query = req.query.symbols || 'NIFTY';
  const limit = parseInt(req.query.limit) || 10;

  const providers = [
    { name: 'gnews', fn: fetchGNews },
    { name: 'newsapi', fn: fetchNewsApi },
    { name: 'marketaux', fn: fetchMarketaux },
  ];

  const errors = [];
  for (const provider of providers) {
    try {
      const articles = await provider.fn(query, limit);
      if (articles && articles.length) {
        return res.status(200).json({ provider: provider.name, data: articles });
      }
      errors.push(`${provider.name}: no articles returned`);
    } catch (err) {
      errors.push(`${provider.name}: ${err.message}`);
    }
  }

  return res.status(502).json({ error: 'All news providers failed or returned nothing.', details: errors });
}

async function fetchGNews(query, limit) {
  const key = process.env.GNEWS_API_KEY;
  if (!key) throw new Error('GNEWS_API_KEY not set');
  const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=en&max=${limit}&apikey=${key}`;
  const resp = await fetch(url);
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.errors ? json.errors.join(', ') : `HTTP ${resp.status}`);
  return (json.articles || []).map(a => ({
    title: a.title,
    source: a.source?.name,
    published_at: a.publishedAt,
    url: a.url,
  }));
}

async function fetchNewsApi(query, limit) {
  const key = process.env.NEWSAPI_API_KEY;
  if (!key) throw new Error('NEWSAPI_API_KEY not set');
  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&pageSize=${limit}&sortBy=publishedAt&apiKey=${key}`;
  const resp = await fetch(url);
  const json = await resp.json();
  if (!resp.ok || json.status === 'error') throw new Error(json.message || `HTTP ${resp.status}`);
  return (json.articles || []).map(a => ({
    title: a.title,
    source: a.source?.name,
    published_at: a.publishedAt,
    url: a.url,
  }));
}

async function fetchMarketaux(query, limit) {
  const key = process.env.MARKETAUX_API_KEY;
  if (!key) throw new Error('MARKETAUX_API_KEY not set');
  const url = `https://api.marketaux.com/v1/news/all?search=${encodeURIComponent(query)}&language=en&limit=${Math.min(limit,3)}&api_token=${key}`;
  const resp = await fetch(url);
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.error?.message || `HTTP ${resp.status}`);
  return (json.data || []).map(a => ({
    title: a.title,
    source: a.source,
    published_at: a.published_at,
    url: a.url,
    entities: a.entities, // keep for sentiment score, if present
  }));
}

