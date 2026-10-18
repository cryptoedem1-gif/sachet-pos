// SachetPOS / MIAKIARA - Logique Applicative Complète

let state = {
  products: [],
  suppliers: [],
  approvisionnements: [],
  customers: [],
  sales: [],
  stockMovements: [],
  customerPayments: [],
  dettes: [],
  reglementsDettes: [],
  depenses: [],
  clotures: [],
  modeVendeur: localStorage.getItem('miakiara_mode_vendeur') === 'true',
  clotureApercu: null,
  activeDebtTab: 'CLIENT', // 'CLIENT' | 'FOURNISSEUR' | 'REGLEMENTS' | 'CLIENTS_LIST'
  currentFicheDetteId: null,
  settings: {
    shop_name: "COMMERCE DE SACHETS MIAKIARA",
    shop_phone: "+228 90 00 00 00 / +228 92 00 00 00",
    shop_address: "Grand Marché Tsévié / Lomé - Togo",
    devise: "FCFA",
    receipt_footer: "MIAKIARA vous remercie de votre fidélité !"
  },
  cart: [],
  activeCategory: 'ALL',
  posSaleMode: 'GROS', // 'GROS' ou 'DETAIL'
  paymentMode: 'ESPECES',
  currentTab: 'pos',
  soundEnabled: true
};

// --- SYSTÈME DE NOTIFICATIONS TOAST MODERNES ---
function showToast(type, title, message) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const id = 'toast-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };
  const borderColors = {
    success: 'border-emerald-500 bg-white text-emerald-950',
    error: 'border-rose-500 bg-white text-rose-950',
    warning: 'border-amber-500 bg-white text-amber-950',
    info: 'border-sky-500 bg-white text-sky-950'
  };

  const toast = document.createElement('div');
  toast.id = id;
  toast.className = `p-3 rounded-xl border shadow-xl flex items-start gap-3 transition-all duration-300 transform translate-y-2 opacity-0 ${borderColors[type] || borderColors.info}`;
  toast.innerHTML = `
    <span class="text-xl flex-shrink-0">${icons[type] || 'ℹ️'}</span>
    <div class="flex-1 text-xs">
      <div class="font-bold text-sm">${title}</div>
      <div class="text-slate-600 mt-0.5 leading-relaxed">${message}</div>
    </div>
    <button onclick="document.getElementById('${id}')?.remove()" class="text-slate-400 hover:text-slate-600 font-bold text-xs ml-1">✕</button>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  }, 10);

  setTimeout(() => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => el.remove(), 300);
    }
  }, 4200);
}

// --- BIP SONORE DE CAISSE (Web Audio API - 100% Hors-Ligne) ---
let audioCtx = null;
function playBeep(type = 'beep') {
  if (!state.soundEnabled) return;
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'beep') {
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // La5 aigu
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'success') {
      osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.08); // E5
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.25);
    }
  } catch (e) {
    // Audio context not allowed or blocked
  }
}

function toggleAudio() {
  state.soundEnabled = !state.soundEnabled;
  const btn = document.getElementById('btn-audio-toggle');
  if (btn) {
    btn.textContent = state.soundEnabled ? '🔔' : '🔕';
    btn.title = state.soundEnabled ? 'Son de caisse activé' : 'Son de caisse coupé';
  }
}

// --- GESTION DE LA SAUVEGARDE & RESTAURATION (1-CLIC) ---
function downloadBackup() {
  playBeep('beep');
  showToast('info', 'Sauvegarde en cours', 'Téléchargement de la copie complète sécurisée de la base MIAKIARA...');
  window.location.href = '/api/backup';
}

function triggerRestoreUpload() {
  const input = document.getElementById('file-restore-input');
  if (input) input.click();
}

async function uploadBackup(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!confirm(`⚠️ Attention : Voulez-vous restaurer les données depuis le fichier "${file.name}" ? Cela remplacera votre base actuelle.`)) {
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const json = JSON.parse(e.target.result);
      const res = await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de la restauration");

      playBeep('success');
      showToast('success', 'Restauration réussie', 'La base de données a été restaurée avec succès !');
      await loadData();
    } catch (err) {
      showToast('error', 'Échec de restauration', err.message);
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsText(file);
}

// --- RACCOURCIS CLAVIER PRO DE CAISSE ---
window.addEventListener('keydown', (e) => {
  // F2 => Focus recherche produits
  if (e.key === 'F2') {
    e.preventDefault();
    switchTab('pos');
    const searchInput = document.getElementById('pos-search');
    if (searchInput) searchInput.focus();
  }
  // F4 => Encaissement rapide
  if (e.key === 'F4') {
    e.preventDefault();
    if (state.cart.length > 0) openCheckoutModal();
  }
  // Escape => Fermer modals
  if (e.key === 'Escape') {
    closeModalCheckout();
    closeModalProduct();
    closeModalReappro();
    closeModalCustomer();
    closeModalPayDebt();
    closeModalStockJournal();
    closeModalSupplier();
    closeModalShareSituation();
  }
});

// --- INITIALISATION ---
let dernierSyncTimestamp = 0;

document.addEventListener('DOMContentLoaded', async () => {
  initSecurityPin();
  initPullToRefresh();
  await loadData();
  switchTab('pos');
  startAutoSync();
});

function startAutoSync() {
  setInterval(async () => {
    try {
      const res = await fetch('/api/sync');
      if (res.ok) {
        const d = await res.json();
        if (d.lastUpdated) {
          if (dernierSyncTimestamp > 0 && d.lastUpdated > dernierSyncTimestamp) {
            console.log("🔄 Synchronisation automatique PC <-> Mobile détectée !");
            await loadData();
          }
          dernierSyncTimestamp = d.lastUpdated;
        }
      }
    } catch(e) {}
  }, 3500);
}

async function loadData() {
  try {
    const res = await fetch('/api/data');
    if (!res.ok) throw new Error("Erreur de récupération des données");
    const data = await res.json();
    dernierSyncTimestamp = Date.now();
    
    state.products = data.products || [];
    state.suppliers = data.suppliers || [];
    state.approvisionnements = data.approvisionnements || [];
    state.customers = data.customers || [];
    state.sales = data.sales || [];
    state.stockMovements = data.stockMovements || [];
    state.customerPayments = data.customerPayments || [];
    state.dettes = data.dettes || [];
    state.reglementsDettes = data.reglementsDettes || [];
    state.depenses = data.depenses || [];
    state.clotures = data.clotures || [];
    if (data.settings) {
      state.settings = data.settings;
      if (data.settings.codePIN) {
        const labelCode = document.getElementById('label-pin-code');
        if (labelCode) labelCode.textContent = data.settings.codePIN;
      }
    }

    updateHeaderInfo();
    appliquerModeVendeurUI();
    populateCustomerDropdown();
    populateApproDropdowns();
    renderPosCatalog();
    renderFlashFavorites();
    renderStockTable();
    renderCustomersTable();
    renderDettesDashboard();
    renderApproTable();
    renderSuppliersTable();
    renderZReports();
    loadSettingsForm();
  } catch (err) {
    console.error("Erreur de chargement:", err);
    showToast('error', 'Connexion serveur', 'Impossible de charger les données du serveur.');
  }
}

// Format monétaire
function formatMoney(amount) {
  const num = Math.round(Number(amount) || 0);
  return num.toLocaleString('fr-FR') + ' ' + (state.settings.devise || 'FCFA');
}

// Nom complet et canonique d'un produit (garantit l'affichage exact de la marque, taille et désignation)
function formatProductFullName(p) {
  if (!p) return 'Article inconnu';
  if (typeof p === 'string') return p;
  
  if (p.designation && p.designation !== 'undefined' && p.designation.trim() !== '') {
    return p.designation.trim();
  }

  const nom = (p.nom || '').trim();
  const marque = (p.marque || '').trim();
  const taille = (p.taille || '').trim();
  const couleur = (p.couleur || '').trim();

  const parts = [nom];
  if (taille && !nom.toLowerCase().includes(taille.toLowerCase())) {
    parts.push(taille);
  }
  if (couleur && couleur.toLowerCase() !== 'transparent' && !nom.toLowerCase().includes(couleur.toLowerCase())) {
    parts.push(couleur);
  }
  let fullName = parts.join(' ');
  if (marque && !fullName.toLowerCase().includes(marque.toLowerCase())) {
    fullName += ' - ' + marque;
  }
  return fullName;
}

// Mise à jour de l'en-tête
function updateHeaderInfo() {
  const shopNameElem = document.getElementById('header-shop-name');
  if (shopNameElem) shopNameElem.textContent = state.settings.shop_name;
  
  // Valeur totale du stock = Somme(stock * prix_gros ou prix)
  const totalStockVal = state.products.reduce((acc, p) => {
    const px = parseFloat(p.prix_gros) || parseFloat(p.prix) || 0;
    return acc + ((parseFloat(p.stock) || 0) * px);
  }, 0);
  const stockValElem = document.getElementById('header-stock-value');
  if (stockValElem) stockValElem.textContent = formatMoney(totalStockVal);

  // Ventes du jour
  const todayStr = new Date().toISOString().slice(0, 10);
  const todaySalesTotal = state.sales
    .filter(s => s.date && s.date.slice(0, 10) === todayStr)
    .reduce((acc, s) => acc + (parseFloat(s.totalNet) || 0), 0);
  const todaySalesElem = document.getElementById('header-today-sales');
  if (todaySalesElem) todaySalesElem.textContent = formatMoney(todaySalesTotal);
}

// Navigation par Onglets
function switchTab(tabId) {
  state.currentTab = tabId;
  document.querySelectorAll('.tab-view').forEach(view => view.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('bg-white', 'text-sky-900', 'shadow');
    btn.classList.add('text-sky-100');
  });

  const activeView = document.getElementById(`view-${tabId}`);
  const activeBtn = document.getElementById(`tab-btn-${tabId}`);

  if (activeView) activeView.classList.remove('hidden');
  if (activeBtn) {
    activeBtn.classList.remove('text-sky-100');
    activeBtn.classList.add('bg-white', 'text-sky-900', 'shadow');
  }

  if (tabId === 'pos') renderPosCatalog();
  if (tabId === 'stock') renderStockTable();
  if (tabId === 'appro') {
    populateApproDropdowns();
    renderApproTable();
    renderSuppliersTable();
    calculerMargesApproEnDirect();
  }
  if (tabId === 'clients') {
    renderDettesDashboard();
  }
  if (tabId === 'rapports') renderZReports();
}

// ==========================================
// 1. MODULE CAISSE & POINT DE VENTE (POS)
// ==========================================

function setPosSaleMode(mode) {
  state.posSaleMode = (mode === 'DETAIL' || mode === 'MONTANT') ? mode : 'GROS';
  const btnGros = document.getElementById('btn-pos-mode-gros');
  const btnDetail = document.getElementById('btn-pos-mode-detail');
  const btnMontant = document.getElementById('btn-pos-mode-montant');

  if (state.posSaleMode === 'GROS') {
    if (btnGros) btnGros.className = 'py-1 px-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 shadow transition bg-sky-700 text-white';
    if (btnDetail) btnDetail.className = 'py-1 px-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition bg-white text-slate-700 border border-slate-300 hover:bg-slate-50';
    if (btnMontant) btnMontant.className = 'py-1 px-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition bg-white text-emerald-800 border border-emerald-300 hover:bg-emerald-50';
  } else if (state.posSaleMode === 'DETAIL') {
    if (btnGros) btnGros.className = 'py-1 px-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition bg-white text-slate-700 border border-slate-300 hover:bg-slate-50';
    if (btnDetail) btnDetail.className = 'py-1 px-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 shadow transition bg-amber-600 text-white';
    if (btnMontant) btnMontant.className = 'py-1 px-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition bg-white text-emerald-800 border border-emerald-300 hover:bg-emerald-50';
  } else {
    // Mode MONTANT
    if (btnGros) btnGros.className = 'py-1 px-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition bg-white text-slate-700 border border-slate-300 hover:bg-slate-50';
    if (btnDetail) btnDetail.className = 'py-1 px-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition bg-white text-slate-700 border border-slate-300 hover:bg-slate-50';
    if (btnMontant) btnMontant.className = 'py-1 px-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 shadow transition bg-emerald-700 text-white';
  }

  renderPosCatalog();
}

function setCategoryFilter(cat) {
  state.activeCategory = cat;
  document.querySelectorAll('.cat-pill').forEach(btn => {
    btn.classList.remove('bg-sky-700', 'text-white');
    btn.classList.add('bg-slate-200', 'text-slate-700');
  });
  if (window.event && window.event.target) {
    window.event.target.classList.remove('bg-slate-200', 'text-slate-700');
    window.event.target.classList.add('bg-sky-700', 'text-white');
  }
  renderPosCatalog();
}

function clearSearch() {
  document.getElementById('pos-search').value = '';
  renderPosCatalog();
}

function onProductCardClick(productId) {
  if (state.posSaleMode === 'MONTANT') {
    openModalVenteMontant(productId);
  } else if (state.posSaleMode === 'DETAIL') {
    addUnitToCart(productId, 1);
  } else {
    addToCart(productId, 1, 'GROS');
  }
}

function renderPosCatalog() {
  const grid = document.getElementById('pos-grid');
  if (!grid) return;
  renderFlashFavorites();
  const search = (document.getElementById('pos-search')?.value || '').toLowerCase().trim();
  const colorFilter = (document.getElementById('pos-color-filter')?.value || '').toLowerCase().trim();

  const filtered = state.products.filter(p => {
    const matchCat = (state.activeCategory === 'ALL' || p.categorie === state.activeCategory);
    const matchColor = !colorFilter || (p.couleur || '').toLowerCase() === colorFilter;
    
    const fullText = `${p.nom} ${p.taille} ${p.couleur} ${p.marque} ${p.code}`.toLowerCase();
    const matchSearch = !search || fullText.includes(search);

    return matchCat && matchColor && matchSearch;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full py-12 text-center text-slate-400">
        <span class="text-4xl block mb-2">🔍</span>
        Aucun sachet trouvé pour cette recherche.
      </div>`;
    return;
  }

  const currentMode = state.posSaleMode || 'GROS';

  grid.innerHTML = filtered.map(p => {
    const unitesParAdaka = p.unites_par_adaka || 20;
    const stockVal = parseFloat(p.stock) || 0;
    const stockUnits = p.stock_unites !== undefined ? p.stock_unites : Math.round(stockVal * unitesParAdaka);
    const isOutOfStock = stockUnits <= 0;
    const isLowStock = stockUnits > 0 && stockVal < (p.seuil_alerte || 1);

    let stockBadge = `<span class="bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded text-[10px] font-bold">${stockUnits} u (${stockVal} Ad.)</span>`;
    if (isOutOfStock) {
      stockBadge = `<span class="bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded text-[10px] font-bold">Rupture (0 u)</span>`;
    } else if (isLowStock) {
      stockBadge = `<span class="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded text-[10px] font-bold">Faible (${stockUnits} u)</span>`;
    }

    const prixGros = parseFloat(p.prix_gros) || parseFloat(p.prix) || 0;
    const prixDetail = parseFloat(p.prix_detail) || parseFloat(p.prix) || 0;
    const prixSachet = parseFloat(p.prix_detail_unite) || (unitesParAdaka > 0 ? Math.round(prixDetail / unitesParAdaka) : 100);

    let activePriceDisplay = '';
    if (currentMode === 'GROS') {
      activePriceDisplay = `<span class="text-[10px] text-slate-400">Tarif GROS :</span> <span class="text-xs font-black text-sky-800">${formatMoney(prixGros)} / Adaka</span>`;
    } else if (currentMode === 'DETAIL') {
      activePriceDisplay = `<span class="text-[10px] text-slate-400">Tarif DÉTAIL :</span> <span class="text-xs font-black text-amber-700">${formatMoney(prixSachet)} / sachet</span>`;
    } else {
      activePriceDisplay = `<span class="text-[10px] text-emerald-600 font-bold">Mode MONTANT :</span> <span class="text-xs font-black text-emerald-800">Au choix du client</span>`;
    }

    return `
      <div class="product-card bg-white border border-slate-200 rounded-xl p-2.5 flex flex-col justify-between shadow-sm hover:border-sky-500 cursor-pointer relative overflow-hidden transition ${isOutOfStock ? 'opacity-70 bg-slate-50' : ''}" onclick="onProductCardClick(${p.id})">
        <div class="space-y-1">
          <div class="flex justify-between items-start">
            <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">${p.code || 'SCH'}</span>
            ${stockBadge}
          </div>
          
          <h3 class="font-bold text-slate-800 text-xs line-clamp-1 leading-snug">
            ${p.nom}
          </h3>

          <div class="flex flex-wrap gap-1 text-[10px] text-slate-600">
            <span class="bg-slate-100 px-1.5 py-0.5 rounded font-medium">${p.taille || ''}</span>
            <span class="bg-slate-100 px-1.5 py-0.5 rounded font-medium">${p.couleur || ''}</span>
            <span class="bg-sky-50 text-sky-700 px-1.5 py-0.5 rounded font-semibold">${p.marque || ''}</span>
          </div>

          <!-- Affichage clair des 3 tarifs : Gros, Détail Adaka et Sachet individuel -->
          <div class="grid grid-cols-3 gap-1 pt-1 text-[10px] bg-slate-50 p-1.5 rounded-lg border border-slate-100 text-center">
            <div class="${currentMode === 'GROS' ? 'font-black text-sky-800 bg-white shadow-xs rounded px-1' : 'text-slate-500'}">
              <span class="text-[9px] uppercase font-bold block ${currentMode === 'GROS' ? 'text-sky-600' : 'text-slate-400'}">Gros Ad.</span>
              ${formatMoney(prixGros)}
            </div>
            <div class="${currentMode === 'DETAIL' ? 'font-black text-amber-700 bg-white shadow-xs rounded px-1' : 'text-slate-500'}">
              <span class="text-[9px] uppercase font-bold block ${currentMode === 'DETAIL' ? 'text-amber-600' : 'text-slate-400'}">Dét. Ad.</span>
              ${formatMoney(prixDetail)}
            </div>
            <div class="font-black text-emerald-800 bg-emerald-50/70 border border-emerald-200/50 rounded px-1">
              <span class="text-[9px] uppercase font-bold block text-emerald-700">1 Sachet</span>
              ${formatMoney(prixSachet)}
            </div>
          </div>
        </div>

        <div class="mt-2 pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-1.5">
          <div>
            ${activePriceDisplay}
          </div>
          
          <!-- Boutons rapides 3 modes : +1 Adaka, +1 Sachet, 💵 Montant -->
          <div class="flex items-center gap-1" onclick="event.stopPropagation()">
            <button type="button" onclick="addToCart(${p.id}, 1, 'GROS')" class="px-2 py-1 bg-sky-700 hover:bg-sky-800 text-white rounded text-[10px] font-bold shadow-xs transition active:scale-95" title="Ajouter 1 Adaka entier au tarif de gros">
              +1 Ad.
            </button>
            <button type="button" onclick="addUnitToCart(${p.id}, 1)" class="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[10px] font-bold shadow-xs transition active:scale-95" title="Ajouter 1 Sachet individuel au détail">
              +1 Sachet
            </button>
            <button type="button" onclick="openModalVenteMontant(${p.id})" class="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-black shadow-xs flex items-center gap-0.5 transition active:scale-95" title="Vente au détail par montant encaissé (200F, 400F, 600F...)">
              <span>💵</span> Montant
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// GESTION DU PANIER (CART)
function addToCart(productId, qty = 1, forceMode = null) {
  const product = state.products.find(p => p.id === productId);
  if (!product) return;

  const unitesParAdaka = product.unites_par_adaka || 20;
  const stockVal = parseFloat(product.stock) || 0;
  const stockUnits = product.stock_unites !== undefined ? product.stock_unites : Math.round(stockVal * unitesParAdaka);

  if (stockUnits <= 0) {
    if (!confirm(`⚠️ Attention : L'article "${product.nom}" est actuellement en rupture de stock. Voulez-vous quand même l'ajouter au panier ?`)) {
      return;
    }
  }

  playBeep('beep');

  const mode = forceMode || state.posSaleMode || 'GROS';
  let unitPrice = 0;
  let unitesVendues = 0;
  let fractionAdaka = 0;
  let coutAchatLigne = 0;

  if (mode === 'DETAIL') {
    // Vente au détail par sachets individuels
    unitPrice = parseFloat(product.prix_detail_unite) || (unitesParAdaka > 0 ? Math.round((parseFloat(product.prix_detail) || parseFloat(product.prix) || 0) / unitesParAdaka) : 100);
    unitesVendues = Math.round(qty);
    fractionAdaka = Math.round((unitesVendues / unitesParAdaka) * 1000) / 1000;
    const costAchatUnite = (parseFloat(product.prix_achat) || 0) / unitesParAdaka;
    coutAchatLigne = costAchatUnite;
  } else {
    // Mode GROS (par Adaka)
    unitPrice = parseFloat(product.prix_gros) || parseFloat(product.prix) || 0;
    fractionAdaka = qty;
    unitesVendues = Math.round(qty * unitesParAdaka);
    coutAchatLigne = parseFloat(product.prix_achat) || 0;
  }

  const existingIndex = state.cart.findIndex(item => item.productId === productId && item.modeVente === mode);
  if (existingIndex !== -1) {
    state.cart[existingIndex].quantite = Math.round((state.cart[existingIndex].quantite + qty) * 1000) / 1000;
    if (state.cart[existingIndex].unitesVendues) {
      state.cart[existingIndex].unitesVendues += unitesVendues;
    }
  } else {
    state.cart.push({
      productId: product.id,
      code: product.code,
      nom: `${product.nom} ${product.taille || ''} (${product.marque || ''})`,
      prix: unitPrice,
      coutAchat: coutAchatLigne,
      modeVente: mode,
      quantite: qty,
      unitesVendues: unitesVendues,
      unitesParAdaka: unitesParAdaka,
      lot: mode === 'DETAIL' ? 'sachet(s)' : (product.lot || 'Adaka')
    });
  }

  renderCart();
}

function addUnitToCart(productId, count = 1) {
  addToCart(productId, count, 'DETAIL');
}

// ==========================================
// MODAL VENTE AU DÉTAIL PAR MONTANT ENCAISSÉ (SECTION 12)
// ==========================================
let currentVenteMontantProduct = null;
let currentVfmSelectedUnits = null;

function openModalVenteMontant(productId) {
  const product = state.products.find(p => p.id === productId);
  if (!product) return;

  currentVenteMontantProduct = product;
  currentVfmSelectedUnits = null;

  const unitesParAdaka = product.unites_par_adaka || 20;
  const stockAdaka = parseFloat(product.stock) || 0;
  const stockUnites = product.stock_unites !== undefined ? product.stock_unites : Math.round(stockAdaka * unitesParAdaka);
  const coutAdaka = parseFloat(product.prix_achat) || 0;
  const coutUnite = unitesParAdaka > 0 ? (coutAdaka / unitesParAdaka) : 0;
  const prixDetailUnite = parseFloat(product.prix_detail_unite) || (unitesParAdaka > 0 ? Math.round((parseFloat(product.prix_detail) || parseFloat(product.prix) || 0) / unitesParAdaka) : 100);

  const elemCode = document.getElementById('vfm-code');
  if (elemCode) elemCode.textContent = product.code || 'SCH';
  const elemNom = document.getElementById('vfm-nom');
  if (elemNom) elemNom.textContent = product.nom;
  const elemDetails = document.getElementById('vfm-details');
  if (elemDetails) elemDetails.textContent = `${product.taille || ''} - ${product.couleur || ''} - ${product.marque || ''}`;
  const elemStockBadge = document.getElementById('vfm-stock-badge');
  if (elemStockBadge) elemStockBadge.textContent = `${stockUnites} sachets (${stockAdaka} Adaka)`;
  const elemUnitesAdaka = document.getElementById('vfm-unites-par-adaka');
  if (elemUnitesAdaka) elemUnitesAdaka.textContent = `${unitesParAdaka} sachets`;
  const elemCoutU = document.getElementById('vfm-cout-unitaire');
  if (elemCoutU) elemCoutU.textContent = `${formatMoney(Math.round(coutUnite))} / u`;
  const elemTarifU = document.getElementById('vfm-tarif-detail-unite');
  if (elemTarifU) elemTarifU.textContent = `${formatMoney(prixDetailUnite)} / u`;

  const inputMontant = document.getElementById('vfm-input-montant');
  if (inputMontant) {
    inputMontant.value = 200;
  }

  recalculerVenteMontant();

  const modal = document.getElementById('modal-vente-montant');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function closeModalVenteMontant() {
  const modal = document.getElementById('modal-vente-montant');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
  currentVenteMontantProduct = null;
  currentVfmSelectedUnits = null;
}

function setVenteMontantRapide(amount) {
  const inputMontant = document.getElementById('vfm-input-montant');
  if (inputMontant) {
    inputMontant.value = amount;
  }
  currentVfmSelectedUnits = null;
  recalculerVenteMontant();
}

function recalculerVenteMontant() {
  const prod = currentVenteMontantProduct;
  if (!prod) return;

  const montant = parseFloat(document.getElementById('vfm-input-montant')?.value) || 0;
  const unitesParAdaka = prod.unites_par_adaka || 20;
  const prixDetailUnite = parseFloat(prod.prix_detail_unite) || (unitesParAdaka > 0 ? Math.round((parseFloat(prod.prix_detail) || parseFloat(prod.prix) || 0) / unitesParAdaka) : 100);
  const coutAdaka = parseFloat(prod.prix_achat) || 0;
  const coutUnite = unitesParAdaka > 0 ? (coutAdaka / unitesParAdaka) : 0;
  const stockAdaka = parseFloat(prod.stock) || 0;
  const stockUnites = prod.stock_unites !== undefined ? prod.stock_unites : Math.round(stockAdaka * unitesParAdaka);

  const precisionBox = document.getElementById('vfm-precision-box');
  const precisionOptions = document.getElementById('vfm-precision-options');

  let unitesVendues = 0;

  if (prixDetailUnite > 0 && montant > 0) {
    const modulo = montant % prixDetailUnite;
    if (modulo !== 0 && currentVfmSelectedUnits === null) {
      if (precisionBox && precisionOptions) {
        precisionBox.classList.remove('hidden');
        const qInf = Math.floor(montant / prixDetailUnite);
        const qSup = Math.ceil(montant / prixDetailUnite);
        const totalInf = qInf * prixDetailUnite;
        const totalSup = qSup * prixDetailUnite;
        const monnaie = montant - totalInf;
        const appoint = totalSup - montant;

        precisionOptions.innerHTML = `
          <button type="button" onclick="choisirPrecisionUnites(${qInf})" class="p-2 bg-white hover:bg-emerald-50 border border-amber-300 hover:border-emerald-500 rounded-lg text-left transition">
            <span class="font-bold text-slate-800 block">${qInf} sachets</span>
            <span class="text-[10px] text-slate-500">Soit ${formatMoney(totalInf)} (rendre ${formatMoney(monnaie)})</span>
          </button>
          <button type="button" onclick="choisirPrecisionUnites(${qSup})" class="p-2 bg-white hover:bg-emerald-50 border border-amber-300 hover:border-emerald-500 rounded-lg text-left transition">
            <span class="font-bold text-slate-800 block">${qSup} sachets</span>
            <span class="text-[10px] text-slate-500">Soit ${formatMoney(totalSup)} (+${formatMoney(appoint)} appoint)</span>
          </button>
        `;
      }
      unitesVendues = Math.floor(montant / prixDetailUnite);
    } else {
      if (precisionBox) precisionBox.classList.add('hidden');
      unitesVendues = currentVfmSelectedUnits !== null ? currentVfmSelectedUnits : Math.floor(montant / prixDetailUnite);
    }
  } else {
    if (precisionBox) precisionBox.classList.add('hidden');
    unitesVendues = 0;
  }

  const fractionAdaka = unitesParAdaka > 0 ? (Math.round((unitesVendues / unitesParAdaka) * 1000) / 1000) : 0;
  const coutTotalLigne = Math.round(coutUnite * unitesVendues);
  const margeBrute = montant - coutTotalLigne;
  const tauxMarge = montant > 0 ? ((margeBrute / montant) * 100) : 0;
  const stockRestantUnites = Math.max(0, stockUnites - unitesVendues);
  const stockRestantAdaka = Math.round(Math.max(0, stockAdaka - fractionAdaka) * 1000) / 1000;

  const elemResU = document.getElementById('vfm-result-unites');
  if (elemResU) elemResU.textContent = `${unitesVendues} sachets`;
  const elemResFrac = document.getElementById('vfm-result-fraction');
  if (elemResFrac) elemResFrac.textContent = `(${fractionAdaka} Adaka)`;
  const elemResCout = document.getElementById('vfm-result-cout');
  if (elemResCout) elemResCout.textContent = formatMoney(coutTotalLigne);
  const elemResCoutU = document.getElementById('vfm-result-cout-unit');
  if (elemResCoutU) elemResCoutU.textContent = `(${formatMoney(Math.round(coutUnite))} / u)`;
  const elemResMarge = document.getElementById('vfm-result-marge');
  if (elemResMarge) {
    elemResMarge.textContent = (margeBrute >= 0 ? '+' : '') + formatMoney(margeBrute);
    elemResMarge.className = `text-sm font-black ${margeBrute >= 0 ? 'text-emerald-700' : 'text-rose-700'}`;
  }
  const elemResTaux = document.getElementById('vfm-result-taux-marge');
  if (elemResTaux) elemResTaux.textContent = `${tauxMarge.toFixed(1)} % de marge`;
  const elemResStock = document.getElementById('vfm-result-stock-restant');
  if (elemResStock) elemResStock.textContent = `${stockRestantUnites} u`;
  const elemResStockAdaka = document.getElementById('vfm-result-stock-restant-adaka');
  if (elemResStockAdaka) elemResStockAdaka.textContent = `(${stockRestantAdaka} Adaka)`;

  const statusBadge = document.getElementById('vfm-status-stock');
  const btnCart = document.getElementById('btn-vfm-cart');
  const btnDirect = document.getElementById('btn-vfm-direct');
  const isStockOk = stockUnites >= unitesVendues;

  if (statusBadge) {
    if (isStockOk) {
      statusBadge.innerHTML = 'Stock suffisant ✅';
      statusBadge.className = 'text-[11px] font-bold text-emerald-700';
    } else {
      statusBadge.innerHTML = 'Stock insuffisant ❌';
      statusBadge.className = 'text-[11px] font-bold text-rose-700';
    }
  }

  if (btnCart) btnCart.disabled = (!isStockOk && unitesVendues > stockUnites) || unitesVendues <= 0;
  if (btnDirect) btnDirect.disabled = (!isStockOk && unitesVendues > stockUnites) || unitesVendues <= 0;
}

function choisirPrecisionUnites(u) {
  currentVfmSelectedUnits = u;
  const precisionBox = document.getElementById('vfm-precision-box');
  if (precisionBox) precisionBox.classList.add('hidden');
  recalculerVenteMontant();
}

function ajouterAuPanierVenteMontant() {
  const prod = currentVenteMontantProduct;
  if (!prod) return;

  const montant = parseFloat(document.getElementById('vfm-input-montant')?.value) || 0;
  if (montant <= 0) {
    showToast('error', 'Montant requis', 'Veuillez renseigner un montant.');
    return;
  }

  const unitesParAdaka = prod.unites_par_adaka || 20;
  const prixDetailUnite = parseFloat(prod.prix_detail_unite) || (unitesParAdaka > 0 ? Math.round((parseFloat(prod.prix_detail) || parseFloat(prod.prix) || 0) / unitesParAdaka) : 100);
  const coutAdaka = parseFloat(prod.prix_achat) || 0;
  const coutUnite = unitesParAdaka > 0 ? (coutAdaka / unitesParAdaka) : 0;
  const unitesVendues = currentVfmSelectedUnits !== null ? currentVfmSelectedUnits : Math.floor(montant / prixDetailUnite);
  const fractionAdaka = unitesParAdaka > 0 ? (Math.round((unitesVendues / unitesParAdaka) * 1000) / 1000) : 0;

  playBeep('beep');

  state.cart.push({
    productId: prod.id,
    code: prod.code,
    nom: `${prod.nom} ${prod.taille || ''} (${prod.marque || ''})`,
    prix: montant,
    montantEncaisse: montant,
    coutAchat: Math.round(coutUnite * unitesVendues),
    modeVente: 'DETAIL_MONTANT',
    quantite: 1,
    fractionAdaka: fractionAdaka,
    unitesVendues: unitesVendues,
    unitesParAdaka: unitesParAdaka,
    lot: `${unitesVendues} sachets (${fractionAdaka} Adaka)`
  });

  closeModalVenteMontant();
  renderCart();
  showToast('success', 'Ajouté au panier', `${unitesVendues} sachets pour ${formatMoney(montant)} ajoutés.`);
}

async function encaisserDirectVenteMontant() {
  const prod = currentVenteMontantProduct;
  if (!prod) return;

  const montant = parseFloat(document.getElementById('vfm-input-montant')?.value) || 0;
  if (montant <= 0) {
    showToast('error', 'Montant requis', 'Veuillez saisir un montant.');
    return;
  }

  const unitesParAdaka = prod.unites_par_adaka || 20;
  const prixDetailUnite = parseFloat(prod.prix_detail_unite) || (unitesParAdaka > 0 ? Math.round((parseFloat(prod.prix_detail) || parseFloat(prod.prix) || 0) / unitesParAdaka) : 100);
  const coutAdaka = parseFloat(prod.prix_achat) || 0;
  const coutUnite = unitesParAdaka > 0 ? (coutAdaka / unitesParAdaka) : 0;
  const unitesVendues = currentVfmSelectedUnits !== null ? currentVfmSelectedUnits : Math.floor(montant / prixDetailUnite);
  const fractionAdaka = unitesParAdaka > 0 ? (Math.round((unitesVendues / unitesParAdaka) * 1000) / 1000) : 0;

  const payload = {
    customerId: 1,
    clientNom: 'Client Détail Comptant',
    modeVente: 'DETAIL_MONTANT',
    items: [{
      productId: prod.id,
      modeVente: 'DETAIL_MONTANT',
      quantite: fractionAdaka,
      unitesVendues: unitesVendues,
      prix: montant,
      montantEncaisse: montant,
      coutAchat: Math.round(coutUnite * unitesVendues),
      nom: `${prod.nom} ${prod.taille || ''} (${prod.marque || ''})`
    }],
    totalNet: montant,
    remise: 0,
    modePaiement: 'ESPECES',
    montantRecu: montant,
    monnaieRendue: 0,
    montantPaye: montant,
    montantRestant: 0
  };

  try {
    const res = await fetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur de validation");

    closeModalVenteMontant();
    playBeep('success');
    showToast('success', 'Vente encaissée !', `Ticket ${data.sale.ticketCode} - ${formatMoney(montant)} encaissés.`);
    await loadData();
    openShareSaleReceipt(data.sale);
  } catch (err) {
    console.error("Erreur encaissement direct:", err);
    showToast('error', 'Erreur vente', err.message);
  }
}

function updateCartItemQty(index, newQty) {
  const val = parseFloat(newQty);
  if (val <= 0) {
    state.cart.splice(index, 1);
  } else {
    state.cart[index].quantite = Math.round(val * 1000) / 1000;
  }
  renderCart();
}

function setCartItemFraction(index, fraction) {
  if (state.cart[index]) {
    state.cart[index].quantite = fraction;
    renderCart();
  }
}

function removeFromCart(index) {
  state.cart.splice(index, 1);
  renderCart();
}

function clearCart() {
  state.cart = [];
  const discountInput = document.getElementById('cart-discount');
  if (discountInput) discountInput.value = 0;
  renderCart();
}

function renderCart() {
  const container = document.getElementById('cart-items-container');
  const countBadge = document.getElementById('cart-item-count');
  const btnCheckout = document.getElementById('btn-checkout');

  if (countBadge) countBadge.textContent = state.cart.length;
  
  const mobileBadge = document.getElementById('mobile-cart-badge');
  if (mobileBadge) mobileBadge.textContent = state.cart.length;

  const floatingBar = document.getElementById('mobile-floating-cart-bar');
  const floatingCount = document.getElementById('floating-cart-count');

  if (state.cart.length === 0) {
    if (floatingBar) floatingBar.classList.add('hidden');
    if (container) {
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-48 text-slate-400 text-xs">
          <span class="text-3xl mb-1">🛍️</span>
          <span>Le panier est vide</span>
          <span class="text-slate-400">Cliquez sur un sachet pour l'ajouter</span>
        </div>`;
    }
    if (btnCheckout) btnCheckout.disabled = true;
    updateCartTotals();
    return;
  }

  if (btnCheckout) btnCheckout.disabled = false;
  if (floatingBar && (!state.mobilePosTab || state.mobilePosTab === 'catalog')) {
    floatingBar.classList.remove('hidden');
  }
  if (floatingCount) floatingCount.textContent = state.cart.length;

  if (container) {
    container.innerHTML = state.cart.map((item, index) => {
      const isMontant = item.modeVente === 'DETAIL_MONTANT';
      const isDetail = item.modeVente === 'DETAIL';
      const totalLine = isMontant ? item.prix : (item.quantite * item.prix);
      const coutLine = (item.coutAchat || 0) * (isMontant ? 1 : item.quantite);
      const margeLine = totalLine - coutLine;

      let badgeMode = '';
      if (isMontant) {
        badgeMode = `<span class="ml-1 text-[9px] px-1.5 py-0.5 rounded font-black bg-emerald-100 text-emerald-800">💵 PAR MONTANT (${item.unitesVendues || 1} u)</span>`;
      } else if (isDetail) {
        badgeMode = `<span class="ml-1 text-[9px] px-1.5 py-0.5 rounded font-black bg-amber-100 text-amber-800">DÉTAIL (${item.unitesVendues || item.quantite} u)</span>`;
      } else {
        badgeMode = `<span class="ml-1 text-[9px] px-1.5 py-0.5 rounded font-black bg-sky-100 text-sky-800">GROS</span>`;
      }

      return `
        <div class="cart-item py-2 px-1 flex flex-col gap-1 border-b border-slate-100">
          <div class="flex justify-between items-start">
            <div class="font-bold text-slate-800 text-xs leading-tight">
              ${item.nom}
              ${badgeMode}
            </div>
            <button onclick="removeFromCart(${index})" class="text-slate-300 hover:text-rose-500 font-bold text-xs ml-2">✕</button>
          </div>

          <div class="flex items-center justify-between text-xs mt-1">
            <div class="flex items-center gap-1">
              ${!isMontant ? `
                <button onclick="setCartItemFraction(${index}, 0.25)" class="px-1 py-0.5 rounded text-[10px] ${item.quantite === 0.25 ? 'bg-sky-700 text-white font-bold' : 'bg-slate-100 text-slate-600'}">¼</button>
                <button onclick="setCartItemFraction(${index}, 0.5)" class="px-1 py-0.5 rounded text-[10px] ${item.quantite === 0.5 ? 'bg-sky-700 text-white font-bold' : 'bg-slate-100 text-slate-600'}">½</button>
                <button onclick="setCartItemFraction(${index}, 1)" class="px-1 py-0.5 rounded text-[10px] ${item.quantite === 1 ? 'bg-sky-700 text-white font-bold' : 'bg-slate-100 text-slate-600'}">1</button>
                <input type="number" step="${isDetail ? '1' : '0.25'}" min="0.01" value="${item.quantite}" onchange="updateCartItemQty(${index}, this.value)" class="w-14 text-center font-bold border border-slate-300 rounded p-0.5 text-xs">
                <span class="text-[10px] text-slate-400 font-medium">${item.lot || 'Adaka'}</span>
              ` : `
                <span class="text-xs font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  ${item.unitesVendues || 1} sachets (${item.fractionAdaka || 0} Adaka)
                </span>
              `}
            </div>

            <div class="text-right flex flex-col items-end gap-1">
              <div class="text-xs font-black text-slate-800">${formatMoney(totalLine)}</div>
              ${!isMontant ? `
                <div class="flex items-center gap-1">
                  <span class="text-[10px] text-slate-400 font-semibold">P.U :</span>
                  <input type="number" min="0" step="5" value="${item.prix}" onchange="updateCartItemPrice(${index}, this.value)" class="w-20 text-right font-black border border-slate-300 rounded px-1 py-0.5 text-xs text-sky-900 bg-sky-50 focus:bg-white focus:ring-1 focus:ring-sky-500" title="Prix modifiable">
                  <button onclick="saveCartPriceToCatalog(${index})" class="text-[10px] text-slate-500 hover:text-emerald-700 bg-slate-100 hover:bg-emerald-50 border border-slate-200 rounded px-1 py-0.5 font-bold transition" title="Enregistrer ce prix comme nouveau prix officiel">
                    💾
                  </button>
                </div>
              ` : `
                <span class="text-[10px] text-emerald-600 font-semibold">Marge : +${formatMoney(margeLine)}</span>
              `}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  updateCartTotals();
}

function updateCartItemPrice(index, newPrice) {
  const p = parseFloat(newPrice);
  if (!isNaN(p) && p >= 0) {
    state.cart[index].prix = p;
    renderCart();
  }
}

async function saveCartPriceToCatalog(index) {
  const item = state.cart[index];
  if (!item) return;
  const prod = state.products.find(p => p.id === item.productId);
  if (!prod) return;

  const mode = item.modeVente || 'GROS';
  const modeLabel = mode === 'GROS' ? 'prix de gros' : 'prix de détail';

  if (confirm(`Voulez-vous mettre à jour le ${modeLabel} officiel de "${prod.nom} ${prod.taille} (${prod.marque})" à ${formatMoney(item.prix)} dans le catalogue ?`)) {
    try {
      if (mode === 'GROS') {
        prod.prix_gros = item.prix;
        prod.prix = item.prix;
      } else {
        prod.prix_detail = item.prix;
      }

      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prod)
      });
      if (!res.ok) throw new Error("Erreur sauvegarde prix");
      playBeep('success');
      showToast('success', 'Catalogue mis à jour', `Le ${modeLabel} a été enregistré avec succès`);
      await loadData();
    } catch (err) {
      showToast('error', 'Erreur catalogue', "Impossible de mettre à jour le prix.");
    }
  }
}

function getCartSubtotal() {
  return state.cart.reduce((sum, item) => sum + (item.modeVente === 'DETAIL_MONTANT' ? item.prix : (item.quantite * item.prix)), 0);
}

function updateCartTotals() {
  const subtotal = getCartSubtotal();
  const discountInput = parseFloat(document.getElementById('cart-discount')?.value) || 0;
  const netTotal = Math.max(0, subtotal - discountInput);

  const cartSubtotalElem = document.getElementById('cart-subtotal');
  if (cartSubtotalElem) cartSubtotalElem.textContent = formatMoney(subtotal);

  const cartTotalElem = document.getElementById('cart-total');
  if (cartTotalElem) cartTotalElem.textContent = formatMoney(netTotal);

  // Estimation de la marge brute du panier
  const totalCost = state.cart.reduce((sum, item) => {
    if (item.modeVente === 'DETAIL_MONTANT') {
      return sum + (item.coutAchat || 0);
    }
    return sum + ((item.coutAchat || 0) * item.quantite);
  }, 0);
  const estMargin = Math.max(0, netTotal - totalCost);
  const marginBadge = document.getElementById('cart-marge-estimee');
  if (marginBadge) marginBadge.textContent = formatMoney(estMargin);

  const floatingTotal = document.getElementById('floating-cart-total');
  if (floatingTotal) floatingTotal.textContent = formatMoney(netTotal);
}

// BASCULE CATALOGUE / PANIER SUR SMARTPHONE
state.mobilePosTab = 'catalog';
function setMobilePosTab(tab) {
  state.mobilePosTab = tab;
  const catalogPanel = document.getElementById('pos-catalog-panel');
  const cartPanel = document.getElementById('pos-cart-panel');
  const btnCatalog = document.getElementById('mobile-pos-btn-catalog');
  const btnCart = document.getElementById('mobile-pos-btn-cart');
  const floatingBar = document.getElementById('mobile-floating-cart-bar');

  if (tab === 'catalog') {
    if (catalogPanel) catalogPanel.classList.remove('hidden');
    if (cartPanel) {
      cartPanel.classList.add('hidden');
      cartPanel.classList.remove('flex');
    }
    if (btnCatalog) {
      btnCatalog.classList.add('bg-white', 'text-sky-900', 'shadow');
      btnCatalog.classList.remove('text-slate-600');
    }
    if (btnCart) {
      btnCart.classList.remove('bg-white', 'text-sky-900', 'shadow');
      btnCart.classList.add('text-slate-600');
    }
    if (floatingBar && state.cart.length > 0) floatingBar.classList.remove('hidden');
  } else {
    if (catalogPanel) catalogPanel.classList.add('hidden');
    if (cartPanel) {
      cartPanel.classList.remove('hidden');
      cartPanel.classList.add('flex');
    }
    if (btnCart) {
      btnCart.classList.add('bg-white', 'text-sky-900', 'shadow');
      btnCart.classList.remove('text-slate-600');
    }
    if (btnCatalog) {
      btnCatalog.classList.remove('bg-white', 'text-sky-900', 'shadow');
      btnCatalog.classList.add('text-slate-600');
    }
    if (floatingBar) floatingBar.classList.add('hidden');
  }
}

// CLIENTS DROPDOWN
function populateCustomerDropdown() {
  const select = document.getElementById('cart-customer-select');
  if (!select) return;
  select.innerHTML = state.customers.map(c => {
    const detteText = (c.dette && c.dette > 0) ? ` (Dette: ${formatMoney(c.dette)})` : '';
    return `<option value="${c.id}">${c.nom}${detteText}</option>`;
  }).join('');
}

// ==========================================
// MODAL D'ENCAISSEMENT & CALCUL DE MONNAIE
// ==========================================

function openCheckoutModal() {
  if (state.cart.length === 0) return;
  const subtotal = getCartSubtotal();
  const discount = parseFloat(document.getElementById('cart-discount')?.value) || 0;
  const netTotal = Math.max(0, subtotal - discount);

  const checkoutTotalElem = document.getElementById('modal-checkout-total');
  if (checkoutTotalElem) checkoutTotalElem.textContent = formatMoney(netTotal);

  setPaymentMode('ESPECES');
  setExactAmount();

  const modal = document.getElementById('modal-checkout');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function closeModalCheckout() {
  const modal = document.getElementById('modal-checkout');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function setPaymentMode(mode) {
  state.paymentMode = mode;
  document.querySelectorAll('.paymode-btn').forEach(btn => {
    btn.classList.remove('border-2', 'border-emerald-500', 'bg-emerald-50', 'text-emerald-800');
    btn.classList.add('border', 'border-slate-300', 'text-slate-700');
  });

  const cashSection = document.getElementById('cash-calculator-section');
  if (mode === 'ESPECES') {
    document.getElementById('paymode-especes')?.classList.add('border-2', 'border-emerald-500', 'bg-emerald-50', 'text-emerald-800');
    if (cashSection) cashSection.classList.remove('hidden');
  } else if (mode === 'MOBILE_MONEY') {
    document.getElementById('paymode-momo')?.classList.add('border-2', 'border-emerald-500', 'bg-emerald-50', 'text-emerald-800');
    if (cashSection) cashSection.classList.add('hidden');
  } else if (mode === 'CREDIT') {
    document.getElementById('paymode-credit')?.classList.add('border-2', 'border-emerald-500', 'bg-emerald-50', 'text-emerald-800');
    if (cashSection) cashSection.classList.add('hidden');
  }
}

function setExactAmount() {
  const subtotal = getCartSubtotal();
  const discount = parseFloat(document.getElementById('cart-discount')?.value) || 0;
  const netTotal = Math.max(0, subtotal - discount);
  const inputRecu = document.getElementById('input-montant-recu');
  if (inputRecu) inputRecu.value = netTotal;
  calculateChange();
}

function addReceivedAmount(amount) {
  const inputRecu = document.getElementById('input-montant-recu');
  const current = parseFloat(inputRecu?.value) || 0;
  if (inputRecu) inputRecu.value = current + amount;
  calculateChange();
}

function calculateChange() {
  const subtotal = getCartSubtotal();
  const discount = parseFloat(document.getElementById('cart-discount')?.value) || 0;
  const netTotal = Math.max(0, subtotal - discount);

  const recu = parseFloat(document.getElementById('input-montant-recu')?.value) || 0;
  const change = Math.max(0, recu - netTotal);

  const displayMonnaie = document.getElementById('display-monnaie');
  if (displayMonnaie) displayMonnaie.textContent = formatMoney(change);
}

// VALIDATION DE LA VENTE (AVEC PROTECTION ANTI-DOUBLE CLIC)
let isConfirmingSale = false;

async function confirmSale(doPrint = true) {
  if (isConfirmingSale) return;
  if (state.cart.length === 0) return;

  const btnConfirm = document.getElementById('btn-confirm-sale');
  const originalText = btnConfirm ? btnConfirm.innerHTML : '';

  try {
    isConfirmingSale = true;
    if (btnConfirm) {
      btnConfirm.disabled = true;
      btnConfirm.innerHTML = `<span class="animate-spin inline-block mr-1">⏳</span> Enregistrement en cours...`;
    }

    const subtotal = getCartSubtotal();
    const discount = parseFloat(document.getElementById('cart-discount')?.value) || 0;
    const netTotal = Math.max(0, subtotal - discount);

    const customerId = parseInt(document.getElementById('cart-customer-select')?.value) || 1;
    const customer = state.customers.find(c => c.id === customerId);

    let montantRecu = netTotal;
    let monnaieRendue = 0;
    let montantPaye = netTotal;
    let montantRestant = 0;

    if (state.paymentMode === 'ESPECES') {
      montantRecu = parseFloat(document.getElementById('input-montant-recu')?.value) || netTotal;
      monnaieRendue = Math.max(0, montantRecu - netTotal);
      montantPaye = netTotal;
      montantRestant = 0;
    } else if (state.paymentMode === 'CREDIT') {
      montantRecu = 0;
      monnaieRendue = 0;
      montantPaye = 0;
      montantRestant = netTotal; // Dette totale
    }

    const payload = {
      customerId: customerId,
      clientNom: customer ? customer.nom : 'Client Comptoir',
      modeVente: state.posSaleMode || 'GROS',
      items: state.cart,
      totalNet: netTotal,
      remise: discount,
      modePaiement: state.paymentMode,
      montantRecu: montantRecu,
      monnaieRendue: monnaieRendue,
      montantPaye: montantPaye,
      montantRestant: montantRestant
    };

    const res = await fetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Problème d'enregistrement");
    }

    closeModalCheckout();
    playBeep('success');
    showToast('success', 'Vente validée !', `Ticket ${data.sale.ticketCode} enregistré avec succès.`);
    
    // Imprimer le ticket
    if (doPrint) {
      printThermalReceipt(data.sale);
    }

    clearCart();
    await loadData();
    // Proposer immédiatement le partage WhatsApp / SMS
    openShareSaleReceipt(data.sale);
  } catch (err) {
    console.error("Erreur vente:", err);
    showToast('error', 'Échec de la vente', err.message);
  } finally {
    isConfirmingSale = false;
    if (btnConfirm) {
      btnConfirm.disabled = false;
      btnConfirm.innerHTML = originalText;
    }
  }
}

// IMPRESSION TICKET DE CAISSE THERMIQUE (80mm)
function printThermalReceipt(sale) {
  const printArea = document.getElementById('receipt-print-area');
  const now = new Date(sale.date || Date.now());
  const dateFormatted = now.toLocaleDateString('fr-FR') + ' ' + now.toLocaleTimeString('fr-FR');

  const itemsHtml = (sale.items || []).map(item => `
    <tr>
      <td style="padding: 2px 0;">${item.nom}<br><small>${item.quantite} x ${formatMoney(item.prix)}</small></td>
      <td style="text-align: right; vertical-align: top; font-weight: bold;">${formatMoney(item.quantite * item.prix)}</td>
    </tr>
  `).join('');

  printArea.innerHTML = `
    <div style="text-align: center; margin-bottom: 8px;">
      <img src="logo.png" style="width: 48px; height: 48px; object-fit: contain; margin: 0 auto 4px auto; display: block; border-radius: 6px;">
      <h2 style="font-size: 14px; font-weight: bold; margin: 0;">${state.settings.shop_name}</h2>
      <p style="margin: 2px 0; font-size: 10px;">${state.settings.shop_address}</p>
      <p style="margin: 2px 0; font-size: 10px;">Tél: ${state.settings.shop_phone}</p>
      <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>
      <p style="margin: 2px 0; font-weight: bold;">TICKET : ${sale.ticketCode}</p>
      <p style="margin: 2px 0; font-size: 10px;">Date : ${dateFormatted}</p>
      <p style="margin: 2px 0; font-size: 10px;">Client : ${sale.clientNom}</p>
      <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>
    </div>

    <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
      <thead>
        <tr style="border-bottom: 1px solid #000;">
          <th style="text-align: left;">Article</th>
          <th style="text-align: right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>

    <div style="font-size: 12px; margin-top: 4px;">
      <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 13px;">
        <span>TOTAL NET :</span>
        <span>${formatMoney(sale.totalNet)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 10px; margin-top: 2px;">
        <span>Mode Paiement :</span>
        <span>${sale.modePaiement}</span>
      </div>
      ${sale.modePaiement === 'ESPECES' ? `
        <div style="display: flex; justify-content: space-between; font-size: 10px;">
          <span>Reçu :</span>
          <span>${formatMoney(sale.montantRecu)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 10px;">
          <span>Monnaie Rendue :</span>
          <span>${formatMoney(sale.monnaieRendue)}</span>
        </div>
      ` : ''}
      ${sale.montantRestant > 0 ? `
        <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: bold; color: red;">
          <span>RESTE À PAYER (CRÉDIT) :</span>
          <span>${formatMoney(sale.montantRestant)}</span>
        </div>
      ` : ''}
    </div>

    <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>
    <div style="text-align: center; font-size: 9px;">
      ${state.settings.receipt_footer}
    </div>
  `;

  window.print();
}

// ==========================================
// 2. MODULE GESTION DES STOCKS & MARGES
// ==========================================

function renderStockTable() {
  const tbody = document.getElementById('stock-table-body');
  if (!tbody) return;
  const search = (document.getElementById('stock-table-search')?.value || '').toLowerCase().trim();
  const catFilter = document.getElementById('stock-table-cat')?.value || '';
  const statusFilter = document.getElementById('stock-table-status')?.value || '';

  const filtered = state.products.filter(p => {
    const matchCat = !catFilter || p.categorie === catFilter;
    const fullText = `${p.nom} ${p.taille} ${p.couleur} ${p.marque} ${p.code}`.toLowerCase();
    const matchSearch = !search || fullText.includes(search);

    const s = parseFloat(p.stock) || 0;
    let matchStatus = true;
    if (statusFilter === 'EN_STOCK') matchStatus = s >= 1;
    else if (statusFilter === 'FAIBLE') matchStatus = s > 0 && s < 1;
    else if (statusFilter === 'RUPTURE') matchStatus = s <= 0;

    return matchCat && matchSearch && matchStatus;
  });

  // Statistiques globales de stock et marges
  const totalArticles = state.products.length;
  const statTotalElem = document.getElementById('stock-stat-total');
  if (statTotalElem) statTotalElem.textContent = totalArticles;

  // Valeur totale au coût d'achat réel (CMP)
  const totalValCoutAchat = state.products.reduce((acc, p) => {
    const cout = parseFloat(p.prix_achat) || 0;
    return acc + ((parseFloat(p.stock) || 0) * cout);
  }, 0);
  const statValCoutElem = document.getElementById('stock-stat-valeur-achat');
  if (statValCoutElem) statValCoutElem.textContent = formatMoney(totalValCoutAchat);

  // Valeur totale au prix de gros
  const totalValGros = state.products.reduce((acc, p) => {
    const px = parseFloat(p.prix_gros) || parseFloat(p.prix) || 0;
    return acc + ((parseFloat(p.stock) || 0) * px);
  }, 0);
  const statValGrosElem = document.getElementById('stock-stat-valeur');
  if (statValGrosElem) statValGrosElem.textContent = formatMoney(totalValGros);

  // Marge potentielle totale en stock
  const margePotentielle = Math.max(0, totalValGros - totalValCoutAchat);
  const statMargePotElem = document.getElementById('stock-stat-marge-potentielle');
  if (statMargePotElem) statMargePotElem.textContent = formatMoney(margePotentielle);

  const faiblest = state.products.filter(p => (parseFloat(p.stock) || 0) > 0 && (parseFloat(p.stock) || 0) < 1).length;
  const statFaibleElem = document.getElementById('stock-stat-faible');
  if (statFaibleElem) statFaibleElem.textContent = faiblest;

  const ruptures = state.products.filter(p => (parseFloat(p.stock) || 0) <= 0).length;
  const statRuptureElem = document.getElementById('stock-stat-rupture');
  if (statRuptureElem) statRuptureElem.textContent = ruptures;

  tbody.innerHTML = filtered.map(p => {
    const unitesParAdaka = p.unites_par_adaka || 20;
    const stockNum = parseFloat(p.stock) || 0;
    const stockUnits = p.stock_unites !== undefined ? p.stock_unites : Math.round(stockNum * unitesParAdaka);
    const coutAchat = parseFloat(p.prix_achat) || 0;
    const coutUnite = unitesParAdaka > 0 ? (coutAchat / unitesParAdaka) : 0;
    const prixGros = parseFloat(p.prix_gros) || parseFloat(p.prix) || 0;
    const prixDetail = parseFloat(p.prix_detail) || parseFloat(p.prix) || 0;
    const prixDetailUnite = parseFloat(p.prix_detail_unite) || (unitesParAdaka > 0 ? Math.round(prixDetail / unitesParAdaka) : 100);
    const margeGros = prixGros - coutAchat;
    const tauxMargeGros = coutAchat > 0 ? ((margeGros / coutAchat) * 100) : 0;

    let stockBadgeClass = "bg-emerald-100 text-emerald-800 font-bold";
    if (stockUnits <= 0) stockBadgeClass = "bg-rose-100 text-rose-800 font-bold";
    else if (stockNum < 1) stockBadgeClass = "bg-amber-100 text-amber-800 font-bold";

    return `
      <tr class="hover:bg-slate-50 transition border-b border-slate-100">
        <td class="p-2.5 font-bold text-slate-500 text-xs font-mono">${p.code || 'SCH'}</td>
        <td class="p-2.5 font-bold text-slate-800 text-xs">${p.nom}</td>
        <td class="p-2.5 text-slate-600 text-xs">${p.taille || ''} / ${p.couleur || ''}</td>
        <td class="p-2.5 font-semibold text-sky-800 text-xs">${p.marque || ''}</td>
        <td class="p-2.5 text-slate-600 text-xs">
          <span class="font-bold text-slate-700">${p.lot || 'Adaka'}</span>
          <span class="text-[10px] text-slate-400 block font-normal">(${unitesParAdaka} sachets)</span>
        </td>
        <td class="p-2.5 text-center">
          <div class="px-2 py-0.5 rounded text-xs ${stockBadgeClass} inline-block">
            <span class="font-black">${stockUnits} u</span>
            <span class="text-[10px] opacity-80 block">(${stockNum} Adaka)</span>
          </div>
        </td>
        <td class="p-2.5 text-right font-medium text-slate-700 text-xs">
          <div>${formatMoney(coutAchat)}</div>
          <span class="text-[10px] text-slate-400 font-semibold block">(${formatMoney(Math.round(coutUnite))} / u)</span>
        </td>
        <td class="p-2.5 text-right font-bold text-sky-900 text-xs">
          <div class="flex items-center justify-end gap-1">
            <input type="number" step="100" min="0" value="${prixGros}" onchange="inlineUpdateProductPrice(${p.id}, 'prix_gros', this.value)" class="w-20 text-right font-black border border-slate-200 hover:border-sky-500 rounded px-1 py-0.5 text-xs text-sky-900 bg-sky-50/40" title="Prix de gros par Adaka modifiable">
          </div>
        </td>
        <td class="p-2.5 text-right font-bold text-amber-800 text-xs">
          <div class="flex items-center justify-end gap-1">
            <input type="number" step="5" min="0" value="${prixDetailUnite}" onchange="inlineUpdateProductPrice(${p.id}, 'prix_detail_unite', this.value)" class="w-20 text-right font-black border border-slate-200 hover:border-amber-500 rounded px-1 py-0.5 text-xs text-amber-900 bg-amber-50/40" title="Prix de détail par sachet modifiable">
          </div>
        </td>
        <td class="p-2.5 text-right font-black text-xs ${margeGros >= 0 ? 'text-emerald-700' : 'text-rose-700'}">
          ${formatMoney(margeGros)}
        </td>
        <td class="p-2.5 text-center text-xs">
          <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${tauxMargeGros >= 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}">
            ${tauxMargeGros.toFixed(1)} %
          </span>
        </td>
        <td class="p-2.5 text-center space-x-1 whitespace-nowrap">
          <button onclick="openModalStockMovement(${p.id}, 'REAPPRO')" class="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded text-xs font-bold transition active:scale-95" title="Réapprovisionner (Entrée de stock)">📥</button>
          <button onclick="openModalStockMovement(${p.id}, 'AJUSTEMENT')" class="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded text-xs font-bold transition active:scale-95" title="Ajuster le stock (Inventaire / Perte)">⚖️</button>
          <button onclick="openModalEditProduct(${p.id})" class="px-2 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded text-xs font-bold" title="Modifier fiche complète et tarifs">✏️</button>
          <button onclick="deleteProduct(${p.id})" class="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded text-xs font-bold" title="Supprimer">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
}

// MODIFICATION DU PRIX EN DIRECT DEPUIS LE TABLEAU DE STOCK
async function inlineUpdateProductPrice(productId, field, newValue) {
  const p = state.products.find(item => item.id === productId);
  if (!p) return;

  const val = parseFloat(newValue);
  if (isNaN(val) || val < 0) {
    showToast('error', 'Prix invalide', 'Veuillez saisir un montant positif.');
    renderStockTable();
    return;
  }

  const ancienPrix = p[field];
  p[field] = val;
  if (field === 'prix_gros') p.prix = val;
  if (field === 'prix_detail_unite') {
    const unites = p.unites_par_adaka || 20;
    p.prix_detail = Math.round(val * unites);
  }

  try {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p)
    });
    if (!res.ok) throw new Error("Erreur de sauvegarde");
    
    playBeep('beep');
    showToast('success', 'Prix mis à jour', `Nouveau tarif enregistré : ${formatMoney(val)}`);
    updateHeaderInfo();
    renderStockTable();
    renderPosCatalog();
  } catch (err) {
    p[field] = ancienPrix;
    renderStockTable();
    showToast('error', 'Erreur serveur', "Impossible d'enregistrer le nouveau tarif.");
  }
}

// CALCUL DES MARGES EN DIRECT DANS LA FICHE PRODUIT
function calculerMargesFicheProduit() {
  const cout = parseFloat(document.getElementById('prod-prix-achat')?.value) || 0;
  const gros = parseFloat(document.getElementById('prod-prix-gros')?.value) || 0;
  const unitesParAdaka = parseInt(document.getElementById('prod-unites-par-adaka')?.value) || 20;
  const prixDetailUnite = parseFloat(document.getElementById('prod-prix-detail-unite')?.value) || 0;
  const stockAdaka = parseFloat(document.getElementById('prod-stock')?.value) || 0;

  // Calculs Gros
  const margeGros = gros - cout;
  const tauxMargeGros = cout > 0 ? ((margeGros / cout) * 100) : 0;
  const tauxMarqueGros = gros > 0 ? ((margeGros / gros) * 100) : 0;

  // Calculs Détail Sachet
  const coutSachet = unitesParAdaka > 0 ? (cout / unitesParAdaka) : 0;
  const margeSachet = prixDetailUnite - coutSachet;
  const stockUnites = Math.round(stockAdaka * unitesParAdaka);

  const prevCoutSachet = document.getElementById('prod-preview-cout-sachet');
  if (prevCoutSachet) prevCoutSachet.textContent = formatMoney(Math.round(coutSachet));

  const prevMargeSachet = document.getElementById('prod-preview-marge-sachet');
  if (prevMargeSachet) prevMargeSachet.textContent = (margeSachet >= 0 ? '+' : '') + formatMoney(Math.round(margeSachet));

  const prevStockUnites = document.getElementById('prod-preview-stock-unites');
  if (prevStockUnites) prevStockUnites.textContent = `${stockUnites} sachets`;

  const prevMarge = document.getElementById('prod-preview-marge');
  if (prevMarge) prevMarge.textContent = formatMoney(margeGros);

  const prevTauxMarge = document.getElementById('prod-preview-taux-marge');
  if (prevTauxMarge) prevTauxMarge.textContent = tauxMargeGros.toFixed(1) + '%';

  const prevTauxMarque = document.getElementById('prod-preview-taux-marque');
  if (prevTauxMarque) prevTauxMarque.textContent = tauxMarqueGros.toFixed(1) + '%';
}

// AJOUT / MODIFICATION D'UN ARTICLE
function openModalAddProduct() {
  document.getElementById('modal-product-title').textContent = "Ajouter un Sachet / Sac (MIAKIARA)";
  document.getElementById('form-product').reset();
  document.getElementById('prod-id').value = '';
  document.getElementById('prod-stock').value = 1;
  document.getElementById('prod-lot').value = 'Adaka';
  document.getElementById('prod-unite-achat').value = 'Paquet';
  document.getElementById('prod-unite-vente').value = 'Adaka';
  document.getElementById('prod-unites-par-adaka').value = 20;
  document.getElementById('prod-prix-achat').value = 0;
  document.getElementById('prod-prix-gros').value = 0;
  document.getElementById('prod-prix-detail').value = 0;
  document.getElementById('prod-prix-detail-unite').value = 100;

  // Remplir le dropdown des fournisseurs
  const selectFournisseur = document.getElementById('prod-fournisseur-select') || document.getElementById('prod-fournisseur');
  if (selectFournisseur) {
    selectFournisseur.innerHTML = `
      <option value="">-- Sélectionner un fournisseur (Optionnel) --</option>
      ${state.suppliers.map(s => `<option value="${s.id}">${s.nom} (${s.ville || 'Togo'})</option>`).join('')}
    `;
  }

  calculerMargesFicheProduit();

  const modal = document.getElementById('modal-product');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function openModalEditProduct(id) {
  const p = state.products.find(item => item.id === id);
  if (!p) return;

  document.getElementById('modal-product-title').textContent = "Modifier la Fiche Article #" + p.id;
  document.getElementById('prod-id').value = p.id;
  document.getElementById('prod-nom').value = p.nom;
  document.getElementById('prod-categorie').value = p.categorie || 'Autres Sachets';
  document.getElementById('prod-taille').value = p.taille || '';
  document.getElementById('prod-couleur').value = p.couleur || '';
  document.getElementById('prod-marque').value = p.marque || '';
  document.getElementById('prod-lot').value = p.lot || 'Adaka';
  document.getElementById('prod-unite-achat').value = p.unite_achat || 'Paquet';
  document.getElementById('prod-unite-vente').value = p.unite_vente || 'Adaka';
  document.getElementById('prod-stock').value = p.stock || 0;
  document.getElementById('prod-unites-par-adaka').value = p.unites_par_adaka || 20;
  
  document.getElementById('prod-prix-achat').value = p.prix_achat || 0;
  document.getElementById('prod-prix-gros').value = p.prix_gros || p.prix || 0;
  document.getElementById('prod-prix-detail').value = p.prix_detail || p.prix || 0;
  document.getElementById('prod-prix-detail-unite').value = p.prix_detail_unite || 0;

  const selectFournisseur = document.getElementById('prod-fournisseur-select') || document.getElementById('prod-fournisseur');
  if (selectFournisseur) {
    selectFournisseur.innerHTML = `
      <option value="">-- Sélectionner un fournisseur (Optionnel) --</option>
      ${state.suppliers.map(s => `<option value="${s.id}" ${p.fournisseurId === s.id ? 'selected' : ''}>${s.nom} (${s.ville || 'Togo'})</option>`).join('')}
    `;
  }

  calculerMargesFicheProduit();

  const modal = document.getElementById('modal-product');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function closeModalProduct() {
  const modal = document.getElementById('modal-product');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

// ENREGISTREMENT SÉCURISÉ DU PRODUIT AVEC TOUS LES PRIX ET MARGES (ANTI-DOUBLE CLIC)
let isSavingProduct = false;

async function saveProduct(e) {
  e.preventDefault();
  if (isSavingProduct) return;

  const btnSubmit = document.getElementById('btn-save-prod') || document.getElementById('btn-submit-product');
  const originalText = btnSubmit ? btnSubmit.innerHTML : '';

  try {
    isSavingProduct = true;
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.innerHTML = `<span class="animate-spin inline-block mr-1">⏳</span> Sauvegarde en cours...`;
    }

    const id = document.getElementById('prod-id').value;
    const prixAchat = parseFloat(document.getElementById('prod-prix-achat').value) || 0;
    const prixGros = parseFloat(document.getElementById('prod-prix-gros').value) || 0;
    const unitesParAdaka = parseInt(document.getElementById('prod-unites-par-adaka')?.value) || 20;
    const prixDetailUnite = parseFloat(document.getElementById('prod-prix-detail-unite')?.value) || 0;
    const prixDetail = prixDetailUnite > 0 ? (prixDetailUnite * unitesParAdaka) : (parseFloat(document.getElementById('prod-prix-detail')?.value) || prixGros);
    const fournisseurVal = document.getElementById('prod-fournisseur-select')?.value || document.getElementById('prod-fournisseur')?.value;
    const stockVal = parseFloat(document.getElementById('prod-stock').value) || 0;

    const productData = {
      id: id ? parseInt(id) : undefined,
      nom: document.getElementById('prod-nom').value.trim(),
      categorie: document.getElementById('prod-categorie').value,
      taille: document.getElementById('prod-taille').value.trim(),
      couleur: document.getElementById('prod-couleur').value.trim(),
      marque: document.getElementById('prod-marque').value.trim(),
      lot: document.getElementById('prod-lot').value.trim() || 'Adaka',
      unites_par_adaka: unitesParAdaka,
      unite_achat: document.getElementById('prod-unite-achat')?.value.trim() || 'Paquet',
      unite_vente: document.getElementById('prod-unite-vente')?.value.trim() || 'Adaka',
      stock: stockVal,
      stock_unites: Math.round(stockVal * unitesParAdaka),
      prix_achat: prixAchat,
      cout_unitaire_achat: unitesParAdaka > 0 ? Math.round((prixAchat / unitesParAdaka) * 100) / 100 : prixAchat,
      prix_gros: prixGros,
      prix_detail: prixDetail,
      prix_detail_unite: prixDetailUnite,
      prix: prixGros,
      fournisseurId: fournisseurVal ? parseInt(fournisseurVal) : null
    };

    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(productData)
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Échec d'enregistrement");

    playBeep('success');
    closeModalProduct();
    showToast('success', 'Enregistrement réussi !', `L'article "${productData.nom}" a été sauvegardé dans la base.`);
    await loadData();
  } catch (err) {
    showToast('error', 'Erreur sauvegarde', err.message);
  } finally {
    isSavingProduct = false;
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = originalText;
    }
  }
}

async function deleteProduct(id) {
  const p = state.products.find(item => item.id === id);
  const nom = p ? p.nom : 'cet article';
  if (!confirm(`⚠️ Attention : Voulez-vous vraiment supprimer "${nom}" ? Cette action mettra à jour la base de données.`)) return;

  try {
    const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Échec suppression");

    showToast('success', 'Suppression réussie', `L'article a été retiré de la base.`);
    await loadData();
  } catch (err) {
    showToast('error', 'Erreur suppression', err.message);
  }
}

// BASCULE RAPIDE VERS L'APPROVISIONNEMENT DEPUIS UN ARTICLE DU STOCK
function ouvrirApproRapidePourProduit(productId) {
  switchTab('appro');
  const selProd = document.getElementById('appro-product-select');
  if (selProd) {
    selProd.value = productId;
    onApproProductChange();
  }
}

// =========================================================================
// SECTION 10 : MODULE DE RÉAPPROVISIONNEMENT & AJUSTEMENT DE STOCK MOBILE
// =========================================================================

const reapproState = {
  mode: 'REAPPRO', // 'REAPPRO' | 'AJUSTEMENT'
  unit: 'adaka',    // 'adaka' | 'unites'
  selectedProductId: null
};

// OUVERTURE DU MODAL (AVEC SÉLECTION PRODUIT & MODE PAR DÉFAUT)
function openModalStockMovement(productId = null, defaultMode = 'REAPPRO') {
  reapproState.mode = defaultMode || 'REAPPRO';
  reapproState.unit = 'adaka';

  // Peupler les fournisseurs
  const suppSelect = document.getElementById('reappro-supplier-select');
  if (suppSelect) {
    suppSelect.innerHTML = `
      <option value="">-- Aucun fournisseur spécifié --</option>
      ${(state.suppliers || []).map(s => `<option value="${s.id}">${s.nom} (${s.ville || 'Togo'})</option>`).join('')}
    `;
  }

  // Peupler la liste déroulante des produits
  const select = document.getElementById('reappro-product-select');
  if (select) {
    select.innerHTML = state.products.map(p => {
      const uParAdaka = p.unites_par_adaka || 20;
      const sUnits = p.stock_unites !== undefined ? p.stock_unites : Math.round((parseFloat(p.stock) || 0) * uParAdaka);
      return `
        <option value="${p.id}" ${productId && p.id === parseInt(productId) ? 'selected' : ''}>
          [${p.code || 'SCH'}] ${formatProductFullName(p)} (${p.stock} Adaka / ${sUnits} u)
        </option>
      `;
    }).join('');
  }

  // Définir la date du jour par défaut
  const dateInput = document.getElementById('reappro-date-operation');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
  }

  // Réinitialiser les champs de saisie
  const qteInput = document.getElementById('reappro-quantite');
  if (qteInput) qteInput.value = '1';
  const fraisInput = document.getElementById('reappro-frais-annexes');
  if (fraisInput) fraisInput.value = '0';
  const obsInput = document.getElementById('reappro-observation');
  if (obsInput) obsInput.value = '';
  const searchInput = document.getElementById('reappro-search-input');
  if (searchInput) searchInput.value = '';
  const searchClear = document.getElementById('reappro-search-clear');
  if (searchClear) searchClear.classList.add('hidden');
  const searchResults = document.getElementById('reappro-search-results');
  if (searchResults) {
    searchResults.innerHTML = '';
    searchResults.classList.add('hidden');
  }

  // Sélectionner le produit cible
  let targetId = productId;
  if (!targetId && state.products.length > 0) {
    targetId = state.products[0].id;
  }
  if (targetId) {
    if (select) select.value = targetId;
    onReapproProductSelect(targetId);
  }

  // Activer le mode demandé (REAPPRO ou AJUSTEMENT)
  setReapproMode(reapproState.mode);

  // Afficher le modal
  const modal = document.getElementById('modal-reappro');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

// FERMETURE DU MODAL
function closeModalReappro() {
  const modal = document.getElementById('modal-reappro');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
  const searchResults = document.getElementById('reappro-search-results');
  if (searchResults) searchResults.classList.add('hidden');
}

// BASCULE DE MODE (RÉAPPROVISIONNER VS AJUSTER LE STOCK)
function setReapproMode(mode) {
  reapproState.mode = mode;
  const tabReappro = document.getElementById('tab-btn-reappro');
  const tabAjust = document.getElementById('tab-btn-ajustement');
  const secReappro = document.getElementById('section-reappro-fields');
  const secAjust = document.getElementById('section-ajustement-fields');
  const headerIcon = document.getElementById('reappro-header-icon');
  const headerText = document.getElementById('reappro-header-text');
  const submitBtn = document.getElementById('btn-submit-stock-operation');
  const submitLabel = document.getElementById('btn-submit-stock-label');
  const submitIcon = document.getElementById('btn-submit-stock-icon');
  const summaryModeBadge = document.getElementById('reappro-summary-mode-badge');
  const summaryCoutRow = document.getElementById('summary-cout-row');

  if (mode === 'REAPPRO') {
    // Onglet Réappro actif
    if (tabReappro) {
      tabReappro.className = "py-2 px-2 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 shadow bg-emerald-600 text-white";
    }
    if (tabAjust) {
      tabAjust.className = "py-2 px-2 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 text-slate-600 hover:text-slate-900";
    }
    if (secReappro) secReappro.classList.remove('hidden');
    if (secAjust) secAjust.classList.add('hidden');
    if (headerIcon) headerIcon.textContent = '📥';
    if (headerText) headerText.textContent = 'Réapprovisionner (Ajouter du stock)';
    if (submitBtn) {
      submitBtn.className = "flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs shadow-lg flex items-center justify-center gap-1.5 transition active:scale-95";
    }
    if (submitLabel) submitLabel.textContent = "Enregistrer le réapprovisionnement";
    if (submitIcon) submitIcon.textContent = "💾";
    if (summaryModeBadge) {
      summaryModeBadge.className = "px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold";
      summaryModeBadge.textContent = "RÉAPPROVISIONNEMENT";
    }
    if (summaryCoutRow) summaryCoutRow.classList.remove('hidden');
  } else {
    // Onglet Ajustement actif
    if (tabAjust) {
      tabAjust.className = "py-2 px-2 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 shadow bg-amber-600 text-white";
    }
    if (tabReappro) {
      tabReappro.className = "py-2 px-2 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 text-slate-600 hover:text-slate-900";
    }
    if (secReappro) secReappro.classList.add('hidden');
    if (secAjust) secAjust.classList.remove('hidden');
    if (headerIcon) headerIcon.textContent = '⚖️';
    if (headerText) headerText.textContent = 'Ajuster le Stock (Inventaire / Perte)';
    if (submitBtn) {
      submitBtn.className = "flex-1 py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-black text-xs shadow-lg flex items-center justify-center gap-1.5 transition active:scale-95";
    }
    if (submitLabel) submitLabel.textContent = "Enregistrer l'ajustement";
    if (submitIcon) submitIcon.textContent = "⚖️";
    if (summaryModeBadge) {
      summaryModeBadge.className = "px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold";
      summaryModeBadge.textContent = "AJUSTEMENT D'INVENTAIRE";
    }
    if (summaryCoutRow) summaryCoutRow.classList.add('hidden'); // Pas de faux frais

    // Synchroniser la valeur de stock réel avec le stock actuel par défaut
    resetAjustToCurrentStock();
  }

  updateReapproCalculation();
}

// BASCULE DE L'UNITÉ DE SAISIE (ADAKA VS UNITÉS / SACHETS)
function setReapproUnit(unit) {
  reapproState.unit = unit;
  const btnAdaka = document.getElementById('reappro-unit-adaka');
  const btnUnites = document.getElementById('reappro-unit-unites');
  const qteUnitName = document.getElementById('reappro-qte-unit-name');
  const ajustUnitName = document.getElementById('ajust-unit-name');
  const quickChipsContainer = document.getElementById('reappro-quick-chips');

  if (unit === 'adaka') {
    if (btnAdaka) {
      btnAdaka.className = "py-2 px-2 rounded-xl text-xs font-bold border-2 border-emerald-600 bg-emerald-50 text-emerald-900 flex items-center justify-center gap-1.5 shadow-xs transition active:scale-95";
    }
    if (btnUnites) {
      btnUnites.className = "py-2 px-2 rounded-xl text-xs font-bold border-2 border-slate-200 bg-slate-50 text-slate-600 hover:bg-white flex items-center justify-center gap-1.5 shadow-xs transition active:scale-95";
    }
    if (qteUnitName) qteUnitName.textContent = "En Adaka / Carton";
    if (ajustUnitName) ajustUnitName.textContent = "En Adaka / Carton";
    if (quickChipsContainer) {
      quickChipsContainer.innerHTML = `
        <button type="button" onclick="quickAddReapproQuantity(0.5)" class="px-2.5 py-1 bg-white hover:bg-emerald-100 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-900 shadow-xs active:scale-95">+0.5</button>
        <button type="button" onclick="quickAddReapproQuantity(1)" class="px-2.5 py-1 bg-white hover:bg-emerald-100 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-900 shadow-xs active:scale-95">+1</button>
        <button type="button" onclick="quickAddReapproQuantity(2)" class="px-2.5 py-1 bg-white hover:bg-emerald-100 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-900 shadow-xs active:scale-95">+2</button>
        <button type="button" onclick="quickAddReapproQuantity(5)" class="px-2.5 py-1 bg-white hover:bg-emerald-100 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-900 shadow-xs active:scale-95">+5</button>
        <button type="button" onclick="quickAddReapproQuantity(10)" class="px-2.5 py-1 bg-white hover:bg-emerald-100 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-900 shadow-xs active:scale-95">+10</button>
      `;
    }
  } else {
    if (btnUnites) {
      btnUnites.className = "py-2 px-2 rounded-xl text-xs font-bold border-2 border-emerald-600 bg-emerald-50 text-emerald-900 flex items-center justify-center gap-1.5 shadow-xs transition active:scale-95";
    }
    if (btnAdaka) {
      btnAdaka.className = "py-2 px-2 rounded-xl text-xs font-bold border-2 border-slate-200 bg-slate-50 text-slate-600 hover:bg-white flex items-center justify-center gap-1.5 shadow-xs transition active:scale-95";
    }
    if (qteUnitName) qteUnitName.textContent = "En Sachets individuels";
    if (ajustUnitName) ajustUnitName.textContent = "En Sachets individuels";
    if (quickChipsContainer) {
      quickChipsContainer.innerHTML = `
        <button type="button" onclick="quickAddReapproQuantity(5)" class="px-2.5 py-1 bg-white hover:bg-emerald-100 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-900 shadow-xs active:scale-95">+5</button>
        <button type="button" onclick="quickAddReapproQuantity(10)" class="px-2.5 py-1 bg-white hover:bg-emerald-100 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-900 shadow-xs active:scale-95">+10</button>
        <button type="button" onclick="quickAddReapproQuantity(20)" class="px-2.5 py-1 bg-white hover:bg-emerald-100 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-900 shadow-xs active:scale-95">+20</button>
        <button type="button" onclick="quickAddReapproQuantity(50)" class="px-2.5 py-1 bg-white hover:bg-emerald-100 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-900 shadow-xs active:scale-95">+50</button>
        <button type="button" onclick="quickAddReapproQuantity(100)" class="px-2.5 py-1 bg-white hover:bg-emerald-100 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-900 shadow-xs active:scale-95">+100</button>
      `;
    }
  }

  // Adapter le prix unitaire indicatif selon l'unité sélectionnée
  const product = state.products.find(p => p.id === reapproState.selectedProductId);
  if (product) {
    const pxInput = document.getElementById('reappro-prix-achat');
    if (pxInput) {
      const uParAdaka = Math.max(1, parseInt(product.unites_par_adaka) || 20);
      if (unit === 'adaka') {
        pxInput.value = product.prix_achat || '';
      } else {
        const coutU = Math.round((parseFloat(product.prix_achat) || 0) / uParAdaka);
        pxInput.value = coutU || '';
      }
    }
  }

  // Réinitialiser la valeur du stock réel constaté dans l'unité choisie
  resetAjustToCurrentStock();
  updateReapproCalculation();
}

// RECHERCHE INSTANTANÉE DE PRODUIT
function filterReapproProducts(query) {
  const clearBtn = document.getElementById('reappro-search-clear');
  const resultsDiv = document.getElementById('reappro-search-results');
  const q = (query || '').toLowerCase().trim();

  if (!q) {
    if (clearBtn) clearBtn.classList.add('hidden');
    if (resultsDiv) {
      resultsDiv.innerHTML = '';
      resultsDiv.classList.add('hidden');
    }
    return;
  }

  if (clearBtn) clearBtn.classList.remove('hidden');

  const matches = state.products.filter(p => {
    const str = `${p.nom} ${p.taille || ''} ${p.couleur || ''} ${p.marque || ''} ${p.code || ''}`.toLowerCase();
    return str.includes(q);
  }).slice(0, 8);

  if (resultsDiv) {
    if (matches.length === 0) {
      resultsDiv.innerHTML = `<div class="p-3 text-slate-500 text-center font-medium">Aucun article trouvé pour "${query}"</div>`;
    } else {
      resultsDiv.innerHTML = matches.map(p => {
        const uParAdaka = p.unites_par_adaka || 20;
        const sUnits = p.stock_unites !== undefined ? p.stock_unites : Math.round((parseFloat(p.stock) || 0) * uParAdaka);
        return `
          <div onclick="selectReapproProductFromSearch(${p.id})" class="p-2.5 hover:bg-sky-50 cursor-pointer flex items-center justify-between transition active:bg-sky-100">
            <div>
              <span class="font-bold text-slate-800">${formatProductFullName(p)}</span>
              <span class="text-[11px] text-slate-500 block font-mono font-semibold">${p.code || 'SCH'} • Marque : ${p.marque || 'Standard'}</span>
            </div>
            <div class="text-right">
              <span class="text-[11px] font-black text-sky-900 bg-sky-100 px-2 py-0.5 rounded-lg">${p.stock} Adaka</span>
              <span class="text-[10px] text-slate-400 block">${sUnits} u</span>
            </div>
          </div>
        `;
      }).join('');
    }
    resultsDiv.classList.remove('hidden');
  }
}

function clearReapproSearch() {
  const searchInput = document.getElementById('reappro-search-input');
  if (searchInput) searchInput.value = '';
  filterReapproProducts('');
}

function selectReapproProductFromSearch(productId) {
  const select = document.getElementById('reappro-product-select');
  if (select) select.value = productId;
  clearReapproSearch();
  onReapproProductSelect(productId);
}

// SÉLECTION D'UN PRODUIT DANS LA FICHE
function onReapproProductSelect(productId) {
  const idNum = parseInt(productId);
  const product = state.products.find(p => p.id === idNum);
  if (!product) return;

  reapproState.selectedProductId = idNum;

  const uParAdaka = Math.max(1, parseInt(product.unites_par_adaka) || 20);
  const stockAdaka = parseFloat(product.stock) || 0;
  const stockUnits = product.stock_unites !== undefined ? parseInt(product.stock_unites) : Math.round(stockAdaka * uParAdaka);

  // Mettre à jour la carte produit
  const badgeElem = document.getElementById('reappro-prod-badge');
  if (badgeElem) badgeElem.textContent = product.code || `SCH-${product.id}`;
  const nomElem = document.getElementById('reappro-prod-nom');
  if (nomElem) nomElem.textContent = formatProductFullName(product);
  const specsElem = document.getElementById('reappro-prod-specs');
  if (specsElem) specsElem.textContent = `${product.marque ? 'Marque : ' + product.marque : 'Sachet'} • Catégorie : ${product.categorie || 'Sachets'}`;
  const packElem = document.getElementById('reappro-prod-packaging');
  if (packElem) packElem.textContent = `1 Adaka = ${uParAdaka} sachets`;

  // Mettre à jour le stock actuel (Lecture seule)
  const stockBadge = document.getElementById('reappro-prod-stock-badge');
  if (stockBadge) {
    stockBadge.textContent = `${stockAdaka} Adaka (${stockUnits} unités)`;
  }

  // Conditionnement (Unités par Adaka) prérempli (Champ 6)
  const uInput = document.getElementById('reappro-unites-par-adaka');
  if (uInput) uInput.value = uParAdaka;

  // Prix d'achat prérempli (Champ 7)
  const pxInput = document.getElementById('reappro-prix-achat');
  if (pxInput) {
    if (reapproState.unit === 'adaka') {
      pxInput.value = product.prix_achat || '';
    } else {
      pxInput.value = Math.round((parseFloat(product.prix_achat) || 0) / uParAdaka) || '';
    }
  }

  // Prix de vente en gros prérempli (Champ 9)
  const pxGrosInput = document.getElementById('reappro-prix-gros');
  if (pxGrosInput) {
    pxGrosInput.value = product.prix_gros || product.prix || '';
  }

  // Prix de vente au détail (par sachet) prérempli (Champ 10)
  const pxDetailInput = document.getElementById('reappro-prix-detail');
  if (pxDetailInput) {
    pxDetailInput.value = product.prix_detail_unite || (uParAdaka > 0 ? Math.round((product.prix_detail || product.prix || 0) / uParAdaka) : 100) || '';
  }

  // Fournisseur prérempli (Champ 11)
  const suppSelect = document.getElementById('reappro-supplier-select');
  if (suppSelect && product.fournisseurId) {
    suppSelect.value = product.fournisseurId;
  }

  // Mettre à jour le récapitulatif
  resetAjustToCurrentStock();
  updateReapproCalculation();
}

// STEPPER & RACCOURCIS QUANTITÉ RÉAPPRO
function stepReapproQuantity(delta) {
  const input = document.getElementById('reappro-quantite');
  if (!input) return;
  let val = parseFloat(input.value) || 0;
  val = Math.max(0.1, val + delta);
  input.value = Math.round(val * 100) / 100;
  updateReapproCalculation();
}

function quickAddReapproQuantity(amount) {
  const input = document.getElementById('reappro-quantite');
  if (!input) return;
  let val = parseFloat(input.value) || 0;
  val = Math.max(0.1, val + amount);
  input.value = Math.round(val * 100) / 100;
  updateReapproCalculation();
}

// STEPPER & RACCOURCIS STOCK RÉEL AJUSTEMENT
function stepAjustStockReel(delta) {
  const input = document.getElementById('ajust-stock-reel');
  if (!input) return;
  let val = parseFloat(input.value) || 0;
  val = Math.max(0, val + delta);
  input.value = reapproState.unit === 'unites' ? Math.round(val) : Math.round(val * 1000) / 1000;
  updateReapproCalculation();
}

function setAjustStockReel(val) {
  const input = document.getElementById('ajust-stock-reel');
  if (!input) return;
  input.value = val;
  updateReapproCalculation();
}

function resetAjustToCurrentStock() {
  const product = state.products.find(p => p.id === reapproState.selectedProductId);
  const input = document.getElementById('ajust-stock-reel');
  if (!product || !input) return;
  const uParAdaka = Math.max(1, parseInt(product.unites_par_adaka) || 20);
  const sAdaka = parseFloat(product.stock) || 0;
  const sUnits = product.stock_unites !== undefined ? parseInt(product.stock_unites) : Math.round(sAdaka * uParAdaka);

  if (reapproState.unit === 'unites') {
    input.value = sUnits;
  } else {
    input.value = sAdaka;
  }
}

function onAjustMotifChange(val) {
  const obsInput = document.getElementById('reappro-observation');
  if (val === 'Autre motif' && obsInput && !obsInput.value) {
    obsInput.placeholder = "Précisez obligatoirement la raison de cet écart...";
    obsInput.focus();
  }
}

// CALCUL EN DIRECT & MISE À JOUR DU RÉCAPITULATIF (Section 10.3 & 10.4)
function updateReapproCalculation() {
  const product = state.products.find(p => p.id === reapproState.selectedProductId);
  if (!product) return;

  const uParAdaka = Math.max(1, parseInt(product.unites_par_adaka) || 20);
  const oldStockAdaka = parseFloat(product.stock) || 0;
  const oldStockUnits = product.stock_unites !== undefined ? parseInt(product.stock_unites) : Math.round(oldStockAdaka * uParAdaka);

  // Mettre à jour l'ancien stock dans le récapitulatif
  const sumProdName = document.getElementById('summary-prod-name');
  if (sumProdName) sumProdName.textContent = `${product.nom} ${product.taille || ''}`.trim();
  const sumAncienStock = document.getElementById('summary-ancien-stock');
  if (sumAncienStock) sumAncienStock.textContent = `${oldStockAdaka} Adaka (${oldStockUnits} u)`;

  const sumMvtLabel = document.getElementById('summary-movement-label');
  const sumMouvement = document.getElementById('summary-mouvement');
  const sumNouveauStock = document.getElementById('summary-nouveau-stock');
  const sumTotalCost = document.getElementById('summary-montant-total');

  if (reapproState.mode === 'REAPPRO') {
    // 1. CALCUL MODE RÉAPPROVISIONNEMENT
    const qteNum = Math.abs(parseFloat(document.getElementById('reappro-quantite')?.value) || 0);
    let addedAdaka = 0;
    let addedUnits = 0;

    if (reapproState.unit === 'unites') {
      addedUnits = Math.round(qteNum);
      addedAdaka = Math.round((addedUnits / uParAdaka) * 1000) / 1000;
      const convLabel = document.getElementById('reappro-conversion-label');
      if (convLabel) convLabel.textContent = `+${addedAdaka} Adaka (${addedUnits} sachets)`;
    } else {
      addedAdaka = Math.round(qteNum * 1000) / 1000;
      addedUnits = Math.round(addedAdaka * uParAdaka);
      const convLabel = document.getElementById('reappro-conversion-label');
      if (convLabel) convLabel.textContent = `+${addedUnits} sachets individuels (${addedAdaka} Adaka)`;
    }

    const projNewAdaka = Math.round((oldStockAdaka + addedAdaka) * 1000) / 1000;
    const projNewUnits = oldStockUnits + addedUnits;

    const uParAdakaInput = document.getElementById('reappro-unites-par-adaka');
    const curUParAdaka = Math.max(1, parseInt(uParAdakaInput?.value) || uParAdaka);

    // Calcul du coût total
    const pxAchat = parseFloat(document.getElementById('reappro-prix-achat')?.value) || 0;
    const frais = parseFloat(document.getElementById('reappro-frais-annexes')?.value) || 0;
    const totalMontant = (reapproState.unit === 'unites' ? (pxAchat * addedUnits) : (pxAchat * addedAdaka)) + frais;

    // Coût par unité individuelle (sachet)
    let coutParUnite = 0;
    if (addedUnits > 0) {
      coutParUnite = Math.round((totalMontant / addedUnits) * 100) / 100;
    } else if (curUParAdaka > 0) {
      coutParUnite = Math.round((pxAchat / curUParAdaka) * 100) / 100;
    }

    // Valeur totale du stock projeté
    const pxGrosProjete = parseFloat(document.getElementById('reappro-prix-gros')?.value) || product.prix_gros || product.prix || (pxAchat > 0 ? pxAchat * 1.2 : 0);
    const valeurStock = Math.round(projNewAdaka * pxGrosProjete);

    if (sumMvtLabel) sumMvtLabel.textContent = "Quantité Ajoutée :";
    if (sumMouvement) {
      sumMouvement.className = "font-black text-emerald-400 text-xs";
      sumMouvement.textContent = `+${addedAdaka} Adaka (+${addedUnits} u)`;
    }
    if (sumNouveauStock) {
      sumNouveauStock.className = "font-black text-white text-xs bg-emerald-600/70 px-2 py-0.5 rounded-lg border border-emerald-400/50 inline-block";
      sumNouveauStock.textContent = `${projNewAdaka} Adaka (${projNewUnits} u)`;
    }
    if (sumTotalCost) {
      sumTotalCost.textContent = `${formatMoney(totalMontant)} FCFA`;
    }
    const sumCoutUnitaire = document.getElementById('summary-cout-unitaire');
    if (sumCoutUnitaire) {
      sumCoutUnitaire.textContent = `${formatMoney(coutParUnite)} FCFA / u`;
    }
    const sumValeurStock = document.getElementById('summary-valeur-stock');
    if (sumValeurStock) {
      sumValeurStock.textContent = `${formatMoney(valeurStock)} FCFA`;
    }

  } else {
    // 2. CALCUL MODE AJUSTEMENT DE STOCK (Section 10.3.B)
    const reelVal = Math.max(0, parseFloat(document.getElementById('ajust-stock-reel')?.value) || 0);
    let newAdaka = 0;
    let newUnits = 0;

    if (reapproState.unit === 'unites') {
      newUnits = Math.round(reelVal);
      newAdaka = Math.round((newUnits / uParAdaka) * 1000) / 1000;
    } else {
      newAdaka = Math.round(reelVal * 1000) / 1000;
      newUnits = Math.round(newAdaka * uParAdaka);
    }

    const ecartUnits = newUnits - oldStockUnits;
    const ecartAdaka = Math.round((newAdaka - oldStockAdaka) * 1000) / 1000;

    // Mise à jour de l'écart direct sur le formulaire
    const ecartBadge = document.getElementById('ajust-ecart-badge');
    const ecartCard = document.getElementById('ajust-ecart-card');
    if (ecartBadge && ecartCard) {
      if (ecartUnits === 0) {
        ecartBadge.className = "font-black text-xs px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700";
        ecartBadge.textContent = "0 (Stock conforme)";
        ecartCard.className = "p-2.5 rounded-xl border flex items-center justify-between text-xs font-bold bg-white border-slate-200";
      } else if (ecartUnits < 0) {
        ecartBadge.className = "font-black text-xs px-2.5 py-0.5 rounded-lg bg-rose-100 text-rose-800";
        ecartBadge.textContent = `${ecartUnits} u (${ecartAdaka} Adaka)`;
        ecartCard.className = "p-2.5 rounded-xl border flex items-center justify-between text-xs font-bold bg-rose-50/50 border-rose-200";
      } else {
        ecartBadge.className = "font-black text-xs px-2.5 py-0.5 rounded-lg bg-emerald-100 text-emerald-800";
        ecartBadge.textContent = `+${ecartUnits} u (+${ecartAdaka} Adaka)`;
        ecartCard.className = "p-2.5 rounded-xl border flex items-center justify-between text-xs font-bold bg-emerald-50/50 border-emerald-200";
      }
    }

    if (sumMvtLabel) sumMvtLabel.textContent = "Écart Constaté :";
    if (sumMouvement) {
      if (ecartUnits < 0) {
        sumMouvement.className = "font-black text-rose-400 text-xs";
      } else if (ecartUnits > 0) {
        sumMouvement.className = "font-black text-emerald-400 text-xs";
      } else {
        sumMouvement.className = "font-bold text-slate-300 text-xs";
      }
      sumMouvement.textContent = `${ecartUnits >= 0 ? '+' : ''}${ecartUnits} u (${ecartAdaka >= 0 ? '+' : ''}${ecartAdaka} Adaka)`;
    }
    if (sumNouveauStock) {
      sumNouveauStock.className = "font-black text-white text-xs bg-amber-600/70 px-2 py-0.5 rounded-lg border border-amber-400/50 inline-block";
      sumNouveauStock.textContent = `${newAdaka} Adaka (${newUnits} u)`;
    }
    if (sumTotalCost) {
      sumTotalCost.textContent = "0 FCFA (Sans impact financier)";
    }
  }
}

// VALIDATION DE L'OPÉRATION (AVEC PROTECTION ANTI-DOUBLE-CLIC)
async function submitStockOperation() {
  const submitBtn = document.getElementById('btn-submit-stock-operation');
  const submitLabel = document.getElementById('btn-submit-stock-label');
  const submitIcon = document.getElementById('btn-submit-stock-icon');

  const productId = reapproState.selectedProductId;
  if (!productId) {
    showToast('error', 'Produit manquant', 'Veuillez sélectionner un article.');
    return;
  }

  const product = state.products.find(p => p.id === productId);
  if (!product) return;

  const mode = reapproState.mode;
  const unit = reapproState.unit;
  const dateOp = document.getElementById('reappro-date-operation')?.value || new Date().toISOString();
  const obs = document.getElementById('reappro-observation')?.value || '';

  let payload = {
    productId,
    uniteMouvement: unit,
    dateOperation: dateOp,
    observation: obs
  };

  if (mode === 'REAPPRO') {
    const qte = parseFloat(document.getElementById('reappro-quantite')?.value) || 0;
    if (qte <= 0) {
      showToast('error', 'Quantité invalide', 'Veuillez saisir une quantité positive.');
      return;
    }
    const pxAchat = parseFloat(document.getElementById('reappro-prix-achat')?.value) || 0;
    const frais = parseFloat(document.getElementById('reappro-frais-annexes')?.value) || 0;
    const suppId = document.getElementById('reappro-supplier-select')?.value;
    const uParAdaka = parseInt(document.getElementById('reappro-unites-par-adaka')?.value) || product.unites_par_adaka || 20;
    const pxGros = parseFloat(document.getElementById('reappro-prix-gros')?.value) || 0;
    const pxDetailUnite = parseFloat(document.getElementById('reappro-prix-detail')?.value) || 0;

    payload.type = 'ENTREE';
    payload.quantite = qte;
    payload.prixAchat = pxAchat;
    payload.fraisAnnexes = frais;
    payload.unitesParAdaka = uParAdaka;
    if (pxGros > 0) payload.prixGros = pxGros;
    if (pxDetailUnite > 0) {
      payload.prixDetailUnite = pxDetailUnite;
      payload.prixDetail = pxDetailUnite * uParAdaka;
    }
    if (suppId) payload.fournisseurId = parseInt(suppId);
    payload.motif = 'Réapprovisionnement marchandise';

  } else {
    // Mode AJUSTEMENT
    const stockReel = parseFloat(document.getElementById('ajust-stock-reel')?.value);
    if (isNaN(stockReel) || stockReel < 0) {
      showToast('error', 'Stock réel invalide', 'Veuillez saisir un comptage positif ou nul.');
      return;
    }
    const motifSelect = document.getElementById('ajust-motif-select');
    const motifVal = motifSelect ? motifSelect.value : 'Inventaire physique';

    payload.type = 'AJUSTEMENT';
    payload.stockReel = stockReel;
    payload.motif = motifVal;
  }

  // Activer sécurité anti-double-clic
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.classList.add('opacity-70', 'cursor-not-allowed');
  }
  if (submitIcon) submitIcon.textContent = '⏳';
  if (submitLabel) submitLabel.textContent = 'Enregistrement...';

  try {
    const res = await fetch('/api/stock/movement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Erreur lors de l'enregistrement de l'opération.");
    }

    closeModalReappro();
    await loadData();
    if (typeof renderStockTable === 'function') renderStockTable();

    const uParAdaka = product.unites_par_adaka || 20;
    const finalAdaka = data.product ? data.product.stock : product.stock;
    const finalUnits = data.product ? data.product.stock_unites : Math.round(finalAdaka * uParAdaka);

    if (mode === 'REAPPRO') {
      showToast('success', '📥 Réapprovisionnement Enregistré', `Nouveau stock pour ${product.nom} : ${finalAdaka} Adaka (${finalUnits} u).`);
    } else {
      showToast('success', '⚖️ Stock Ajusté avec Succès', `Stock corrigé pour ${product.nom} : ${finalAdaka} Adaka (${finalUnits} u).`);
    }

  } catch (err) {
    console.error("Erreur opération stock:", err);
    showToast('error', 'Erreur Opération', err.message || "Impossible d'enregistrer le mouvement.");
  } finally {
    // Réactiver le bouton
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove('opacity-70', 'cursor-not-allowed');
    }
    if (submitIcon) submitIcon.textContent = mode === 'REAPPRO' ? '💾' : '⚖️';
    if (submitLabel) submitLabel.textContent = mode === 'REAPPRO' ? "Enregistrer le réapprovisionnement" : "Enregistrer l'ajustement";
  }
}

// Fonction de rétrocompatibilité pour tout appel existant
async function submitReappro() {
  return submitStockOperation();
}

// ==========================================
// MODULE APPROVISIONNEMENTS, CALCULATEUR DE MARGES & FOURNISSEURS (MIAKIARA)
// ==========================================

function populateApproDropdowns() {
  const selectFournisseur = document.getElementById('appro-fournisseur-select');
  if (selectFournisseur) {
    const curVal = selectFournisseur.value;
    selectFournisseur.innerHTML = `
      <option value="">-- Choisir le fournisseur --</option>
      ${state.suppliers.map(s => `<option value="${s.id}">${s.nom} (${s.ville || 'Togo'})</option>`).join('')}
    `;
    if (curVal) selectFournisseur.value = curVal;
  }

  const selectProduct = document.getElementById('appro-product-select');
  if (selectProduct) {
    const curVal = selectProduct.value;
    selectProduct.innerHTML = `
      <option value="">-- Sélectionner l'article à approvisionner --</option>
      ${state.products.map(p => {
        const stockNum = parseFloat(p.stock) || 0;
        const unites = p.unites_par_adaka || 20;
        const stockUnits = p.stock_unites !== undefined ? p.stock_unites : Math.round(stockNum * unites);
        const fullName = formatProductFullName(p);
        const code = p.code || `SCH-${p.id}`;
        return `<option value="${p.id}">[${code}] ${fullName} (Stock: ${stockNum} ${p.lot || 'Adaka'} / ${stockUnits} u)</option>`;
      }).join('')}
    `;
    if (curVal) {
      selectProduct.value = curVal;
    }
    onApproProductChange();
  }

  const dateInput = document.getElementById('appro-date');
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().slice(0, 10);
  }
}

// Filtre instantané pour le formulaire d'approvisionnement (Recherche par nom, code ou marque)
function filterApproProductDropdown(query) {
  const selectProduct = document.getElementById('appro-product-select');
  if (!selectProduct) return;
  const q = (query || '').toLowerCase().trim();
  const curVal = selectProduct.value;

  const filteredProds = state.products.filter(p => {
    if (!q) return true;
    const fullName = formatProductFullName(p).toLowerCase();
    const code = (p.code || '').toLowerCase();
    const marque = (p.marque || '').toLowerCase();
    const cat = (p.categorie || '').toLowerCase();
    return fullName.includes(q) || code.includes(q) || marque.includes(q) || cat.includes(q);
  });

  selectProduct.innerHTML = `
    <option value="">-- ${filteredProds.length} article(s) trouvé(s) --</option>
    ${filteredProds.map(p => {
      const stockNum = parseFloat(p.stock) || 0;
      const unites = p.unites_par_adaka || 20;
      const stockUnits = p.stock_unites !== undefined ? p.stock_unites : Math.round(stockNum * unites);
      const fullName = formatProductFullName(p);
      const code = p.code || `SCH-${p.id}`;
      return `<option value="${p.id}" ${curVal && p.id === parseInt(curVal) ? 'selected' : ''}>[${code}] ${fullName} (Stock: ${stockNum} ${p.lot || 'Adaka'} / ${stockUnits} u)</option>`;
    }).join('')}
  `;

  if (filteredProds.length === 1) {
    selectProduct.value = filteredProds[0].id;
    onApproProductChange();
  } else if (curVal && filteredProds.some(p => p.id === parseInt(curVal))) {
    selectProduct.value = curVal;
    onApproProductChange();
  } else {
    onApproProductChange();
  }
}

function onApproProductChange() {
  const selectProduct = document.getElementById('appro-product-select');
  if (!selectProduct) return;
  const productId = parseInt(selectProduct.value);
  const p = state.products.find(item => item.id === productId);

  const badgeStock = document.getElementById('appro-stock-actuel-badge');
  const infoNom = document.getElementById('appro-info-nom');
  const infoCode = document.getElementById('appro-info-code');
  const infoStock = document.getElementById('appro-info-stock');
  const infoMarque = document.getElementById('appro-info-marque');
  const infoCond = document.getElementById('appro-info-conditionnement');
  const infoGros = document.getElementById('appro-info-prix-gros');
  const infoDetail = document.getElementById('appro-info-prix-detail');
  const selectedBadge = document.getElementById('appro-selected-product-badge');

  if (p) {
    const unites = p.unites_par_adaka || 20;
    const stockVal = parseFloat(p.stock) || 0;
    const stockUnits = p.stock_unites !== undefined ? p.stock_unites : Math.round(stockVal * unites);
    const fullName = formatProductFullName(p);
    const code = p.code || `SCH-${p.id}`;

    if (badgeStock) badgeStock.textContent = `Stock actuel : ${stockUnits} u (${stockVal} ${p.lot || 'Adaka'})`;
    if (selectedBadge) selectedBadge.textContent = `${code} • ${p.marque || 'MIAKIARA'}`;
    if (infoNom) infoNom.textContent = fullName;
    if (infoCode) infoCode.textContent = code;
    if (infoStock) infoStock.textContent = `Stock : ${stockVal} Adaka (${stockUnits} u)`;
    if (infoMarque) infoMarque.textContent = p.marque || 'Standard';
    if (infoCond) infoCond.textContent = `${unites} sachets / ${p.lot || 'Adaka'}`;
    if (infoGros) infoGros.textContent = formatMoney(p.prix_gros || p.prix || 0);
    if (infoDetail) infoDetail.textContent = `${formatMoney(p.prix_detail_unite || 100)} / sachet`;

    const inputPrixAchat = document.getElementById('appro-prix-achat');
    if (inputPrixAchat) inputPrixAchat.value = p.prix_achat || 0;

    const inputUnitesParAdaka = document.getElementById('appro-unites-par-adaka');
    if (inputUnitesParAdaka) inputUnitesParAdaka.value = unites;

    const inputPrixGros = document.getElementById('appro-prix-vente-gros');
    if (inputPrixGros) inputPrixGros.value = p.prix_gros || p.prix || 0;

    const inputPrixDetail = document.getElementById('appro-prix-vente-detail');
    if (inputPrixDetail) inputPrixDetail.value = p.prix_detail || p.prix || 0;

    const inputPrixDetailUnite = document.getElementById('appro-prix-vente-detail-unite');
    if (inputPrixDetailUnite) inputPrixDetailUnite.value = p.prix_detail_unite || (unites > 0 ? Math.round((p.prix_detail || p.prix || 0) / unites) : 100);

    const selectUnite = document.getElementById('appro-unite');
    if (selectUnite && p.unite_achat) selectUnite.value = p.unite_achat;

    const selectFournisseur = document.getElementById('appro-fournisseur-select');
    if (selectFournisseur && p.fournisseurId) selectFournisseur.value = p.fournisseurId;
  } else {
    if (badgeStock) badgeStock.textContent = `Stock actuel : 0 u (0 Adaka)`;
    if (infoNom) infoNom.textContent = "Aucun article sélectionné";
    if (infoCode) infoCode.textContent = "SCH-000";
    if (infoStock) infoStock.textContent = "Stock : -";
    if (infoMarque) infoMarque.textContent = "-";
    if (infoCond) infoCond.textContent = "-";
    if (infoGros) infoGros.textContent = "-";
    if (infoDetail) infoDetail.textContent = "-";
  }

  calculerMargesApproEnDirect();
}

function calculerMargesApproEnDirect() {
  const selectProduct = document.getElementById('appro-product-select');
  const productId = selectProduct ? parseInt(selectProduct.value) : null;
  const prod = state.products.find(p => p.id === productId);

  const qte = parseFloat(document.getElementById('appro-quantite')?.value) || 0;
  const unitesParAdaka = parseInt(document.getElementById('appro-unites-par-adaka')?.value) || (prod ? (prod.unites_par_adaka || 20) : 20);
  const prixAchatU = parseFloat(document.getElementById('appro-prix-achat')?.value) || 0;
  const fraisTransport = parseFloat(document.getElementById('appro-frais-transport')?.value) || 0;
  const prixVenteGros = parseFloat(document.getElementById('appro-prix-vente-gros')?.value) || 0;
  const prixVenteDetailUnite = parseFloat(document.getElementById('appro-prix-vente-detail-unite')?.value) || 0;

  // Coût réel total d'acquisition Adaka = (Prix Achat Unitaire * Quantité) + Frais de Transport
  const coutTotalAcquisition = (prixAchatU * qte) + fraisTransport;
  const coutReelUnitaire = qte > 0 ? (coutTotalAcquisition / qte) : prixAchatU;
  const coutReelSachet = unitesParAdaka > 0 ? (coutReelUnitaire / unitesParAdaka) : 0;

  // Marges par rapport au Prix de Gros
  const margeUnitaireGros = prixVenteGros - coutReelUnitaire;
  const margeTotaleGros = margeUnitaireGros * qte;
  const tauxMargeGros = coutReelUnitaire > 0 ? ((margeUnitaireGros / coutReelUnitaire) * 100) : 0;
  const tauxMarqueGros = prixVenteGros > 0 ? ((margeUnitaireGros / prixVenteGros) * 100) : 0;

  // Marge sachet détail
  const margeSachet = prixVenteDetailUnite - coutReelSachet;

  // Calcul du Coût Moyen Pondéré (CMP) projeté
  const ancienStock = prod ? (parseFloat(prod.stock) || 0) : 0;
  const ancienCout = prod ? (parseFloat(prod.prix_achat) || coutReelUnitaire) : coutReelUnitaire;
  const stockProjete = Math.max(0, ancienStock) + qte;
  const stockProjeteUnits = Math.round(stockProjete * unitesParAdaka);
  const cmpProjete = stockProjete > 0 
    ? (((Math.max(0, ancienStock) * ancienCout) + (qte * coutReelUnitaire)) / stockProjete)
    : coutReelUnitaire;

  // Mise à jour de l'affichage dans le formulaire
  const elemCoutTotal = document.getElementById('calc-cout-reel-total');
  if (elemCoutTotal) elemCoutTotal.textContent = formatMoney(coutTotalAcquisition);

  const elemCoutU = document.getElementById('calc-cout-unitaire-reel');
  if (elemCoutU) elemCoutU.textContent = `(${formatMoney(coutReelUnitaire)} / Adaka)`;

  const elemCoutSachet = document.getElementById('calc-cout-unite-reel-sachet');
  if (elemCoutSachet) elemCoutSachet.textContent = `${formatMoney(Math.round(coutReelSachet))} / sachet`;

  const elemMargeU = document.getElementById('calc-marge-unitaire');
  if (elemMargeU) {
    elemMargeU.textContent = formatMoney(margeUnitaireGros);
    elemMargeU.className = `text-sm font-black ${margeUnitaireGros >= 0 ? 'text-emerald-700' : 'text-rose-700'}`;
  }

  const elemMargeSachet = document.getElementById('calc-marge-unite-sachet');
  if (elemMargeSachet) {
    elemMargeSachet.textContent = (margeSachet >= 0 ? '+' : '') + formatMoney(Math.round(margeSachet));
    elemMargeSachet.className = `font-bold ${margeSachet >= 0 ? 'text-emerald-700' : 'text-rose-700'}`;
  }

  const elemMargeTotLabel = document.getElementById('calc-marge-totale-label');
  if (elemMargeTotLabel) elemMargeTotLabel.textContent = `Marge totale : ${formatMoney(margeTotaleGros)}`;

  const elemTauxMarge = document.getElementById('calc-taux-marge');
  if (elemTauxMarge) elemTauxMarge.textContent = `${tauxMargeGros.toFixed(2)} %`;

  const elemTauxMarque = document.getElementById('calc-taux-marque');
  if (elemTauxMarque) elemTauxMarque.textContent = `${tauxMarqueGros.toFixed(2)} %`;

  const elemCmp = document.getElementById('calc-cmp-projete');
  if (elemCmp) elemCmp.textContent = formatMoney(cmpProjete);

  const elemStockProjete = document.getElementById('calc-stock-projete');
  if (elemStockProjete) elemStockProjete.textContent = `${stockProjete} Adaka`;

  const elemStockProjeteUnits = document.getElementById('calc-stock-projete-unites');
  if (elemStockProjeteUnits) elemStockProjeteUnits.textContent = `(${stockProjeteUnits} sachets)`;
}

function basculerVueApproMobile(target) {
  const btnForm = document.getElementById('btn-appro-mobile-form') || document.getElementById('btn-nav-appro-form');
  const btnSecond = document.getElementById('btn-appro-mobile-second') || document.getElementById('btn-nav-appro-table');
  const formCard = document.getElementById('appro-form-card') || document.getElementById('form-appro');
  const historyCard = document.getElementById('appro-history-section') || document.getElementById('appro-historique-container');

  if (target === 'form') {
    if (btnForm) {
      btnForm.className = 'flex-1 py-2 px-2 text-xs font-bold rounded-lg bg-sky-700 text-white shadow transition flex items-center justify-center gap-1';
    }
    if (btnSecond) {
      btnSecond.className = 'flex-1 py-2 px-2 text-xs font-bold rounded-lg text-slate-700 hover:bg-slate-100 transition flex items-center justify-center gap-1';
    }
    if (formCard) formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    if (btnSecond) {
      btnSecond.className = 'flex-1 py-2 px-2 text-xs font-bold rounded-lg bg-indigo-700 text-white shadow transition flex items-center justify-center gap-1';
    }
    if (btnForm) {
      btnForm.className = 'flex-1 py-2 px-2 text-xs font-bold rounded-lg text-slate-700 hover:bg-slate-100 transition flex items-center justify-center gap-1';
    }
    if (historyCard) historyCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

let isSubmittingAppro = false;

async function soumettreApprovisionnement(event) {
  event.preventDefault();
  if (isSubmittingAppro) return;

  const btnSubmit = document.getElementById('btn-submit-appro');
  const originalText = btnSubmit ? btnSubmit.innerHTML : '';

  try {
    const selectProduct = document.getElementById('appro-product-select');
    const productId = selectProduct ? parseInt(selectProduct.value) : null;
    const quantite = parseFloat(document.getElementById('appro-quantite')?.value) || 0;
    const prod = state.products.find(p => p.id === productId);

    if (!productId) {
      showToast('error', 'Sélection obligatoire', 'Veuillez sélectionner un article à approvisionner.');
      return;
    }
    if (quantite <= 0) {
      showToast('error', 'Quantité invalide', 'Veuillez saisir une quantité supérieure à 0.');
      return;
    }

    isSubmittingAppro = true;
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.innerHTML = `<span class="animate-spin inline-block mr-1">⏳</span> Enregistrement & Calcul CMP...`;
    }

    const selectFournisseur = document.getElementById('appro-fournisseur-select');
    const fournisseurId = selectFournisseur && selectFournisseur.value ? parseInt(selectFournisseur.value) : null;
    const fournisseurObj = state.suppliers.find(s => s.id === fournisseurId);

    const unitesParAdaka = parseInt(document.getElementById('appro-unites-par-adaka')?.value) || (prod ? (prod.unites_par_adaka || 20) : 20);
    const prixAchatU = parseFloat(document.getElementById('appro-prix-achat')?.value) || 0;
    const fraisTransport = parseFloat(document.getElementById('appro-frais-transport')?.value) || 0;
    const prixVenteGros = parseFloat(document.getElementById('appro-prix-vente-gros')?.value) || 0;
    const prixVenteDetail = parseFloat(document.getElementById('appro-prix-vente-detail')?.value) || 0;
    const prixVenteDetailUnite = parseFloat(document.getElementById('appro-prix-vente-detail-unite')?.value) || 0;
    const dateAchat = document.getElementById('appro-date')?.value || new Date().toISOString();
    const modePaiement = document.getElementById('appro-mode-paiement')?.value || 'ESPECES';
    const uniteAchat = document.getElementById('appro-unite')?.value || 'Adaka';

    const payload = {
      productId,
      fournisseurId,
      fournisseurNom: fournisseurObj ? fournisseurObj.nom : 'Fournisseur Direct',
      date: dateAchat,
      quantite,
      unitesParAdaka,
      uniteAchat,
      prixAchatUnitaire: prixAchatU,
      fraisTransport,
      fraisAutres: 0,
      prixVenteGrosPrevu: prixVenteGros,
      prixVenteDetailPrevu: prixVenteDetail,
      prixVenteDetailUnite: prixVenteDetailUnite,
      modePaiement: modePaiement,
      acomptePaye: modePaiement === 'CREDIT' ? 0 : ((prixAchatU * quantite) + fraisTransport)
    };

    const res = await fetch('/api/approvisionnements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur lors de l'enregistrement");

    playBeep('success');
    showToast('success', 'Approvisionnement réussi !', `Bon ${data.approvisionnement.codeBon} validé. Stock et CMP actualisés.`);
    
    // Réinitialisation du formulaire
    document.getElementById('form-appro').reset();
    document.getElementById('appro-quantite').value = 1;
    document.getElementById('appro-frais-transport').value = 0;
    const dateInput = document.getElementById('appro-date');
    if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);

    await loadData();
    renderApproTable();
    calculerMargesApproEnDirect();
  } catch (err) {
    showToast('error', 'Erreur approvisionnement', err.message);
  } finally {
    isSubmittingAppro = false;
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = originalText;
    }
  }
}

function setSecondScreenApproTab(subtab) {
  const panelAchats = document.getElementById('sub-panel-appro-achats');
  const panelFournisseurs = document.getElementById('sub-panel-appro-fournisseurs');
  const tabAchats = document.getElementById('tab-sub-appro-achats');
  const tabFournisseurs = document.getElementById('tab-sub-appro-fournisseurs');

  if (subtab === 'achats') {
    if (panelAchats) panelAchats.classList.remove('hidden');
    if (panelFournisseurs) panelFournisseurs.classList.add('hidden');
    if (tabAchats) {
      tabAchats.className = "px-4 py-2 font-bold text-xs rounded-t-xl bg-white border-t border-l border-r border-slate-200 text-sky-900 shadow-sm flex items-center gap-1.5";
    }
    if (tabFournisseurs) {
      tabFournisseurs.className = "px-4 py-2 font-bold text-xs rounded-t-xl bg-slate-200 hover:bg-slate-300 text-slate-700 flex items-center gap-1.5";
    }
  } else {
    if (panelAchats) panelAchats.classList.add('hidden');
    if (panelFournisseurs) panelFournisseurs.classList.remove('hidden');
    if (tabFournisseurs) {
      tabFournisseurs.className = "px-4 py-2 font-bold text-xs rounded-t-xl bg-white border-t border-l border-r border-slate-200 text-sky-900 shadow-sm flex items-center gap-1.5";
    }
    if (tabAchats) {
      tabAchats.className = "px-4 py-2 font-bold text-xs rounded-t-xl bg-slate-200 hover:bg-slate-300 text-slate-700 flex items-center gap-1.5";
    }
  }
}

function renderApproTable() {
  const tbody = document.getElementById('appro-table-body');
  if (!tbody) return;

  const search = (document.getElementById('filter-appro-search')?.value || '').toLowerCase().trim();

  const filtered = (state.approvisionnements || []).filter(a => {
    const prod = state.products.find(p => p.id === a.productId);
    const prodName = a.productNom || a.productName || (prod ? formatProductFullName(prod) : '');
    const prodCode = a.productCode || (prod ? prod.code : '');
    const brand = prod ? (prod.marque || '') : '';
    const fullText = `${a.code || a.codeBon || ''} ${a.fournisseurNom || ''} ${prodName} ${prodCode} ${brand}`.toLowerCase();
    return !search || fullText.includes(search);
  });

  const countElem = document.getElementById('count-bons-appro');
  if (countElem) countElem.textContent = (state.approvisionnements || []).length;

  // Calcul des statistiques approvisionnement globales
  const totalAchats = (state.approvisionnements || []).reduce((acc, a) => acc + (parseFloat(a.totalAchat || a.montantAchatTotal) || 0), 0);
  const totalFrais = (state.approvisionnements || []).reduce((acc, a) => acc + (parseFloat(a.fraisTransport) || 0), 0);
  const totalCoutReel = (state.approvisionnements || []).reduce((acc, a) => acc + (parseFloat(a.totalCoutReel || a.coutReelAcquisition) || 0), 0);
  const totalDettesFournisseurs = (state.suppliers || []).reduce((acc, s) => acc + (parseFloat(s.dette || s.solde_dette) || 0), 0);

  const statAchatsElem = document.getElementById('stat-appro-total-achats');
  if (statAchatsElem) statAchatsElem.textContent = formatMoney(totalAchats);

  const statFraisElem = document.getElementById('stat-appro-total-frais');
  if (statFraisElem) statFraisElem.textContent = formatMoney(totalFrais);

  const statCoutReelElem = document.getElementById('stat-appro-cout-reel');
  if (statCoutReelElem) statCoutReelElem.textContent = formatMoney(totalCoutReel);

  const statDettesElem = document.getElementById('stat-appro-dettes-fournisseurs');
  if (statDettesElem) statDettesElem.textContent = formatMoney(totalDettesFournisseurs);

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="p-6 text-center text-slate-400 text-xs">
          Aucun bon d'approvisionnement trouvé. Utilisez le formulaire ci-dessus pour enregistrer vos achats.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(a => {
    const d = new Date(a.date || Date.now());
    const dateFormatted = d.toLocaleDateString('fr-FR');
    const prod = state.products.find(p => p.id === a.productId);
    
    // Résolution précise et robuste du nom et du code de l'article
    const productCode = a.productCode || (prod ? prod.code : `SCH-${a.productId || '00'}`);
    const productName = (prod ? formatProductFullName(prod) : null) || a.productNom || a.productName || 'Article inconnu';
    const productBrand = prod ? prod.marque : '';

    const unitesParAdaka = a.unitesParAdaka || (prod ? prod.unites_par_adaka : 20) || 20;
    const qteUnits = Math.round((parseFloat(a.quantite) || 0) * unitesParAdaka);

    const montantAchatTotal = parseFloat(a.montantAchatTotal) || (parseFloat(a.prixAchatUnitaire) * parseFloat(a.quantite)) || 0;
    const coutReelTot = parseFloat(a.coutReelAcquisition) || parseFloat(a.totalCoutReel) || (montantAchatTotal + (parseFloat(a.fraisTransport) || 0));
    const margeBruteU = parseFloat(a.margeBruteUnitaire) || parseFloat(a.margeBruteUnitairePrevue) || ((parseFloat(a.prixVenteGros) || parseFloat(a.prixVenteGrosPrevu) || 0) - (parseFloat(a.coutUnitaireReel) || 0));

    // Stocks avant et après l'opération
    const ancienStock = a.ancienStock !== undefined ? a.ancienStock : '-';
    const nouveauStock = a.nouveauStock !== undefined ? a.nouveauStock : '-';
    const ancienStockUnits = a.ancienStockUnites !== undefined ? `${a.ancienStockUnites} u` : '';
    const nouveauStockUnits = a.nouveauStockUnites !== undefined ? `${a.nouveauStockUnites} u` : '';

    return `
      <tr class="hover:bg-slate-50 border-b border-slate-100 text-xs transition">
        <td class="p-2.5 font-bold text-sky-900 whitespace-nowrap">
          <div>${a.code || a.codeBon || 'BON'}</div>
          <div class="text-[10px] text-slate-400 font-normal">${dateFormatted}</div>
        </td>
        <td class="p-2.5">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="px-1.5 py-0.5 bg-sky-100 text-sky-800 border border-sky-200 rounded font-mono font-bold text-[10px]">${productCode}</span>
            <span class="font-bold text-slate-900 text-xs">${productName}</span>
          </div>
          ${productBrand ? `<span class="text-[10px] text-sky-700 font-semibold block mt-0.5">Marque : ${productBrand}</span>` : ''}
        </td>
        <td class="p-2.5 font-semibold text-slate-800">${a.fournisseurNom || 'Fournisseur Direct'}</td>
        <td class="p-2.5 text-center font-bold text-slate-800">
          <div>${a.quantite} ${a.uniteAchat || 'Adaka'}</div>
          <div class="text-[10px] text-slate-400 font-normal">(${qteUnits} unités)</div>
        </td>
        <td class="p-2.5 text-center text-slate-600 font-medium text-[11px] whitespace-nowrap">
          <div class="bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 inline-block">
            <span class="text-slate-500 font-bold">${ancienStock} Ad.</span>
            <span class="text-sky-700 mx-1 font-bold">➔</span>
            <strong class="text-emerald-700 font-black">${nouveauStock} Ad.</strong>
            ${nouveauStockUnits ? `<div class="text-[9px] text-slate-400 font-semibold">${ancienStockUnits} ➔ ${nouveauStockUnits}</div>` : ''}
          </div>
        </td>
        <td class="p-2.5 text-right font-medium text-slate-600">${formatMoney(a.prixAchatUnitaire)}</td>
        <td class="p-2.5 text-right font-black text-indigo-900">
          <div>${formatMoney(coutReelTot)}</div>
          ${a.fraisTransport > 0 ? `<div class="text-[9px] text-amber-700 font-normal">+${formatMoney(a.fraisTransport)} transport</div>` : ''}
        </td>
        <td class="p-2.5 text-right font-black ${margeBruteU >= 0 ? 'text-emerald-700' : 'text-rose-700'}">
          ${formatMoney(margeBruteU)}
          <div class="text-[9px] text-slate-400 font-medium">/ Adaka</div>
        </td>
        <td class="p-2.5 text-center">
          <button onclick="annulerApprovisionnement(${a.id})" class="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded font-bold text-[11px] transition active:scale-95" title="Annuler ce bon et déduire le stock">
            🗑️ Annuler
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

async function annulerApprovisionnement(id) {
  const appro = (state.approvisionnements || []).find(a => a.id === id);
  const bon = appro ? appro.codeBon : `#${id}`;
  if (!confirm(`⚠️ Attention : Voulez-vous vraiment annuler le bon d'approvisionnement ${bon} ?\nLe stock sera automatiquement diminué et le solde du fournisseur ajusté.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/approvisionnements/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur d'annulation");

    showToast('success', 'Bon annulé', `Le bon ${bon} a été annulé avec succès.`);
    await loadData();
    renderApproTable();
  } catch (err) {
    showToast('error', 'Erreur annulation', err.message);
  }
}

// GESTION DU CARNET DES FOURNISSEURS
function renderSuppliersTable() {
  const tbody = document.getElementById('suppliers-table-body');
  if (!tbody) return;

  const countElem = document.getElementById('count-fournisseurs');
  if (countElem) countElem.textContent = (state.suppliers || []).length;

  if ((state.suppliers || []).length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="p-6 text-center text-slate-400 text-xs">
          Aucun fournisseur partenaire enregistré.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = state.suppliers.map(s => {
    const detteVal = parseFloat(s.dette) || 0;
    return `
      <tr class="hover:bg-slate-50 border-b border-slate-100 text-xs">
        <td class="p-2.5 font-bold text-slate-800">${s.nom}</td>
        <td class="p-2.5 text-slate-600">${s.telephone || '-'}</td>
        <td class="p-2.5 text-slate-600">${s.ville || s.adresse || '-'}</td>
        <td class="p-2.5 text-right font-black ${detteVal > 0 ? 'text-rose-600' : 'text-emerald-700'}">
          ${formatMoney(detteVal)}
        </td>
        <td class="p-2.5 text-slate-500 text-[11px]">${s.notes || '-'}</td>
        <td class="p-2.5 text-center space-x-1 whitespace-nowrap">
          <button onclick="openModalEditSupplier(${s.id})" class="px-2 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded font-bold text-xs" title="Modifier le fournisseur">
            ✏️
          </button>
          <button onclick="deleteSupplier(${s.id})" class="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded font-bold text-xs" title="Supprimer">
            🗑️
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function openModalAddSupplier() {
  const form = document.getElementById('form-supplier');
  if (form) form.reset();
  const title = document.getElementById('modal-supplier-title');
  if (title) title.textContent = "Nouveau Fournisseur Partenaire (MIAKIARA)";
  const idInput = document.getElementById('supplier-id');
  if (idInput) idInput.value = '';
  const detteInput = document.getElementById('supplier-dette');
  if (detteInput) detteInput.value = 0;

  const modal = document.getElementById('modal-supplier');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function openModalEditSupplier(id) {
  const s = state.suppliers.find(item => item.id === id);
  if (!s) return;

  const title = document.getElementById('modal-supplier-title');
  if (title) title.textContent = `Modifier le Fournisseur #${s.id}`;

  const idInput = document.getElementById('supplier-id');
  if (idInput) idInput.value = s.id;

  const nomInput = document.getElementById('supplier-nom');
  if (nomInput) nomInput.value = s.nom || '';

  const telInput = document.getElementById('supplier-tel');
  if (telInput) telInput.value = s.telephone || '';

  const detteInput = document.getElementById('supplier-dette');
  if (detteInput) detteInput.value = s.dette || 0;

  const adresseInput = document.getElementById('supplier-adresse');
  if (adresseInput) adresseInput.value = s.ville || s.adresse || '';

  const notesInput = document.getElementById('supplier-notes');
  if (notesInput) notesInput.value = s.notes || '';

  const modal = document.getElementById('modal-supplier');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function closeModalSupplier() {
  const modal = document.getElementById('modal-supplier');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

async function saveSupplier(event) {
  event.preventDefault();
  const id = document.getElementById('supplier-id')?.value;
  const nom = document.getElementById('supplier-nom')?.value.trim();

  if (!nom) {
    showToast('error', 'Nom requis', 'Le nom du fournisseur est obligatoire.');
    return;
  }

  const payload = {
    id: id ? parseInt(id) : undefined,
    nom: nom,
    telephone: document.getElementById('supplier-tel')?.value.trim() || '',
    ville: document.getElementById('supplier-adresse')?.value.trim() || 'Lomé / Togo',
    dette: parseFloat(document.getElementById('supplier-dette')?.value) || 0,
    notes: document.getElementById('supplier-notes')?.value.trim() || ''
  };

  try {
    const res = await fetch('/api/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur de sauvegarde");

    closeModalSupplier();
    showToast('success', 'Fournisseur enregistré !', `"${payload.nom}" a été sauvegardé avec succès.`);
    await loadData();
    renderSuppliersTable();
  } catch (err) {
    showToast('error', 'Erreur sauvegarde', err.message);
  }
}

async function deleteSupplier(id) {
  const s = state.suppliers.find(item => item.id === id);
  const nom = s ? s.nom : 'ce fournisseur';
  if (!confirm(`⚠️ Attention : Voulez-vous vraiment supprimer "${nom}" ?`)) return;

  try {
    const res = await fetch(`/api/suppliers/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur suppression");

    showToast('success', 'Fournisseur supprimé', `"${nom}" a été retiré de la liste.`);
    await loadData();
    renderSuppliersTable();
  } catch (err) {
    showToast('error', 'Erreur suppression', err.message);
  }
}

// ==========================================
// 3. SECTION 14 : MODULE DE GESTION DES DETTES & MISE À JOUR DES RÈGLEMENTS
// ==========================================

// --- Navigation par Sous-Onglets (Séparation Stricte Section 14.A) ---
function setDebtActiveTab(tab) {
  state.activeDebtTab = tab;

  // Réinitialiser les boutons des sous-onglets
  const btnClient = document.getElementById('tab-debt-client');
  const btnFourn = document.getElementById('tab-debt-fournisseur');
  const btnRegl = document.getElementById('tab-debt-reglements');
  const btnList = document.getElementById('tab-debt-clients-list');

  const activeClasses = ['bg-white', 'border-t', 'border-l', 'border-r', 'border-slate-200', 'text-sky-900', 'shadow-sm'];
  const inactiveClasses = ['bg-slate-200', 'hover:bg-slate-300', 'text-slate-700'];

  [btnClient, btnFourn, btnRegl, btnList].forEach(btn => {
    if (btn) {
      btn.classList.remove(...activeClasses);
      btn.classList.add(...inactiveClasses);
    }
  });

  const panels = {
    'CLIENT': { btn: btnClient, panel: document.getElementById('panel-debt-clients') },
    'FOURNISSEUR': { btn: btnFourn, panel: document.getElementById('panel-debt-fournisseurs') },
    'REGLEMENTS': { btn: btnRegl, panel: document.getElementById('panel-debt-reglements') },
    'CLIENTS_LIST': { btn: btnList, panel: document.getElementById('panel-debt-clients-list') }
  };

  // Cacher tous les panneaux
  Object.values(panels).forEach(item => {
    if (item.panel) item.panel.classList.add('hidden');
  });

  // Activer le panneau sélectionné
  if (panels[tab]) {
    if (panels[tab].btn) {
      panels[tab].btn.classList.remove(...inactiveClasses);
      panels[tab].btn.classList.add(...activeClasses);
    }
    if (panels[tab].panel) {
      panels[tab].panel.classList.remove('hidden');
    }
  }

  renderDettesDashboard();
}

// --- Tableaux de Bord & Statistiques (Section 14.F) ---
function renderDettesDashboard() {
  const dettes = state.dettes || [];
  const reglements = state.reglementsDettes || [];

  // 1. Calculs des KPI
  const clientDebts = dettes.filter(d => d.type === 'CLIENT' && !d.annulee);
  const supplierDebts = dettes.filter(d => d.type === 'FOURNISSEUR' && !d.annulee);

  const totalCreancesClients = clientDebts.reduce((sum, d) => sum + (parseFloat(d.soldeRestant) || 0), 0);
  const totalDettesFournisseurs = supplierDebts.reduce((sum, d) => sum + (parseFloat(d.soldeRestant) || 0), 0);

  const clientReglements = reglements.filter(r => r.type === 'CLIENT' && !r.annule);
  const supplierReglements = reglements.filter(r => r.type === 'FOURNISSEUR' && !r.annule);

  const totalReglementsEncaisses = clientReglements.reduce((sum, r) => sum + (parseFloat(r.montant) || 0), 0);
  const totalReglementsVerses = supplierReglements.reduce((sum, r) => sum + (parseFloat(r.montant) || 0), 0);

  // Décompte par statuts
  const now = new Date();
  let countNonReglees = 0;
  let countPartielles = 0;
  let countSoldees = 0;
  let countEnRetard = 0;

  dettes.forEach(d => {
    if (d.annulee) return;
    const solde = parseFloat(d.soldeRestant) || 0;
    const isOverdue = d.dateEcheance && new Date(d.dateEcheance) < now && solde > 0;

    if (isOverdue || d.statut === 'EN_RETARD') {
      countEnRetard++;
    } else if (solde <= 0 || d.statut === 'SOLDEE') {
      countSoldees++;
    } else if ((parseFloat(d.montantRegle) || 0) > 0 || d.statut === 'PARTIEL') {
      countPartielles++;
    } else {
      countNonReglees++;
    }
  });

  // Mise à jour de l'affichage des cartes KPI
  const kpiCreances = document.getElementById('kpi-total-creances-clients');
  if (kpiCreances) kpiCreances.textContent = formatMoney(totalCreancesClients);

  const kpiDettesFourn = document.getElementById('kpi-total-dettes-fournisseurs');
  if (kpiDettesFourn) kpiDettesFourn.textContent = formatMoney(totalDettesFournisseurs);

  const kpiReglEnc = document.getElementById('kpi-total-reglements-encaisses');
  if (kpiReglEnc) kpiReglEnc.textContent = formatMoney(totalReglementsEncaisses);

  const kpiReglVer = document.getElementById('kpi-total-reglements-verses');
  if (kpiReglVer) kpiReglVer.textContent = formatMoney(totalReglementsVerses);

  // Compteurs secondaires sous les cartes
  const countCreancesElem = document.getElementById('kpi-count-creances-actives');
  if (countCreancesElem) countCreancesElem.textContent = `${clientDebts.filter(d => (parseFloat(d.soldeRestant) || 0) > 0).length} active(s) / ${clientDebts.length} total`;

  const countDettesElem = document.getElementById('kpi-count-dettes-fournisseurs');
  if (countDettesElem) countDettesElem.textContent = `${supplierDebts.filter(d => (parseFloat(d.soldeRestant) || 0) > 0).length} active(s) / ${supplierDebts.length} total`;

  const countEncElem = document.getElementById('kpi-count-reglements-encaisses');
  if (countEncElem) countEncElem.textContent = `${clientReglements.length} encaissement(s)`;

  const countVerElem = document.getElementById('kpi-count-reglements-verses');
  if (countVerElem) countVerElem.textContent = `${supplierReglements.length} versement(s)`;

  // Badges de décompte par statut
  const bNonReg = document.getElementById('badge-statut-non-reglee');
  if (bNonReg) bNonReg.textContent = `⏳ Non réglées : ${countNonReglees}`;

  const bPart = document.getElementById('badge-statut-partielle');
  if (bPart) bPart.textContent = `🌗 Partielles : ${countPartielles}`;

  const bSoldee = document.getElementById('badge-statut-soldee');
  if (bSoldee) bSoldee.textContent = `✅ Soldées : ${countSoldees}`;

  const bRetard = document.getElementById('badge-statut-retard');
  if (bRetard) bRetard.textContent = `🚨 En retard : ${countEnRetard}`;

  // Compteurs sur les onglets
  const tabCli = document.getElementById('count-tab-clients');
  if (tabCli) tabCli.textContent = clientDebts.length;

  const tabFrn = document.getElementById('count-tab-fournisseurs');
  if (tabFrn) tabFrn.textContent = supplierDebts.length;

  const tabReg = document.getElementById('count-tab-reglements');
  if (tabReg) tabReg.textContent = reglements.filter(r => !r.annule).length;

  const tabRep = document.getElementById('count-tab-repertoire');
  if (tabRep) tabRep.textContent = (state.customers || []).length;

  // 2. Filtres & Recherche
  const search = (document.getElementById('filter-debt-search')?.value || '').toLowerCase().trim();
  const statutFilter = document.getElementById('filter-debt-statut')?.value || '';
  const sortFilter = document.getElementById('filter-debt-sort')?.value || 'date-desc';

  function filtrerEtTrierDettes(liste) {
    let res = liste.filter(d => !d.annulee);

    if (search) {
      res = res.filter(d => 
        (d.tierNom && d.tierNom.toLowerCase().includes(search)) ||
        (d.code && d.code.toLowerCase().includes(search)) ||
        (d.telephone && d.telephone.toLowerCase().includes(search)) ||
        (d.description && d.description.toLowerCase().includes(search)) ||
        (d.reference && d.reference.toLowerCase().includes(search))
      );
    }

    if (statutFilter) {
      if (statutFilter === 'EN_RETARD') {
        res = res.filter(d => d.statut === 'EN_RETARD' || (d.dateEcheance && new Date(d.dateEcheance) < now && (parseFloat(d.soldeRestant) || 0) > 0));
      } else {
        res = res.filter(d => d.statut === statutFilter);
      }
    }

    res.sort((a, b) => {
      if (sortFilter === 'date-desc') return new Date(b.date || b.dateCreation) - new Date(a.date || a.dateCreation);
      if (sortFilter === 'date-asc') return new Date(a.date || a.dateCreation) - new Date(b.date || b.dateCreation);
      if (sortFilter === 'solde-desc') return (parseFloat(b.soldeRestant) || 0) - (parseFloat(a.soldeRestant) || 0);
      if (sortFilter === 'solde-asc') return (parseFloat(a.soldeRestant) || 0) - (parseFloat(b.soldeRestant) || 0);
      return 0;
    });

    return res;
  }

  // 3. Rendu de chaque table
  renderDebtClientsTable(filtrerEtTrierDettes(clientDebts));
  renderDebtSuppliersTable(filtrerEtTrierDettes(supplierDebts));
  renderDebtReglementsTable();
  renderCustomersTable();
}

// --- Rendu Table Créances Clients ---
function renderDebtClientsTable(clientDebts) {
  const tbody = document.getElementById('debt-clients-table-body');
  if (!tbody) return;

  if (clientDebts.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="p-8 text-center text-slate-400">
          <div class="text-3xl mb-1">🎉</div>
          <div class="font-bold text-slate-600">Aucune créance client trouvée</div>
          <div class="text-xs">Toutes les créances sont soldées ou aucun filtre ne correspond.</div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = clientDebts.map(d => {
    const solde = parseFloat(d.soldeRestant) || 0;
    const initial = parseFloat(d.montantInitial) || 0;
    const regle = parseFloat(d.montantRegle) || 0;
    const dDate = new Date(d.date || d.dateCreation || Date.now());
    const dateFormatted = dDate.toLocaleDateString('fr-FR');

    const now = new Date();
    const isOverdue = d.dateEcheance && new Date(d.dateEcheance) < now && solde > 0;
    let badgeHtml = '';

    if (isOverdue || d.statut === 'EN_RETARD') {
      badgeHtml = `<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-100 text-red-900 border border-red-300">🚨 En Retard</span>`;
    } else if (solde <= 0 || d.statut === 'SOLDEE') {
      badgeHtml = `<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">✅ Soldée</span>`;
    } else if (regle > 0 || d.statut === 'PARTIEL') {
      badgeHtml = `<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">🌗 Partielle</span>`;
    } else {
      badgeHtml = `<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-50 text-rose-800 border border-rose-200">⏳ Non Réglée</span>`;
    }

    return `
      <tr class="hover:bg-sky-50/50 border-b border-slate-100 transition">
        <td class="p-3">
          <div class="font-mono font-bold text-sky-900 text-xs">${d.code || `DET-CLI-${d.id}`}</div>
          <div class="text-[11px] text-slate-500">${dateFormatted}</div>
          ${d.dateEcheance ? `<div class="text-[10px] ${isOverdue ? 'text-red-600 font-bold' : 'text-slate-400'}">Éch. ${new Date(d.dateEcheance).toLocaleDateString('fr-FR')}</div>` : ''}
        </td>
        <td class="p-3">
          <div class="font-bold text-slate-900 text-xs flex items-center gap-1.5">
            <span>${d.tierNom}</span>
            ${d.telephone ? `<a href="https://wa.me/${d.telephone.replace(/[^0-9]/g, '')}" target="_blank" class="text-emerald-600 hover:text-emerald-700" title="Contacter sur WhatsApp">💬</a>` : ''}
          </div>
          <div class="text-[11px] text-slate-500 font-mono">${d.telephone || '-'}</div>
        </td>
        <td class="p-3">
          <div class="text-xs text-slate-800 font-medium">${d.description || '-'}</div>
          ${d.reference ? `<div class="text-[10px] text-slate-500 font-mono">Réf: ${d.reference}</div>` : ''}
        </td>
        <td class="p-3 text-right font-medium text-slate-700">${formatMoney(initial)}</td>
        <td class="p-3 text-right font-bold text-emerald-700">${formatMoney(regle)}</td>
        <td class="p-3 text-right">
          <span class="text-sm font-black ${solde > 0 ? 'text-rose-700' : 'text-emerald-700'}">${formatMoney(solde)}</span>
        </td>
        <td class="p-3 text-center">${badgeHtml}</td>
        <td class="p-3 text-center space-x-1 whitespace-nowrap">
          ${solde > 0 ? `
            <button onclick="openModalReglementDette(${d.id})" class="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-lg text-xs font-bold shadow-sm transition inline-flex items-center gap-1">
              <span>💵</span> <span>Encaisser</span>
            </button>
          ` : ''}
          <button onclick="openModalFicheDette(${d.id})" class="px-2.5 py-1.5 bg-sky-100 hover:bg-sky-200 text-sky-900 rounded-lg text-xs font-bold transition inline-flex items-center gap-1" title="Voir l'historique complet et les reçus">
            <span>📜</span> <span>Fiche</span>
          </button>
          <button onclick="partagerSituationClientDirect(${d.id})" class="px-2 py-1.5 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-lg text-xs font-bold transition inline-flex items-center gap-1" title="Partager la situation par WhatsApp">
            <span>💬</span>
          </button>
          ${regle === 0 ? `
            <button onclick="supprimerDette(${d.id})" class="px-1.5 py-1.5 bg-slate-100 hover:bg-rose-100 text-slate-400 hover:text-rose-600 rounded-lg text-xs transition" title="Supprimer dette sans règlement">
              🗑️
            </button>
          ` : ''}
        </td>
      </tr>
    `;
  }).join('');
}

// --- Rendu Table Dettes Fournisseurs ---
function renderDebtSuppliersTable(supplierDebts) {
  const tbody = document.getElementById('debt-fournisseurs-table-body');
  if (!tbody) return;

  if (supplierDebts.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="p-8 text-center text-slate-400">
          <div class="text-3xl mb-1">🤝</div>
          <div class="font-bold text-slate-600">Aucune dette fournisseur trouvée</div>
          <div class="text-xs">Aucune dette fournisseur en cours ou filtres sans résultat.</div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = supplierDebts.map(d => {
    const solde = parseFloat(d.soldeRestant) || 0;
    const initial = parseFloat(d.montantInitial) || 0;
    const regle = parseFloat(d.montantRegle) || 0;
    const dDate = new Date(d.date || d.dateCreation || Date.now());
    const dateFormatted = dDate.toLocaleDateString('fr-FR');

    const now = new Date();
    const isOverdue = d.dateEcheance && new Date(d.dateEcheance) < now && solde > 0;
    let badgeHtml = '';

    if (isOverdue || d.statut === 'EN_RETARD') {
      badgeHtml = `<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-100 text-red-900 border border-red-300">🚨 En Retard</span>`;
    } else if (solde <= 0 || d.statut === 'SOLDEE') {
      badgeHtml = `<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">✅ Soldée</span>`;
    } else if (regle > 0 || d.statut === 'PARTIEL') {
      badgeHtml = `<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">🌗 Partielle</span>`;
    } else {
      badgeHtml = `<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-50 text-rose-800 border border-rose-200">⏳ Non Réglée</span>`;
    }

    return `
      <tr class="hover:bg-amber-50/50 border-b border-slate-100 transition">
        <td class="p-3">
          <div class="font-mono font-bold text-amber-900 text-xs">${d.code || `DET-FRN-${d.id}`}</div>
          <div class="text-[11px] text-slate-500">${dateFormatted}</div>
          ${d.dateEcheance ? `<div class="text-[10px] ${isOverdue ? 'text-red-600 font-bold' : 'text-slate-400'}">Éch. ${new Date(d.dateEcheance).toLocaleDateString('fr-FR')}</div>` : ''}
        </td>
        <td class="p-3">
          <div class="font-bold text-slate-900 text-xs flex items-center gap-1.5">
            <span>${d.tierNom}</span>
            ${d.telephone ? `<a href="https://wa.me/${d.telephone.replace(/[^0-9]/g, '')}" target="_blank" class="text-emerald-600 hover:text-emerald-700" title="Contacter sur WhatsApp">💬</a>` : ''}
          </div>
          <div class="text-[11px] text-slate-500 font-mono">${d.telephone || '-'}</div>
        </td>
        <td class="p-3">
          <div class="text-xs text-slate-800 font-medium">${d.description || '-'}</div>
          ${d.reference ? `<div class="text-[10px] text-slate-500 font-mono">Réf: ${d.reference}</div>` : ''}
        </td>
        <td class="p-3 text-right font-medium text-slate-700">${formatMoney(initial)}</td>
        <td class="p-3 text-right font-bold text-emerald-700">${formatMoney(regle)}</td>
        <td class="p-3 text-right">
          <span class="text-sm font-black ${solde > 0 ? 'text-amber-700' : 'text-emerald-700'}">${formatMoney(solde)}</span>
        </td>
        <td class="p-3 text-center">${badgeHtml}</td>
        <td class="p-3 text-center space-x-1 whitespace-nowrap">
          ${solde > 0 ? `
            <button onclick="openModalReglementDette(${d.id})" class="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white rounded-lg text-xs font-bold shadow-sm transition inline-flex items-center gap-1">
              <span>💵</span> <span>Régler</span>
            </button>
          ` : ''}
          <button onclick="openModalFicheDette(${d.id})" class="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold transition inline-flex items-center gap-1" title="Voir l'historique complet et les reçus">
            <span>📜</span> <span>Fiche</span>
          </button>
          <button onclick="partagerSituationClientDirect(${d.id})" class="px-2 py-1.5 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-lg text-xs font-bold transition inline-flex items-center gap-1" title="Partager le relevé par WhatsApp">
            <span>💬</span>
          </button>
          ${regle === 0 ? `
            <button onclick="supprimerDette(${d.id})" class="px-1.5 py-1.5 bg-slate-100 hover:bg-rose-100 text-slate-400 hover:text-rose-600 rounded-lg text-xs transition" title="Supprimer dette sans règlement">
              🗑️
            </button>
          ` : ''}
        </td>
      </tr>
    `;
  }).join('');
}

// --- Rendu Table Journal des Règlements ---
function renderDebtReglementsTable() {
  const tbody = document.getElementById('debt-reglements-table-body');
  if (!tbody) return;

  const reglements = (state.reglementsDettes || []).filter(r => !r.annule);

  if (reglements.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="p-8 text-center text-slate-400">
          <div class="text-3xl mb-1">📜</div>
          <div class="font-bold text-slate-600">Aucun règlement enregistré</div>
          <div class="text-xs">Les paiements et acomptes enregistrés apparaîtront ici.</div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = reglements.map(r => {
    const rDate = new Date(r.date || Date.now());
    const dateFormatted = rDate.toLocaleDateString('fr-FR') + ' à ' + rDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const isClient = r.type === 'CLIENT';

    return `
      <tr class="hover:bg-slate-50 border-b border-slate-100 text-xs">
        <td class="p-3">
          <div class="font-mono font-bold text-slate-800">${r.code || `REG-${r.id}`}</div>
          <div class="text-[11px] text-slate-500">${dateFormatted}</div>
        </td>
        <td class="p-3">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${isClient ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-900'}">
            ${isClient ? '🔵 Client' : '🟠 Fournisseur'}
          </span>
          <div class="font-mono text-[10px] text-slate-500 mt-0.5">${r.detteCode || ''}</div>
        </td>
        <td class="p-3">
          <div class="font-bold text-slate-800">${r.tierNom}</div>
          <div class="text-[11px] text-slate-500 font-mono">${r.telephone || '-'}</div>
        </td>
        <td class="p-3">
          <div class="font-medium text-slate-700">${r.modePaiement || 'ESPECES'}</div>
          ${r.reference ? `<div class="text-[10px] font-mono text-slate-500">Réf: ${r.reference}</div>` : ''}
        </td>
        <td class="p-3 text-right font-black text-emerald-700 text-sm">
          +${formatMoney(r.montant)}
        </td>
        <td class="p-3 text-right font-bold text-slate-700">
          ${formatMoney(r.nouveauSolde)}
        </td>
        <td class="p-3 text-slate-500 text-[11px]">
          ${r.auteur || 'Caisse'}
        </td>
        <td class="p-3 text-center space-x-1 whitespace-nowrap">
          <button onclick="imprimerRecuReglement(${r.id})" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-bold text-xs" title="Imprimer le reçu thermique">
            🖨️
          </button>
          <button onclick="partagerRecuReglementWhatsApp(${r.id})" class="px-2 py-1 bg-[#25D366] hover:bg-[#128C7E] text-white rounded font-bold text-xs" title="Envoyer le reçu sur WhatsApp">
            💬
          </button>
          <button onclick="annulerReglementDette(${r.id})" class="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded font-bold text-xs" title="Annuler ce règlement">
            🚫
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// --- Rendu Table Répertoire Clients ---
function renderCustomersTable() {
  const tbody = document.getElementById('customers-table-body');
  if (!tbody) return;

  const totalDettes = (state.customers || []).reduce((sum, c) => sum + (parseFloat(c.dette) || 0), 0);
  const totalDettesElem = document.getElementById('total-dettes-clients');
  if (totalDettesElem) totalDettesElem.textContent = formatMoney(totalDettes);

  tbody.innerHTML = (state.customers || []).map(c => {
    const detteVal = parseFloat(c.dette) || 0;
    return `
      <tr class="hover:bg-slate-50 border-b border-slate-100 text-xs">
        <td class="p-3 font-bold text-slate-800">${c.nom}</td>
        <td class="p-3 text-slate-600 font-mono">${c.telephone || '-'}</td>
        <td class="p-3 text-slate-600">${c.adresse || '-'}</td>
        <td class="p-3 text-right font-black ${detteVal > 0 ? 'text-amber-700' : 'text-emerald-700'}">
          ${formatMoney(detteVal)}
        </td>
        <td class="p-3 text-center space-x-1 whitespace-nowrap">
          <button onclick="openShareCustomerStatement(${c.id})" class="px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded text-xs font-bold transition" title="Envoyer le relevé de compte par WhatsApp ou SMS">
            📤 Situation
          </button>
          ${detteVal > 0 ? `
            <button onclick="openModalNouvelleDettePourClient(${c.id})" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold shadow-sm transition">
              ➕ Dette / Règlement
            </button>
          ` : `
            <span class="text-xs text-slate-400 font-medium px-1.5 py-0.5 bg-slate-100 rounded">À jour</span>
          `}
        </td>
      </tr>
    `;
  }).join('');
}

// ==========================================
// MODAL 1 : NOUVELLE DETTE (MANUELLE / ANTÉRIEURE)
// ==========================================

let nouveauTierDetteMode = false;

function openModalNouvelleDette(presetType = 'CLIENT') {
  nouveauTierDetteMode = false;
  const form = document.getElementById('form-nouvelle-dette');
  if (form) form.reset();

  setNouvelleDetteType(presetType);

  const dateInput = document.getElementById('nd-date');
  if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);

  const statusMsg = document.getElementById('nd-status-msg');
  if (statusMsg) statusMsg.textContent = '';

  calculerSoldeNouvelleDette();

  const modal = document.getElementById('modal-nouvelle-dette');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function openModalNouvelleDettePourClient(customerId) {
  openModalNouvelleDette('CLIENT');
  const select = document.getElementById('nd-tier-select');
  if (select) {
    select.value = customerId;
    onTierDetteSelectChange();
  }
}

function closeModalNouvelleDette() {
  const modal = document.getElementById('modal-nouvelle-dette');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function setNouvelleDetteType(type) {
  const typeInput = document.getElementById('nd-type');
  if (typeInput) typeInput.value = type;

  const btnCli = document.getElementById('btn-type-dette-client');
  const btnFrn = document.getElementById('btn-type-dette-fournisseur');
  const labelTier = document.getElementById('label-nd-tier');
  const labelNom = document.getElementById('label-nd-nom');

  if (type === 'CLIENT') {
    if (btnCli) {
      btnCli.className = "py-2.5 px-3 rounded-xl border-2 font-bold flex items-center justify-center gap-2 transition bg-sky-50 border-sky-600 text-sky-900 shadow-sm";
    }
    if (btnFrn) {
      btnFrn.className = "py-2.5 px-3 rounded-xl border-2 font-bold flex items-center justify-center gap-2 transition bg-slate-50 border-slate-200 text-slate-600 hover:bg-amber-50";
    }
    if (labelTier) labelTier.textContent = "Choisir le Client :";
    if (labelNom) labelNom.textContent = "Nom complet du Client * :";
  } else {
    if (btnCli) {
      btnCli.className = "py-2.5 px-3 rounded-xl border-2 font-bold flex items-center justify-center gap-2 transition bg-slate-50 border-slate-200 text-slate-600 hover:bg-sky-50";
    }
    if (btnFrn) {
      btnFrn.className = "py-2.5 px-3 rounded-xl border-2 font-bold flex items-center justify-center gap-2 transition bg-amber-50 border-amber-600 text-amber-900 shadow-sm";
    }
    if (labelTier) labelTier.textContent = "Choisir le Fournisseur :";
    if (labelNom) labelNom.textContent = "Nom / Enseigne du Fournisseur * :";
  }

  populateTierDetteDropdown();
  calculerSoldeNouvelleDette();
}

function populateTierDetteDropdown() {
  const type = document.getElementById('nd-type')?.value || 'CLIENT';
  const select = document.getElementById('nd-tier-select');
  if (!select) return;

  if (type === 'CLIENT') {
    const clients = state.customers || [];
    select.innerHTML = `
      <option value="">-- Sélectionner un client existant --</option>
      ${clients.map(c => `<option value="${c.id}">${c.nom} (${c.telephone || 'Sans tél'}) - Dette act. ${formatMoney(c.dette || 0)}</option>`).join('')}
      <option value="NEW">➕ Saisir un nouveau client non répertorié...</option>
    `;
  } else {
    const suppliers = state.suppliers || [];
    select.innerHTML = `
      <option value="">-- Sélectionner un fournisseur existant --</option>
      ${suppliers.map(s => `<option value="${s.id}">${s.nom} (${s.telephone || 'Sans tél'}) - Dette act. ${formatMoney(s.solde_dette || s.dette || 0)}</option>`).join('')}
      <option value="NEW">➕ Saisir un nouveau fournisseur non répertorié...</option>
    `;
  }
}

function toggleNouveauTierDette() {
  nouveauTierDetteMode = !nouveauTierDetteMode;
  const selectContainer = document.getElementById('nd-tier-select-container');
  const newFields = document.getElementById('nd-nouveau-tier-fields');
  const btnToggle = document.getElementById('btn-toggle-nouveau-tier');

  if (nouveauTierDetteMode) {
    if (selectContainer) selectContainer.classList.add('hidden');
    if (newFields) newFields.classList.remove('hidden');
    if (btnToggle) btnToggle.textContent = "Choisir dans la liste existante";
  } else {
    if (selectContainer) selectContainer.classList.remove('hidden');
    if (newFields) newFields.classList.add('hidden');
    if (btnToggle) btnToggle.textContent = "➕ Saisir un nouveau";
  }
}

function onTierDetteSelectChange() {
  const select = document.getElementById('nd-tier-select');
  if (!select) return;
  if (select.value === 'NEW') {
    nouveauTierDetteMode = true;
    document.getElementById('nd-tier-select-container')?.classList.add('hidden');
    document.getElementById('nd-nouveau-tier-fields')?.classList.remove('hidden');
    const btnToggle = document.getElementById('btn-toggle-nouveau-tier');
    if (btnToggle) btnToggle.textContent = "Choisir dans la liste existante";
  }
}

function calculerSoldeNouvelleDette() {
  const montantInitial = parseFloat(document.getElementById('nd-montant-initial')?.value) || 0;
  const montantDejaRegle = parseFloat(document.getElementById('nd-montant-deja-regle')?.value) || 0;

  const solde = Math.max(0, montantInitial - montantDejaRegle);
  const soldeElem = document.getElementById('nd-solde-calcule');
  if (soldeElem) soldeElem.textContent = formatMoney(solde);

  const boxInitialRegl = document.getElementById('nd-box-reglement-initial');
  if (boxInitialRegl) {
    if (montantDejaRegle > 0) {
      boxInitialRegl.classList.remove('hidden');
    } else {
      boxInitialRegl.classList.add('hidden');
    }
  }
}

let isSavingNouvelleDette = false;

async function saveNouvelleDette(event) {
  event.preventDefault();
  if (isSavingNouvelleDette) return;

  const type = document.getElementById('nd-type')?.value || 'CLIENT';
  let tierId = null;
  let tierNom = '';
  let telephone = '';
  let adresse = '';

  if (nouveauTierDetteMode) {
    tierNom = document.getElementById('nd-tier-nom')?.value.trim();
    telephone = document.getElementById('nd-telephone')?.value.trim();
    adresse = document.getElementById('nd-adresse')?.value.trim();
  } else {
    const selectVal = document.getElementById('nd-tier-select')?.value;
    if (!selectVal) {
      showToast('error', 'Tiers obligatoire', 'Veuillez sélectionner ou saisir le client ou fournisseur.');
      return;
    }
    tierId = parseInt(selectVal);
    if (type === 'CLIENT') {
      const c = (state.customers || []).find(item => item.id === tierId);
      if (c) {
        tierNom = c.nom;
        telephone = c.telephone || '';
        adresse = c.adresse || '';
      }
    } else {
      const s = (state.suppliers || []).find(item => item.id === tierId);
      if (s) {
        tierNom = s.nom;
        telephone = s.telephone || '';
        adresse = s.adresse || s.ville || '';
      }
    }
  }

  if (!tierNom) {
    showToast('error', 'Nom obligatoire', 'Veuillez renseigner le nom.');
    return;
  }

  const montantInitial = parseFloat(document.getElementById('nd-montant-initial')?.value) || 0;
  if (montantInitial <= 0) {
    showToast('error', 'Montant invalide', 'Le montant initial doit être supérieur à 0 FCFA.');
    return;
  }

  const montantDejaRegle = parseFloat(document.getElementById('nd-montant-deja-regle')?.value) || 0;
  if (montantDejaRegle > montantInitial) {
    showToast('error', 'Erreur de calcul', 'Le montant déjà réglé ne peut pas dépasser le montant initial de la dette.');
    return;
  }

  const payload = {
    type: type,
    tierId: tierId,
    tierNom: tierNom,
    telephone: telephone,
    adresse: adresse,
    date: document.getElementById('nd-date')?.value || new Date().toISOString(),
    dateEcheance: document.getElementById('nd-date-echeance')?.value || null,
    description: document.getElementById('nd-description')?.value.trim() || 'Dette manuelle',
    reference: document.getElementById('nd-reference')?.value.trim() || '',
    montantInitial: montantInitial,
    montantDejaRegle: montantDejaRegle,
    modePaiementInitial: document.getElementById('nd-mode-initial')?.value || 'ESPECES',
    referenceReglementInitial: document.getElementById('nd-ref-initial')?.value.trim() || 'Acompte initial',
    observations: document.getElementById('nd-observations')?.value.trim() || ''
  };

  const btnSubmit = document.getElementById('btn-submit-nouvelle-dette');
  const originalText = btnSubmit ? btnSubmit.innerHTML : '';

  try {
    isSavingNouvelleDette = true;
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.innerHTML = `<span class="animate-spin inline-block mr-1">⏳</span> Enregistrement...`;
    }

    const res = await fetch('/api/dettes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur lors de l'enregistrement de la dette");

    closeModalNouvelleDette();
    playBeep('success');
    showToast('success', 'Dette enregistrée !', `La dette ${data.dette.code} de ${formatMoney(payload.montantInitial)} a été enregistrée.`);
    await loadData();
    renderDettesDashboard();
  } catch (err) {
    showToast('error', 'Erreur', err.message);
  } finally {
    isSavingNouvelleDette = false;
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = originalText;
    }
  }
}

// ==========================================
// MODAL 2 : ENREGISTRER UN RÈGLEMENT (SECTION 14.C & 14.D)
// ==========================================

let targetDetteForReglement = null;
let isSubmittingReglement = false;

function openModalReglementDette(detteId) {
  const dette = (state.dettes || []).find(d => d.id === detteId);
  if (!dette) {
    showToast('error', 'Introuvable', "La dette sélectionnée n'existe plus.");
    return;
  }

  targetDetteForReglement = dette;
  const form = document.getElementById('form-reglement-dette');
  if (form) form.reset();

  document.getElementById('rd-dette-id').value = dette.id;
  document.getElementById('rd-dette-code').textContent = dette.code || `DET-${dette.id}`;
  document.getElementById('rd-dette-tier-nom').textContent = dette.tierNom;
  document.getElementById('rd-dette-tel').textContent = dette.telephone || 'Sans tél';
  document.getElementById('rd-dette-motif').textContent = dette.description || '-';
  document.getElementById('rd-dette-date').textContent = new Date(dette.date || dette.dateCreation).toLocaleDateString('fr-FR');

  const solde = parseFloat(dette.soldeRestant) || 0;
  const initial = parseFloat(dette.montantInitial) || 0;
  const regle = parseFloat(dette.montantRegle) || 0;

  document.getElementById('rd-montant-initial').textContent = formatMoney(initial);
  document.getElementById('rd-montant-deja-regle').textContent = formatMoney(regle);
  document.getElementById('rd-solde-restant').textContent = formatMoney(solde);

  const statutBadge = document.getElementById('rd-dette-statut-badge');
  if (statutBadge) {
    statutBadge.textContent = solde <= 0 ? 'Soldée' : (regle > 0 ? 'Partielle' : 'Non réglée');
    statutBadge.className = `font-bold text-xs ${solde <= 0 ? 'text-emerald-700' : 'text-amber-700'}`;
  }

  // Pré-remplir le montant avec le solde restant dû
  const inputMontant = document.getElementById('rd-montant');
  if (inputMontant) inputMontant.value = solde;

  const dateInput = document.getElementById('rd-date');
  if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);

  const modalTitle = document.getElementById('rd-modal-title');
  if (modalTitle) {
    modalTitle.textContent = dette.type === 'CLIENT' ? "Encaisser Règlement Client" : "Verser Règlement Fournisseur";
  }

  calculerNouveauSoldeReglement();

  const modal = document.getElementById('modal-reglement-dette');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function closeModalReglementDette() {
  const modal = document.getElementById('modal-reglement-dette');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function setReglementMontantRapide(fraction) {
  if (!targetDetteForReglement) return;
  const solde = parseFloat(targetDetteForReglement.soldeRestant) || 0;
  const montant = Math.round(solde * fraction);
  const input = document.getElementById('rd-montant');
  if (input) input.value = montant;
  calculerNouveauSoldeReglement();
}

function setReglementMontantFixe(val) {
  const input = document.getElementById('rd-montant');
  if (!input) return;
  const current = parseFloat(input.value) || 0;
  input.value = current + val;
  calculerNouveauSoldeReglement();
}

function calculerNouveauSoldeReglement() {
  if (!targetDetteForReglement) return;
  const soldeActuel = parseFloat(targetDetteForReglement.soldeRestant) || 0;
  const montant = parseFloat(document.getElementById('rd-montant')?.value) || 0;

  const nouveauSolde = Math.max(0, soldeActuel - montant);
  const displayElem = document.getElementById('rd-nouveau-solde');
  if (displayElem) displayElem.textContent = formatMoney(nouveauSolde);

  const tropPercuBox = document.getElementById('rd-trop-percu-box');
  const tropPercuMsg = document.getElementById('rd-trop-percu-msg');

  if (montant > soldeActuel && soldeActuel > 0) {
    if (tropPercuBox) tropPercuBox.classList.remove('hidden');
    if (tropPercuMsg) {
      const diff = montant - soldeActuel;
      tropPercuMsg.textContent = `Le montant saisi (${formatMoney(montant)}) dépasse le solde restant dû (${formatMoney(soldeActuel)}) de ${formatMoney(diff)}. Veuillez confirmer ci-dessous si vous souhaitez autoriser cette avance / trop-perçu.`;
    }
  } else {
    if (tropPercuBox) tropPercuBox.classList.add('hidden');
  }
}

async function soumettreReglementDette(event) {
  event.preventDefault();
  if (isSubmittingReglement || !targetDetteForReglement) return;

  const montant = parseFloat(document.getElementById('rd-montant')?.value) || 0;
  if (montant <= 0) {
    showToast('error', 'Montant requis', 'Le montant du règlement doit être supérieur à 0 FCFA.');
    return;
  }

  const soldeActuel = parseFloat(targetDetteForReglement.soldeRestant) || 0;
  const forcerTropPercu = document.getElementById('rd-forcer-trop-percu')?.checked || false;

  if (montant > soldeActuel && !forcerTropPercu) {
    showToast('warning', 'Trop-perçu bloqué', "Le montant dépasse le solde restant. Cochez la confirmation d'autorisation pour valider.");
    return;
  }

  const payload = {
    montant: montant,
    modePaiement: document.getElementById('rd-mode-paiement')?.value || 'ESPECES',
    reference: document.getElementById('rd-reference')?.value.trim() || '',
    date: document.getElementById('rd-date')?.value || new Date().toISOString(),
    auteur: document.getElementById('rd-auteur')?.value.trim() || 'Caisse / Gérant',
    commentaire: document.getElementById('rd-commentaire')?.value.trim() || 'Règlement de dette',
    forcerTropPercu: forcerTropPercu
  };

  const btnSubmit = document.getElementById('btn-submit-reglement');
  const originalText = btnSubmit ? btnSubmit.innerHTML : '';

  try {
    isSubmittingReglement = true;
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.innerHTML = `<span class="animate-spin inline-block mr-1">⏳</span> Validation...`;
    }

    const res = await fetch(`/api/dettes/${targetDetteForReglement.id}/reglement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message || "Erreur lors de l'enregistrement du règlement");

    closeModalReglementDette();
    playBeep('success');
    showToast('success', 'Règlement validé !', `${formatMoney(montant)} enregistrés sur la dette ${targetDetteForReglement.code}. Nouveau solde : ${formatMoney(data.dette.soldeRestant)}.`);

    await loadData();
    renderDettesDashboard();

    // Proposer l'envoi immédiat du reçu par WhatsApp / SMS
    partagerRecuReglementWhatsApp(data.reglement.id);
  } catch (err) {
    showToast('error', 'Échec du règlement', err.message);
  } finally {
    isSubmittingReglement = false;
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = originalText;
    }
  }
}

// ==========================================
// MODAL 3 : FICHE INDIVIDUELLE & HISTORIQUE (SECTION 14.E)
// ==========================================

function openModalFicheDette(detteId) {
  const dette = (state.dettes || []).find(d => d.id === detteId);
  if (!dette) {
    showToast('error', 'Introuvable', "La dette sélectionnée n'existe plus.");
    return;
  }

  state.currentFicheDetteId = detteId;

  document.getElementById('fd-code').textContent = dette.code || `DET-${dette.id}`;
  document.getElementById('fd-tier-nom').textContent = dette.tierNom;
  document.getElementById('fd-tier-tel').textContent = dette.telephone || 'Non renseigné';
  document.getElementById('fd-motif').textContent = dette.description || '-';
  document.getElementById('fd-reference').textContent = dette.reference ? `Réf: ${dette.reference}` : '';
  document.getElementById('fd-date-creation').textContent = new Date(dette.date || dette.dateCreation).toLocaleDateString('fr-FR');

  const waLink = document.getElementById('fd-tier-whatsapp');
  if (waLink) {
    if (dette.telephone) {
      waLink.href = `https://wa.me/${dette.telephone.replace(/[^0-9]/g, '')}`;
      waLink.classList.remove('hidden');
    } else {
      waLink.classList.add('hidden');
    }
  }

  const typeBadge = document.getElementById('fd-type-badge');
  if (typeBadge) {
    if (dette.type === 'CLIENT') {
      typeBadge.textContent = "🔵 Créance Client";
      typeBadge.className = "text-xs font-bold px-2.5 py-1 rounded-lg bg-sky-100 text-sky-900 border border-sky-300";
    } else {
      typeBadge.textContent = "🟠 Dette Fournisseur";
      typeBadge.className = "text-xs font-bold px-2.5 py-1 rounded-lg bg-amber-100 text-amber-950 border border-amber-300";
    }
  }

  const solde = parseFloat(dette.soldeRestant) || 0;
  const initial = parseFloat(dette.montantInitial) || 0;
  const regle = parseFloat(dette.montantRegle) || 0;

  const now = new Date();
  const isOverdue = dette.dateEcheance && new Date(dette.dateEcheance) < now && solde > 0;
  const statutBadge = document.getElementById('fd-statut-badge');
  if (statutBadge) {
    if (isOverdue || dette.statut === 'EN_RETARD') {
      statutBadge.textContent = "🚨 En retard";
      statutBadge.className = "text-xs font-bold px-2.5 py-1 rounded-lg bg-red-100 text-red-900 border border-red-300";
    } else if (solde <= 0 || dette.statut === 'SOLDEE') {
      statutBadge.textContent = "✅ Soldée";
      statutBadge.className = "text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-300";
    } else if (regle > 0 || dette.statut === 'PARTIEL') {
      statutBadge.textContent = "🌗 Partielle";
      statutBadge.className = "text-xs font-bold px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 border border-amber-300";
    } else {
      statutBadge.textContent = "⏳ Non réglée";
      statutBadge.className = "text-xs font-bold px-2.5 py-1 rounded-lg bg-rose-50 text-rose-800 border border-rose-200";
    }
  }

  // Barre de progression
  const pct = initial > 0 ? Math.min(100, Math.round((regle / initial) * 100)) : 100;
  const pctElem = document.getElementById('fd-progression-pct');
  if (pctElem) pctElem.textContent = `${pct}% réglé`;
  const barElem = document.getElementById('fd-progression-bar');
  if (barElem) barElem.style.width = `${pct}%`;

  document.getElementById('fd-montant-initial').textContent = formatMoney(initial);
  document.getElementById('fd-total-regle').textContent = formatMoney(regle);
  document.getElementById('fd-solde-restant').textContent = formatMoney(solde);

  const obsElem = document.getElementById('fd-observations');
  if (obsElem) obsElem.textContent = dette.observations || 'Aucune observation enregistrée.';

  // Bouton Ajouter un Règlement depuis la fiche
  const btnAjouter = document.getElementById('fd-btn-ajouter-reglement');
  if (btnAjouter) {
    if (solde <= 0) {
      btnAjouter.classList.add('hidden');
    } else {
      btnAjouter.classList.remove('hidden');
    }
  }

  // Liste chronologique des règlements sur cette dette
  const reglements = (state.reglementsDettes || []).filter(r => r.detteId === dette.id && !r.annule);
  document.getElementById('fd-reglements-count').textContent = reglements.length;

  const tbody = document.getElementById('fd-table-reglements-body');
  if (tbody) {
    if (reglements.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="p-4 text-center text-slate-400 text-xs">
            Aucun versement n'a encore été enregistré sur cette dette.
          </td>
        </tr>
      `;
    } else {
      tbody.innerHTML = reglements.map(r => {
        const rDate = new Date(r.date || Date.now());
        const dStr = rDate.toLocaleDateString('fr-FR') + ' ' + rDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        return `
          <tr class="hover:bg-slate-50 border-b border-slate-100 text-xs">
            <td class="p-2.5">
              <div class="font-mono font-bold text-slate-800">${r.code || `REG-${r.id}`}</div>
              <div class="text-[11px] text-slate-500">${dStr}</div>
            </td>
            <td class="p-2.5">
              <span class="font-medium">${r.modePaiement || 'ESPECES'}</span>
              ${r.reference ? `<div class="text-[10px] text-slate-500 font-mono">Réf: ${r.reference}</div>` : ''}
            </td>
            <td class="p-2.5 text-right font-black text-emerald-700">
              +${formatMoney(r.montant)}
            </td>
            <td class="p-2.5 text-right font-bold text-slate-700">
              ${formatMoney(r.nouveauSolde)}
            </td>
            <td class="p-2.5 text-slate-500 text-[11px]">
              ${r.auteur || 'Caisse'}
            </td>
            <td class="p-2.5 text-center space-x-1 whitespace-nowrap">
              <button onclick="imprimerRecuReglement(${r.id})" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-bold text-xs" title="Imprimer le reçu thermique">
                🖨️
              </button>
              <button onclick="partagerRecuReglementWhatsApp(${r.id})" class="px-2 py-1 bg-[#25D366] hover:bg-[#128C7E] text-white rounded font-bold text-xs" title="WhatsApp">
                💬
              </button>
              <button onclick="annulerReglementDette(${r.id})" class="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded font-bold text-xs" title="Annuler ce versement">
                🚫
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  const modal = document.getElementById('modal-fiche-dette');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function closeModalFicheDette() {
  state.currentFicheDetteId = null;
  const modal = document.getElementById('modal-fiche-dette');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function openReglementFromFiche() {
  if (!state.currentFicheDetteId) return;
  const detteId = state.currentFicheDetteId;
  closeModalFicheDette();
  openModalReglementDette(detteId);
}

async function annulerReglementDette(regId) {
  const motif = prompt("⚠️ Confirmation requise : Veuillez renseigner le motif d'annulation de ce règlement :", "Erreur de saisie / Chèque sans provision");
  if (motif === null) return; // Annulé par l'utilisateur

  try {
    const res = await fetch(`/api/dettes/reglements/${regId}/annuler`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motif: motif.trim() || 'Annulation manuelle' })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur lors de l'annulation du règlement");

    showToast('info', 'Règlement annulé', "Le règlement a été annulé et le solde de la dette a été restauré.");
    await loadData();
    renderDettesDashboard();

    if (state.currentFicheDetteId) {
      openModalFicheDette(state.currentFicheDetteId);
    }
  } catch (err) {
    showToast('error', 'Erreur', err.message);
  }
}

async function supprimerDette(detteId) {
  const dette = (state.dettes || []).find(d => d.id === detteId);
  if (!dette) return;

  if (!confirm(`⚠️ Attention : Voulez-vous vraiment supprimer la dette "${dette.code}" de ${formatMoney(dette.montantInitial)} concernant "${dette.tierNom}" ?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/dettes/${detteId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur de suppression");

    showToast('success', 'Dette supprimée', `La dette ${dette.code} a été supprimée.`);
    await loadData();
    renderDettesDashboard();
  } catch (err) {
    showToast('error', 'Impossible de supprimer', err.message);
  }
}

// --- Impression de Reçus Thermiques & Attestations ---
function imprimerAttestationDette(detteId = null) {
  const id = detteId || state.currentFicheDetteId;
  const dette = (state.dettes || []).find(d => d.id === id);
  if (!dette) return;

  const reglements = (state.reglementsDettes || []).filter(r => r.detteId === dette.id && !r.annule);
  const now = new Date();
  const dateFormatted = now.toLocaleDateString('fr-FR') + ' ' + now.toLocaleTimeString('fr-FR');

  const printArea = document.getElementById('receipt-print-area');
  if (!printArea) return;

  const reglementsRows = reglements.map(r => `
    <tr>
      <td style="padding: 2px 0;">${new Date(r.date).toLocaleDateString('fr-FR')}<br><small>${r.modePaiement} ${r.reference ? `(${r.reference})` : ''}</small></td>
      <td style="text-align: right; vertical-align: top; font-weight: bold; color: green;">+${formatMoney(r.montant)}</td>
    </tr>
  `).join('');

  printArea.innerHTML = `
    <div style="text-align: center; margin-bottom: 8px;">
      <h2 style="font-size: 14px; font-weight: bold; margin: 0;">${state.settings.shop_name}</h2>
      <p style="margin: 2px 0; font-size: 10px;">${state.settings.shop_address}</p>
      <p style="margin: 2px 0; font-size: 10px;">Tél: ${state.settings.shop_phone}</p>
      <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>
      <h3 style="font-size: 12px; font-weight: bold; margin: 2px 0;">ATTESTATION DE CRÉANCE / DETTE</h3>
      <p style="margin: 2px 0; font-weight: bold;">RÉF : ${dette.code}</p>
      <p style="margin: 2px 0; font-size: 10px;">Date d'édition : ${dateFormatted}</p>
      <p style="margin: 2px 0; font-size: 11px;"><strong>${dette.type === 'CLIENT' ? 'Client' : 'Fournisseur'} :</strong> ${dette.tierNom}</p>
      <p style="margin: 2px 0; font-size: 10px;">Tél : ${dette.telephone || '-'}</p>
      <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>
    </div>

    <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 6px;">
      <tr><td>Montant Initial :</td><td style="text-align: right; font-weight: bold;">${formatMoney(dette.montantInitial)}</td></tr>
      <tr><td>Total Règlements :</td><td style="text-align: right; font-weight: bold; color: green;">-${formatMoney(dette.montantRegle)}</td></tr>
      <tr style="border-top: 1px solid #000;"><td style="font-size: 12px; font-weight: bold;">SOLDE RESTANT DÛ :</td><td style="text-align: right; font-size: 13px; font-weight: bold;">${formatMoney(dette.soldeRestant)}</td></tr>
    </table>

    ${reglements.length > 0 ? `
      <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>
      <p style="margin: 2px 0; font-size: 10px; font-weight: bold;">HISTORIQUE DES VERSEMENTS :</p>
      <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
        ${reglementsRows}
      </table>
    ` : ''}

    <div style="border-top: 1px dashed #000; margin: 8px 0;"></div>
    <div style="text-align: center; font-size: 9px;">
      <p style="margin: 2px 0;">Statut actuel : <strong>${dette.soldeRestant <= 0 ? 'TOTALEMENT SOLDÉ' : 'EN COURS DE RÈGLEMENT'}</strong></p>
      <p style="margin: 2px 0;">${state.settings.receipt_footer}</p>
    </div>
  `;

  window.print();
}

function imprimerRecuReglement(regId) {
  const reg = (state.reglementsDettes || []).find(r => r.id === regId);
  if (!reg) return;

  const dette = (state.dettes || []).find(d => d.id === reg.detteId) || { code: reg.detteCode || '', type: reg.type };
  const now = new Date(reg.date || Date.now());
  const dateFormatted = now.toLocaleDateString('fr-FR') + ' ' + now.toLocaleTimeString('fr-FR');

  const printArea = document.getElementById('receipt-print-area');
  if (!printArea) return;

  printArea.innerHTML = `
    <div style="text-align: center; margin-bottom: 8px;">
      <h2 style="font-size: 14px; font-weight: bold; margin: 0;">${state.settings.shop_name}</h2>
      <p style="margin: 2px 0; font-size: 10px;">${state.settings.shop_address}</p>
      <p style="margin: 2px 0; font-size: 10px;">Tél: ${state.settings.shop_phone}</p>
      <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>
      <h3 style="font-size: 12px; font-weight: bold; margin: 2px 0;">REÇU DE RÈGLEMENT</h3>
      <p style="margin: 2px 0; font-weight: bold;">REÇU N° : ${reg.code}</p>
      <p style="margin: 2px 0; font-size: 10px;">Dette réf : ${dette.code}</p>
      <p style="margin: 2px 0; font-size: 10px;">Date : ${dateFormatted}</p>
      <p style="margin: 2px 0; font-size: 11px;"><strong>${reg.type === 'CLIENT' ? 'Client' : 'Fournisseur'} :</strong> ${reg.tierNom}</p>
      <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>
    </div>

    <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 6px;">
      <tr><td>Mode de paiement :</td><td style="text-align: right; font-weight: bold;">${reg.modePaiement}</td></tr>
      ${reg.reference ? `<tr><td>Réf. transaction :</td><td style="text-align: right; font-family: monospace;">${reg.reference}</td></tr>` : ''}
      <tr style="border-top: 1px solid #000; border-bottom: 1px solid #000;">
        <td style="font-size: 13px; font-weight: bold; padding: 4px 0;">MONTANT ENCAISSÉ :</td>
        <td style="text-align: right; font-size: 14px; font-weight: bold; padding: 4px 0;">${formatMoney(reg.montant)}</td>
      </tr>
      <tr><td>Ancien solde dû :</td><td style="text-align: right;">${formatMoney(reg.ancienSolde)}</td></tr>
      <tr><td style="font-weight: bold;">NOUVEAU SOLDE DÛ :</td><td style="text-align: right; font-weight: bold;">${formatMoney(reg.nouveauSolde)}</td></tr>
    </table>

    <div style="border-top: 1px dashed #000; margin: 8px 0;"></div>
    <div style="text-align: center; font-size: 9px;">
      <p style="margin: 2px 0;">Opérateur : ${reg.auteur || 'Caisse'}</p>
      <p style="margin: 2px 0;">${reg.nouveauSolde <= 0 ? '🎉 COMPTE ENTIÈREMENT SOLDÉ. MERCI !' : 'Merci pour votre règlement.'}</p>
      <p style="margin: 2px 0;">${state.settings.receipt_footer}</p>
    </div>
  `;

  window.print();
}

// --- Partage WhatsApp & SMS des Fiches et Reçus de Dette ---
function partagerSituationClientDirect(detteId) {
  const dette = (state.dettes || []).find(d => d.id === detteId);
  if (!dette) return;

  const reglements = (state.reglementsDettes || []).filter(r => r.detteId === dette.id && !r.annule);
  const shopName = (state.settings && state.settings.shop_name) || "MIAKIARA";
  const shopAddress = (state.settings && state.settings.shop_address) || "Grand Marché Tsévié";
  const shopPhone = (state.settings && state.settings.shop_phone) || "+228 90 33 33 28";
  const now = new Date();
  const dateFormatted = now.toLocaleDateString('fr-FR');

  let msg = `📑 *${shopName.toUpperCase()} - SITUATION DE CRÉANCE*
📍 ${shopAddress}
📞 Contact Boutique : ${shopPhone}
───────────────────────
👤 *${dette.type === 'CLIENT' ? 'Client' : 'Fournisseur'} :* ${dette.tierNom}
📱 *Téléphone :* ${dette.telephone || 'Non renseigné'}
📅 *Date :* ${dateFormatted}
📋 *Référence Dette :* ${dette.code}
📝 *Motif :* ${dette.description || 'Vente de sachets'}
───────────────────────
💰 *Montant Initial :* ${formatMoney(dette.montantInitial)}
✅ *Total déjà réglé :* -${formatMoney(dette.montantRegle)}\n`;

  if (dette.soldeRestant > 0) {
    msg += `👉 *SOLDE RESTANT DÛ : ${formatMoney(dette.soldeRestant)}*\n`;
    if (dette.dateEcheance) {
      msg += `⏰ *Date d'échéance convenue :* ${new Date(dette.dateEcheance).toLocaleDateString('fr-FR')}\n`;
    }
  } else {
    msg += `🎉 *CETTE CRÉANCE EST INTÉGRALEMENT SOLDÉE (0 FCFA) !*\n`;
  }

  if (reglements.length > 0) {
    msg += `───────────────────────\n*DERNIERS VERSEMENTS REÇUS :*\n`;
    reglements.slice(0, 4).forEach(r => {
      msg += `• ${new Date(r.date).toLocaleDateString('fr-FR')} : +${formatMoney(r.montant)} (${r.modePaiement})\n`;
    });
  }

  msg += `───────────────────────\n🙏 _Merci pour votre fidélité et votre collaboration !_`;

  openShareModal({
    type: 'dette',
    icon: '📑',
    title: `Situation Créance ${dette.code}`,
    subtitle: `Compte de ${dette.tierNom}`,
    recipientLabel: dette.type === 'CLIENT' ? 'Client :' : 'Fournisseur :',
    recipientName: dette.tierNom,
    phone: dette.telephone || '',
    messageText: msg
  });
}

function partagerSituationFicheWhatsApp() {
  if (!state.currentFicheDetteId) return;
  partagerSituationClientDirect(state.currentFicheDetteId);
}

function partagerRecuReglementWhatsApp(regId) {
  const reg = (state.reglementsDettes || []).find(r => r.id === regId);
  if (!reg) return;

  const shopName = (state.settings && state.settings.shop_name) || "MIAKIARA";
  const shopPhone = (state.settings && state.settings.shop_phone) || "+228 90 33 33 28";
  const now = new Date(reg.date || Date.now());
  const dateStr = now.toLocaleDateString('fr-FR') + ' à ' + now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  let msg = `✅ *${shopName.toUpperCase()} - REÇU DE RÈGLEMENT*
📞 Caisse : ${shopPhone}
───────────────────────
👤 *${reg.type === 'CLIENT' ? 'Client' : 'Fournisseur'} :* ${reg.tierNom}
🧾 *Reçu N° :* ${reg.code}
📅 *Date :* ${dateStr}
───────────────────────
💵 *MONTANT ENCAISSÉ : ${formatMoney(reg.montant)}*
💳 *Mode de paiement :* ${reg.modePaiement}
${reg.reference ? `🔖 *Réf transaction :* ${reg.reference}\n` : ''}───────────────────────
📊 *SOLDE ACTUALISÉ :*
• Solde précédent : ${formatMoney(reg.ancienSolde)}
• Déduction versement : -${formatMoney(reg.montant)}\n`;

  if (reg.nouveauSolde > 0) {
    msg += `👉 *RESTE À PAYER : ${formatMoney(reg.nouveauSolde)}*\n`;
  } else {
    msg += `🎉 *FÉLICITATIONS : VOTRE DETTE EST ENTIÈREMENT SOLDÉE (0 FCFA) !*\n`;
  }

  msg += `───────────────────────\n🙏 _Paiement bien validé par la caisse. Merci pour votre confiance !_`;

  openShareModal({
    type: 'reglement',
    icon: '✅',
    title: `Reçu de Règlement ${reg.code}`,
    subtitle: `Versement de ${formatMoney(reg.montant)}`,
    recipientLabel: reg.type === 'CLIENT' ? 'Client :' : 'Fournisseur :',
    recipientName: reg.tierNom,
    phone: reg.telephone || '',
    messageText: msg
  });
}

// --- Fonctions Client (Ajout / Consultation) ---
function openModalAddCustomer() {
  const nomInput = document.getElementById('cust-nom');
  if (nomInput) nomInput.value = '';
  const telInput = document.getElementById('cust-tel');
  if (telInput) telInput.value = '';
  const adrInput = document.getElementById('cust-adresse');
  if (adrInput) adrInput.value = '';
  const modal = document.getElementById('modal-customer');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function closeModalCustomer() {
  const modal = document.getElementById('modal-customer');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

async function saveCustomer() {
  const nom = document.getElementById('cust-nom')?.value.trim();
  if (!nom) return alert("Le nom est obligatoire");

  const newCust = {
    nom: nom,
    telephone: document.getElementById('cust-tel')?.value.trim() || '',
    adresse: document.getElementById('cust-adresse')?.value.trim() || '',
    dette: 0
  };

  try {
    const res = await fetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCust)
    });
    if (!res.ok) throw new Error("Erreur d'ajout client");
    closeModalCustomer();
    showToast('success', 'Client ajouté !', `Le client "${newCust.nom}" a été enregistré.`);
    await loadData();
    renderDettesDashboard();
  } catch (err) {
    alert("Impossible d'ajouter le client : " + err.message);
  }
}

// Compatibilité descendante règlement ancien client
function openModalPayDebt(customerId) {
  // Rediriger vers la première dette non soldée du client s'il en a une, sinon ouvrir Nouvelle Dette
  const clientDebts = (state.dettes || []).filter(d => d.tierId === customerId && d.type === 'CLIENT' && (parseFloat(d.soldeRestant) || 0) > 0 && !d.annulee);
  if (clientDebts.length > 0) {
    openModalReglementDette(clientDebts[0].id);
  } else {
    openModalNouvelleDettePourClient(customerId);
  }
}

function closeModalPayDebt() {
  closeModalReglementDette();
}

// ==========================================
// 4. MODULE CLÔTURE DE CAISSE (RAPPORT Z)
// ==========================================

function renderZReports() {
  const totalCA = state.sales.reduce((sum, s) => sum + (parseFloat(s.totalNet) || 0), 0);
  const totalEspeces = state.sales
    .filter(s => s.modePaiement === 'ESPECES')
    .reduce((sum, s) => sum + (parseFloat(s.totalNet) || 0), 0);
  const totalMomo = state.sales
    .filter(s => s.modePaiement === 'MOBILE_MONEY')
    .reduce((sum, s) => sum + (parseFloat(s.totalNet) || 0), 0);
  const totalCredit = state.sales
    .filter(s => s.modePaiement === 'CREDIT' || (s.montantRestant && s.montantRestant > 0))
    .reduce((sum, s) => sum + (parseFloat(s.montantRestant || s.totalNet) || 0), 0);

  const totalGros = state.sales
    .filter(s => s.modeVente === 'GROS' || !s.modeVente)
    .reduce((sum, s) => sum + (parseFloat(s.totalNet) || 0), 0);

  const totalDetail = state.sales
    .filter(s => s.modeVente === 'DETAIL')
    .reduce((sum, s) => sum + (parseFloat(s.totalNet) || 0), 0);

  const caElem = document.getElementById('z-total-ca');
  if (caElem) caElem.textContent = formatMoney(totalCA);

  const espElem = document.getElementById('z-total-especes');
  if (espElem) espElem.textContent = formatMoney(totalEspeces);

  const momoElem = document.getElementById('z-total-momo');
  if (momoElem) momoElem.textContent = formatMoney(totalMomo);

  const credElem = document.getElementById('z-total-credit');
  if (credElem) credElem.textContent = formatMoney(totalCredit);

  // Marge Brute Réelle Calculée
  let totalCoutAchat = 0;
  state.sales.forEach(s => {
    (s.items || []).forEach(it => {
      const prod = state.products.find(p => p.id === it.productId);
      const coutU = it.coutAchatUnitaire !== undefined 
        ? parseFloat(it.coutAchatUnitaire)
        : (prod && prod.prix_achat ? parseFloat(prod.prix_achat) : (parseFloat(it.prix) * 0.85));
      totalCoutAchat += (coutU * (parseFloat(it.quantite) || 0));
    });
  });

  const margeReelle = Math.max(0, totalCA - totalCoutAchat);
  const tauxMargeGlobal = totalCoutAchat > 0 ? ((margeReelle / totalCoutAchat) * 100) : 0;
  
  const elemMarge = document.getElementById('z-total-marge');
  if (elemMarge) {
    elemMarge.textContent = `${formatMoney(margeReelle)} (${tauxMargeGlobal.toFixed(1)}%)`;
  }

  const badgeElem = document.getElementById('sales-count-badge');
  if (badgeElem) {
    badgeElem.textContent = `${state.sales.length} tickets (${formatMoney(totalGros)} en Gros / ${formatMoney(totalDetail)} au Détail)`;
  }

  const tbody = document.getElementById('sales-table-body');
  if (!tbody) return;

  if (state.sales.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-400">Aucune vente enregistrée pour le moment.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.sales.map(s => {
    const dt = new Date(s.date);
    const dateStr = dt.toLocaleDateString('fr-FR') + ' ' + dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const itemsCount = (s.items || []).reduce((sum, i) => sum + (parseFloat(i.quantite) || 0), 0);
    const isGros = s.modeVente === 'GROS' || !s.modeVente;

    // Calcul de la marge du ticket
    let coutTicket = 0;
    (s.items || []).forEach(it => {
      const prod = state.products.find(p => p.id === it.productId);
      const coutU = it.coutAchatUnitaire !== undefined 
        ? parseFloat(it.coutAchatUnitaire)
        : (prod && prod.prix_achat ? parseFloat(prod.prix_achat) : (parseFloat(it.prix) * 0.85));
      coutTicket += (coutU * (parseFloat(it.quantite) || 0));
    });
    const margeTicket = Math.max(0, (parseFloat(s.totalNet) || 0) - coutTicket);

    return `
      <tr class="hover:bg-slate-50 border-b border-slate-100">
        <td class="p-2.5 font-bold text-sky-800">
          <div>${s.ticketCode}</div>
          <div class="text-[10px] text-slate-400 font-normal">${dateStr}</div>
        </td>
        <td class="p-2.5 font-semibold text-slate-800">${s.clientNom}</td>
        <td class="p-2.5 text-center">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${isGros ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'}">
            ${isGros ? 'GROS' : 'DÉTAIL'}
          </span>
        </td>
        <td class="p-2.5 text-slate-600">${itemsCount} Adaka</td>
        <td class="p-2.5 font-medium">
          <span class="px-2 py-0.5 rounded text-[10px] bg-slate-100">${s.modePaiement}</span>
        </td>
        <td class="p-2.5 text-right font-black text-slate-800">
          <div>${formatMoney(s.totalNet)}</div>
          <div class="text-[10px] text-emerald-700 font-bold">+${formatMoney(margeTicket)} marge</div>
        </td>
        <td class="p-2.5 text-center space-x-1 whitespace-nowrap">
          <button onclick='printThermalReceipt(${JSON.stringify(s)})' class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-bold" title="Réimprimer Ticket de Caisse">
            🖨️
          </button>
          <button onclick='openShareSaleReceipt("${s.ticketCode}")' class="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded text-xs font-bold transition" title="Envoyer par WhatsApp ou SMS">
            💬
          </button>
          <button onclick='annulerVente(${s.id})' class="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-xs font-bold transition" title="Annuler cette vente et rétablir le stock">
            ↩️ Annuler
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

async function annulerVente(saleId) {
  const sale = state.sales.find(s => s.id === saleId);
  const ticket = sale ? sale.ticketCode : `#${saleId}`;
  if (!confirm(`⚠️ Attention : Voulez-vous vraiment annuler la vente ${ticket} ?\nLe stock sera automatiquement remis en rayon et la dette du client (si vente à crédit) sera déduite.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/sales/${saleId}/cancel`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur lors de l'annulation");

    playBeep('success');
    showToast('success', 'Vente annulée', `Le ticket ${ticket} a été annulé avec succès.`);
    await loadData();
    renderZReports();
  } catch (err) {
    showToast('error', 'Erreur annulation', err.message);
  }
}

// --- MODAL JOURNAL DES MOUVEMENTS DE STOCK (AUDIT ET RENTABILITÉ 9 COLONNES) ---
function openModalStockJournal() {
  filtrerJournalMouvements();
  const modal = document.getElementById('modal-stock-journal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function closeModalStockJournal() {
  const modal = document.getElementById('modal-stock-journal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function filtrerJournalMouvements() {
  const tbody = document.getElementById('stock-journal-table-body');
  if (!tbody) return;

  const filterText = (document.getElementById('filter-stock-journal')?.value || '').toLowerCase().trim();
  const movements = state.stockMovements || [];

  const filtered = movements.filter(m => {
    if (!filterText) return true;
    const txt = `${m.productName || ''} ${m.type || ''} ${m.modeVente || ''} ${m.motif || ''}`.toLowerCase();
    return txt.includes(filterText);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="p-6 text-center text-slate-400">Aucun mouvement trouvé.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(m => {
    const dt = new Date(m.date);
    const dateStr = dt.toLocaleDateString('fr-FR') + ' ' + dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    let typeBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">${m.type}</span>`;
    if (m.type === 'ENTREE') {
      typeBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">ENTRÉE</span>`;
    } else if (m.type === 'VENTE') {
      const mode = m.modeVente || (m.quantiteAdaka < 1 ? 'DETAIL' : 'GROS');
      const modeColor = mode === 'GROS' ? 'bg-sky-100 text-sky-800' : (mode === 'DETAIL_MONTANT' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800');
      typeBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold ${modeColor}">VENTE (${mode})</span>`;
    } else if (m.type === 'SORTIE' || m.type === 'PERTE') {
      typeBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">${m.type}</span>`;
    }

    const qteUnits = m.quantiteUnites !== undefined ? m.quantiteUnites : Math.round((m.quantite || 0) * 20);
    const qteAdaka = m.quantiteAdaka !== undefined ? m.quantiteAdaka : (m.quantite || 0);

    const montant = m.montantVente !== undefined ? formatMoney(m.montantVente) : '-';
    const cout = m.coutAchat !== undefined ? formatMoney(m.coutAchat) : '-';
    let marge = '-';
    if (m.margeBrute !== undefined) {
      const mVal = parseFloat(m.margeBrute) || 0;
      marge = `<span class="font-bold ${mVal >= 0 ? 'text-emerald-700' : 'text-rose-700'}">${mVal >= 0 ? '+' : ''}${formatMoney(mVal)}</span>`;
    }

    const avantUnits = m.ancienStockUnites !== undefined ? `${m.ancienStockUnites} u` : `${m.ancienStock || 0} Ad.`;
    const apresUnits = m.nouveauStockUnites !== undefined ? `${m.nouveauStockUnites} u` : `${m.nouveauStock || 0} Ad.`;

    return `
      <tr class="hover:bg-slate-50 border-b border-slate-100">
        <td class="p-2 text-slate-500 whitespace-nowrap text-[11px]">${dateStr}</td>
        <td class="p-2 font-bold text-slate-800">${m.productName || 'Article'}</td>
        <td class="p-2 text-center">${typeBadge}</td>
        <td class="p-2 text-center font-bold text-slate-800">
          <div>${qteUnits} u</div>
          <div class="text-[10px] text-slate-400 font-normal">(${qteAdaka} Adaka)</div>
        </td>
        <td class="p-2 text-right font-medium text-slate-700">${montant}</td>
        <td class="p-2 text-right text-slate-500">${cout}</td>
        <td class="p-2 text-right">${marge}</td>
        <td class="p-2 text-center text-slate-600 font-medium text-[11px]">
          <span>${avantUnits}</span> ➔ <strong class="text-sky-900">${apresUnits}</strong>
        </td>
        <td class="p-2 text-slate-600 text-[11px]">${m.motif || '-'}</td>
      </tr>
    `;
  }).join('');
}

function printZReport() {
  const printArea = document.getElementById('receipt-print-area');
  const now = new Date();
  const dateFormatted = now.toLocaleDateString('fr-FR') + ' ' + now.toLocaleTimeString('fr-FR');

  const totalCA = state.sales.reduce((sum, s) => sum + (parseFloat(s.totalNet) || 0), 0);
  const totalEspeces = state.sales
    .filter(s => s.modePaiement === 'ESPECES')
    .reduce((sum, s) => sum + (parseFloat(s.totalNet) || 0), 0);
  const totalMomo = state.sales
    .filter(s => s.modePaiement === 'MOBILE_MONEY')
    .reduce((sum, s) => sum + (parseFloat(s.totalNet) || 0), 0);
  const totalCredit = state.sales
    .filter(s => s.modePaiement === 'CREDIT' || (s.montantRestant && s.montantRestant > 0))
    .reduce((sum, s) => sum + (parseFloat(s.montantRestant || s.totalNet) || 0), 0);

  printArea.innerHTML = `
    <div style="text-align: center; margin-bottom: 8px;">
      <h2 style="font-size: 14px; font-weight: bold; margin: 0;">${state.settings.shop_name}</h2>
      <h3 style="font-size: 12px; margin: 2px 0;">CLÔTURE DE CAISSE (RAPPORT Z)</h3>
      <p style="margin: 2px 0; font-size: 10px;">Date : ${dateFormatted}</p>
      <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>
    </div>

    <div style="font-size: 11px; space-y: 4px;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
        <span>Nombre de Ventes :</span>
        <span style="font-weight: bold;">${state.sales.length}</span>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
        <span>Total Espèces en Caisse :</span>
        <span style="font-weight: bold;">${formatMoney(totalEspeces)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
        <span>Total Mobile Money :</span>
        <span style="font-weight: bold;">${formatMoney(totalMomo)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
        <span>Total Ventes à Crédit :</span>
        <span style="font-weight: bold;">${formatMoney(totalCredit)}</span>
      </div>
      <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>
      <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: bold;">
        <span>CHIFFRE D'AFFAIRES TOTAL :</span>
        <span>${formatMoney(totalCA)}</span>
      </div>
    </div>

    <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>
    <div style="text-align: center; font-size: 9px;">
      Signature Responsable Caisse : ____________________
    </div>
  `;

  window.print();
}

// ==========================================
// 5. PARAMÈTRES & RESTAURATION
// ==========================================

function loadSettingsForm() {
  document.getElementById('param-shop-name').value = state.settings.shop_name || '';
  document.getElementById('param-shop-phone').value = state.settings.shop_phone || '';
  document.getElementById('param-shop-address').value = state.settings.shop_address || '';
  document.getElementById('param-receipt-footer').value = state.settings.receipt_footer || '';

  const badgePin = document.getElementById('badge-current-pin');
  if (badgePin) badgePin.textContent = `Code Actuel : ${getCodePIN()}`;
}

async function saveShopSettings() {
  const newSettings = {
    shop_name: document.getElementById('param-shop-name').value.trim(),
    shop_phone: document.getElementById('param-shop-phone').value.trim(),
    shop_address: document.getElementById('param-shop-address').value.trim(),
    receipt_footer: document.getElementById('param-receipt-footer').value.trim()
  };

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSettings)
    });
    if (!res.ok) throw new Error("Erreur sauvegarde paramètres");
    await loadData();
    alert("✅ Paramètres enregistrés avec succès !");
  } catch (err) {
    alert("Erreur lors de la sauvegarde.");
  }
}

async function resetToDemoExcel() {
  if (!confirm("⚠️ Attention : Vous allez réinitialiser la base de données avec les 55 articles d'origine de votre fichier Excel. Continuer ?")) return;

  try {
    const res = await fetch('/api/reset', { method: 'POST' });
    if (!res.ok) throw new Error("Erreur réinitialisation");
    await loadData();
    alert("✅ Base réinitialisée avec succès aux 55 articles de départ !");
  } catch (err) {
    alert("Erreur lors de la réinitialisation.");
  }
}

// ==========================================
// 6. MODULE ACCÈS MOBILE & MONDIAL (SMARTPHONE)
// ==========================================
let cachedNetworkInfo = null;

async function openModalMobileAccess() {
  const modal = document.getElementById('modal-mobile-access');
  if (!modal) return;

  try {
    const res = await fetch('/api/network-info');
    if (res.ok) {
      cachedNetworkInfo = await res.json();
      
      // Wi-Fi Local URL
      const localUrl = cachedNetworkInfo.localUrl || `http://${window.location.hostname}:3000`;
      const textWifi = document.getElementById('text-local-wifi-url');
      if (textWifi) textWifi.textContent = localUrl;

      // QR Code Wi-Fi dynamique
      const qrWifi = document.getElementById('qr-image-wifi');
      if (qrWifi) {
        qrWifi.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(localUrl)}`;
      }

      // Tailscale IP
      const tsIp = document.getElementById('text-tailscale-ip');
      if (tsIp && cachedNetworkInfo.tailscaleIp) {
        tsIp.textContent = cachedNetworkInfo.tailscaleIp;
      }

      // Si le tunnel public est déjà en ligne
      if (cachedNetworkInfo.tunnelUrl) {
        displayTunnelResult(cachedNetworkInfo.tunnelUrl);
      }
    }
  } catch (err) {
    console.error("Erreur réseau mobile:", err);
  }

  setMobileAccessMode('wifi');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeModalMobileAccess() {
  const modal = document.getElementById('modal-mobile-access');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function setMobileAccessMode(mode) {
  const secWifi = document.getElementById('section-mobile-wifi');
  const secWorld = document.getElementById('section-mobile-world');
  const secRender = document.getElementById('section-mobile-render');
  const btnWifi = document.getElementById('btn-mode-wifi');
  const btnWorld = document.getElementById('btn-mode-world');
  const btnRender = document.getElementById('btn-mode-render');

  if (secWifi) secWifi.classList.toggle('hidden', mode !== 'wifi');
  if (secWorld) secWorld.classList.toggle('hidden', mode !== 'world');
  if (secRender) secRender.classList.toggle('hidden', mode !== 'render');

  [
    { btn: btnWifi, active: mode === 'wifi' },
    { btn: btnWorld, active: mode === 'world' },
    { btn: btnRender, active: mode === 'render' }
  ].forEach(item => {
    if (item.btn) {
      if (item.active) {
        item.btn.classList.add('bg-white', 'shadow', 'text-sky-800');
        item.btn.classList.remove('text-slate-600');
      } else {
        item.btn.classList.remove('bg-white', 'shadow', 'text-sky-800');
        item.btn.classList.add('text-slate-600');
      }
    }
  });
}

async function startPublicTunnel() {
  const btn = document.getElementById('btn-start-tunnel');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="animate-spin inline-block mr-1">⏳</span> Activation du lien sécurisé mondial...`;
  }

  try {
    const res = await fetch('/api/tunnel/start', { method: 'POST' });
    const data = await res.json();
    if (!res.ok || !data.url) throw new Error(data.error || "Impossible d'ouvrir le tunnel");

    displayTunnelResult(data.url);
    playBeep('success');
  } catch (err) {
    alert("Erreur lors de la génération du lien internet mondial : " + err.message);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span>🚀</span> Réessayer l'activation mondiale`;
    }
  }
}

function displayTunnelResult(url) {
  const statusArea = document.getElementById('tunnel-status-area');
  const resultArea = document.getElementById('tunnel-result-area');
  const textUrl = document.getElementById('text-tunnel-url');
  const qrImg = document.getElementById('qr-image-tunnel');
  const waShare = document.getElementById('btn-whatsapp-share');

  if (statusArea) statusArea.classList.add('hidden');
  if (resultArea) resultArea.classList.remove('hidden');

  if (textUrl) textUrl.textContent = url;
  if (qrImg) {
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(url)}`;
  }
  if (waShare) {
    const msg = `Lien d'accès à la caisse et aux stocks SachetPOS de la boutique : ${url}`;
    waShare.href = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
  }
}

function copyToClipboard(elementId) {
  const elem = document.getElementById(elementId);
  if (!elem) return;
  const text = elem.textContent || elem.value;
  navigator.clipboard.writeText(text).then(() => {
    alert("✅ Lien copié dans le presse-papier !");
  }).catch(() => {
    prompt("Copiez ce lien :", text);
  });
}

// ==========================================
// ==========================================
// 7. MODULE DE SÉCURITÉ & MOT DE PASSE (PIN)
// ==========================================
let saisiePINActuelle = "";

function getCodePIN() {
  if (state.settings && state.settings.codePIN) {
    return String(state.settings.codePIN);
  }
  return localStorage.getItem('sachet_pos_pin') || "1234";
}

function initSecurityPin() {
  const isUnlocked = sessionStorage.getItem('sachet_pos_deverrouille');
  const overlay = document.getElementById('ecran-verrouillage');
  const currentPin = getCodePIN();

  const labelCode = document.getElementById('label-pin-code');
  if (labelCode) labelCode.textContent = currentPin;

  const badgePin = document.getElementById('badge-current-pin');
  if (badgePin) badgePin.textContent = `Code Actuel : ${currentPin}`;

  if (isUnlocked === 'true') {
    if (overlay) overlay.style.display = 'none';
  } else {
    if (overlay) {
      overlay.style.display = 'flex';
      overlay.style.opacity = '1';
      effacerToutPIN();
    }
  }

  // Écoute clavier physique
  window.removeEventListener('keydown', gererClavierPhysiquePIN);
  window.addEventListener('keydown', gererClavierPhysiquePIN);
}

function gererClavierPhysiquePIN(e) {
  const overlay = document.getElementById('ecran-verrouillage');
  if (!overlay || overlay.style.display === 'none') return;

  // Si l'utilisateur tape dans l'input direct, le focus fait déjà le travail
  if (document.activeElement && document.activeElement.id === 'input-pin-direct') {
    if (e.key === 'Enter') {
      validerSaisieDirectePIN();
    }
    return;
  }

  if (e.key >= '0' && e.key <= '9') {
    taperChiffrePIN(e.key);
  } else if (e.key === 'Backspace') {
    supprimerDernierPIN();
  } else if (e.key === 'Escape') {
    effacerToutPIN();
  } else if (e.key === 'Enter') {
    validerSaisieDirectePIN();
  }
}

function togglePasswordVisibility(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

function onInputPinDirect(e) {
  saisiePINActuelle = e.target.value;
  const msgEl = document.getElementById('pin-erreur-msg');
  if (msgEl) msgEl.innerText = "";
  
  if (saisiePINActuelle === getCodePIN()) {
    deverrouillerSucces();
  }
}

function taperChiffrePIN(chiffre) {
  saisiePINActuelle += chiffre;
  const input = document.getElementById('input-pin-direct');
  if (input) input.value = saisiePINActuelle;
  playBeep('click');

  const codeAttendu = getCodePIN();
  if (saisiePINActuelle === codeAttendu) {
    deverrouillerSucces();
  } else if (saisiePINActuelle.length >= codeAttendu.length && /^\d+$/.test(codeAttendu)) {
    indiquerErreurPIN();
  }
}

function supprimerDernierPIN() {
  if (saisiePINActuelle.length > 0) {
    saisiePINActuelle = saisiePINActuelle.slice(0, -1);
    const input = document.getElementById('input-pin-direct');
    if (input) input.value = saisiePINActuelle;
  }
}

function effacerToutPIN() {
  saisiePINActuelle = "";
  const input = document.getElementById('input-pin-direct');
  if (input) input.value = "";
  const msgEl = document.getElementById('pin-erreur-msg');
  if (msgEl) msgEl.innerText = "";
}

function validerSaisieDirectePIN() {
  const input = document.getElementById('input-pin-direct');
  const codeTape = (input ? input.value : saisiePINActuelle).trim();
  const codeAttendu = getCodePIN();

  if (codeTape === codeAttendu) {
    deverrouillerSucces();
  } else {
    indiquerErreurPIN();
  }
}

function indiquerErreurPIN() {
  const msgEl = document.getElementById('pin-erreur-msg');
  if (msgEl) {
    msgEl.className = 'text-xs text-red-400 font-bold min-h-[1.25rem] transition-all';
    msgEl.innerText = "❌ Mot de passe incorrect, veuillez réessayer";
  }
  const input = document.getElementById('input-pin-direct');
  if (input) {
    input.classList.add('animate-shake');
    setTimeout(() => input.classList.remove('animate-shake'), 450);
  }
  setTimeout(() => {
    effacerToutPIN();
  }, 600);
}

function deverrouillerSucces() {
  sessionStorage.setItem('sachet_pos_deverrouille', 'true');
  const overlay = document.getElementById('ecran-verrouillage');
  const msgEl = document.getElementById('pin-erreur-msg');
  if (msgEl) {
    msgEl.className = 'text-xs text-emerald-400 font-bold min-h-[1.25rem] transition-all';
    msgEl.innerText = "✅ Accès autorisé ! Bienvenue sur SachetPOS";
  }
  playBeep('success');
  setTimeout(() => {
    if (overlay) {
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.25s ease-out';
      setTimeout(() => {
        overlay.style.display = 'none';
        overlay.style.opacity = '1';
      }, 250);
    }
  }, 350);
}

function verrouillerApplication() {
  sessionStorage.removeItem('sachet_pos_deverrouille');
  saisiePINActuelle = "";
  const overlay = document.getElementById('ecran-verrouillage');
  if (overlay) {
    overlay.style.display = 'flex';
    overlay.style.opacity = '1';
    effacerToutPIN();
  }
}

function openModalChangerPIN() {
  const modal = document.getElementById('modal-changer-pin');
  if (modal) {
    document.getElementById('pin-actuel').value = '';
    document.getElementById('pin-nouveau').value = '';
    document.getElementById('pin-confirmer').value = '';
    document.getElementById('pin-change-error').textContent = '';
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function closeModalChangerPIN() {
  const modal = document.getElementById('modal-changer-pin');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

async function validerChangementPIN(e) {
  e.preventDefault();
  const actuel = document.getElementById('pin-actuel').value.trim();
  const nouveau = document.getElementById('pin-nouveau').value.trim();
  const confirmer = document.getElementById('pin-confirmer').value.trim();
  const errEl = document.getElementById('pin-change-error');

  const codeAttendu = getCodePIN();
  if (actuel !== codeAttendu) {
    errEl.textContent = "❌ Le mot de passe actuel est incorrect.";
    return;
  }

  if (nouveau.length < 3) {
    errEl.textContent = "❌ Le nouveau mot de passe doit comporter au moins 3 caractères.";
    return;
  }

  if (nouveau !== confirmer) {
    errEl.textContent = "❌ La confirmation ne correspond pas au nouveau mot de passe.";
    return;
  }

  // Enregistrer localement et sur le serveur
  state.settings = state.settings || {};
  state.settings.codePIN = nouveau;
  localStorage.setItem('sachet_pos_pin', nouveau);

  try {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codePIN: nouveau })
    });
  } catch (err) {
    console.error("Erreur sync code PIN:", err);
  }

  const labelCode = document.getElementById('label-pin-code');
  if (labelCode) labelCode.textContent = nouveau;
  const badgePin = document.getElementById('badge-current-pin');
  if (badgePin) badgePin.textContent = `Code Actuel : ${nouveau}`;

  closeModalChangerPIN();
  playBeep('success');
  alert(`✅ Votre nouveau mot de passe (${nouveau}) a été enregistré avec succès !`);
  effacerToutPIN();
}

async function savePinFromSettings() {
  const nouveau = (document.getElementById('input-new-pin-settings').value || '').trim();
  const confirmer = (document.getElementById('input-confirm-pin-settings').value || '').trim();
  const statusMsg = document.getElementById('settings-pin-status-msg');

  if (!nouveau) {
    statusMsg.className = "text-xs font-bold text-red-500";
    statusMsg.textContent = "❌ Veuillez saisir un mot de passe.";
    return;
  }
  if (nouveau.length < 3) {
    statusMsg.className = "text-xs font-bold text-red-500";
    statusMsg.textContent = "❌ Le mot de passe doit comporter au moins 3 caractères.";
    return;
  }
  if (nouveau !== confirmer) {
    statusMsg.className = "text-xs font-bold text-red-500";
    statusMsg.textContent = "❌ La confirmation ne correspond pas au nouveau mot de passe.";
    return;
  }

  state.settings = state.settings || {};
  state.settings.codePIN = nouveau;
  localStorage.setItem('sachet_pos_pin', nouveau);

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codePIN: nouveau })
    });
    if (!res.ok) throw new Error("Erreur serveur");
  } catch (err) {
    console.error("Erreur sync code PIN:", err);
  }

  const badgePin = document.getElementById('badge-current-pin');
  if (badgePin) badgePin.textContent = `Code Actuel : ${nouveau}`;
  const labelCode = document.getElementById('label-pin-code');
  if (labelCode) labelCode.textContent = nouveau;

  document.getElementById('input-new-pin-settings').value = '';
  document.getElementById('input-confirm-pin-settings').value = '';

  statusMsg.className = "text-xs font-bold text-emerald-600";
  statusMsg.textContent = `✅ Mot de passe enregistré avec succès !`;
  playBeep('success');
  alert(`✅ Votre mot de passe de connexion a été mis à jour avec succès : ${nouveau}`);
}

// ==========================================
// 8. MODULE PULL-TO-REFRESH MOBILE (GLISSER VERS LE BAS)
// ==========================================
let ptrStartY = 0;
let ptrCurrentY = 0;
let isPtrActive = false;
let isPtrRefreshing = false;

function initPullToRefresh() {
  const indicator = document.getElementById('pull-to-refresh-indicator');
  const icon = document.getElementById('ptr-icon');
  const text = document.getElementById('ptr-text');
  if (!indicator) return;

  function getScrollTop(target) {
    let el = target;
    while (el && el !== document.body && el !== document.documentElement) {
      if (el.scrollTop > 0) return el.scrollTop;
      el = el.parentElement;
    }
    return window.scrollY || document.documentElement.scrollTop || 0;
  }

  document.addEventListener('touchstart', (e) => {
    if (isPtrRefreshing) return;
    const overlay = document.getElementById('ecran-verrouillage');
    if (overlay && overlay.style.display !== 'none') return; // ne pas activer sur l'écran PIN

    if (getScrollTop(e.target) <= 0) {
      ptrStartY = e.touches[0].clientY;
      isPtrActive = true;
    } else {
      isPtrActive = false;
    }
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!isPtrActive || isPtrRefreshing) return;
    ptrCurrentY = e.touches[0].clientY;
    const diff = ptrCurrentY - ptrStartY;

    if (diff > 0 && getScrollTop(e.target) <= 0) {
      const pull = Math.min(diff * 0.45, 90);
      indicator.style.transform = `translateY(${pull}px)`;

      if (pull > 55) {
        if (icon) icon.style.transform = 'rotate(180deg)';
        if (text) text.textContent = "Relâchez pour actualiser...";
      } else {
        if (icon) icon.style.transform = 'rotate(0deg)';
        if (text) text.textContent = "Glissez vers le bas pour actualiser...";
      }
    } else {
      indicator.style.transform = 'translateY(-100%)';
    }
  }, { passive: true });

  document.addEventListener('touchend', async () => {
    if (!isPtrActive || isPtrRefreshing) return;
    isPtrActive = false;
    const diff = ptrCurrentY - ptrStartY;

    if (diff * 0.45 > 55) {
      await declencherActualisationPTR();
    } else {
      indicator.style.transform = 'translateY(-100%)';
    }
    ptrStartY = 0;
    ptrCurrentY = 0;
  });
}

async function declencherActualisationPTR() {
  const indicator = document.getElementById('pull-to-refresh-indicator');
  const icon = document.getElementById('ptr-icon');
  const text = document.getElementById('ptr-text');

  isPtrRefreshing = true;
  if (indicator) indicator.style.transform = 'translateY(65px)';
  if (icon) {
    icon.textContent = "🔄";
    icon.className = "text-base animate-spin-refresh inline-block";
  }
  if (text) text.textContent = "Actualisation des données en cours...";

  try {
    await loadData();
    playBeep('success');
    if (text) text.textContent = "✅ Données à jour !";
    if (icon) {
      icon.className = "text-base inline-block";
      icon.textContent = "✅";
    }
  } catch (err) {
    if (text) text.textContent = "Erreur de connexion";
  }

  setTimeout(() => {
    if (indicator) indicator.style.transform = 'translateY(-100%)';
    setTimeout(() => {
      if (icon) {
        icon.textContent = "⬇️";
        icon.className = "text-base transition-transform duration-200 inline-block";
        icon.style.transform = 'rotate(0deg)';
      }
      if (text) text.textContent = "Glissez vers le bas pour actualiser...";
      isPtrRefreshing = false;
    }, 200);
  }, 600);
}

async function rafraichirDonneesManuellement() {
  const btn = document.getElementById('btn-refresh-header');
  if (btn) btn.classList.add('animate-spin');

  try {
    await loadData();
    playBeep('success');
  } catch (err) {
    console.error(err);
  } finally {
    setTimeout(() => {
      if (btn) btn.classList.remove('animate-spin');
    }, 600);
  }
}

// ==========================================
// 10. MODULE PARTAGE WHATSAPP & SMS (SUPER PRO)
// ==========================================

let currentShareState = {
  type: '',
  recipientName: '',
  phone: '',
  messageText: '',
  saleData: null
};

// Formateur de numéro de téléphone Togo (+228)
function cleanTogoPhone(phone) {
  if (!phone) return '';
  let digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('00228')) {
    digits = digits.slice(2);
  }
  if (digits.startsWith('228') && digits.length >= 11) {
    return digits;
  }
  // Si numéro togolais à 8 chiffres (ex: 90123456 ou 70123456)
  if (digits.length === 8) {
    return '228' + digits;
  }
  // Si déjà avec indicatif ou autre
  if (digits.length > 8 && !digits.startsWith('228')) {
    return digits;
  }
  return digits.length > 0 ? ('228' + digits) : '';
}

// Générateur universel des liens WhatsApp et SMS (compatible iOS, Android et Ordinateur)
function buildShareUrls(rawPhone, text) {
  const cleanPhone = cleanTogoPhone(rawPhone);
  const encodedText = encodeURIComponent(text || '');

  // Lien WhatsApp : si téléphone fourni, cible directe, sinon ouvre sélecteur de contact WhatsApp
  const whatsappUrl = cleanPhone
    ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`
    : `https://api.whatsapp.com/send?text=${encodedText}`;

  // Détection iOS pour le protocole SMS universel
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const sep = isIOS ? '&' : '?';
  const phoneFormatted = cleanPhone ? (cleanPhone.startsWith('228') ? `+${cleanPhone}` : cleanPhone) : '';
  const smsUrl = phoneFormatted
    ? `sms:${phoneFormatted}${sep}body=${encodedText}`
    : `sms:${sep}body=${encodedText}`;

  return { whatsappUrl, smsUrl, cleanPhone };
}

// 1. TICKET DE VENTE / FACTURE DÉTAILLÉE D'ACHAT
function genererMessageTicketVente(sale) {
  const shopName = (state.settings && state.settings.shop_name) || "MIAKIARA";
  const shopAddress = (state.settings && state.settings.shop_address) || "Grand Marché Tsévié / Lomé - Togo";
  const shopPhone = (state.settings && state.settings.shop_phone) || "+228 90 00 00 00";
  const dt = new Date(sale.date || Date.now());
  const dateStr = dt.toLocaleDateString('fr-FR') + ' à ' + dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  let lignesArticles = (sale.items || []).map(it => {
    const qte = parseFloat(it.quantite) || 0;
    const px = parseFloat(it.prix) || 0;
    const tot = qte * px;
    return `▪️ ${qte} ${it.lot || 'Adaka'} x ${it.nom} (${formatMoney(px)}) = *${formatMoney(tot)}*`;
  }).join('\n');

  let msg = `🛍️ *${shopName.toUpperCase()} - FACTURE & REÇU D'ACHAT*
📍 ${shopAddress}
📞 Service client : ${shopPhone}
───────────────────────
🧾 *N° Ticket :* ${sale.ticketCode || 'TICK'}
📅 *Date :* ${dateStr}
👤 *Client :* ${sale.clientNom || 'Client Comptoir'}
───────────────────────
*ARTICLES ACHETÉS :*
${lignesArticles}
───────────────────────
💰 *TOTAL NET : ${formatMoney(sale.totalNet)}*
💳 *Mode de règlement :* ${sale.modePaiement || 'ESPECES'}`;

  if (sale.remise && sale.remise > 0) {
    msg += `\n🏷️ *Remise accordée :* -${formatMoney(sale.remise)}`;
  }
  if (sale.modePaiement === 'ESPECES') {
    msg += `\n💵 *Montant versé :* ${formatMoney(sale.montantRecu || sale.totalNet)}`;
    if (sale.monnaieRendue && sale.monnaieRendue > 0) {
      msg += `\n🪙 *Monnaie rendue :* ${formatMoney(sale.monnaieRendue)}`;
    }
  }
  if (sale.montantRestant && sale.montantRestant > 0) {
    msg += `\n⚠️ *RESTE À PAYER (CRÉDIT) : ${formatMoney(sale.montantRestant)}*`;
  }

  const footer = (state.settings && state.settings.receipt_footer) || "MIAKIARA vous remercie de votre fidélité et de votre confiance !";
  msg += `\n───────────────────────\n🙏 _${footer}_`;
  return msg;
}

// 2. SITUATION DE CRÉDIT & RELEVÉ DE COMPTE CLIENT
function genererMessageSituationClient(customer) {
  const shopName = (state.settings && state.settings.shop_name) || "MIAKIARA";
  const shopAddress = (state.settings && state.settings.shop_address) || "Grand Marché Tsévié / Lomé - Togo";
  const shopPhone = (state.settings && state.settings.shop_phone) || "+228 90 00 00 00";
  const dateStr = new Date().toLocaleDateString('fr-FR');
  const dette = parseFloat(customer.dette) || 0;

  const salesClient = state.sales.filter(s => s.customerId === customer.id);
  const totalAchats = salesClient.reduce((sum, s) => sum + (parseFloat(s.totalNet) || 0), 0);
  const creditSales = salesClient.filter(s => (s.montantRestant && s.montantRestant > 0) || s.modePaiement === 'CREDIT');
  const payments = (state.customerPayments || []).filter(p => p.customerId === customer.id);

  let msg = `📑 *${shopName.toUpperCase()} - RELEVÉ DE COMPTE CLIENT*
📍 ${shopAddress}
📞 Contact Boutique : ${shopPhone}
───────────────────────
👤 *Client :* ${customer.nom}
📱 *Téléphone :* ${customer.telephone || 'Non renseigné'}
📅 *Date d'arrêté :* ${dateStr}
───────────────────────\n`;

  if (dette > 0) {
    msg += `🔴 *SOLDE RESTANT DÛ : ${formatMoney(dette)}*\n`;
  } else {
    msg += `🟢 *SOLDE ACTUEL : 0 FCFA (Compte entièrement à jour)*\n`;
  }

  msg += `📊 *Cumul des achats :* ${formatMoney(totalAchats)} (${salesClient.length} commandes)\n`;
  msg += `───────────────────────\n`;

  if (creditSales.length > 0) {
    msg += `*DÉTAILS DES ACHATS À CRÉDIT :*\n`;
    creditSales.slice(0, 5).forEach(s => {
      const d = new Date(s.date).toLocaleDateString('fr-FR');
      msg += `• ${d} | Ticket ${s.ticketCode} : *${formatMoney(s.montantRestant || s.totalNet)}*\n`;
    });
    if (creditSales.length > 5) {
      msg += `_... et ${creditSales.length - 5} autres tickets précédents_\n`;
    }
    msg += `───────────────────────\n`;
  }

  if (payments.length > 0) {
    msg += `*DERNIERS RÈGLEMENTS ENCAISSÉS :*\n`;
    payments.slice(0, 4).forEach(p => {
      const d = new Date(p.date).toLocaleDateString('fr-FR');
      msg += `• ${d} : -${formatMoney(p.montant)} (${p.modePaiement || 'Espèces'})\n`;
    });
    msg += `───────────────────────\n`;
  }

  if (dette > 0) {
    msg += `💬 _Rappel courtois : Nous vous prions de bien vouloir régulariser ce montant dès que possible._\n`;
  }
  msg += `🙏 _Merci pour votre partenariat et votre fidélité !_`;
  return msg;
}

// 3. REÇU DE RÈGLEMENT DE DETTE
function genererMessageRecuReglement(customer, montant, modePaiement, ancienneDette, nouvelleDette) {
  const shopName = (state.settings && state.settings.shop_name) || "MIAKIARA";
  const shopAddress = (state.settings && state.settings.shop_address) || "Grand Marché Tsévié / Lomé - Togo";
  const shopPhone = (state.settings && state.settings.shop_phone) || "+228 90 00 00 00";
  const dt = new Date();
  const dateStr = dt.toLocaleDateString('fr-FR') + ' à ' + dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  let msg = `✅ *${shopName.toUpperCase()} - REÇU DE RÈGLEMENT*
📍 ${shopAddress}
📞 Contact : ${shopPhone}
───────────────────────
👤 *Client :* ${customer.nom}
📅 *Date :* ${dateStr}
───────────────────────
💵 *MONTANT ENCAISSÉ : ${formatMoney(montant)}*
💳 *Mode de paiement :* ${modePaiement || 'ESPECES'}
───────────────────────
📊 *SITUATION ACTUALISÉE DU COMPTE :*
• Dette antérieure : ${formatMoney(ancienneDette)}
• Règlement déduit : -${formatMoney(montant)}\n`;

  if (nouvelleDette > 0) {
    msg += `👉 *NOUVEAU SOLDE DÛ : ${formatMoney(nouvelleDette)}*\n`;
  } else {
    msg += `🎉 *FÉLICITATIONS : VOTRE COMPTE EST TOTALEMENT SOLDÉ (0 FCFA) !*\n`;
  }

  msg += `───────────────────────\n🙏 _Paiement bien validé avec nos remerciements sincères !_`;
  return msg;
}

// 4. BILAN JOURNALIER / RAPPORT Z POUR LE PROPRIÉTAIRE
function genererMessageBilanZ() {
  const shopName = (state.settings && state.settings.shop_name) || "MIAKIARA";
  const shopAddress = (state.settings && state.settings.shop_address) || "Grand Marché Tsévié / Lomé - Togo";
  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR') + ' à ' + now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  const totalCA = state.sales.reduce((sum, s) => sum + (parseFloat(s.totalNet) || 0), 0);
  const totalEspeces = state.sales
    .filter(s => s.modePaiement === 'ESPECES')
    .reduce((sum, s) => sum + (parseFloat(s.totalNet) || 0), 0);
  const totalMomo = state.sales
    .filter(s => s.modePaiement === 'MOBILE_MONEY')
    .reduce((sum, s) => sum + (parseFloat(s.totalNet) || 0), 0);
  const totalCredit = state.sales
    .filter(s => s.modePaiement === 'CREDIT' || (s.montantRestant && s.montantRestant > 0))
    .reduce((sum, s) => sum + (parseFloat(s.montantRestant || s.totalNet) || 0), 0);

  const volumeVendu = state.sales.reduce((sum, s) => {
    return sum + (s.items || []).reduce((sub, it) => sub + (parseFloat(it.quantite) || 0), 0);
  }, 0);

  let totalCoutAchat = 0;
  state.sales.forEach(s => {
    (s.items || []).forEach(it => {
      const prod = state.products.find(p => p.id === it.productId);
      const coutUnitaire = prod && prod.prix_achat ? parseFloat(prod.prix_achat) : (parseFloat(it.prix) * 0.85);
      totalCoutAchat += (coutUnitaire * (parseFloat(it.quantite) || 0));
    });
  });
  const margeEstimee = Math.max(0, totalCA - totalCoutAchat);

  let msg = `📊 *${shopName.toUpperCase()} - POINT DE CAISSE (BILAN Z)*
📍 ${shopAddress}
📅 *Arrêté au :* ${dateStr}
───────────────────────
💰 *CHIFFRE D'AFFAIRES GLOBAL : ${formatMoney(totalCA)}*
📈 *Marge Brute estimée : ${formatMoney(margeEstimee)}*
🧾 *Nombre de tickets :* ${state.sales.length} ventes
📦 *Volume total vendu :* ${volumeVendu} Adaka
───────────────────────
*VENTILATION PAR MODE DE PAIEMENT :*
💵 Espèces en caisse : *${formatMoney(totalEspeces)}*
📱 Mobile Money (Flooz/T-Money) : *${formatMoney(totalMomo)}*
⚠️ Ventes à crédit (Dettes créées) : *${formatMoney(totalCredit)}*
───────────────────────
💼 _Rapport officiel de caisse généré via SachetPOS._`;
  return msg;
}

// OUVERTURE DU MODAL DE PARTAGE GÉNÉRIQUE
function openShareModal({ type, icon, title, subtitle, recipientLabel, recipientName, phone, messageText, saleData }) {
  currentShareState = {
    type: type || 'ticket',
    recipientName: recipientName || '',
    phone: phone || '',
    messageText: messageText || '',
    saleData: saleData || null
  };

  const elemIcon = document.getElementById('share-modal-icon');
  if (elemIcon) elemIcon.textContent = icon || '📤';

  const elemTitle = document.getElementById('share-modal-title');
  if (elemTitle) elemTitle.textContent = title || 'Partager la Situation';

  const elemSub = document.getElementById('share-modal-subtitle');
  if (elemSub) elemSub.textContent = subtitle || 'WhatsApp & SMS';

  const elemRecLabel = document.getElementById('share-recipient-label');
  if (elemRecLabel) elemRecLabel.textContent = recipientLabel || 'Destinataire :';

  const elemRecName = document.getElementById('share-recipient-name');
  if (elemRecName) elemRecName.textContent = recipientName || 'Client';

  const phoneInput = document.getElementById('share-recipient-phone');
  if (phoneInput) {
    phoneInput.value = phone || '';
  }

  const previewElem = document.getElementById('share-message-preview');
  if (previewElem) {
    previewElem.textContent = messageText;
  }

  const printBtn = document.getElementById('btn-share-print');
  if (printBtn) {
    if (saleData) {
      printBtn.classList.remove('hidden');
    } else {
      printBtn.classList.add('hidden');
    }
  }

  updateShareLinks();

  const modal = document.getElementById('modal-share-situation');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function closeModalShareSituation() {
  const modal = document.getElementById('modal-share-situation');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function updateShareLinks() {
  const phoneInput = document.getElementById('share-recipient-phone');
  const rawPhone = phoneInput ? phoneInput.value : (currentShareState.phone || '');
  const msg = currentShareState.messageText || '';

  const { whatsappUrl, smsUrl } = buildShareUrls(rawPhone, msg);

  const btnWa = document.getElementById('btn-share-whatsapp');
  if (btnWa) btnWa.href = whatsappUrl;

  const btnSms = document.getElementById('btn-share-sms');
  if (btnSms) btnSms.href = smsUrl;
}

function copierMessageShare() {
  const text = currentShareState.messageText || '';
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    alert("📋 Message copié dans le presse-papiers ! Vous pouvez le coller directement.");
  }).catch(() => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    alert("📋 Message copié !");
  });
}

function imprimerTicketDepuisShare() {
  if (currentShareState.saleData) {
    printThermalReceipt(currentShareState.saleData);
  } else {
    alert("Aucun ticket physique associé à cette situation.");
  }
}

// DECLENCHEURS SPÉCIFIQUES

function openShareSaleReceipt(saleOrTicketCode) {
  let sale = null;
  if (typeof saleOrTicketCode === 'object' && saleOrTicketCode !== null) {
    sale = saleOrTicketCode;
  } else {
    sale = state.sales.find(s => s.ticketCode === saleOrTicketCode || String(s.id) === String(saleOrTicketCode));
  }
  if (!sale) return alert("Vente introuvable");

  let phone = '';
  if (sale.customerId) {
    const cust = state.customers.find(c => c.id === sale.customerId);
    if (cust && cust.telephone) phone = cust.telephone;
  }

  const msg = genererMessageTicketVente(sale);
  openShareModal({
    type: 'sale',
    icon: '🧾',
    title: `Ticket ${sale.ticketCode}`,
    subtitle: "Détails d'achat et facture électronique",
    recipientLabel: 'Client :',
    recipientName: sale.clientNom || 'Client Comptoir',
    phone: phone,
    messageText: msg,
    saleData: sale
  });
}

function openShareCustomerStatement(customerId) {
  const customer = state.customers.find(c => c.id === customerId);
  if (!customer) return alert("Client introuvable");

  const msg = genererMessageSituationClient(customer);
  openShareModal({
    type: 'statement',
    icon: '📑',
    title: `Situation : ${customer.nom}`,
    subtitle: 'Relevé de compte, achats & situation de crédit',
    recipientLabel: 'Client :',
    recipientName: customer.nom,
    phone: customer.telephone || '',
    messageText: msg,
    saleData: null
  });
}

function openSharePaymentReceipt(customer, montant, modePaiement, ancienneDette, nouvelleDette) {
  const msg = genererMessageRecuReglement(customer, montant, modePaiement, ancienneDette, nouvelleDette);
  openShareModal({
    type: 'payment',
    icon: '✅',
    title: `Reçu de Règlement : ${formatMoney(montant)}`,
    subtitle: 'Confirmation de versement et nouveau solde de dette',
    recipientLabel: 'Client :',
    recipientName: customer.nom,
    phone: customer.telephone || '',
    messageText: msg,
    saleData: null
  });
}

function openShareDailyZReport() {
  ouvrirModalClotureZ();
}

// ============================================================================
// 1. VENTES FLASH / FAVORIS EN CAISSE (ACCÈS RAPIDE 1-CLIC)
// ============================================================================
function renderFlashFavorites() {
  const container = document.getElementById('pos-flash-favorites-list');
  if (!container) return;

  const salesCount = {};
  (state.sales || []).forEach(s => {
    (s.items || []).forEach(it => {
      salesCount[it.productId] = (salesCount[it.productId] || 0) + (parseFloat(it.quantite) || 1);
    });
  });

  let favorites = [];
  const sortedBySales = [...(state.products || [])]
    .filter(p => (salesCount[p.id] || 0) > 0)
    .sort((a, b) => (salesCount[b.id] || 0) - (salesCount[a.id] || 0));

  if (sortedBySales.length >= 4) {
    favorites = sortedBySales.slice(0, 6);
  } else {
    const keywords = ['glaçon viva', 'kavi', 'demi', '5frs', '10frs', 'foutou', 'yaourt'];
    favorites = (state.products || []).filter(p => {
      const nom = (p.nom || '').toLowerCase();
      return keywords.some(k => nom.includes(k));
    }).slice(0, 7);
    if (favorites.length === 0) {
      favorites = (state.products || []).slice(0, 6);
    }
  }

  if (favorites.length === 0) {
    container.innerHTML = '<span class="text-[11px] text-slate-400">Aucun favori</span>';
    return;
  }

  const isDetail = state.posSaleMode === 'DETAIL';
  container.innerHTML = favorites.map(p => {
    const prix = isDetail 
      ? (parseFloat(p.prix_detail_unite) || 50) 
      : (parseFloat(p.prix_gros) || parseFloat(p.prix) || 1000);
    const nomCourt = p.nom.replace(/^Sachets?\s+/i, '').slice(0, 20);
    return `
      <button type="button" onclick="ajouterFavoriPanier(${p.id})" 
        class="flex-shrink-0 px-2.5 py-1 rounded-full bg-white hover:bg-amber-100 active:scale-95 border border-amber-300 shadow-sm text-xs font-bold text-slate-800 flex items-center gap-1.5 transition cursor-pointer select-none"
        title="Ajouter immédiatement 1 ${isDetail ? 'unité' : 'adaka'} de ${p.nom} au panier">
        <span class="text-amber-500 font-black">⚡</span>
        <span class="truncate max-w-[130px]">${nomCourt}</span>
        <span class="text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded-md text-[10px] font-mono font-bold">${formatMoney(prix)}</span>
      </button>
    `;
  }).join('');
}

function ajouterFavoriPanier(productId) {
  if (state.posSaleMode === 'DETAIL') {
    addUnitToCart(productId, 1);
  } else {
    addToCart(productId, 1, 'GROS');
  }
  playBeep('beep');
}

// ============================================================================
// 2. MODE VENDEUR / CAISSE SÉCURISÉE (VERROUILLAGE DES MARGES & COÛTS D'ACHAT)
// ============================================================================
function appliquerModeVendeurUI() {
  const isVendeur = !!state.modeVendeur;
  const btn = document.getElementById('btn-mode-vendeur');
  const icon = document.getElementById('icon-mode-vendeur');
  const label = document.getElementById('label-mode-vendeur');

  if (isVendeur) {
    document.body.classList.add('mode-vendeur-actif');
    if (btn) {
      btn.className = 'px-2 sm:px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 border border-amber-400 rounded-lg font-black flex items-center gap-1 shadow transition text-xs';
    }
    if (icon) icon.textContent = '🛡️';
    if (label) label.textContent = 'Vendeur';
  } else {
    document.body.classList.remove('mode-vendeur-actif');
    if (btn) {
      btn.className = 'px-2 sm:px-2.5 py-1.5 bg-slate-900 hover:bg-slate-700 text-emerald-300 border border-slate-700 rounded-lg font-bold flex items-center gap-1 shadow transition text-xs';
    }
    if (icon) icon.textContent = '🔑';
    if (label) label.textContent = 'Gérant';
  }
}

function basculerModeVendeur() {
  if (!state.modeVendeur) {
    // Passage en Mode Vendeur : direct et sans code
    state.modeVendeur = true;
    localStorage.setItem('miakiara_mode_vendeur', 'true');
    appliquerModeVendeurUI();
    showToast('info', 'Mode Vendeur Activé', 'Marges et prix d\'achat masqués pour la caisse.');
  } else {
    // Retour en Mode Gérant : exige le code PIN du propriétaire
    ouvrirModalPinManager();
  }
}

function ouvrirModalPinManager() {
  const modal = document.getElementById('modal-pin-manager');
  const input = document.getElementById('input-pin-switch-gerant');
  const err = document.getElementById('pin-switch-error');
  if (err) err.textContent = '';
  if (input) {
    input.value = '';
    setTimeout(() => input.focus(), 150);
  }
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function fermerModalPinManager() {
  const modal = document.getElementById('modal-pin-manager');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function validerPinManager() {
  const input = document.getElementById('input-pin-switch-gerant');
  const err = document.getElementById('pin-switch-error');
  const codeAttendu = (state.settings && state.settings.codePIN) ? String(state.settings.codePIN).trim() : '1234';
  const saisi = (input ? input.value : '').trim();

  if (saisi === codeAttendu) {
    state.modeVendeur = false;
    localStorage.setItem('miakiara_mode_vendeur', 'false');
    appliquerModeVendeurUI();
    fermerModalPinManager();
    showToast('success', 'Mode Gérant Déverrouillé', 'Accès complet aux marges, approvisionnements et rapports.');
    playBeep('success');
  } else {
    if (err) err.textContent = 'Code PIN incorrect. Veuillez réessayer.';
    if (input) {
      input.value = '';
      input.focus();
    }
    playBeep('beep');
  }
}

// ============================================================================
// 3. GESTION DES DÉPENSES & PETITE CAISSE (SORTIES DE FONCTIONNEMENT)
// ============================================================================
async function ouvrirModalDepenses() {
  const modal = document.getElementById('modal-depenses');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  await chargerDepensesJour();
  const inputMotif = document.getElementById('depense-motif');
  if (inputMotif) setTimeout(() => inputMotif.focus(), 100);
}

function fermerModalDepenses() {
  const modal = document.getElementById('modal-depenses');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

async function chargerDepensesJour() {
  try {
    const res = await fetch('/api/depenses');
    if (res.ok) {
      state.depenses = await res.json();
    }
  } catch (e) {
    console.warn("Impossible d'actualiser les dépenses :", e);
  }

  const container = document.getElementById('depenses-liste-container');
  const totalBadge = document.getElementById('depenses-total-badge');
  if (!container) return;

  const aujourdhuiStr = new Date().toISOString().slice(0, 10);
  const depensesJour = (state.depenses || []).filter(d => (d.date || '').slice(0, 10) === aujourdhuiStr);
  const totalJour = depensesJour.reduce((sum, d) => sum + (parseFloat(d.montant) || 0), 0);

  if (totalBadge) totalBadge.textContent = `${formatMoney(totalJour)} (${depensesJour.length} sortie(s))`;

  if (depensesJour.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-slate-400 text-xs">
        <span class="text-2xl block mb-1">💸</span>
        Aucune dépense enregistrée aujourd'hui.
      </div>`;
    return;
  }

  container.innerHTML = depensesJour.map(d => {
    const dt = new Date(d.date || Date.now());
    const heure = dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const modeBadge = d.mode === 'ESPECES' ? '💵 Caisse Espèces' : (d.mode || 'Paiement');
    return `
      <div class="p-2.5 flex items-center justify-between gap-2 hover:bg-slate-50 transition text-xs">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="font-bold text-slate-900">${d.motif || 'Dépense'}</span>
            <span class="px-2 py-0.2 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">${d.categorie || 'Divers'}</span>
            <span class="text-[10px] text-slate-400 font-mono">${modeBadge}</span>
          </div>
          <div class="text-[11px] text-slate-500 mt-0.5">
            Heure : ${heure} ${d.beneficiaire ? '• Pour : ' + d.beneficiaire : ''}
          </div>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <span class="font-black text-rose-700 font-mono text-xs sm:text-sm">-${formatMoney(d.montant)}</span>
          <button type="button" onclick="supprimerDepense(${d.id})" class="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer" title="Supprimer cette dépense">✕</button>
        </div>
      </div>
    `;
  }).join('');
}

async function soumettreNouvelleDepense(e) {
  e.preventDefault();
  const motif = (document.getElementById('depense-motif')?.value || '').trim();
  const montant = parseFloat(document.getElementById('depense-montant')?.value) || 0;
  const categorie = document.getElementById('depense-categorie')?.value || 'Autre';
  const mode = document.getElementById('depense-mode')?.value || 'ESPECES';
  const beneficiaire = (document.getElementById('depense-beneficiaire')?.value || '').trim();

  if (!motif || montant <= 0) {
    showToast('error', 'Erreur de saisie', 'Veuillez saisir un motif et un montant valide supérieur à 0.');
    return;
  }

  try {
    const res = await fetch('/api/depenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motif, montant, categorie, mode, beneficiaire })
    });
    const result = await res.json();
    if (!res.ok) {
      throw new Error(result.error || 'Erreur lors de l\'enregistrement de la dépense.');
    }

    state.depenses = result.depenses || state.depenses;
    document.getElementById('form-nouvelle-depense')?.reset();
    await chargerDepensesJour();
    showToast('success', 'Dépense Enregistrée', `Sortie de caisse de ${formatMoney(montant)} enregistrée avec succès.`);
    playBeep('success');
  } catch (err) {
    console.error(err);
    showToast('error', 'Erreur', err.message || 'Impossible d\'enregistrer la dépense.');
  }
}

async function supprimerDepense(id) {
  if (!confirm("Voulez-vous vraiment annuler et supprimer cette dépense ?")) return;
  try {
    const res = await fetch(`/api/depenses/${id}`, { method: 'DELETE' });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Erreur de suppression.");
    state.depenses = result.depenses || state.depenses;
    await chargerDepensesJour();
    showToast('info', 'Dépense supprimée', 'La dépense a été retirée du journal.');
  } catch (err) {
    showToast('error', 'Erreur', err.message);
  }
}

// ============================================================================
// 4. CLÔTURE JOURNALIÈRE DE CAISSE (RAPPORT Z OFFICIEL) & ENVOI WHATSAPP
// ============================================================================
async function ouvrirModalClotureZ(dateStr) {
  const modal = document.getElementById('modal-cloture-z');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.classList.add('flex');

  const inputDate = document.getElementById('input-date-cloture-z');
  const targetDate = dateStr || (new Date().toISOString().slice(0, 10));
  if (inputDate) inputDate.value = targetDate;

  const nomBoutique = (state.settings && state.settings.shop_name) || "MIAKIARA POS";
  const elBoutique = document.getElementById('z-nom-boutique');
  if (elBoutique) elBoutique.textContent = nomBoutique;

  await actualiserApercuClotureZ();
}

function fermerModalClotureZ() {
  const modal = document.getElementById('modal-cloture-z');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

async function actualiserApercuClotureZ() {
  const inputDate = document.getElementById('input-date-cloture-z');
  const targetDate = inputDate ? inputDate.value : (new Date().toISOString().slice(0, 10));

  try {
    const res = await fetch(`/api/cloture/preview?date=${targetDate}`);
    if (!res.ok) throw new Error("Impossible de charger les données du jour.");
    const preview = await res.json();
    state.clotureApercu = preview;

    // Remplissage des KPIs
    const elCa = document.getElementById('z-kpi-ca');
    const elTickets = document.getElementById('z-kpi-tickets');
    const elMarge = document.getElementById('z-kpi-marge');
    const elDepenses = document.getElementById('z-kpi-depenses');
    const elDepCount = document.getElementById('z-kpi-depenses-count');
    const elNet = document.getElementById('z-kpi-benefice-net');

    if (elCa) elCa.textContent = formatMoney(preview.chiffreAffairesNet);
    if (elTickets) elTickets.textContent = `${preview.ventesCount} vente(s)`;
    if (elMarge) elMarge.textContent = formatMoney(preview.margeBruteEstimee);
    if (elDepenses) elDepenses.textContent = formatMoney(preview.totalDepenses);
    if (elDepCount) elDepCount.textContent = `${preview.depensesCount || 0} sortie(s)`;
    if (elNet) elNet.textContent = formatMoney(preview.beneficeNetEstime);

    // Détail des modes de règlement
    const elEspVentes = document.getElementById('z-detail-especes-ventes');
    const elMomoVentes = document.getElementById('z-detail-momo-ventes');
    const elCreditVentes = document.getElementById('z-detail-credit-ventes');
    const elRecouv = document.getElementById('z-detail-recouvrements');
    const elRecouvEsp = document.getElementById('z-detail-recouvrements-especes');
    const elDepEsp = document.getElementById('z-detail-depenses-especes');
    const elEspTheorique = document.getElementById('z-especes-theoriques');

    if (elEspVentes) elEspVentes.textContent = formatMoney(preview.especesVentes);
    if (elMomoVentes) elMomoVentes.textContent = formatMoney(preview.momoVentes);
    if (elCreditVentes) elCreditVentes.textContent = formatMoney(preview.creditVentes);
    if (elRecouv) elRecouv.textContent = formatMoney(preview.totalRecouvrementsDettes);
    if (elRecouvEsp) elRecouvEsp.textContent = formatMoney(preview.recouvrementsDettesEspeces);
    if (elDepEsp) elDepEsp.textContent = formatMoney(preview.depensesCaisseEspeces);
    if (elEspTheorique) elEspTheorique.textContent = formatMoney(preview.especesTheoriquesEnCaisse);

    calculerEcartClotureZ();
  } catch (err) {
    console.error("Erreur actualiserApercuClotureZ:", err);
    showToast('error', 'Erreur de calcul', err.message);
  }
}

function calculerEcartClotureZ() {
  const preview = state.clotureApercu;
  if (!preview) return;

  const inputPhysique = document.getElementById('z-input-especes-physiques');
  const boxEcart = document.getElementById('z-box-ecart-caisse');
  const iconEcart = document.getElementById('z-icon-ecart');
  const titreEcart = document.getElementById('z-titre-ecart');
  const montantEcart = document.getElementById('z-montant-ecart');

  const valStr = inputPhysique ? inputPhysique.value.trim() : '';
  if (valStr === '') {
    if (boxEcart) boxEcart.className = 'p-2.5 rounded-xl border flex items-center gap-2.5 bg-white border-slate-200';
    if (iconEcart) iconEcart.textContent = 'ℹ️';
    if (titreEcart) titreEcart.textContent = 'Écart de Caisse';
    if (montantEcart) {
      montantEcart.textContent = 'Saisissez les espèces comptées';
      montantEcart.className = 'text-xs text-slate-500 font-semibold';
    }
    return;
  }

  const physique = parseFloat(valStr) || 0;
  const theorique = preview.especesTheoriquesEnCaisse || 0;
  const ecart = Math.round(physique - theorique);

  if (ecart === 0) {
    if (boxEcart) boxEcart.className = 'p-2.5 rounded-xl border flex items-center gap-2.5 bg-emerald-50 border-emerald-300 text-emerald-950';
    if (iconEcart) iconEcart.textContent = '✅';
    if (titreEcart) titreEcart.textContent = 'Caisse Parfaitement Équilibrée';
    if (montantEcart) {
      montantEcart.textContent = 'Écart : 0 FCFA (Zéro différence)';
      montantEcart.className = 'text-sm font-black text-emerald-800';
    }
  } else if (ecart > 0) {
    if (boxEcart) boxEcart.className = 'p-2.5 rounded-xl border flex items-center gap-2.5 bg-amber-50 border-amber-300 text-amber-950';
    if (iconEcart) iconEcart.textContent = '⚠️';
    if (titreEcart) titreEcart.textContent = 'Excédent de Caisse (Surplus)';
    if (montantEcart) {
      montantEcart.textContent = `+${formatMoney(ecart)} en trop dans le tiroir`;
      montantEcart.className = 'text-sm font-black text-amber-800';
    }
  } else {
    if (boxEcart) boxEcart.className = 'p-2.5 rounded-xl border flex items-center gap-2.5 bg-rose-50 border-rose-300 text-rose-950';
    if (iconEcart) iconEcart.textContent = '🚨';
    if (titreEcart) titreEcart.textContent = 'Déficit / Manquant de Caisse';
    if (montantEcart) {
      montantEcart.textContent = `-${formatMoney(Math.abs(ecart))} manquant dans le tiroir`;
      montantEcart.className = 'text-sm font-black text-rose-700';
    }
  }
}

async function enregistrerClotureZ() {
  const preview = state.clotureApercu;
  if (!preview) {
    showToast('error', 'Erreur', 'Données de clôture indisponibles.');
    return;
  }

  const inputPhysique = document.getElementById('z-input-especes-physiques');
  const valPhysique = inputPhysique ? inputPhysique.value.trim() : '';
  if (valPhysique === '') {
    showToast('warning', 'Comptage Requis', 'Veuillez saisir le montant total des espèces physiques comptées dans le tiroir.');
    if (inputPhysique) inputPhysique.focus();
    return;
  }

  const especesPhysiques = parseFloat(valPhysique) || 0;
  const caissier = (document.getElementById('z-input-caissier')?.value || '').trim() || 'Caissier';
  const observations = (document.getElementById('z-input-observations')?.value || '').trim();

  const payload = {
    ...preview,
    especesPhysiques,
    caissier,
    observations
  };

  try {
    const res = await fetch('/api/clotures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erreur lors de la validation de la clôture.');

    state.clotures = state.clotures || [];
    state.clotures.unshift(result.cloture);

    showToast('success', 'Clôture Enregistrée !', `Rapport Z officiel ${result.cloture.code} certifié.`);
    playBeep('success');

    // Proposition immédiate de partage WhatsApp
    if (confirm(`Clôture certifiée avec succès (${result.cloture.code}) !\n\nSouhaitez-vous envoyer immédiatement le rapport Z par WhatsApp au propriétaire ?`)) {
      partagerRapportZWhatsApp(result.cloture);
    }
    fermerModalClotureZ();
  } catch (err) {
    console.error(err);
    showToast('error', 'Erreur', err.message || 'Impossible d\'enregistrer la clôture.');
  }
}

function genererTexteClotureZ(clotureData) {
  const p = clotureData || state.clotureApercu;
  if (!p) return '';

  const nomBoutique = (state.settings && state.settings.shop_name) || "COMMERCE DE SACHETS MIAKIARA";
  const caissier = document.getElementById('z-input-caissier')?.value.trim() || p.caissier || 'Responsable Caisse';
  const obs = document.getElementById('z-input-observations')?.value.trim() || p.observations || 'Clôture normale.';
  
  const valPhysique = document.getElementById('z-input-especes-physiques')?.value.trim();
  const physique = valPhysique !== undefined && valPhysique !== '' ? parseFloat(valPhysique) : (p.especesPhysiques || 0);
  const theorique = p.especesTheoriquesEnCaisse || 0;
  const ecart = Math.round(physique - theorique);

  let etatEcart = '✅ Caisse parfaitement équilibrée (0 FCFA)';
  if (ecart > 0) etatEcart = `⚠️ Excédent : +${formatMoney(ecart)}`;
  if (ecart < 0) etatEcart = `🚨 Manquant / Déficit : -${formatMoney(Math.abs(ecart))}`;

  return `📊 *RAPPORT OFFICIEL DE CLÔTURE DE CAISSE (RAPPORT Z)*
🏪 *${nomBoutique.toUpperCase()}*
📅 *Date :* ${p.date || new Date().toISOString().slice(0, 10)}
👤 *Clôturé par :* ${caissier}
───────────────────────
📈 *ACTIVITÉ DU JOUR :*
• Tickets de vente : ${p.ventesCount || 0} vente(s)
• Chiffre d'Affaires Net : *${formatMoney(p.chiffreAffairesNet || 0)}*
• Marge Brute estimée : ${formatMoney(p.margeBruteEstimee || 0)}
• Dépenses Fonctionnement : -${formatMoney(p.totalDepenses || 0)} (${p.depensesCount || 0} sortie(s))
⭐ *BÉNÉFICE NET DU JOUR : ${formatMoney(p.beneficeNetEstime || 0)}*
───────────────────────
💳 *VENTILATION DES RÈGLEMENTS :*
• Espèces ventes : ${formatMoney(p.especesVentes || 0)}
• Mobile Money (T-Money/Flooz) : ${formatMoney(p.momoVentes || 0)}
• Ventes à Crédit : ${formatMoney(p.creditVentes || 0)}
• Recouvrements dettes encaissés : +${formatMoney(p.totalRecouvrementsDettes || 0)}
───────────────────────
💵 *CONTRÔLE TIROIR-CAISSE (ESPÈCES) :*
• Espèces théoriques attendues : *${formatMoney(theorique)}*
• Espèces physiques comptées : *${formatMoney(physique)}*
• *Situation :* ${etatEcart}
───────────────────────
📝 *Observations :* ${obs}
💼 _Généré et certifié automatiquement par MIAKIARA POS._`;
}

function partagerRapportZWhatsApp(clotureObj) {
  const texte = genererTexteClotureZ(clotureObj);
  if (!texte) {
    showToast('error', 'Erreur', 'Données de clôture indisponibles.');
    return;
  }
  const telProprio = (state.settings && state.settings.shop_phone) || '';
  const { whatsappUrl } = buildShareUrls(telProprio, texte);
  window.open(whatsappUrl, '_blank');
}

function imprimerRapportZ(clotureObj) {
  const texte = genererTexteClotureZ(clotureObj);
  const win = window.open('', '_blank', 'width=450,height=600');
  if (!win) {
    alert("Veuillez autoriser les fenêtres pop-up pour imprimer.");
    return;
  }
  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Ticket Z - Clôture de Caisse</title>
      <style>
        body { font-family: monospace; font-size: 12px; padding: 15px; margin: 0; line-height: 1.4; white-space: pre-wrap; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
${texte.replace(/\*/g, '')}
      <script>
        window.onload = function() { window.print(); };
      </script>
    </body>
    </html>
  `);
  win.document.close();
}


