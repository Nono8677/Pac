'use strict';

const CONFIG = {
    pairs: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'],
    utBot: { keyValue: 2, atrPeriod: 10 },
    supertrend: { period: 10, multiplier: 3 },
    timeframes: [{ label: '1H', value: '1h' }, { label: '4H', value: '4h' }, { label: 'D', value: '1d' }]
};

const BINANCE_BASE = 'https://api.binance.com/api/v3';
let state = { signals: {}, selectedSignalTf: '1d' };

// --- FONCTIONS TECHNIQUES ---
function atr(h, l, c, p) {
    let tr = c.map((v, i) => i === 0 ? 0 : Math.max(h[i]-l[i], Math.abs(h[i]-c[i-1]), Math.abs(l[i]-c[i-1])));
    let res = new Array(c.length).fill(0);
    let sum = 0; for(let i=1; i<=p; i++) sum += tr[i];
    res[p] = sum / p;
    for(let i=p+1; i<c.length; i++) res[i] = (res[i-1] * (p-1) + tr[i]) / p;
    return res;
}

function calcSignals(h, l, c) {
    // UT Bot
    const aUt = atr(h, l, c, CONFIG.utBot.atrPeriod);
    let ts = new Array(c.length).fill(0), pUt = new Array(c.length).fill(0);
    for (let i = 1; i < c.length; i++) {
        let nL = CONFIG.utBot.keyValue * aUt[i];
        if (c[i] > ts[i-1] && c[i-1] > ts[i-1]) ts[i] = Math.max(ts[i-1], c[i]-nL);
        else if (c[i] < ts[i-1] && c[i-1] < ts[i-1]) ts[i] = Math.min(ts[i-1], c[i]+nL);
        else ts[i] = c[i] > ts[i-1] ? c[i]-nL : c[i]+nL;
        pUt[i] = (c[i-1] <= ts[i-1] && c[i] > ts[i]) ? 1 : (c[i-1] >= ts[i-1] && c[i] < ts[i]) ? -1 : pUt[i-1];
    }
    // SuperTrend
    const aSt = atr(h, l, c, CONFIG.supertrend.period);
    let ub = new Array(c.length).fill(0), dSt = new Array(c.length).fill(1);
    for (let i = CONFIG.supertrend.period; i < c.length; i++) {
        ub[i] = ((h[i] + l[i]) / 2) + CONFIG.supertrend.multiplier * aSt[i];
        dSt[i] = (c[i] > ub[i-1]) ? -1 : (c[i] < ub[i-1] ? 1 : dSt[i-1]);
    }
    return { 
        isBull: pUt[c.length-1] === 1 && dSt[c.length-1] === -1,
        target: ub[c.length-1]
    };
}

// --- AFFICHAGE ---
function render() {
    const container = document.getElementById('signals-container');
    if (!container) return;

    // Si aucune donnée, on montre qu'on travaille
    if (Object.keys(state.signals).length === 0) {
        container.innerHTML = "<div class='crypto-card'>Connexion Binance en cours...</div>";
        return;
    }

    container.innerHTML = CONFIG.pairs.map(s => {
        const d = state.signals[s];
        if (!d) return `<div class="crypto-card">Calcul ${s}...</div>`;
        return `
            <div class="crypto-card">
                <div class="coin-name" style="font-weight:bold; margin-bottom:10px;">${s} : ${d.price.toFixed(2)} $</div>
                <div class="verdict ${d.isBull ? 'buy' : 'out'}" style="padding:10px; border-radius:8px; text-align:center; font-weight:bold; background:${d.isBull ? '#0ecb81' : 'rgba(246, 70, 93, 0.2)'}; color:${d.isBull ? 'black' : '#f6465d'}">
                    ${d.isBull ? "J'ACHÈTE" : "HORS MARCHÉ"}
                </div>
                ${!d.isBull ? `<div style="font-size:0.8rem; margin-top:8px; opacity:0.6">Cible : ${d.target.toFixed(2)} $</div>` : ''}
            </div>`;
    }).join('');
}

async function analyze() {
    const updateEl = document.getElementById('last-update');
    if (updateEl) updateEl.innerText = "Analyse...";
    
    for (const s of CONFIG.pairs) {
        try {
            const r = await fetch(`${BINANCE_BASE}/klines?symbol=${s}&interval=${state.selectedSignalTf}&limit=200`);
            const data = await r.json();
            const k = { 
                highs: data.map(x=>parseFloat(x[2])), 
                lows: data.map(x=>parseFloat(x[3])), 
                closes: data.map(x=>parseFloat(x[4])) 
            };
            const sig = calcSignals(k.highs, k.lows, k.closes);
            state.signals[s] = { 
                isBull: sig.isBull, 
                target: sig.target, 
                price: k.closes[k.closes.length-1] 
            };
            render(); // On met à jour l'écran pour chaque crypto terminée
        } catch(e) {
            console.error("Erreur sur " + s, e);
        }
    }
    if (updateEl) updateEl.innerText = "À jour";
}

// --- INITIALISATION ---
function startApp() {
    const sTf = document.getElementById('signal-tf-select');
    if (sTf) {
        CONFIG.timeframes.forEach(t => sTf.add(new Option(t.label, t.value)));
        sTf.value = state.selectedSignalTf;
        sTf.addEventListener('change', e => { 
            state.selectedSignalTf = e.target.value; 
            state.signals = {}; 
            analyze(); 
        });
    }

    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) refreshBtn.onclick = analyze;

    // Countdown
    setInterval(() => {
        const now = Date.now(), tf = state.selectedSignalTf;
        let pMs = (tf==='1h')?3600000:(tf==='4h')?14400000:86400000;
        const diff = (Math.ceil(now/pMs)*pMs) - now;
        const h=Math.floor(diff/3600000), m=Math.floor((diff%3600000)/60000), s=Math.floor((diff%60000)/1000);
        const cdEl = document.getElementById('countdown');
        if (cdEl) cdEl.innerText = `CLÔTURE : ${h}h ${m}m ${s}s`;
    }, 1000);

    // Premier rendu immédiat pour confirmer que le script tourne
    const container = document.getElementById('signals-container');
    if (container) container.innerHTML = "<div class='crypto-card'>Initialisation...</div>";
    
    analyze();
}

// On lance quand le HTML est chargé
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
} else {
    startApp();
}
