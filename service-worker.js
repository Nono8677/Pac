'use strict';

const CONFIG = {
    pairs: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'],
    utBot: { keyValue: 2, atrPeriod: 10 },
    supertrend: { period: 10, multiplier: 3 },
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
    loading: false
};

function atr(h, l, c, p) {
    if (c.length < p + 1) return [];

    const tr = c.map((v, i) =>
        i === 0 ? 0 :
        Math.max(
            h[i] - l[i],
            Math.abs(h[i] - c[i - 1]),
            Math.abs(l[i] - c[i - 1])
        )
    );

    let res = new Array(c.length).fill(0);
    let sum = 0;

    for (let i = 1; i <= p; i++) {
        sum += tr[i] || 0;
    }

    res[p] = sum / p;

    for (let i = p + 1; i < c.length; i++) {
        res[i] = (res[i - 1] * (p - 1) + tr[i]) / p;
    }

    return res;
}

function calcUTBot(h, l, c) {
    const kv = CONFIG.utBot.keyValue;
    const ap = CONFIG.utBot.atrPeriod;

    const a = atr(h, l, c, ap);
    if (!a.length) return 'neutral';

    let ts = new Array(c.length).fill(0);
    let p = new Array(c.length).fill(0);

    for (let i = 1; i < c.length; i++) {
        let nL = kv * (a[i] || 0);

        if (c[i] > ts[i - 1] && c[i - 1] > ts[i - 1])
            ts[i] = Math.max(ts[i - 1], c[i] - nL);
        else if (c[i] < ts[i - 1] && c[i - 1] < ts[i - 1])
            ts[i] = Math.min(ts[i - 1], c[i] + nL);
        else
            ts[i] = c[i] > ts[i - 1] ? c[i] - nL : c[i] + nL;

        p[i] =
            (c[i - 1] <= ts[i - 1] && c[i] > ts[i]) ? 1 :
            (c[i - 1] >= ts[i - 1] && c[i] < ts[i]) ? -1 :
            p[i - 1];
    }

    return p[c.length - 1] === 1 ? 'bull' : 'bear';
}

function calcSuperTrend(h, l, c) {
    const p = CONFIG.supertrend.period;
    const m = CONFIG.supertrend.multiplier;

    const a = atr(h, l, c, p);
    if (!a.length) return { signal: 'neutral', target: 0 };

    let ub = new Array(c.length).fill(0);
    let d = new Array(c.length).fill(1);

    for (let i = p; i < c.length; i++) {
        ub[i] = ((h[i] + l[i]) / 2) + m * (a[i] || 0);

        d[i] =
            (c[i] > ub[i - 1]) ? -1 :
            (c[i] < ub[i - 1]) ? 1 :
            d[i - 1];
    }

    return {
        signal: d[c.length - 1] === -1 ? 'bull' : 'bear',
        target: ub[c.length - 1] || 0
    };
}

function renderSignals() {
    const container = document.getElementById('signals-container');
    if (!container) return;

    if (Object.keys(state.signals).length === 0) {
        container.innerHTML = "<div class='crypto-card'>Chargement...</div>";
        return;
    }

    container.innerHTML = CONFIG.pairs.map(s => {
        const d = state.signals[s];

        if (!d) {
            return `<div class="crypto-card">Erreur ${s}</div>`;
        }

        const buy = d.ut === 'bull' && d.st.signal === 'bull';

        return `
        <div class="crypto-card">
            <div style="font-weight:bold;">
                ${s} : ${Number(d.price || 0).toFixed(2)} $
            </div>
            <div class="verdict ${buy ? 'buy' : 'out'}">
                ${buy ? "J'ACHÈTE" : "HORS MARCHÉ"}
            </div>
            ${
                !buy
                ? `<div style="font-size:0.8rem; opacity:0.6">
                    Cible : ${Number(d.st.target || 0).toFixed(2)} $
                   </div>`
                : ''
            }
        </div>`;
    }).join('');
}

async function analyzeAll() {
    if (state.loading) return;

    state.loading = true;
    state.signals = {};

    document.getElementById('last-update').innerText = "Analyse...";
    renderSignals();

    try {
        const promises = CONFIG.pairs.map(async (s) => {
            try {
                const r = await fetch(`${BINANCE_BASE}/klines?symbol=${s}&interval=${state.selectedSignalTf}&limit=300`);

                if (!r.ok) throw new Error("HTTP " + r.status);

                const d = await r.json();

                if (!Array.isArray(d)) throw new Error("Data invalide");

                const k = {
                    highs: d.map(x => parseFloat(x[2])),
                    lows: d.map(x => parseFloat(x[3])),
                    closes: d.map(x => parseFloat(x[4]))
                };

                return [s, {
                    ut: calcUTBot(k.highs, k.lows, k.closes),
                    st: calcSuperTrend(k.highs, k.lows, k.closes),
                    price: k.closes.at(-1)
                }];

            } catch (e) {
                console.error("Erreur sur", s, e);
                return [s, null];
            }
        });

        const results = await Promise.all(promises);

        results.forEach(([s, data]) => {
            if (data) state.signals[s] = data;
        });

    } catch (e) {
        console.error("Erreur globale", e);
    }

    state.loading = false;
    document.getElementById('last-update').innerText = "À jour";

    renderSignals();
}

document.addEventListener('DOMContentLoaded', () => {

    const sTf = document.getElementById('signal-tf-select');

    CONFIG.timeframes.forEach(t => {
        sTf.add(new Option(t.label, t.value));
    });

    sTf.value = state.selectedSignalTf;

    sTf.onchange = (e) => {
        state.selectedSignalTf = e.target.value;
        analyzeAll();
    };

    document.getElementById('refresh-btn').onclick = analyzeAll;

    setInterval(() => {
        const now = Date.now();
        const tf = state.selectedSignalTf;

        let pMs =
            tf === '1h' ? 3600000 :
            tf === '4h' ? 14400000 :
            86400000;

        const diff = (Math.ceil(now / pMs) * pMs) - now;

        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);

        document.getElementById('countdown').innerText =
            `CLÔTURE : ${h}h ${m}m ${s}s`;

    }, 1000);

    analyzeAll();
});
