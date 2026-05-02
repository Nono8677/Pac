'use strict';

const CONFIG = {
    pairs: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'],
    utBot: { keyValue: 2, atrPeriod: 10 },
    supertrend: { period: 10, multiplier: 3 },
    qqe: { rsi: 14, smooth: 5, fast: 4.236 },
    startCapital: 1000,
    launchDate: '2026-02-28', // Point de départ pour la progression
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
    currentPair: 'BTCUSDT', // Pour la progression dynamique
    loading: false 
};

/* --- MOTEUR DE CALCUL --- */

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
    let ub = new Array(c.length).fill(0), lb = new Array(c.length).fill(0), d = new Array(c.length).fill(1);
    for (let i = CONFIG.supertrend.period; i < c.length; i++) {
        let mid = (h[i] + l[i]) / 2;
        ub[i] = mid + CONFIG.supertrend.multiplier * a[i];
        lb[i] = mid - CONFIG.supertrend.multiplier * a[i];
        d[i] = (c[i] > ub[i-1]) ? -1 : (c[i] < lb[i-1] ? 1 : d[i-1]);
    }
    const isBull = d[c.length-1] === -1;
    return { signal: isBull ? 'bull' : 'bear', line: isBull ? lb[lb.length-1] : ub[ub.length-1] };
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

/* --- AFFICHAGE DES SIGNAUX --- */

function renderSignals() {
    const container = document.getElementById('signals-container');
    if (!container) return;
    container.innerHTML = CONFIG.pairs.map(s => {
        const d = state.signals[s];
        if (!d) return `<div class="crypto-card">Analyse de ${s}...</div>`;
        
        const score = (d.ut === 'bull' ? 1 : 0) + (d.st === 'bull' ? 1 : 0) + (d.qqe === 'bull' ? 1 : 0);
        const isBuy = score >= 2;

        return `
            <div class="crypto-card">
                <div class="card-info">${s} : ${d.price.toFixed(2)} $</div>
                <div class="verdict ${isBuy ? 'buy' : 'out'}">
                    ${isBuy ? "J'ACHÈTE" : "HORS MARCHÉ"}
                </div>
                ${!isBuy ? `<div class="target-price">Cible : ${d.stLine.toFixed(2)} $</div>` : ''}
            </div>`;
    }).join('');
}

/* --- PROGRESSION DU PORTEFEUILLE (Système Préservé) --- */

async function refreshPortfolio() {
    const container = document.getElementById('portfolio-container');
    if(!container) return;
    try {
        // Progression calculée en 'd' (journalier) sur la crypto sélectionnée
        const res = await fetch(`${BINANCE_BASE}/klines?symbol=${state.currentPair}&interval=1d&limit=100`);
        const data = await res.json();
        
        const pNow = parseFloat(data[data.length-1][4]);
        const pLaunch = parseFloat(data[0][4]); // Référence historique
        
        const perf = ((pNow - pLaunch) / pLaunch) * 100;
        const cap = CONFIG.startCapital * (1 + perf / 100);

        container.innerHTML = `
            <div class="portfolio-card">
                <div class="perf-title">Progression (${state.currentPair})</div>
                <div class="cap-val">${cap.toFixed(2)} $</div>
                <div class="perf-val ${perf >= 0 ? 'plus' : 'minus'}">
                    ${perf >= 0 ? '▲' : '▼'} ${perf.toFixed(2)}%
                </div>
            </div>`;
    } catch (e) { console.error("Erreur portfolio", e); }
}

/* --- LOGIQUE GÉNÉRALE --- */

async function analyzeAll() {
    if (state.loading) return;
    state.loading = true;
    document.getElementById('last-update').innerText = "Analyse...";

    for (const s of CONFIG.pairs) {
        try {
            const r = await fetch(`${BINANCE_BASE}/klines?symbol=${s}&interval=${state.selectedSignalTf}&limit=250`);
            const d = await r.json();
            const k = { highs: d.map(x=>parseFloat(x[2])), lows: d.map(x=>parseFloat(x[3])), closes: d.map(x=>parseFloat(x[4])) };
            const stRes = calcSuperTrend(k.highs, k.lows, k.closes);
            state.signals[s] = {
                ut: calcUTBot(k.highs, k.lows, k.closes),
                st: stRes.signal,
                stLine: stRes.line,
                qqe: calcQQEMod(k.closes),
                price: k.closes[k.closes.length-1]
            };
            renderSignals();
        } catch(e) { }
    }
    state.loading = false;
    document.getElementById('last-update').innerText = "À jour";
    refreshPortfolio();
}

function init() {
    document.querySelectorAll('.nav-tab').forEach(t => t.addEventListener('click', () => {
        document.querySelectorAll('.nav-tab, .tab-content').forEach(el => el.classList.remove('active'));
        t.classList.add('active');
        document.getElementById(t.dataset.tab).classList.add('active');
    }));

    const sTf = document.getElementById('signal-tf-select');
    CONFIG.timeframes.forEach(t => sTf.add(new Option(t.label, t.value)));
    sTf.value = state.selectedSignalTf;
    sTf.onchange = e => { state.selectedSignalTf = e.target.value; analyzeAll(); };

    document.getElementById('refresh-btn').onclick = analyzeAll;
    
    // Pour changer la crypto de référence du portfolio
    // On clique sur une carte crypto pour changer le calcul du capital
    document.addEventListener('click', (e) => {
        const card = e.target.closest('.crypto-card');
        if(card) {
            const pair = card.querySelector('.card-info').innerText.split(' :')[0];
            state.currentPair = pair;
            refreshPortfolio();
        }
    });

    analyzeAll();
}

document.addEventListener('DOMContentLoaded', init);
