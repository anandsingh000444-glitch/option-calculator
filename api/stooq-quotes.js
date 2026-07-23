// File location: /api/stooq-quotes.js
//
// Proxies Stooq's free, no-key quote endpoint (used widely by pandas-datareader
// and similar tools). Stooq has no official documented API — this is a
// best-effort integration using their public CSV quote export, treat as
// experimental/supplementary, not a primary data source.
//
// USAGE: /api/stooq-quotes?symbols=^dji,^ndq,cl.f,usdinr
// (Stooq's own symbol notation — ^dji=Dow, ^ndq=Nasdaq Composite,
//  cl.f=WTI crude oil futures, usdinr=USD/INR)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const symbols = req.query.symbols || '^dji,^ndq,cl.f,usdinr';

  try {
    const url = `https://stooq.com/q/l/?s=${encodeURIComponent(symbols)}&f=sd2t2ohlcv&h&e=csv`;
    const resp = await fetch(url);
    const csvText = await resp.text();

    const lines = csvText.trim().split('\n');
    const header = lines[0].split(',').map(h => h.trim().replace(/"/g,''));
    const rows = lines.slice(1).map(line => {
      const cols = line.split(',').map(c => c.trim().replace(/"/g,''));
      const obj = {};
      header.forEach((h, i) => { obj[h] = cols[i]; });
      return obj;
    });

    return res.status(200).json({ data: rows });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
