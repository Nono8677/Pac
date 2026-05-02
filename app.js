'use strict';

const CONFIG = {
    pairs: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'],
    utBot: { keyValue: 2, atrPeriod: 10 },
    supertrend: { period: 10, multiplier: 3 },
    timeframes: [{ label: '1H', value: '1h' }, { label: '4H', value: '4h' }, { label: 'D', value: '1d' }]
};

let state = { signals: {}, selectedSignalTf: '1d' };

// --- FONCTIONS TECHNIQUES ---
function getATR(h, l, c, p) {
    let tr = c.map((v, i) => i === 0 ? 0 : Math.max(h[i]-l[i], Math.abs(h[i]-c[i-1]), Math.abs(l[i]-c[i-1])));
    let res = new Array(c.length).fill(0);
    let sum = 0; for(let i=1; i<=p; i++) sum += tr[i];
    res[p] = sum / p;
    for(let i=p+1; i<c.length; i++) res[i] = (res[i-1] * (p-1) + tr[i]) / p;
    return res;
}

function calculateAll(h, l, c) {
    const aUt = getATR(h, l, c, CONFIG.utBot.atrPeriod);
    let ts = new Array(c.length).fill(0), pUt = new Array(c.length).fill(0);
    for (let i = 1; i < c.length; i++) {
        let nL = CONFIG.utBot.keyValue * aUt[i];
        if (c[i] > ts[i-1] && c[i-1] > ts[i-1]) ts[i] = Math.max(ts[i-1], c[i]-nL);
        else if (c[i] < ts[i-1] && c[i-1] < ts[i-1]) ts[i] = Math.min(ts[i-1], c[i]+nL);
        else ts[i] = c[i] > ts[i-1] ? c[i]-nL : c[i]+nL;
        pUt[i] = (c[i-1] <= ts[i-1] && c[i] > ts[i]) ? 1 : (c[i-1] >= ts[i-1] && c[i] < ts[i]) ? -1 : pUt[i-1];
    }
    const aSt = getATR(h, l, c, CONFIG.supertrend.period);
    let ub = new Array(c.length).fill(0), dSt = new Array(c.length).fill(1);
    for (let i = CONFIG.supertrend.period; i < c.length; i++) {
        ub[i] = ((h[i] + l[i]) / 2) + CONFIG.supertrend.multiplier * aSt[i];
        dSt[i] = (c[i] > ub[i-1]) ? -1 : (c[i] < ub[i-1] ? 1 : dSt[i-1]);
    }
    return { isBull: pUt[c.length-1] === 1 && dSt[c.length-1] === -1, target: ub[c.length-1] };
}

// --- RENDU ---
function draw() {
    const container = document.getElementById('signals-container');
    if (!container) return;

    if (Object.keys(state.signals).length === 0) {
        container.innerHTML = "<div class='crypto-card'>Chargement Binance...</div>";
        return;
    }

    let html = "";
    CONFIG.pairs.forEach(s => {
        const d = state.signals[s];
        if (d) {
            const color = d.isBull ? "#0ecb81" : "#f6465d";
            const bg = d.isBull ? "rgba(14, 203, 129, 0.2)" : "rgba(246, 70, 93, 0.2)";
            html += `
                <div class="crypto-card" style="border-left: 5px solid ${color}">
                    <div style="font-weight:bold; font-size:1.1rem;">${s} : ${d.price.toFixed(2)} $</div>
                    <div style="margin-top:10px; padding:12px; border-radius:8px; text-align:center; font-weight:bold; background:${bg}; color:${color}">
                        ${d.isBull ? "ACHAT (BULL)" : "ATTENTE (BEAR)"}
                    </div>
                    ${!d.isBull ? `<div style="font-size:0.8rem; margin-top:8px; opacity:0.6">Stop/Cible : ${d.target.toFixed(2)} $</div>` : ''}
                </div>`;
        }
    });
    container.innerHTML = html;
}

// --- LOGIQUE ---
async function runAnalysis() {
    document.getElementById('last-update').innerText = "Analyse en cours...";
    for (const s of CONFIG.pairs) {
        try {
            const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${s}&interval=${state.selectedSignalTf}&limit=200`);
            const data = await r.json();
            const k = { 
                h: data.map(x=>parseFloat(x[2])), 
                l: data.map(x=>parseFloat(x[3])), 
                c: data.map(x=>parseFloat(x[4])) 
            };
            const sig = calculateAll(k.h, k.l, k.c);
            state.signals[s] = { isBull: sig.isBull, target: sig.target, price: k.c[k.c.length-1] };
            draw();
        } catch(e) { console.error(e); }
    }
    document.getElementById('last-update').innerText = "À jour";
}

// --- START ---
window.onload = () => {
    const sTf = document.getElementById('signal-tf-select');
    if (sTf) {
        CONFIG.timeframes.forEach(t => sTf.add(new Option(t.label, t.value)));
        sTf.value = state.selectedSignalTf;
        sTf.onchange = (e) => { state.selectedSignalTf = e.target.value; state.signals = {}; runAnalysis(); };
    }
    
    document.getElementById('refresh-btn').onclick = runAnalysis;

    setInterval(() => {
        const now = Date.now(), tf = state.selectedSignalTf;
        let pMs = (tf==='1h')?3600000:(tf==='4h')?14400000:86400000;
        const diff = (Math.ceil(now/pMs)*pMs) - now;
        const h=Math.floor(diff/3600000), m=Math.floor((diff%3600000)/60000), s=Math.floor((diff%60000)/1000);
        document.getElementById('countdown').innerText = `CLÔTURE : ${h}h ${m}m ${s}s`;
    }, 1000);

    runAnalysis();
};
