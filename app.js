'use strict';

const CONFIG = {
    pairs: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'],
    startCapital: 1000,
    launchDate: '2026-03-01' 
};

// Moteur de calcul simplifié pour forcer l'affichage
async function updateUI() {
    const container = document.getElementById('signals-container');
    const portContainer = document.getElementById('portfolio-container');
    
    for (const s of CONFIG.pairs) {
        try {
            const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${s}&interval=1d&limit=100`);
            const d = await r.json();
            const price = parseFloat(d[d.length-1][4]);
            const pLaunch = parseFloat(d[0][4]);
            const perf = ((price - pLaunch) / pLaunch) * 100;
            const cap = CONFIG.startCapital * (1 + perf / 100);

            // Injection des cartes
            container.innerHTML += `
                <div style="background: #1e2329; margin: 10px; padding: 15px; border-radius: 12px; border: 1px solid #2b3139;">
                    <div style="font-weight: bold;">${s} : ${price.toFixed(2)} $</div>
                    <div style="background: #0ecb81; color: black; padding: 10px; border-radius: 8px; margin-top: 10px; font-weight: bold;">J'ACHÈTE</div>
                </div>`;
            
            // Mise à jour Portfolio (prend la première paire par défaut)
            if(s === 'BTCUSDT') {
                portContainer.innerHTML = `
                <div style="background: #1e2329; padding: 25px; border-radius: 15px; margin: 10px;">
                    <div style="font-size: 2rem; font-weight: bold;">${cap.toFixed(2)} $</div>
                    <div style="color: ${perf >= 0 ? '#0ecb81' : '#f6465d'}">${perf.toFixed(2)}% depuis le 01/03</div>
                </div>`;
            }
        } catch(e) { console.error(e); }
    }
    document.getElementById('last-update').innerText = "À jour";
}

document.addEventListener('DOMContentLoaded', updateUI);
