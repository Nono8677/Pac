'use strict';

const CONFIG = {
    pairs: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'],
    refreshInterval: 60,
    utBot: { keyValue: 2, atrPeriod: 10 },
    supertrend: { period: 10, multiplier: 3 },
    startCapital: 1000,
    timeframes: [
        { label: '1H', value: '1h' },
        { label: '4H', value: '4h' },
        { label: 'D', value: '1d' },
        { label: 'W', value: '1w' }
    ],
};

const BINANCE_BASE = 'https://api.binance.com/api/v3';

let state = {
    signals: {},
    selectedSignalTf: '1d',
    selectedPair: 'BTCUSDT',
    selectedTf: '1d',
    launchDate: getLaunchDate(),
    loading: false
};

function getLaunchDate() {
    const stored = localStorage.getItem('pachecoin_launch');
    if (stored) return new Date(stored);
    const now = new Date();
    localStorage.setItem('pachecoin_launch', now.toISOString());
    return now;
}

// --- INDICATEURS ---
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
        if (closes[i] > trailStop[i-1] && closes[i-1] > trailStop[i-1]) trailStop[i] = Math.max(trailStop[i-1], closes[i]-nLoss);
        else if (closes[i] < trailStop[i-1] && closes[i-1] < trailStop[i-1]) trailStop[i] = Math.min(trailStop[i-1], closes[i]+nLoss);
        else trailStop[i] = closes[i] > trailStop[i-1] ? closes[i]-nLoss : closes[i]+nLoss;
        if (closes[i-1] <= trailStop[i-1] && closes[i] > trailStop[i]) pos[i] = 1;
        else if (closes[i-1] >= trailStop[i-1] && closes[i] < trailStop[i]) pos[i] = -1;
        else pos[i] = pos[i-1];
    }
    return pos[pos.length-1] === 1 ? 'bull' : 'bear';
}

function calcSuperTrend(highs, lows, closes) {
    const { period, multiplier } = CONFIG.supertrend;
    const atrVals = atr(highs, lows, closes, period);
    const upperBand = new Array(closes.length).fill(0);
    const lowerBand = new Array(closes.length).fill(0);
    const direction = new Array(closes.length).fill(1);
    for (let i = period; i < closes.length; i++) {
        const hl2 = (highs[i] + lows[i]) / 2;
        upperBand[i] = (hl2 + multiplier * atrVals[i]);
        lowerBand[i] = (hl2 - multiplier * atrVals[i]);
        direction[i] = (closes[i] > upperBand[i-1]) ? -1 : (closes[i] < lowerBand[i-1]) ? 1 : direction[i-1];
    }
    return { signal: direction[closes.length-1] === -1 ? 'bull' : 'bear', target: upperBand[upperBand.length-1] };
}

// --- API ---
async function fetchKlines(symbol, interval) {
    const resp = await fetch(`${BINANCE_BASE}/klines?symbol=${symbol}&interval=${interval}&limit=300`);
    const data = await resp.json();
    return { highs: data.map(k => parseFloat(k[2])), lows: data.map(k => parseFloat(k[3])), closes: data.map(k => parseFloat(k[4])) };
}

async function fetchPriceAtLaunch(symbol, interval) {
    const launch = state.launchDate.getTime();
    const resp = await fetch(`${BINANCE_BASE}/klines?symbol=${symbol}&interval=${interval}&startTime=${launch}&limit=1`);
    const data = await resp.json();
    return data.length > 0 ? parseFloat(data[0][4]) : null;
}

// --- LOGIQUE UI ---
async function analyzeAll() {
    state.loading = true;
    for (const symbol of CONFIG.pairs) {
        const k = await fetchKlines(symbol, state.selectedSignalTf);
        const ut = calcUTBot(k.highs, k.lows, k.closes);
        const st = calcSuperTrend(k.highs, k.lows, k.closes);
        state.signals[symbol] = { ut, st, price: k.closes[k.closes.length-1] };
    }
    state.loading = false;
    renderSignals();
}

function renderSignals() {
    const container = document.getElementById('signals-container');
    const tf = state.selectedSignalTf.toUpperCase();
    container.innerHTML = CONFIG.pairs.map(s => {
        const d = state.signals[s];
        const isBuy = d.ut === 'bull' && d.st.signal === 'bull';
        return `
            <div class="crypto-card">
                <div class="coin-name">${s} (${tf}) : ${d.price.toFixed(2)} $</div>
                <div class="verdict ${isBuy ? 'buy' : 'out'}">${isBuy ? "J'ACHÈTE" : "HORS MARCHÉ"}</div>
                ${!isBuy ? `<div style="font-size:0.8rem; margin-top:8px; opacity:0.6">Cible : ${d.st.target.toFixed(2)} $</div>` : ''}
            </div>`;
    }).join('');
}

async function refreshPortfolio() {
    const container = document.getElementById('portfolio-container');
    const pLaunch = await fetchPriceAtLaunch(state.selectedPair, state.selectedTf);
    const k = await fetchKlines(state.selectedPair, state.selectedTf);
    const pNow = k.closes[k.closes.length-1];
    
    if(!pLaunch) { container.innerHTML = "Prix d'origine introuvable"; return; }
    
    const perf = ((pNow - pLaunch) / pLaunch) * 100;
    const currentCap = CONFIG.startCapital * (1 + perf/100);
    
    container.innerHTML = `
        <div class="portfolio-card">
            <div class="portfolio-value">${currentCap.toFixed(2)} $</div>
            <div class="portfolio-gain ${perf >= 0 ? 'up' : 'down'}">${perf >= 0 ? '+' : ''}${perf.toFixed(2)}%</div>
            <div class="pf-row"><span>Prix Début:</span> <span>${pLaunch.toFixed(2)} $</span></div>
            <div class="pf-row"><span>Prix Actuel:</span> <span>${pNow.toFixed(2)} $</span></div>
        </div>`;
}

function init() {
    // Tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.nav-tab, .tab-content').forEach(el => el.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.add('active');
            if(tab.dataset.tab === 'tab-portfolio') refreshPortfolio();
        });
    });

    // Sélecteurs
    const sigTf = document.getElementById('signal-tf-select');
    const pfPair = document.getElementById('pf-pair-select');
    const pfTf = document.getElementById('pf-tf-select');

    CONFIG.timeframes.forEach(t => {
        sigTf.add(new Option(t.label, t.value));
        pfTf.add(new Option(t.label, t.value));
    });
    CONFIG.pairs.forEach(p => pfPair.add(new Option(p.replace('USDT',''), p)));

    sigTf.value = state.selectedSignalTf;
    sigTf.addEventListener('change', (e) => { state.selectedSignalTf = e.target.value; analyzeAll(); });
    pfPair.addEventListener('change', (e) => { state.selectedPair = e.target.value; refreshPortfolio(); });
    pfTf.addEventListener('change', (e) => { state.selectedTf = e.target.value; refreshPortfolio(); });
    
    document.getElementById('refresh-btn').onclick = analyzeAll;
    document.getElementById('pf-refresh-btn').onclick = refreshPortfolio;

    analyzeAll();
}

document.addEventListener('DOMContentLoaded', init);
