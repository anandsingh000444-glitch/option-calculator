// File location: /api/upstox-instrument-lookup.js
//
// Downloads Upstox's public NSE instrument master file (gzipped JSON), and
// searches it for F&O contracts matching a stock symbol (optionally filtered
// by expiry/strike/type), returning their instrument_key.
//
// USAGE: /api/upstox-instrument-lookup?symbol=RELIANCE&expiry=2026-07-31&strike=2900&type=CE
// (expiry/strike/type are optional — omit to see all matches for the symbol)
//
// NOTE: this file is large (thousands of F&O contracts across every stock/
// strike/expiry) — this is a first-attempt implementation; if it times out
// on Vercel's execution limits, we'll need to iterate (e.g. narrow the
// download, or increase maxDuration further in vercel.json).

import zlib from 'zlib';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { symbol, expiry, strike, type } = req.query;
  if (!symbol) {
    return res.status(400).json({ error: 'Missing ?symbol= (e.g. RELIANCE)' });
  }

  try {
    const fileResp = await fetch('https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz');
    if (!fileResp.ok) {
      return res.status(502).json({ error: `Upstox instrument file fetch failed: HTTP ${fileResp.status}` });
    }
    const buffer = Buffer.from(await fileResp.arrayBuffer());
    const decompressed = zlib.gunzipSync(buffer);
    const instruments = JSON.parse(decompressed.toString('utf-8'));

    const symbolUpper = symbol.trim().toUpperCase();
    let matches = instruments.filter(inst =>
      inst.segment === 'NSE_FO' &&
      (inst.trading_symbol || '').toUpperCase().includes(symbolUpper) &&
      (inst.instrument_type === 'CE' || inst.instrument_type === 'PE')
    );

    if (expiry) {
      matches = matches.filter(inst => inst.expiry === expiry || (inst.expiry || '').startsWith(expiry));
    }
    if (strike) {
      const strikeNum = parseFloat(strike);
      matches = matches.filter(inst => Math.abs(parseFloat(inst.strike_price) - strikeNum) < 0.01);
    }
    if (type) {
      matches = matches.filter(inst => inst.instrument_type === type.toUpperCase());
    }

    const results = matches.slice(0, 100).map(inst => ({
      trading_symbol: inst.trading_symbol,
      instrument_key: inst.instrument_key,
      expiry: inst.expiry,
      strike_price: inst.strike_price,
      instrument_type: inst.instrument_type,
    }));

    return res.status(200).json({ count: results.length, total_matched_before_limit: matches.length, data: results });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
