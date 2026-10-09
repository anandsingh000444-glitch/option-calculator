// File location: /api/ai-news-analysis.js
//
// Fetches recent news (same multi-provider logic as market-news.js, reused
// here) and sends the headlines to NVIDIA's free-tier Nemotron model asking
// for a concise Hinglish analysis of what matters for Indian markets
// (NIFTY/SENSEX).
//
// REQUIRES: NVIDIA_API_KEY environment variable — free to get at
// https://build.nvidia.com (sign in, Profile -> API Keys -> Generate API Key).
// NVIDIA's free tier is rate-limited (~40 requests/minute per key as of this
// writing) — fine for occasional manual use, but check build.nvidia.com for
// current limits since these can change.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const nvidiaKey = process.env.NVIDIA_API_KEY;
  if (!nvidiaKey) {
    return res.status(500).json({ error: 'Server missing NVIDIA_API_KEY environment variable. Ye feature use karne ke liye build.nvidia.com se free API key le kar Vercel Environment Variables mein add karo.' });
  }

  const query = req.query.symbols || 'NIFTY,SENSEX,India stock market';

  try {
    // Step 1: gather recent news (reusing the same provider logic as market-news.js —
    // GNews -> NewsAPI -> Marketaux fallback chain)
    const gnewsKeys = (process.env.GNEWS_API_KEYS || '').split(',').map(k=>k.trim()).filter(Boolean);
    const newsApiKeys = (process.env.NEWSAPI_API_KEYS || '').split(',').map(k=>k.trim()).filter(Boolean);
    const marketauxKey = process.env.MARKETAUX_API_KEY;

    let articles = [];
    for (const key of gnewsKeys) {
      try {
        const r = await fetch(`https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=en&max=10&apikey=${key}`);
        const j = await r.json();
        if (r.ok && j.articles?.length) { articles = j.articles.map(a => ({ title: a.title, source: a.source?.name, publishedAt: a.publishedAt })); break; }
      } catch(e) {}
    }
    if (!articles.length) {
      for (const key of newsApiKeys) {
        try {
          const r = await fetch(`https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&pageSize=10&sortBy=publishedAt&apiKey=${key}`);
          const j = await r.json();
          if (r.ok && j.articles?.length) { articles = j.articles.map(a => ({ title: a.title, source: a.source?.name, publishedAt: a.publishedAt })); break; }
        } catch(e) {}
      }
    }
    if (!articles.length && marketauxKey) {
      try {
        const r = await fetch(`https://api.marketaux.com/v1/news/all?search=${encodeURIComponent(query)}&language=en&limit=3&api_token=${marketauxKey}`);
        const j = await r.json();
        if (r.ok && j.data?.length) { articles = j.data.map(a => ({ title: a.title, source: a.source, publishedAt: a.published_at })); }
      } catch(e) {}
    }

    if (!articles.length) {
      return res.status(502).json({ error: 'Koi news nahi mili kisi provider se — pehle Market News section mein check karo providers kaam kar rahe hain.' });
    }

    // Step 2: send headlines to NVIDIA's Nemotron model for Hinglish analysis
    const headlinesText = articles.slice(0, 10).map((a,i) => `${i+1}. ${a.title} (${a.source || 'unknown'})`).join('\n');

    const nvidiaResp = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${nvidiaKey}`,
      },
      body: JSON.stringify({
        model: 'nvidia/llama-3.3-nemotron-super-49b-v1.5',
        max_tokens: 700,
        temperature: 0.5,
        messages: [{
          role: 'user',
          content: `Neeche kuch recent news headlines hain. Inme se jo bhi India ke stock market (NIFTY/SENSEX/F&O traders) ke liye relevant hain, unka concise analysis do — Hinglish mein (Hindi+English mix, jaise ek trader doosre trader se baat karta hai), 150-200 words mein. Bullet points mein batao: (1) kaunsi news market-relevant hai, (2) kya impact ho sakta hai (bullish/bearish/neutral), (3) kis sector/index par zyada asar. Agar koi headline market se directly related nahi hai to use skip kar do.\n\nHeadlines:\n${headlinesText}`
        }]
      })
    });

    if (!nvidiaResp.ok) {
      const errText = await nvidiaResp.text();
      return res.status(nvidiaResp.status).json({ error: `NVIDIA API error: ${errText.slice(0,300)}` });
    }

    const nvidiaJson = await nvidiaResp.json();
    const analysisText = nvidiaJson.choices?.[0]?.message?.content || 'No analysis generated.';

    return res.status(200).json({ analysis: analysisText, source_count: articles.length, headlines: articles.slice(0,10).map(a=>a.title) });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
