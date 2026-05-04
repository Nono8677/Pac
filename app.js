'use strict';

const CONFIG = {
    pairs: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'],
    utBot: { keyValue: 2, atrPeriod: 10 },
    supertrend: { period: 10, multiplier: 3 },
    qqe: { rsi: 14, smooth: 5, fast: 4.236 },
    startCapital: 1000,
    launchDate: '2026-03-01', 
    timeframes: [
        { label: '1H', value: '1h' },
        { label: '4H', value: '4h' },
        { label: 'D', value: '1d' }
    ]
};

const BINANCE_BASE = 'https://api.binance.com/api/v3';
let state = { signals: {}, selectedTf: '1d', currentPair: 'BTCUSDT' };

/* --- CALCULS TECHNIQUES --- */
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

/* --- TIMER ET PORTFOLIO --- */
function updateCountdown() {
    const now = new Date();
    let ms;
    if (state.selectedTf === '1h') ms = 3600000 - (now % 3600000);
    else if (state.selectedTf === '4h') ms = 14400000 - (now % 14400000);
    else ms = 86400000 - (now % 86400000);
    const h = Math.floor(ms / 3600000).toString().padStart(2, '0');
    const m = Math.floor((ms % 3600000) / 60000).toString().padStart(2, '0');
    const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
    document.getElementById('countdown').innerText = `${h}:${m}:${s}`;
}

async function refreshPortfolio(pair) {
    const container = document.getElementById('portfolio-container');
    try {
        const res = await fetch(`${BINANCE_BASE}/klines?symbol=${pair}&interval=1d&limit=150`);
        const data = await res.json();
        const closes = data.map(x => parseFloat(x[4]));
        const pStart = closes[0]; 
        const pEnd = closes[closes.length - 1];
        const perf = ((pEnd - pStart) / pStart) * 100;
        const currentCap = CONFIG.startCapital * (1 + (perf / 100));

        container.innerHTML = `
            <div class="portfolio-card">
                <div style="color:#f0b90b; margin-bottom:15px; font-weight:bold;">PROGRESSION D : ${pair}</div>
                <div class="cap-val">${currentCap.toFixed(2)} $</div>
                <div class="perf-val ${perf >= 0 ? 'plus' : 'minus'}">${perf >= 0 ? '▲' : '▼'} ${perf.toFixed(2)}%</div>
                <p style="margin-top:20px; font-size:0.8rem; opacity:0.5;">Base : 1000$ le 01/03/26</p>
            </div>`;
    } catch (e) { container.innerHTML = "Erreur de calcul."; }
}

function renderSignals() {
    const container = document.getElementById('signals-container');
    container.innerHTML = CONFIG.pairs.map(s => {
        const d = state.signals[s];
        if (!d) return `<div class="crypto-card">Analyse en cours...</div>`;
        const score = (d.ut === 'bull' ? 1 : 0) + (d.st === 'bull' ? 1 : 0) + (d.qqe === 'bull' ? 1 : 0);
        const isBuy = score >= 2;
        return `
            <div class="crypto-card" onclick="viewPair('${s}')">
                <div class="card-info"><span>${s}</span><span>${d.price.toFixed(2)}$</span></div>
                <div class="verdict ${isBuy ? 'buy' : 'out'}">${isBuy ? "J'ACHÈTE" : "HORS MARCHÉ"}</div>
                ${!isBuy ? `<div class="target-price">Cible : ${d.stLine.toFixed(2)}$</div>` : ''}
            </div>`;
    }).join('');
}

window.viewPair = (pair) => {
    state.currentPair = pair;
    refreshPortfolio(pair);
    document.querySelector('[data-tab="tab-portfolio"]').click();
};

async function startAnalysis() {
    document.getElementById('last-update').innerText = "Analyse...";
    for (const s of CONFIG.pairs) {
        const r = await fetch(`${BINANCE_BASE}/klines?symbol=${s}&interval=${state.selectedTf}&limit=200`);
        const d = await r.json();
        const k = { highs: d.map(x=>parseFloat(x[2])), lows: d.map(x=>parseFloat(x[3])), closes: d.map(x=>parseFloat(x[4])) };
        const st = calcSuperTrend(k.highs, k.lows, k.closes);
        state.signals[s] = { ut: calcUTBot(k.highs, k.lows, k.closes), st: st.signal, stLine: st.line, qqe: calcQQEMod(k.closes), price: k.closes[k.closes.length-1] };
        renderSignals();
    }
    document.getElementById('last-update').innerText = "À jour : " + new Date().toLocaleTimeString();
}

function init() {
    document.querySelectorAll('.nav-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-tab, .tab-content').forEach(el => el.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
        });
    });
    const sel = document.getElementById('signal-tf-select');
    CONFIG.timeframes.forEach(t => sel.add(new Option(t.label, t.value)));
    sel.value = state.selectedTf;
    sel.onchange = (e) => { state.selectedTf = e.target.value; startAnalysis(); };
    document.getElementById('refresh-btn').onclick = startAnalysis;
    setInterval(updateCountdown, 1000);
    startAnalysis();
    refreshPortfolio(state.currentPair);
}
document.addEventListener('DOMContentLoaded', init);
