'use strict';

const CONFIG = {
    pairs: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'],
    utBot: { keyValue: 2, atrPeriod: 10 },
    supertrend: { period: 10, multiplier: 3 },
    qqe: { rsi: 14, smooth: 5, fast: 4.236 },
    startCapital: 1000,
    fixedLaunchDate: new Date('2026-03-01T00:00:00Z'),
    timeframes: [
        { label: '1H', value: '1h' },
        { label: '4H', value: '4h' },
        { label: 'D', value: '1d' }
    ]
};

const BINANCE_BASE = 'https://api.binance.com/api/v3';

let state = {
    signals: {},
    selectedSignalTf: '1d',
    selectedPair: 'BTCUSDT',
    selectedTf: '1d',
    loading: false
};

/* --- INDICATEURS TECHNIQUES --- */

function getATR(h, l, c, p) {
    const tr = c.map((v, i) => i === 0 ? 0 : Math.max(h[i]-l[i], Math.abs(h[i]-c[i-1]), Math.abs(l[i]-c[i-1])));
    let res = new Array(c.length).fill(0);
    let sum = 0; for(let i=1; i<=p; i++) sum += tr[i];
    res[p] = sum / p;
    for(let i=p+1; i<c.length; i++) res[i] = (res[i-1] * (p-1) + tr[i]) / p;
    return res;
}

function calcUTBot(h, l, c) {
    const a = getATR(h, l, c, CONFIG.utBot.atrPeriod);
    let ts = new Array(c.length).fill(0), p = new Array(c.length).fill(0);
    for (let i = 1; i < c.length; i++) {
        let nL = CONFIG.utBot.keyValue * a[i];
        if (c[i] > ts[i-1] && c[i-1] > ts[i-1]) ts[i] = Math.max(ts[i-1], c[i]-nL);
        else if (c[i] < ts[i-1] && c[i-1] < ts[i-1]) ts[i] = Math.min(ts[i-1], c[i]+nL);
        else ts[i] = c[i] > ts[i-1] ? c[i]-nL : c[i]+nL;
        p[i] = (c[i-1] <= ts[i-1] && c[i] > ts[i]) ? 1 : (c[i-1] >= ts[i-1] && c[i] < ts[i]) ? -1 : p[i-1];
    }
    return p[c.length-1] === 1 ? 'bull' : 'bear';
}

function calcSuperTrend(h, l, c) {
    const a = getATR(h, l, c, CONFIG.supertrend.period);
    let ub = new Array(c.length).fill(0), d = new Array(c.length).fill(1);
    for (let i = CONFIG.supertrend.period; i < c.length; i++) {
        ub[i] = ((h[i] + l[i]) / 2) + CONFIG.supertrend.multiplier * a[i];
        d[i] = (c[i] > ub[i-1]) ? -1 : (c[i] < ub[i-1] ? 1 : d[i-1]);
    }
    return { signal: d[c.length-1] === -1 ? 'bull' : 'bear', target: ub[c.length-1] };
}

function calcQQEMod(closes) {
    const rsiPeriod = CONFIG.qqe.rsi;
    let changes = closes.map((c, i) => i === 0 ? 0 : c - closes[i-1]);
    let gains = changes.map(v => v > 0 ? v : 0);
    let losses = changes.map(v => v < 0 ? -v : 0);
    let avgG = gains.slice(1, rsiPeriod+1).reduce((a,b)=>a+b)/rsiPeriod;
    let avgL = losses.slice(1, rsiPeriod+1).reduce((a,b)=>a+b)/rsiPeriod;
    let rsi = new Array(closes.length).fill(50);
    for(let i=rsiPeriod+1; i<closes.length; i++) {
        avgG = (avgG*(rsiPeriod-1)+gains[i])/rsiPeriod;
        avgL = (avgL*(rsiPeriod-1)+losses[i])/rsiPeriod;
        rsi[i] = 100 - (100/(1+(avgG/avgL)));
    }
    let rsiMa = new Array(rsi.length).fill(50);
    const alpha = 2/(CONFIG.qqe.smooth+1);
    for(let i=1; i<rsi.length; i++) rsiMa[i] = rsi[i]*alpha + rsiMa[i-1]*(1-alpha);
    return (rsiMa[rsiMa.length-1] > 50 && rsiMa[rsiMa.length-1] > rsiMa[rsiMa.length-2]) ? 'bull' : 'bear';
}

/* --- LOGIQUE DES SIGNAUX --- */

function renderSignals() {
    const container = document.getElementById('signals-container');
    if (!container) return;
    container.innerHTML = CONFIG.pairs.map(s => {
        const d = state.signals[s];
        if (!d) return `<div class="crypto-card">Calcul ${s}...</div>`;
        const isFullBull = (d.ut === 'bull' && d.st === 'bull' && d.qqe === 'bull');
        return `
            <div class="crypto-card" style="border-left: 5px solid ${isFullBull ? '#0ecb81' : '#f6465d'}">
                <div style="display:flex; justify-content:space-between; font-weight:bold;">
                    <span>${s}</span><span>${d.price.toFixed(2)} $</span>
                </div>
                <div class="verdict ${isFullBull ? 'buy' : 'out'}">${isFullBull ? "FUSION : ACHAT" : "ATTENTE"}</div>
                <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:5px; margin-top:10px; font-size:0.6rem; text-align:center; font-weight:bold;">
                    <div style="color:${d.ut==='bull'?'#0ecb81':'#f6465d'}">UT: ${d.ut}</div>
                    <div style="color:${d.st==='bull'?'#0ecb81':'#f6465d'}">ST: ${d.st}</div>
                    <div style="color:${d.qqe==='bull'?'#0ecb81':'#f6465d'}">QQE: ${d.qqe}</div>
                </div>
            </div>`;
    }).join('');
}

async function analyzeAll() {
    if (state.loading) return;
    state.loading = true;
    document.getElementById('last-update').innerText = "Analyse Fusion...";
    for (const s of CONFIG.pairs) {
        try {
            const r = await fetch(`${BINANCE_BASE}/klines?symbol=${s}&interval=${state.selectedSignalTf}&limit=300`);
            const d = await r.json();
            const k = { highs: d.map(x=>parseFloat(x[2])), lows: d.map(x=>parseFloat(x[3])), closes: d.map(x=>parseFloat(x[4])) };
            const stData = calcSuperTrend(k.highs, k.lows, k.closes);
            state.signals[s] = {
                ut: calcUTBot(k.highs, k.lows, k.closes),
                st: stData.signal,
                qqe: calcQQEMod(k.closes),
                price: k.closes[k.closes.length-1]
            };
            renderSignals();
        } catch(e) { console.error(s, e); }
    }
    state.loading = false;
    document.getElementById('last-update').innerText = "À jour";
}

/* --- LOGIQUE PORTFOLIO --- */

async function refreshPortfolio() {
    const container = document.getElementById('portfolio-container');
    if(!container) return;
    container.innerHTML = "Calcul...";
    try {
        const symbol = state.selectedPair;
        const interval = state.selectedTf;
        const startTs = CONFIG.fixedLaunchDate.getTime();
        
        // Prix Lancement
        const rL = await fetch(`${BINANCE_BASE}/klines?symbol=${symbol}&interval=${interval}&startTime=${startTs}&limit=1`);
        const dL = await rL.json();
        let pLaunch = dL.length > 0 ? parseFloat(dL[0][4]) : null;

        // Fallback si vide
        if (!pLaunch) {
            const kHisto = await fetch(`${BINANCE_BASE}/klines?symbol=${symbol}&interval=${interval}&limit=1000`).then(r => r.json());
            pLaunch = parseFloat(kHisto[0][4]);
        }

        // Prix Actuel
        const rNow = await fetch(`${BINANCE_BASE}/ticker/price?symbol=${symbol}`);
        const dNow = await rNow.json();
        const pNow = parseFloat(dNow.price);

        const perf = ((pNow - pLaunch) / pLaunch) * 100;
        const cap = CONFIG.startCapital * (1 + perf / 100);

        container.innerHTML = `
            <div class="portfolio-card">
                <div class="portfolio-value">${cap.toFixed(2)} $</div>
                <div class="portfolio-gain ${perf >= 0 ? 'up' : 'down'}">
                    ${perf >= 0 ? '▲' : '▼'} ${perf.toFixed(2)}%
                </div>
                <div style="font-size:0.7rem; opacity:0.5; margin-top:10px;">Lancement : ${pLaunch.toFixed(2)} $</div>
            </div>`;
    } catch (e) { container.innerHTML = "Erreur Portfolio"; }
}

/* --- UTILITAIRES & INIT --- */

function startCountdown() {
    setInterval(() => {
        const now = Date.now();
        const tf = state.selectedSignalTf;
        let ms = tf==='1h'?3600000 : tf==='4h'?14400000 : 86400000;
        const diff = (Math.ceil(now/ms)*ms) - now;
        const h=Math.floor(diff/3600000), m=Math.floor((diff%3600000)/60000), s=Math.floor((diff%60000)/1000);
        document.getElementById('countdown').innerText = `${h}h ${m}m ${s}s`;
        if (diff < 1000) setTimeout(analyzeAll, 2000);
    }, 1000);
}

function init() {
    // Tabs
    document.querySelectorAll('.nav-tab').forEach(t => t.addEventListener('click', () => {
        document.querySelectorAll('.nav-tab, .tab-content').forEach(el => el.classList.remove('active'));
        t.classList.add('active');
        document.getElementById(t.dataset.tab).classList.add('active');
        if(t.dataset.tab === 'tab-portfolio') refreshPortfolio();
    }));

    // Selectors
    const sTf = document.getElementById('signal-tf-select');
    const pP = document.getElementById('pf-pair-select');
    const pT = document.getElementById('pf-tf-select');

    CONFIG.timeframes.forEach(t => { sTf.add(new Option(t.label, t.value)); pT.add(new Option(t.label, t.value)); });
    CONFIG.pairs.forEach(p => pP.add(new Option(p.replace('USDT',''), p)));

    sTf.onchange = e => { state.selectedSignalTf = e.target.value; analyzeAll(); };
    pP.onchange = e => { state.selectedPair = e.target.value; refreshPortfolio(); };
    pT.onchange = e => { state.selectedTf = e.target.value; refreshPortfolio(); };

    document.getElementById('refresh-btn').onclick = analyzeAll;
    document.getElementById('pf-refresh-btn').onclick = refreshPortfolio;

    startCountdown();
    analyzeAll();
}

document.addEventListener('DOMContentLoaded', init);
