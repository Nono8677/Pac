const cryptos = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];

function show(id) {
    document.querySelectorAll('.tab').forEach(t => t.style.display = 'none');
    document.getElementById(id).style.display = 'block';
}

// Simulation du Tribunal des 3 (A remplacer par calculs API sur ordi)
async function getTribunalSignal(symbol) {
    // Règle : Si 2/3 sont OK alors J'ACHETE
    // Simulation stable basée sur la tendance actuelle
    const utBot = true; 
    const qqeMode = Math.random() > 0.3; 
    const superTrend = true;

    const votes = [utBot, qqeMode, superTrend].filter(v => v === true).length;
    const finalSignal = votes >= 2 ? "J'ACHÈTE" : "HORS MARCHÉ";
    
    return {
        status: finalSignal,
        resistance: 158.40 // Ta ligne rouge SuperTrend
    };
}

async function render() {
    const div = document.getElementById('signals');
    div.innerHTML = "";
    
    for (let s of cryptos) {
        const res = await getTribunalSignal(s);
        const card = document.createElement('div');
        card.className = `card ${res.status === "J'ACHÈTE" ? 'buy' : 'off'}`;
        card.innerHTML = `
            <h3>${s}</h3>
            <p>Verdict : <strong>${res.status}</strong> (${votes}/3)</p>
            ${res.status === "HORS MARCHÉ" ? `<p>Attente cassure : <span class="price-target">${res.resistance}</span></p>` : ''}
        `;
        div.appendChild(card);
    }
}

// Graphique de performance (PF 1000$)
const ctx = document.getElementById('myChart').getContext('2d');
new Chart(ctx, {
    type: 'line',
    data: {
        labels: ['25/04', '27/04', '29/04', '02/05'],
        datasets: [{
            label: 'Portefeuille ($)',
            data: [1000, 1040, 1080, 1130],
            borderColor: '#02c076',
            backgroundColor: 'rgba(2, 192, 118, 0.1)',
            fill: true
        }]
    }
});

render();
