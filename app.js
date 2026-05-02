'use strict';

const CONFIG = {
    pairs: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'],
    refreshInterval: 60,
    utBot: { keyValue: 2, atrPeriod: 10 },
    supertrend: { period: 10, multiplier: 3 },
    startCapital: 1000,
    fixedLaunchDate: new Date('2026-03-01T00:00:00Z'), // Performance depuis le 1er Mars
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
    loading: false
};

/* --- CALCULS --- */
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
    const direction = new Array(closes.length).fill(1);
    for (let i = period; i < closes.length; i++) {
        const hl2 = (highs[i] + lows[i]) / 2;
        upperBand[i] = (hl2 + multiplier * atrVals[i]);
        direction[i] = (closes[i] > upperBand[i-1]) ? -1 : (closes[i] < lowerBand[i-1]) ? 1 : direction[i-1];
    }
    return { signal: direction[closes.length-1] === -1 ? 'bull' : 'bear', target: upperBand[upperBand.length-1] };
}

/* --- API --- */
async function fetchKlines(symbol, interval) {
    const resp = await fetch(`${BINANCE_BASE}/klines?symbol=${symbol}&interval=${interval}&limit=300`);
    const data = await resp.json();
    return { highs: data.map(k => parseFloat(k[2])), lows: data.map(k => parseFloat(k[3])), closes: data.map(k => parseFloat(k[4])) };
}

async function fetchPriceAtLaunch(symbol, interval) {
    const startTs = CONFIG.fixedLaunchDate.getTime();
    const url = `${BINANCE_BASE}/klines?symbol=${symbol}&interval=${interval}&startTime=${startTs}&limit=1`;
    const resp = await fetch(url);
    const data = await resp.json();
    return data.length > 0 ? parseFloat(data[0][4]) : null;
}

/* --- LOGIQUE --- */
function startMarketCountdown() {
    const countdownEl = document.getElementById('countdown');
    setInterval(() => {
        const now = Date.now();
        const tf = state.selectedSignalTf;
        let pMs = (tf==='1h')?3600000:(tf==='4h')?14400000:(tf==='1d')?86400000:604800000;
        const next = Math.ceil(now / pMs) * pMs;
        const diff = next - now;
        const h = Math.floor(diff/3600000), m = Math.floor((diff%3600000)/60000), s = Math.floor((diff%60000)/1000);
        countdownEl.innerText = `CLÔTURE : ${h}h ${m}m ${s}s`;
        if (diff <= 1000) setTimeout(analyzeAll, 1500);
    }, 1000);
}

async function analyzeAll() {
    if (state.loading) return;
    state.loading = true;
    document.getElementById('last-update').innerText = "Analyse...";
    for (const s of CONFIG.pairs) {
        try {
            const k = await fetchKlines(s, state.selectedSignalTf);
            state.signals[s] = { ut: calcUTBot(k.highs, k.lows, k.closes), st: calcSuperTrend(k.highs, k.lows, k.closes), price: k.closes[k.closes.length-1] };
        } catch(e) {}
    }
    state.loading = false;
    document.getElementById('last-update').innerText = "À jour";
    renderSignals();
}

function renderSignals() {
    const container = document.getElementById('signals-container');
    container.innerHTML = CONFIG.pairs.map(s => {
        const d = state.signals[s]; if (!d) return '';
        const buy = d.ut === 'bull' && d.st.signal === 'bull';
        return `<div class="crypto-card">
            <div class="coin-name">${s} (${state.selectedSignalTf.toUpperCase()}) : ${d.price.toFixed(2)} $</div>
            <div class="verdict ${buy?'buy':'out'}">${buy?"J'ACHÈTE":"HORS MARCHÉ"}</div>
            ${!buy?`<div style="font-size:0.8rem; margin-top:8px; opacity:0.6">Cible : ${d.st.target.toFixed(2)} $</div>`:''}
        </div>`;
    }).join('');
}

async function refreshPortfolio() {
    const container = document.getElementById('portfolio-container');
    container.innerHTML = "Calcul depuis le 01/03...";
    try {
        const pLaunch = await fetchPriceAtLaunch(state.selectedPair, state.selectedTf);
        const k = await fetchKlines(state.selectedPair, state.selectedTf);
        const pNow = k.closes[k.closes.length-1];
        if (!pLaunch) throw new Error("Historique indisponible");
        const perf = ((pNow - pLaunch) / pLaunch) * 100;
        const cap = CONFIG.startCapital * (1 + perf/100);
        container.innerHTML = `<div class="portfolio-card">
            <div style="font-size:0.8rem; opacity:0.6; margin-bottom:5px;">Capital depuis le 01/03</div>
            <div class="portfolio-value">${cap.toFixed(2)} $</div>
            <div class="portfolio-gain ${perf>=0?'up':'down'}">${perf>=0?'▲':'▼'} ${perf.toFixed(2)}%</div>
            <div style="margin-top:15px; border-top:1px solid var(--border); padding-top:10px; font-size:0.8rem;">
                <div style="display:flex; justify-content:space-between;"><span>Prix au 01/03:</span><b>${pLaunch.toFixed(2)} $</b></div>
                <div style="display:flex; justify-content:space-between;"><span>Prix Actuel:</span><b>${pNow.toFixed(2)} $</b></div>
            </div>
        </div>`;
    } catch(e) { container.innerHTML = `<div style="color:var(--red)">Erreur : ${e.message} (Utilisez l'unité D)</div>`; }
}

function init() {
    document.querySelectorAll('.nav-tab').forEach(t => t.addEventListener('click', () => {
        document.querySelectorAll('.nav-tab, .tab-content').forEach(el => el.classList.remove('active'));
        t.classList.add('active'); document.getElementById(t.dataset.tab).classList.add('active');
        if(t.dataset.tab==='tab-portfolio') refreshPortfolio();
    }));
    const sTf = document.getElementById('signal-tf-select'), pP = document.getElementById('pf-pair-select'), pT = document.getElementById('pf-tf-select');
    CONFIG.timeframes.forEach(t => { sTf.add(new Option(t.label, t.value)); pT.add(new Option(t.label, t.value)); });
    CONFIG.pairs.forEach(p => pP.add(new Option(p.replace('USDT',''), p)));
    sTf.addEventListener('change', e => { state.selectedSignalTf = e.target.value; analyzeAll(); });
    pP.addEventListener('change', e => { state.selectedPair = e.target.value; refreshPortfolio(); });
    pT.addEventListener('change', e => { state.selectedTf = e.target.value; refreshPortfolio(); });
    document.getElementById('refresh-btn').onclick = analyzeAll;
    document.getElementById('pf-refresh-btn').onclick = refreshPortfolio;
    startMarketCountdown(); analyzeAll();
}
document.addEventListener('DOMContentLoaded', init);
