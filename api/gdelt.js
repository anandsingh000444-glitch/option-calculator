// File location: /api/gdelt.js
//
// Proxies GDELT's free, no-key DOC 2.0 API. GDELT does set CORS headers for
// direct browser embedding, but routing through our own server removes any
// doubt about browser-side network reliability/CORS edge cases — same
// server-to-server pattern used for our other proxies.
//
// USAGE: /api/gdelt?query=India&mode=timelinetone&timespan=3day

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { query, mode, timespan, ...rest } = req.query;
  if (!query) {
    return res.status(400).json({ error: 'Missing ?query= (e.g. India)' });
  }

  const params = new URLSearchParams({
    query,
    mode: mode || 'timelinetone',
    format: 'json',
    timespan: timespan || '3day',
    ...rest
  });

  try {
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?${params.toString()}`;
    const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); } catch(e) { data = { raw: text.slice(0,500) }; }
    return res.status(resp.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
