/* RESET COMPLET POUR MOBILE */
* {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}

body { 
    background-color: #0b0e11; 
    color: #eaecef; 
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
    padding: 15px;
    line-height: 1.5;
}

/* HEADER & NAV */
header { 
    text-align: center; 
    padding: 20px 0;
    border-bottom: 1px solid #2b3139;
}

h1 { color: #f0b90b; font-size: 1.5rem; margin-bottom: 15px; }

nav { 
    display: flex; 
    gap: 10px; 
    justify-content: center; 
    margin-bottom: 20px; 
}

button { 
    background: #2b3139; 
    color: white; 
    border: none; 
    padding: 10px 20px; 
    border-radius: 6px; 
    font-weight: bold;
    flex: 1; /* Pour que les boutons soient de même taille sur iPhone */
    max-width: 150px;
}

/* CARTES DE SIGNAUX */
.card { 
    background: #1e2329; 
    padding: 15px; 
    border-radius: 12px; 
    margin-bottom: 12px; 
    border-left: 6px solid #474d57; 
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
}

.buy { border-left-color: #02c076; } /* Vert Binance */
.off { border-left-color: #f6465d; } /* Rouge Binance */

.card h3 { margin-bottom: 5px; color: #fff; }

.price-target { 
    color: #f0b90b; 
    font-weight: bold; 
    display: block;
    margin-top: 5px;
    padding: 5px;
    background: rgba(240, 185, 11, 0.1);
    border-radius: 4px;
}

/* GRAPHIQUE */
#myChart {
    background: #161a1e;
    border-radius: 8px;
    margin-top: 15px;
    padding: 10px;
}

/* FOOTER */
footer { 
    font-size: 11px; 
    text-align: center; 
    opacity: 0.5; 
    margin-top: 30px; 
    padding: 10px;
}
