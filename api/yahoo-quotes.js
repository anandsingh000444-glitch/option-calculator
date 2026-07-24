// File location: /api/yahoo-quotes.js
//
// Proxies Yahoo Finance's public chart endpoint (query1.finance.yahoo.com).
// This is an unofficial but very widely-used, reliable free source for quotes
// (used by countless open-source finance tools) — no API key needed.
//
// USAGE: /api/yahoo-quotes?symbols=^DJI,^IXIC,CL=F,INR=X
// (Yahoo's own ticker notation — ^DJI=Dow, ^IXIC=Nasdaq, CL=F=WTI crude,
//  INR=X=USD/INR)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const symbols = (req.query.symbols || '^DJI,^IXIC,CL=F,INR=X').split(',').map(s=>s.trim());

  try {
    const results = await Promise.all(symbols.map(async (sym) => {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}`;
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        }
      });
      const json = await resp.json();
      const result = json.chart?.result?.[0];
      if(!result) return { symbol: sym, error: 'no data' };
      const meta = result.meta;
      return {
        symbol: sym,
        price: meta.regularMarketPrice,
        previousClose: meta.chartPreviousClose ?? meta.previousClose,
        changePercent: (meta.chartPreviousClose || meta.previousClose)
          ? ((meta.regularMarketPrice - (meta.chartPreviousClose ?? meta.previousClose)) / (meta.chartPreviousClose ?? meta.previousClose)) * 100
          : null,
        currency: meta.currency,
      };
    }));

    return res.status(200).json({ data: results });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
