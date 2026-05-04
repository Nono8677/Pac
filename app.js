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

// --- FONCTIONS TECHNIQUES (UT, ST, QQE) ---
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

// --- PORTFOLIO AVEC HISTORIQUE DAILY ---
async function refreshPortfolio(pair) {
    const container = document.getElementById('portfolio-container');
    try {
        const res = await fetch(`${BINANCE_BASE}/klines?symbol=${pair}&interval=1d&limit=200`);
        const data = await res.json();
        const h = data.map(x => parseFloat(x[2]));
        const l = data.map(x => parseFloat(x[3]));
        const c = data.map(x => parseFloat(x[4]));

        let capital = CONFIG.startCapital;
        let trades = [];
        let inPos = false, entryP = 0;

        for (let i = 20; i < c.length; i++) {
            const score = (calcUTBot(h.slice(0,i+1), l.slice(0,i+1), c.slice(0,i+1)) === 'bull' ? 1 : 0) + 
                          (calcSuperTrend(h.slice(0,i+1), l.slice(0,i+1), c.slice(0,i+1)).signal === 'bull' ? 1 : 0) + 
                          (calcQQEMod(c.slice(0,i+1)) === 'bull' ? 1 : 0);
            
            if (score >= 2 && !inPos) { inPos = true; entryP = c[i]; }
            else if (score < 2 && inPos) { 
                inPos = false; 
                let gain = c[i]/entryP;
                capital *= gain;
                trades.push({ entry: entryP, exit: c[i], p: ((gain-1)*100).toFixed(2) });
            }
        }

        const perf = ((capital - 1000)/10).toFixed(2);
        container.innerHTML = `
            <div class="portfolio-card">
                <p>En partant de 1000 $ depuis le 01/03 sur ${pair}, ton pf serait à :</p>
                <div class="cap-val" style="font-size:2.2rem; color:#f0b90b;">${capital.toFixed(2)} $</div>
                <div class="perf-val" style="color:${perf >= 0 ? '#0ecb81' : '#f6465d'}">${perf >= 0 ? '▲' : '▼'} ${perf}%</div>
                <h3 style="margin-top:20px; border-top:1px solid #333; padding-top:10px;">Historique des trades</h3>
                ${trades.reverse().map(t => `<div style="display:flex; justify-content:space-between; font-size:0.8rem; padding:5px 0; border-bottom:1px solid #222;">
                    <span>${t.entry.toFixed(2)} → ${t.exit.toFixed(2)}</span>
                    <span style="color:${t.p >= 0 ? '#0ecb81' : '#f6465d'}">${t.p}%</span>
                </div>`).join('')}
            </div>`;
    } catch(e) { container.innerHTML = "Calcul..."; }
}

// --- AFFICHAGE SIGNAUX ---
function renderSignals() {
    const container = document.getElementById('signals-container');
    container.innerHTML = CONFIG.pairs.map(s => {
        const d = state.signals[s];
        if (!d) return `<div class="crypto-card">Chargement...</div>`;
        const isBuy = (d.ut==='bull'?1:0)+(d.st==='bull'?1:0)+(d.qqe==='bull'?1:0) >= 2;
        return `
            <div class="crypto-card" onclick="selectPair('${s}')">
                <div style="display:flex; justify-content:space-between;"><b>${s}</b> <span>${d.price.toFixed(2)} $</span></div>
                <div class="verdict ${isBuy?'buy':'out'}">${isBuy?"J'ACHÈTE":"HORS MARCHÉ"}</div>
                <div style="text-align:center; font-size:0.8rem; color:gray; margin-top:5px;">
                    ${isBuy ? "Prix d'achat : " : "Cible : "} ${d.stLine.toFixed(2)} $
                </div>
            </div>`;
    }).join('');
}

window.selectPair = (pair) => { state.currentPair = pair; refreshPortfolio(pair); document.querySelector('[data-tab="tab-portfolio"]').click(); };

// --- INITIALISATION & TIMERS ---
async function analyzeAll() {
    for (const s of CONFIG.pairs) {
        const r = await fetch(`${BINANCE_BASE}/klines?symbol=${s}&interval=${state.selectedTf}&limit=250`);
        const d = await r.json();
        const k = { h: d.map(x=>parseFloat(x[2])), l: d.map(x=>parseFloat(x[3])), c: d.map(x=>parseFloat(x[4])) };
        const st = calcSuperTrend(k.h, k.l, k.c);
        state.signals[s] = { ut: calcUTBot(k.h, k.l, k.c), st: st.signal, stLine: st.line, qqe: calcQQEMod(k.c), price: k.c[k.c.length-1] };
        renderSignals();
    }
    refreshPortfolio(state.currentPair);
}

document.addEventListener('DOMContentLoaded', () => {
    // Gestion des onglets
    document.querySelectorAll('.nav-tab').forEach(btn => btn.onclick = () => {
        document.querySelectorAll('.nav-tab, .tab-content').forEach(el => el.classList.remove('active'));
        btn.classList.add('active'); document.getElementById(btn.dataset.tab).classList.add('active');
    });
    analyzeAll();
    setInterval(analyzeAll, 60000); // Refresh toutes les minutes
});
