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
    // Encode each symbol individually but keep the comma separator literal —
    // encoding the whole string (including commas) turns them into %2C, which
    // Stooq's endpoint doesn't split on, silently returning zero rows.
    const symbolList = symbols.split(',').map(s => encodeURIComponent(s.trim())).join(',');
    const url = `https://stooq.com/q/l/?s=${symbolList}&f=sd2t2ohlcv&h&e=csv`;
    const resp = await fetch(url);
    const csvText = await resp.text();

    const lines = csvText.trim().split('\n');
    const header = lines[0].split(',').map(h => h.trim().replace(/"/g,''));
    const rows = lines.slice(1).map(line => {
      const cols = line.split(',').map(c => c.trim().replace(/"/g,''));
      const obj = {};
      header.forEach((h, i) => { obj[h] = cols[i]; });
      return obj;
    }).filter(r => Object.values(r).some(v => v !== undefined && v !== ''));

    if(!rows.length){
      // Nothing parsed — include the raw CSV so we can see exactly what Stooq sent back.
      return res.status(200).json({ data: [], debug_raw_csv: csvText.slice(0, 500) });
    }
    return res.status(200).json({ data: rows });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
