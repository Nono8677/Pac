// --- COMPTE À REBOURS SYNCHRONISÉ MARCHÉ ---
function startMarketCountdown() {
    const countdownEl = document.getElementById('countdown');
    
    setInterval(() => {
        const now = Date.now();
        const tf = state.selectedSignalTf;
        let periodMs;

        // Définition des périodes de clôture du marché
        switch(tf) {
            case '1h': periodMs = 3600000; break;
            case '4h': periodMs = 14400000; break;
            case '1d': periodMs = 86400000; break;
            case '1w': periodMs = 604800000; break;
            default: periodMs = 3600000;
        }

        // Calcul du moment exact de la prochaine clôture de bougie
        const nextCloture = Math.ceil(now / periodMs) * periodMs;
        const diff = nextCloture - now;

        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);

        countdownEl.innerText = `Clôture bougie : ${h}h ${m}m ${s}s`;

        // Trigger l'analyse à la seconde où la bougie ferme
        if (diff <= 1000) {
            setTimeout(analyzeAll, 1500); 
        }
    }, 1000);
}

// --- PORTFOLIO : CORRECTION DU BUG PERF (INFINITY) ---
async function refreshPortfolio() {
    const container = document.getElementById('portfolio-container');
    container.innerHTML = "<div class='loading'>Synchronisation...</div>";
    
    try {
        const symbol = state.selectedPair;
        const interval = state.selectedTf;
        const launchTs = state.launchDate.getTime();

        // On cherche précisément la bougie qui contient ta date de lancement
        const urlHisto = `${BINANCE_BASE}/klines?symbol=${symbol}&interval=${interval}&startTime=${launchTs}&limit=1`;
        const resHisto = await fetch(urlHisto).then(r => r.json());
        
        if (!resHisto.length) throw new Error("Date hors limites");

        const pLaunch = parseFloat(resHisto[0][4]); // Prix de clôture de l'époque
        const k = await fetchKlines(symbol, interval);
        const pNow = k.closes[k.closes.length - 1];

        // Sécurité mathématique pour éviter Infinity/NaN
        if (!pLaunch || pLaunch === 0) throw new Error("Prix invalide");

        const perf = ((pNow - pLaunch) / pLaunch) * 100;
        const currentCap = CONFIG.startCapital * (1 + perf / 100);
        
        const isPos = perf >= 0;

        container.innerHTML = `
            <div class="portfolio-card">
                <div class="portfolio-value">${currentCap.toFixed(2)} $</div>
                <div class="portfolio-gain ${isPos ? 'up' : 'down'}">
                    ${isPos ? '▲' : '▼'} ${perf.toFixed(2)}%
                </div>
                <div class="pf-details">
                    <div class="pf-row"><span>Prix Initial (${interval}):</span> <span>${pLaunch.toFixed(2)} $</span></div>
                    <div class="pf-row"><span>Prix Actuel:</span> <span>${pNow.toFixed(2)} $</span></div>
                    <div class="pf-row"><span>Capital de départ:</span> <span>${CONFIG.startCapital} $</span></div>
                </div>
            </div>`;
    } catch (e) {
        container.innerHTML = `<div class="error-card">⚠️ Erreur : ${e.message}<br>Changez d'unité de temps ou de paire.</div>`;
    }
}
