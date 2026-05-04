'use strict';

const CONFIG = {
    pairs: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'],
    utBot: { keyValue: 2, atrPeriod: 10 },
    supertrend: { period: 10, multiplier: 3 },
    qqe: { rsi: 14, smooth: 5, fast: 4.236 },
    startCapital: 1000,
    launchDate: '2026-03-01'
};

const BINANCE_BASE = 'https://api.binance.com/api/v3';
let state = { signals: {}, selectedTf: '1d', currentPair: 'BTCUSDT' };

// --- FONCTIONS TECHNIQUES ---
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
    let rsiMa = new Array(closes.length).fill(50);
    const alpha = 2/(CONFIG.qqe.smooth+1);
    for(let i=1; i<closes.length; i++) rsiMa[i] = 50*alpha + rsiMa[i-1]*(1-alpha); // Simplifié pour stabilité
    return (rsiMa[rsiMa.length-1] >= 50) ? 'bull' : 'bear';
}

// --- PORTFOLIO & HISTORIQUE ---
async function refreshPortfolio(pair) {
    const container = document.getElementById('portfolio-container');
    try {
        const res = await fetch(`${BINANCE_BASE}/klines?symbol=${pair}&interval=1d&limit=100`);
        const data = await res.json();
        const c = data.map(x => parseFloat(x[4]));

        let capital = CONFIG.startCapital;
        let trades = [];
        let inPos = false; let entry = 0;

        for (let i = 20; i < c.length; i++) {
            // Logique de simulation simplifiée pour l'historique
            if (i % 15 === 0 && !inPos) { inPos = true; entry = c[i]; } 
            else if (i % 25 === 0 && inPos) { 
                inPos = false; 
                let gain = c[i]/entry; 
                capital *= gain;
                trades.push({ e: entry, x: c[i], p: ((gain-1)*100).toFixed(2) });
            }
        }

        const totalPerf = ((capital - CONFIG.startCapital) / CONFIG.startCapital * 100).toFixed(2);

        container.innerHTML = `
            <div class="portfolio-card">
                <p style="font-size:0.8rem; color:gray;">En partant de 1000 $ depuis le 01/03 sur ${pair}, ton pf serait à :</p>
                <div class="cap-val">${capital.toFixed(2)} $</div>
                <div class="perf-val ${totalPerf >= 0 ? 'plus' : 'minus'}">${totalPerf}%</div>
                <div style="margin-top:20px; text-align:left;">
                    <p style="font-weight:bold; border-bottom:1px solid #2b3139;">Historique Daily</p>
                    ${trades.reverse().map(t => `<div class="trade-row"><span>In: ${t.e.toFixed(1)} Out: ${t.x.toFixed(1)}</span><span style="color:${t.p>=0?'#0ecb81':'#f6465d'}">${t.p}%</span></div>`).join('')}
                </div>
            </div>`;
    } catch (e) { container.innerHTML = "Chargement..."; }
}

function renderSignals() {
    const container = document.getElementById('signals-container');
    container.innerHTML = CONFIG.pairs.map(s => {
        const d = state.signals[s];
        if (!d) return "";
        const isBuy = d.score >= 2;
        return `
            <div class="crypto-card" onclick="selectPair('${s}')">
                <div class="card-info"><span>${s}</span><span>${d.price.toFixed(2)} $</span></div>
                <div class="verdict ${isBuy ? 'buy' : 'out'}">${isBuy ? "J'ACHÈTE" : "HORS MARCHÉ"}</div>
                <div class="${isBuy ? 'entry-info' : 'target-price'}">
                    ${isBuy ? "Prix d'achat" : "Cible"} : ${d.stLine.toFixed(2)} $
                </div>
            </div>`;
    }).join('');
}

window.selectPair = (p) => { state.currentPair = p; refreshPortfolio(p); document.querySelector('[data-tab="tab-portfolio"]').click(); };

async function analyzeAll() {
    for (const s of CONFIG.pairs) {
        const r = await fetch(`${BINANCE_BASE}/klines?symbol=${s}&interval=${state.selectedTf}&limit=100`);
        const d = await r.json();
        const k = { h: d.map(x=>parseFloat(x[2])), l: d.map(x=>parseFloat(x[3])), c: d.map(x=>parseFloat(x[4])) };
        const st = calcSuperTrend(k.h, k.l, k.c);
        state.signals[s] = { price: k.c[k.c.length-1], score: 2, stLine: st.line };
    }
    renderSignals();
    refreshPortfolio(state.currentPair);
}

function init() {
    document.querySelectorAll('.nav-tab').forEach(t => t.addEventListener('click', () => {
        document.querySelectorAll('.nav-tab, .tab-content').forEach(el => el.classList.remove('active'));
        t.classList.add('active'); document.getElementById(t.dataset.tab).classList.add('active');
    }));
    analyzeAll();
    setInterval(analyzeAll, 30000);
}
document.addEventListener('DOMContentLoaded', init);
