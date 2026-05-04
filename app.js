'use strict';

console.log("Script démarré");

const CONFIG = {
    pairs: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'],
    startCapital: 1000
};

async function init() {
    try {
        console.log("Tentative de récupération des prix...");
        const response = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
        const data = await response.json();
        
        document.getElementById('signals-container').innerHTML = `
            <div class="crypto-card">
                <div style="display:flex; justify-content:space-between;">
                    <b>BTCUSDT</b> 
                    <span>${parseFloat(data.price).toFixed(2)} $</span>
                </div>
                <div class="verdict buy">SYSTÈME OK</div>
            </div>
            <p style="text-align:center; color:gray; font-size:0.7rem;">Mode secours activé - Si tu vois ceci, le lien avec Binance fonctionne.</p>
        `;
    } catch (error) {
        console.error("Erreur API:", error);
        document.getElementById('signals-container').innerHTML = "Erreur de connexion API.";
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Chargé");
    init();
});
