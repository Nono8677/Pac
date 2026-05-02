'use strict';

const CONFIG = {
    pairs: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'],
    refreshInterval: 60,
    utBot: { keyValue: 2, atrPeriod: 10 },
    supertrend: { period: 10, multiplier: 3 },
    startCapital: 1000,
    fixedLaunchDate: new Date('2026-03-01T00:00:00Z'),
    timeframes: [
        { label: '1H', value: '1h' },
        { label: '4H', value: '4h' },
        { label: 'D', value: '1d' }
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

// Fonctions techniques de base (ATR, UTBot, SuperTrend) identiques à précédemment...
function atr(h, l, c, p) {
    const tr = c.map((v, i) => i === 0 ? 0 : Math.max(h[i]-l[i], Math.abs(h[i]-c[i-1]), Math.abs(l[i]-c[i-1])));
    let res = new Array(c.length).fill(0);
    let sum = 0; for(let i=1; i<=p; i++) sum += tr[i];
    res[p] = sum / p;
    for(let i=p+1; i<c.length; i++) res[i] = (res[i-1] * (p-1) + tr[i]) / p;
    return res;
}

function calcUTBot(h, l, c) {
    const kv = CONFIG.utBot.keyValue, ap = CONFIG.utBot.atrPeriod;
    const a = atr(h, l, c, ap);
    let ts = new Array(c.length).fill(0), p = new Array(c.length).fill(0);
    for (let i = 1; i < c.length; i++) {
        let nL = kv * a[i];
        if (c[i] > ts[i-1] && c[i-1] > ts[i-1]) ts[i] = Math.max(ts[i-1], c[i]-nL);
        else if (c[i] < ts[i-1] && c[i-1] < ts[i-1]) ts[i] = Math.min(ts[i-1], c[i]+nL);
        else ts[i] = c[i] > ts[i-1] ? c[i]-nL : c[i]+nL;
        if (c[i-1] <= ts[i-1] && c[i] > ts[i]) p[i] = 1;
        else if (c[i-1] >= ts[i-1] && c[i] < ts[i]) p[i] = -1;
        else p[i] = p[i-1];
    }
    return p[p.length-1] === 1 ? 'bull' : 'bear';
}

function calcSuperTrend(h, l, c) {
    const p = CONFIG.supertrend.period, m = CONFIG.supertrend.multiplier;
    const a = atr(h, l, c, p);
    let ub = new Array(c.length).fill(0), d = new Array(c.length).fill(1);
    for (let i = p; i < c.length; i++) {
        ub[i] = ((h[i] + l[i]) / 2) + m * a[i];
        d[i] = (c[i] > ub[i-1]) ? -1 : (c[i] < ub[i-1] ? 1 : d[i-1]);
    }
    return { signal: d[c.length-1] === -1 ? 'bull' : 'bear', target: ub[c.length-1] };
}

async function fetchKlines(s, i) {
    try {
        const r = await fetch(`${BINANCE_BASE}/klines?symbol=${s}&interval=${i}&limit=300`);
        const d = await r.json();
        return { highs: d.map(k=>parseFloat(k[2])), lows: d.map(k=>parseFloat(k[3])), closes: d.map(k=>parseFloat(k[4])) };
    } catch(e) { return null; }
}

async function analyzeAll() {
    if (state.loading) return;
    state.loading = true;
    const updateEl = document.getElementById('last-update');
    if(updateEl) updateEl.innerText = "Analyse...";

    for (const s of CONFIG.pairs) {
        const k = await fetchKlines(s, state.selectedSignalTf);
        if (k) {
            state.signals[s] = {
                ut: calcUTBot(k.highs, k.lows, k.closes),
                st: calcSuperTrend(k.highs, k.lows, k.closes),
                price: k.closes[k.closes.length-1]
            };
        }
    }
    state.loading = false;
    if(updateEl) updateEl.innerText = "À jour";
    renderSignals();
}

function renderSignals() {
    const container = document.getElementById('signals-container');
    if(!container) return;
    container.innerHTML = CONFIG.pairs.map(s => {
        const d = state.signals[s];
        if (!d) return `<div class="crypto-card">Chargement ${s}...</div>`;
        const buy = d.ut === 'bull' && d.st.signal === 'bull';
        return `
            <div class="crypto-card">
                <div class="coin-name">${s} (${state.selectedSignalTf.toUpperCase()}) : ${d.price.toFixed(2)} $</div>
                <div class="verdict ${buy?'buy':'out'}">${buy?"J'ACHÈTE":"HORS MARCHÉ"}</div>
                ${!buy?`<div style="font-size:0.8rem; margin-top:8px; opacity:0.6">Cible : ${d.st.target.toFixed(2)} $</div>`:''}
            </div>`;
    }).join('');
}

// ... (Garde les fonctions startMarketCountdown, refreshPortfolio et init telles quelles)
// Assure-toi juste que renderSignals() est bien appelée à la fin de analyzeAll().

async function refreshPortfolio() {
    const container = document.getElementById('portfolio-container');
    if(!container) return;
    container.innerHTML = "Calcul...";
    try {
        const s = state.selectedPair, i = state.selectedTf;
        const startTs = CONFIG.fixedLaunchDate.getTime();
        const rL = await fetch(`${BINANCE_BASE}/klines?symbol=${s}&interval=${i}&startTime=${startTs}&limit=1`);
        const dL = await rL.json();
        const pLaunch = dL.length > 0 ? parseFloat(dL[0][4]) : null;
        
        const k = await fetchKlines(s, i);
        const pNow = k.closes[k.closes.length-1];

        if (!pLaunch) throw new Error("Historique trop court");
        const perf = ((pNow - pLaunch) / pLaunch) * 100;
        const cap = CONFIG.startCapital * (1 + perf/100);

        container.innerHTML = `
            <div class="portfolio-card">
                <div style="font-size:0.8rem; opacity:0.6;">Depuis le 01/03</div>
                <div class="portfolio-value">${cap.toFixed(2)} $</div>
                <div class="portfolio-gain ${perf>=0?'up':'down'}">${perf>=0?'▲':'▼'} ${perf.toFixed(2)}%</div>
            </div>`;
    } catch(e) { container.innerHTML = "Erreur (Utilisez D)"; }
}

function init() {
    // Nav tabs
    document.querySelectorAll('.nav-tab').forEach(t => t.addEventListener('click', () => {
        document.querySelectorAll('.nav-tab, .tab-content').forEach(el => el.classList.remove('active'));
        t.classList.add('active');
        const target = document.getElementById(t.dataset.tab);
        if(target) target.classList.add('active');
        if(t.dataset.tab === 'tab-portfolio') refreshPortfolio();
    }));

    // Selectors
    const sTf = document.getElementById('signal-tf-select');
    const pP = document.getElementById('pf-pair-select');
    const pT = document.getElementById('pf-tf-select');

    if(sTf && pP && pT) {
        CONFIG.timeframes.forEach(t => { sTf.add(new Option(t.label, t.value)); pT.add(new Option(t.label, t.value)); });
        CONFIG.pairs.forEach(p => pP.add(new Option(p.replace('USDT',''), p)));
        sTf.addEventListener('change', e => { state.selectedSignalTf = e.target.value; analyzeAll(); });
        pP.addEventListener('change', e => { state.selectedPair = e.target.value; refreshPortfolio(); });
        pT.addEventListener('change', e => { state.selectedTf = e.target.value; refreshPortfolio(); });
    }

    document.getElementById('refresh-btn').onclick = analyzeAll;
    document.getElementById('pf-refresh-btn').onclick = refreshPortfolio;

    analyzeAll();
    // Lancer le compte à rebours
    setInterval(() => {
        const now = Date.now(), tf = state.selectedSignalTf;
        let pMs = (tf==='1h')?3600000:(tf==='4h')?14400000:86400000;
        const diff = (Math.ceil(now/pMs)*pMs) - now;
        const h=Math.floor(diff/3600000), m=Math.floor((diff%3600000)/60000), s=Math.floor((diff%60000)/1000);
        document.getElementById('countdown').innerText = `CLÔTURE : ${h}h ${m}m ${s}s`;
    }, 1000);
}
document.addEventListener('DOMContentLoaded', init);
