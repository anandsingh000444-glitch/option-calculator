// File location: /api/worldmonitor.js
//
// Generic passthrough proxy for World Monitor's public REST API
// (https://api.worldmonitor.app). Per their own FAQ, public endpoints don't
// require an API key — but this is a fast-moving open-source project, so
// treat this integration as EXPERIMENTAL. If a key ever becomes required,
// set WORLDMONITOR_API_KEY as an environment variable and it'll be sent
// automatically; until then it's optional.
//
// USAGE from the calculator:
//   /api/worldmonitor?path=intelligence/v1/get-risk-scores&country=IN
//   /api/worldmonitor?path=market/v1/list-market-quotes&symbols=^DJI,^IXIC,CL=F
//
// The `path` query param maps directly to World Monitor's own path structure
// (see their API docs: domain/v1/endpoint-name). Everything else in the query
// string is forwarded as-is to World Monitor.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { path, ...rest } = req.query;
  if (!path) {
    return res.status(400).json({ error: 'Missing ?path= (e.g. intelligence/v1/get-risk-scores)' });
  }

  const qs = new URLSearchParams(rest).toString();
  const url = `https://api.worldmonitor.app/api/${path}${qs ? '?' + qs : ''}`;

  try {
    const headers = { 'Accept': 'application/json' };
    if (process.env.WORLDMONITOR_API_KEY) {
      headers['X-WorldMonitor-Key'] = process.env.WORLDMONITOR_API_KEY;
    }
    const upstreamResp = await fetch(url, { headers });
    const text = await upstreamResp.text();
    let data;
    try { data = JSON.parse(text); } catch(e) { data = { raw: text }; }
    return res.status(upstreamResp.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
