'use strict';

/* -- Configuration -- */
const CONFIG = {
    pairs: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'],
    defaultInterval: '1d',
    klineLimit: 500,
    refreshInterval: 60,
    utBot: { keyValue: 2, atrPeriod: 10 },
    qqe: { rsiLength: 14, smoothing: 5 },
    supertrend: { period: 10, multiplier: 3 },
    startCapital: 1000,
    timeframes: [
        { label: '1H', value: '1h' },
        { label: '4H', value: '4h' },
        { label: 'D', value: '1d' },
        { label: 'W', value: '1w' }
    ],
};

const BINANCE_BASE = 'https://api.binance.com/api/v3';

function getLaunchDate() {
    const stored = localStorage.getItem('pachecoin_launch');
    if (stored) return new Date(stored);
    const now = new Date();
    localStorage.setItem('pachecoin_launch', now.toISOString());
    return now;
}

let state = {
    signals: {},
    portfolioData: {},
    chart: null,
    loading: false,
    pfLoading: false,
    selectedPair: 'BTCUSDT',
    selectedTf: '1d',
    launchDate: getLaunchDate(),
};

/* --- CALCULS TECHNIQUES --- */

function atr(highs, lows, closes, period) {
    const tr = closes.map((c, i) => i === 0 ? 0 : Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
    const out = new Array(closes.length).fill(null);
    let sum = 0;
    for (let i = 1; i <= period; i++) sum += tr[i];
    out[period] = sum / period;
    for (let i = period + 1; i < closes.length; i++) out[i] = (out[i - 1] * (period - 1) + tr[i]) / period;
    return out;
}

function calcUTBot(highs, lows, closes) {
    const { keyValue: kv, atrPeriod } = CONFIG.utBot;
    const atrVals = atr(highs, lows, closes, atrPeriod);
    const trailStop = new Array(closes.length).fill(0);
    const pos = new Array(closes.length).fill(0);
    for (let i = 1; i < closes.length; i++) {
        const nLoss = kv * atrVals[i];
        if (closes[i] > trailStop[i - 1] && closes[i - 1] > trailStop[i - 1]) trailStop[i] = Math.max(trailStop[i - 1], closes[i] - nLoss);
        else if (closes[i] < trailStop[i - 1] && closes[i - 1] < trailStop[i - 1]) trailStop[i] = Math.min(trailStop[i - 1], closes[i] + nLoss);
        else trailStop[i] = closes[i] > trailStop[i - 1] ? closes[i] - nLoss : closes[i] + nLoss;
        if (closes[i - 1] <= trailStop[i - 1] && closes[i] > trailStop[i]) pos[i] = 1;
        else if (closes[i - 1] >= trailStop[i - 1] && closes[i] < trailStop[i]) pos[i] = -1;
        else pos[i] = pos[i - 1];
    }
    return { signal: pos[pos.length - 1] === 1 ? 'bull' : 'bear', name: 'UT Bot' };
}

function calcSuperTrend(highs, lows, closes) {
    const { period, multiplier } = CONFIG.supertrend;
    const atrVals = atr(highs, lows, closes, period);
    const upperBand = new Array(closes.length).fill(null);
    const lowerBand = new Array(closes.length).fill(null);
    const direction = new Array(closes.length).fill(1);
    for (let i = period; i < closes.length; i++) {
        const hl2 = (highs[i] + lows[i]) / 2;
        const basicUp = hl2 + multiplier * atrVals[i];
        const basicDown = hl2 - multiplier * atrVals[i];
        upperBand[i] = (basicUp < upperBand[i - 1] || closes[i - 1] > upperBand[i - 1]) ? basicUp : upperBand[i - 1];
        lowerBand[i] = (basicDown > lowerBand[i - 1] || closes[i - 1] < lowerBand[i - 1]) ? basicDown : lowerBand[i - 1];
        direction[i] = (direction[i - 1] === 1 && closes[i] > upperBand[i]) ? -1 : (direction[i - 1] === -1 && closes[i] < lowerBand[i]) ? 1 : direction[i - 1];
    }
    return { signal: direction[closes.length - 1] === -1 ? 'bull' : 'bear', buyTarget: upperBand[closes.length - 1], name: 'SuperTrend' };
}

/* --- API BINANCE --- */

async function fetchKlines(symbol, interval) {
    const url = `${BINANCE_BASE}/klines?symbol=${symbol}&interval=${interval}&limit=${CONFIG.klineLimit}`;
    const resp = await fetch(url);
    const data = await resp.json();
    return {
        highs: data.map(k => parseFloat(k[2])),
        lows: data.map(k => parseFloat(k[3])),
        closes: data.map(k => parseFloat(k[4])),
        times: data.map(k => k[0])
    };
}

async function fetchPriceAtLaunch(symbol, interval) {
    const launch = state.launchDate.getTime();
    const url = `${BINANCE_BASE}/klines?symbol=${symbol}&interval=${interval}&startTime=${launch}&limit=1`;
    const resp = await fetch(url);
    const data = await resp.json();
    return data.length > 0 ? parseFloat(data[0][4]) : null;
}

/* --- LOGIQUE UI --- */

async function analyzeAll() {
    if (state.loading) return;
    state.loading = true;
    for (const symbol of CONFIG.pairs) {
        try {
            const k = await fetchKlines(symbol, '1d');
            const ut = calcUTBot(k.highs, k.lows, k.closes);
            const st = calcSuperTrend(k.highs, k.lows, k.closes);
            const buy = ut.signal === 'bull' && st.signal === 'bull';
            state.signals[symbol] = { ut, st, price: k.closes[k.closes.length - 1], verdict: buy ? "J'ACHÈTE" : "HORS MARCHÉ" };
        } catch (e) { console.error(e); }
    }
    state.loading = false;
    renderSignals();
}

function renderSignals() {
    const container = document.getElementById('signals-container');
    container.innerHTML = CONFIG.pairs.map(s => {
        const d = state.signals[s];
        if (!d) return '';
        const target = d.verdict === "HORS MARCHÉ" ? `<div class="verdict-target">Cible : ${d.st.buyTarget.toFixed(2)} $</div>` : '';
        return `
            <div class="crypto-card">
                <div class="coin-name">${s} : ${d.price.toFixed(2)} $</div>
                <div class="verdict ${d.verdict === "J'ACHÈTE" ? 'buy' : 'out'}">${d.verdict}</div>
                ${target}
            </div>`;
    }).join('');
}

/* --- PORTFOLIO --- */

async function refreshPortfolio() {
    if (state.pfLoading) return;
    state.pfLoading = true;
    const container = document.getElementById('portfolio-container');
    container.innerHTML = '<div class="loading-state">Calcul de la perf...</div>';

    try {
        const symbol = state.selectedPair;
        const interval = state.selectedTf;
        const priceAtLaunch = await fetchPriceAtLaunch(symbol, interval);
        const k = await fetchKlines(symbol, interval);
        const currentPrice = k.closes[k.closes.length - 1];
        
        const perfPct = ((currentPrice - priceAtLaunch) / priceAtLaunch) * 100;
        const capitalNow = CONFIG.startCapital * (1 + perfPct / 100);

        container.innerHTML = `
            <div class="portfolio-header">
                <div class="portfolio-value">${capitalNow.toFixed(2)} $</div>
                <div class="portfolio-gain ${perfPct >= 0 ? 'up' : 'down'}">${perfPct >= 0 ? '+' : ''}${perfPct.toFixed(2)}%</div>
            </div>
            <div class="chart-container"><canvas id="portfolio-chart"></canvas></div>
        `;
        // Ici tu pourrais ajouter la logique Chart.js si tu veux le graphique
    } catch (e) {
        container.innerHTML = '<div class="error-state">Erreur de chargement portfolio</div>';
    }
    state.pfLoading = false;
}

/* --- INITIALISATION --- */

function initTabs() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.add('active');
            if (tab.dataset.tab === 'tab-portfolio') refreshPortfolio();
        });
    });
}

function buildSelectors() {
    const pairSel = document.getElementById('pf-pair-select');
    const tfSel = document.getElementById('pf-tf-select');
    
    CONFIG.pairs.forEach(p => {
        let opt = document.createElement('option'); opt.value = p; opt.textContent = p.replace('USDT','');
        pairSel.appendChild(opt);
    });
    CONFIG.timeframes.forEach(t => {
        let opt = document.createElement('option'); opt.value = t.value; opt.textContent = t.label;
        tfSel.appendChild(opt);
    });

    pairSel.addEventListener('change', (e) => { state.selectedPair = e.target.value; refreshPortfolio(); });
    tfSel.addEventListener('change', (e) => { state.selectedTf = e.target.value; refreshPortfolio(); });
}

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    buildSelectors();
    analyzeAll();
});
