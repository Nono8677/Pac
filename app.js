'use strict';

const CONFIG = {
    pairs: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'],
    utBot: { keyValue: 2, atrPeriod: 10 },
    supertrend: { period: 10, multiplier: 3 },
    timeframes: [{ label: '1H', value: '1h' }, { label: '4H', value: '4h' }, { label: 'D', value: '1d' }]
};

const BINANCE_BASE = 'https://api.binance.com/api/v3';
let state = { signals: {}, selectedSignalTf: '1d' };

// --- CALCULS (Simplifiés pour éviter les erreurs) ---
function atr(h, l, c, p) {
    let tr = c.map((v, i) => i === 0 ? 0 : Math.max(h[i]-l[i], Math.abs(h[i]-c[i-1]), Math.abs(l[i]-c[i-1])));
    let res = new Array(c.length).fill(0);
    let sum = 0; for(let i=1; i<=p; i++) sum += tr[i];
    res[p] = sum / p;
    for(let i=p+1; i<c.length; i++) res[i] = (res[i-1] * (p-1) + tr[i]) / p;
    return res;
}

function calcUTBot(h, l, c) {
    const a = atr(h, l, c, CONFIG.utBot.atrPeriod);
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
    const a = atr(h, l, c, CONFIG.supertrend.period);
    let ub = new Array(c.length).fill(0), d = new Array(c.length).fill(1);
    for (let i = CONFIG.supertrend.period; i < c.length; i++) {
        ub[i] = ((h[i] + l[i]) / 2) + CONFIG.supertrend.multiplier * a[i];
        d[i] = (c[i] > ub[i-1]) ? -1 : (c[i] < ub[i-1] ? 1 : d[i-1]);
    }
    return { signal: d[c.length-1] === -1 ? 'bull' : 'bear', target: ub[c.length-1] };
}

// --- AFFICHAGE ---
function render() {
    const container = document.getElementById('signals-container');
    if (!container) return alert("Erreur: ID 'signals-container' absent du HTML");

    if (Object.keys(state.signals).length === 0) {
        container.innerHTML = "<div class='crypto-card'>Récupération des prix Binance...</div>";
        return;
    }

    container.innerHTML = CONFIG.pairs.map(s => {
        const d = state.signals[s];
        if (!d) return `<div class="crypto-card">Calcul ${s}...</div>`;
        const buy = d.ut === 'bull' && d.st === 'bull';
        return `
            <div class="crypto-card">
                <div class="coin-name">${s} : ${d.price.toFixed(2)} $</div>
                <div class="verdict ${buy ? 'buy' : 'out'}">${buy ? "J'ACHÈTE" : "HORS MARCHÉ"}</div>
                ${!buy ? `<div style="font-size:0.8rem; margin-top:8px; opacity:0.6">Cible : ${d.target.toFixed(2)} $</div>` : ''}
            </div>`;
    }).join('');
}

async function analyze() {
    document.getElementById('last-update').innerText = "Analyse...";
    for (const s of CONFIG.pairs) {
        try {
            const r = await fetch(`${BINANCE_BASE}/klines?symbol=${s}&interval=${state.selectedSignalTf}&limit=200`);
            const d = await r.json();
            const k = { highs: d.map(x=>parseFloat(x[2])), lows: d.map(x=>parseFloat(x[3])), closes: d.map(x=>parseFloat(x[4])) };
            const st = calcSuperTrend(k.highs, k.lows, k.closes);
            state.signals[s] = { ut: calcUTBot(k.highs, k.lows, k.closes), st: st.signal, target: st.target, price: k.closes[k.closes.length-1] };
            render(); // Affiche dès qu'une crypto est prête
        } catch(e) { console.error("Erreur Binance sur " + s, e); }
    }
    document.getElementById('last-update').innerText = "À jour";
}

// --- DEMARRAGE ---
document.addEventListener('DOMContentLoaded', () => {
    const sTf = document.getElementById('signal-tf-select');
    CONFIG.timeframes.forEach(t => sTf.add(new Option(t.label, t.value)));
    sTf.value = state.selectedSignalTf;
    sTf.addEventListener('change', e => { state.selectedSignalTf = e.target.value; analyze(); });
    document.getElementById('refresh-btn').onclick = analyze;

    // Countdown simple
    setInterval(() => {
        const now = Date.now(), tf = state.selectedSignalTf;
        let pMs = (tf==='1h')?3600000:(tf==='4h')?14400000:86400000;
        const diff = (Math.ceil(now/pMs)*pMs) - now;
        const h=Math.floor(diff/3600000), m=Math.floor((diff%3600000)/60000), s=Math.floor((diff%60000)/1000);
        document.getElementById('countdown').innerText = `CLÔTURE : ${h}h ${m}m ${s}s`;
    }, 1000);

    analyze();
});
