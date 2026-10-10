// File location: /api/ai-news-analysis.js
//
// Fetches recent news (same provider chain as market-news.js: GNews -> NewsAPI
// -> Marketaux) and asks an NVIDIA-hosted Nemotron model (free tier on
// build.nvidia.com) for a short Hinglish analysis of what matters for Indian
// markets (NIFTY/SENSEX).
//
// REQUIRES: NVIDIA_API_KEY environment variable (free key from
// https://build.nvidia.com -> Profile -> API Keys).
// OPTIONAL: NVIDIA_MODEL environment variable — a model ID to try first.
//   NVIDIA retires hosted models from time to time (e.g. the earlier default,
//   llama-3.3-nemotron-super-49b-v1.5, was shut down on 2026-08-26). If that
//   happens again, set NVIDIA_MODEL to a current ID (visible on the model's page
//   at build.nvidia.com under "View Code") — no code change needed.

const DEFAULT_MODELS = [
  'nvidia/nemotron-3-super-120b-a12b',
  'nvidia/nemotron-3-nano-30b-a3b',
];

// Vercel env values sometimes end up with the key pasted twice, a newline, or a
// "Bearer " prefix — any of which makes the Authorization header invalid.
// Take the first token that looks like a key.
function cleanKey(raw) {
  if (!raw) return null;
  const tokens = raw.split(/[\s,]+/).filter(Boolean);
  return tokens.find(t => t.startsWith('nvapi-')) || tokens.find(t => !/^bearer$/i.test(t)) || null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const nvidiaKey = cleanKey(process.env.NVIDIA_API_KEY);
  if (!nvidiaKey) {
    return res.status(500).json({ error: 'Server missing NVIDIA_API_KEY environment variable. build.nvidia.com se free API key le kar Vercel Environment Variables mein add karo (sirf ek baar, ek hi line mein).' });
  }

  const query = req.query.symbols || 'NIFTY,SENSEX,India stock market';

  try {
    // Step 1: gather recent headlines
    const gnewsKeys = (process.env.GNEWS_API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);
    const newsApiKeys = (process.env.NEWSAPI_API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);
    const marketauxKey = process.env.MARKETAUX_API_KEY;

    let articles = [];
    for (const key of gnewsKeys) {
      try {
        const r = await fetch(`https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=en&max=10&apikey=${key}`);
        const j = await r.json();
        if (r.ok && j.articles?.length) { articles = j.articles.map(a => ({ title: a.title, source: a.source?.name })); break; }
      } catch (e) {}
    }
    if (!articles.length) {
      for (const key of newsApiKeys) {
        try {
          const r = await fetch(`https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&pageSize=10&sortBy=publishedAt&apiKey=${key}`);
          const j = await r.json();
          if (r.ok && j.articles?.length) { articles = j.articles.map(a => ({ title: a.title, source: a.source?.name })); break; }
        } catch (e) {}
      }
    }
    if (!articles.length && marketauxKey) {
      try {
        const r = await fetch(`https://api.marketaux.com/v1/news/all?search=${encodeURIComponent(query)}&language=en&limit=3&api_token=${marketauxKey}`);
        const j = await r.json();
        if (r.ok && j.data?.length) { articles = j.data.map(a => ({ title: a.title, source: a.source })); }
      } catch (e) {}
    }

    if (!articles.length) {
      return res.status(502).json({ error: 'Koi news nahi mili kisi provider se — pehle Market News section mein check karo providers kaam kar rahe hain.' });
    }

    // Step 2: ask the model
    const headlinesText = articles.slice(0, 10).map((a, i) => `${i + 1}. ${a.title} (${a.source || 'unknown'})`).join('\n');
    const prompt = `Neeche kuch recent news headlines hain. Inme se jo bhi India ke stock market (NIFTY/SENSEX/F&O traders) ke liye relevant hain, unka concise analysis do — Hinglish mein (Hindi+English mix, jaise ek trader doosre trader se baat karta hai), 150-200 words mein. Bullet points mein batao: (1) kaunsi news market-relevant hai, (2) kya impact ho sakta hai (bullish/bearish/neutral), (3) kis sector/index par zyada asar. Agar koi headline market se directly related nahi hai to use skip kar do.\n\nHeadlines:\n${headlinesText}`;

    const override = (process.env.NVIDIA_MODEL || '').trim();
    const models = override ? [override, ...DEFAULT_MODELS.filter(m => m !== override)] : DEFAULT_MODELS;

    const tried = [];
    for (const model of models) {
      let resp;
      try {
        resp = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${nvidiaKey}` },
          signal: AbortSignal.timeout(10000),
          body: JSON.stringify({
            model,
            max_tokens: 700,
            temperature: 0.5,
            messages: [{ role: 'user', content: prompt }],
            // Nemotron 3 models "think" before answering by default, which can use up
            // max_tokens and leave the final answer empty — switch that off here.
            chat_template_kwargs: { enable_thinking: false },
          }),
        });
      } catch (e) {
        tried.push(`${model}: ${e.name === 'TimeoutError' ? 'timeout (10s)' : e.message}`);
        continue;
      }

      if (resp.ok) {
        const j = await resp.json();
        const text = (j.choices?.[0]?.message?.content || '').trim();
        if (text) {
          return res.status(200).json({ analysis: text, model_used: model, source_count: articles.length, headlines: articles.slice(0, 10).map(a => a.title) });
        }
        tried.push(`${model}: khaali jawab aaya`);
        continue;
      }

      const errText = (await resp.text()).slice(0, 160);
      if (resp.status === 401 || resp.status === 403) {
        return res.status(resp.status).json({ error: `NVIDIA ne API key reject ki (HTTP ${resp.status}) — key galat/expired hai. build.nvidia.com pe nayi key banao aur Vercel mein update karke Redeploy karo.` });
      }
      if (resp.status === 429) {
        return res.status(429).json({ error: 'NVIDIA free-tier ki rate limit lag gayi — 1 minute baad dobara try karo.' });
      }
      // 400/404/410/5xx -> most likely this model is retired/unavailable; try the next one
      tried.push(`${model}: HTTP ${resp.status} ${errText}`);
    }

    return res.status(502).json({ error: `Koi bhi NVIDIA model jawab nahi de paya. Koshish: ${tried.join(' | ')}. Agar models retire ho gaye hain to Vercel mein NVIDIA_MODEL set karo (build.nvidia.com pe model page -> View Code se naam milega).` });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
