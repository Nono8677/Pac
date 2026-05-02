'use strict';

const CONFIG = {
  pairs: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'],
  defaultInterval: '1d',
  utBot: { keyValue: 2, atrPeriod: 10 },
  supertrend: { period: 10, multiplier: 3 },
  startCapital: 1000,
  refreshInterval: 60,
  timeframes: [{ label: '1H', value: '1h' }, { label: '4H', value: '4h' }, { label: 'D', value: '1d' }, { label: 'W', value: '1w' }]
};

const BINANCE_BASE = 'https://api.binance.com/api/v3';
let state = { signals: {}, portfolioData: {}, launchDate: getLaunchDate(), selectedPair: 'BTCUSDT', selectedTf: '1d' };

function getLaunchDate() {
  const stored = localStorage.getItem('pachecoin_launch');
  if (stored) return new Date(stored);
  const now = new Date();
  localStorage.setItem('pachecoin_launch', now.toISOString());
  return now;
}

// --- MATHS & INDICATORS ---
function atr(highs, lows, closes, period) {
  const tr = closes.map((c, i) => i === 0 ? 0 : Math.max(highs[i]-lows[i], Math.abs(highs[i]-closes[i-1]), Math.abs(lows[i]-closes[i-1])));
  const out = new Array(closes.length).fill(null);
  let sum = 0;
  for(let i=1; i<=period; i++) sum += tr[i];
  out[period] = sum / period;
  for(let i=period+1; i<closes.length; i++) out[i] = (out[i-1] * (period-1) + tr[i]) / period;
  return out;
}

function calcUTBot(highs, lows, closes) {
  const { keyValue: kv, atrPeriod } = CONFIG.utBot;
  const atrVals = atr(highs, lows, closes, atrPeriod);
  const trailStop = new Array(closes.length).fill(0);
  const pos = new Array(closes.length).fill(0);

  for (let i = 1; i < closes.length; i++) {
    const nLoss = kv * atrVals[i];
    if (closes[i] > trailStop[i-1] && closes[i-1] > trailStop[i-1]) trailStop[i] = Math.max(trailStop[i-1], closes[i] - nLoss);
    else if (closes[i] < trailStop[i-1] && closes[i-1] < trailStop[i-1]) trailStop[i] = Math.min(trailStop[i-1], closes[i] + nLoss);
    else trailStop[i] = closes[i] > trailStop[i-1] ? closes[i] - nLoss : closes[i] + nLoss;

    if (closes[i-1] <= trailStop[i-1] && closes[i] > trailStop[i]) pos[i] = 1;
    else if (closes[i-1] >= trailStop[i-1] && closes[i] < trailStop[i]) pos[i] = -1;
    else pos[i] = pos[i-1];
  }
  return { signal: pos[pos.length-1] === 1 ? 'bull' : 'bear', name: 'UT Bot' };
}

// --- API ---
async function fetchKlines(symbol, interval) {
  const resp = await fetch(`${BINANCE_BASE}/klines?symbol=${symbol}&interval=${interval}&limit=200`);
  const data = await resp.json();
  return { highs: data.map(k => parseFloat(k[2])), lows: data.map(k => parseFloat(k[3])), closes: data.map(k => parseFloat(k[4])), times: data.map(k => k[0]) };
}

async function fetchPriceAtLaunch(symbol, interval) {
  const launch = state.launchDate.getTime();
  const resp = await fetch(`${BINANCE_BASE}/klines?symbol=${symbol}&interval=${interval}&startTime=${launch}&limit=5`);
  const data = await resp.json();
  return data.length > 0 ? parseFloat(data[0][4]) : (await fetch(`${BINANCE_BASE}/ticker/price?symbol=${symbol}`).then(r => r.json())).price;
}

// --- LOGIQUE UI ---
async function analyzeAll() {
  for (const symbol of CONFIG.pairs) {
    const k = await fetchKlines(symbol, '1d');
    const ut = calcUTBot(k.highs, k.lows, k.closes);
    state.signals[symbol] = { ut, price: k.closes[k.closes.length-1] };
  }
  renderSignals();
}

function renderSignals() {
  const container = document.getElementById('signals-container');
  container.innerHTML = CONFIG.pairs.map(s => `
    <div class="crypto-card">
      <strong>${s}</strong>: ${state.signals[s].price} $
      <div class="verdict ${state.signals[s].ut.signal === 'bull' ? 'buy' : 'out'}">${state.signals[s].ut.signal === 'bull' ? "J'ACHÈTE" : "HORS MARCHÉ"}</div>
    </div>
  `).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/service-worker.js');
  analyzeAll();
  setInterval(analyzeAll, CONFIG.refreshInterval * 1000);
});
