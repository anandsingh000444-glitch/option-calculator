// File location in your Vercel project: /api/market-news.js
//
// Combines 3 news providers with automatic fallback: if one key/provider is down
// or hits its daily quota, the next one is tried. You can also set MULTIPLE keys
// per provider (comma-separated) — e.g. if you have several GNews accounts — and
// each key is tried in turn before moving to the next provider entirely.
//
// SETUP: Vercel dashboard -> your project -> Settings -> Environment Variables:
//   GNEWS_API_KEYS    = key1,key2,key3        (one or more GNews keys, comma-separated)
//   NEWSAPI_API_KEYS  = key1,key2             (one or more NewsAPI keys, comma-separated)
//   MARKETAUX_API_KEY = your Marketaux token  (single key)
//
//   NOTE: NewsAPI.org's free Developer plan is documented as development/localhost
//   use only — using it from this deployed proxy may go against their free-tier
//   terms. Fine for personal/hobby testing, but don't rely on it for anything commercial.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const query = req.query.symbols || 'NIFTY';
  const limit = parseInt(req.query.limit) || 10;

  function keysFrom(envVar) {
    return (process.env[envVar] || '').split(',').map(k => k.trim()).filter(Boolean);
  }

  const providers = [
    { name: 'gnews',     keys: keysFrom('GNEWS_API_KEYS'),   fn: fetchGNews },
    { name: 'newsapi',   keys: keysFrom('NEWSAPI_API_KEYS'), fn: fetchNewsApi },
    { name: 'marketaux', keys: keysFrom('MARKETAUX_API_KEY'),fn: fetchMarketaux },
  ];

  const errors = [];
  for (const provider of providers) {
    if (!provider.keys.length) {
      errors.push(`${provider.name}: no API key(s) configured`);
      continue;
    }
    for (const key of provider.keys) {
      try {
        const articles = await provider.fn(key, query, limit);
        if (articles && articles.length) {
          return res.status(200).json({ provider: provider.name, data: articles });
        }
        errors.push(`${provider.name} (key ...${key.slice(-4)}): no articles returned`);
      } catch (err) {
        errors.push(`${provider.name} (key ...${key.slice(-4)}): ${err.message}`);
        // try the next key for this same provider before giving up on it entirely
      }
    }
  }

  return res.status(502).json({ error: 'All news providers/keys failed or returned nothing.', details: errors });
}

async function fetchGNews(key, query, limit) {
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

async function fetchNewsApi(key, query, limit) {
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

async function fetchMarketaux(key, query, limit) {
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

