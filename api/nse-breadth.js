// File location: /api/nse-breadth.js
//
// NSE India's website has no official public API — this uses the same
// two-step pattern as popular unofficial scraper libraries (nsetools,
// dalal, stock-nse-india): first hit the homepage to get session cookies
// (NSE blocks direct API calls without them), then call their internal
// allIndices endpoint, which includes each index's advance/decline counts.
// This is best-effort/experimental — NSE can change this anytime without
// notice, similar to our Stooq/GDELT integrations.
//
// USAGE: /api/nse-breadth  (returns breadth for NIFTY 50 by default)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  try {
    // Step 1: hit the homepage to collect session cookies
    const homeResp = await fetch('https://www.nseindia.com/', { headers });
    const setCookie = homeResp.headers.get('set-cookie') || '';
    const cookieHeader = setCookie.split(',').map(c => c.split(';')[0]).join('; ');

    // Step 2: call allIndices using those cookies — this includes advances/
    // declines per index (NIFTY 50, BANK NIFTY, etc.)
    const dataResp = await fetch('https://www.nseindia.com/api/allIndices', {
      headers: { ...headers, 'Cookie': cookieHeader, 'Referer': 'https://www.nseindia.com/' }
    });

    if (!dataResp.ok) {
      return res.status(dataResp.status).json({ error: `NSE responded HTTP ${dataResp.status} — they may have changed/blocked this endpoint.` });
    }

    const json = await dataResp.json();
    const niftyRow = (json.data || []).find(row => row.index === 'NIFTY 50') || null;

    return res.status(200).json({
      nifty50: niftyRow ? {
        advances: niftyRow.advances,
        declines: niftyRow.declines,
        unchanged: niftyRow.unchanged,
        last: niftyRow.last,
        percentChange: niftyRow.percentChange,
      } : null,
      raw_found: !!niftyRow,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
