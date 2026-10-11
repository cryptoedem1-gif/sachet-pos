// SachetPOS - Logique Applicative Complète

let state = {
  products: [],
  customers: [],
  sales: [],
  stockMovements: [],
  settings: {
    shop_name: "COMMERCE SACHETS & SACS RAYÉS",
    shop_phone: "+228 90 00 00 00 / +225 07 00 00 00",
    shop_address: "Grand Marché - Halle Centrale",
    devise: "FCFA",
    receipt_footer: "Merci pour votre fidélité !"
  },
  cart: [],
  activeCategory: 'ALL',
  paymentMode: 'ESPECES',
  currentTab: 'pos',
  soundEnabled: true
};

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
      alert("✅ Sauvegarde restaurée avec succès !");
      await loadData();
    } catch (err) {
      alert("Erreur de restauration : " + err.message);
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
    state.customers = data.customers || [];
    state.sales = data.sales || [];
    state.stockMovements = data.stockMovements || [];
    if (data.settings) {
      state.settings = data.settings;
      if (data.settings.codePIN) {
        const labelCode = document.getElementById('label-pin-code');
        if (labelCode) labelCode.textContent = data.settings.codePIN;
      }
    }

    updateHeaderInfo();
    populateCustomerDropdown();
    renderPosCatalog();
    renderStockTable();
    renderCustomersTable();
    renderZReports();
    loadSettingsForm();
  } catch (err) {
    console.error("Erreur de chargement:", err);
  }
}

// Format monétaire
function formatMoney(amount) {
  const num = Math.round(Number(amount) || 0);
  return num.toLocaleString('fr-FR') + ' ' + (state.settings.devise || 'FCFA');
}

// Mise à jour de l'en-tête
function updateHeaderInfo() {
  document.getElementById('header-shop-name').textContent = state.settings.shop_name;
  
  // Valeur totale du stock = Somme(stock * prix)
  const totalStockVal = state.products.reduce((acc, p) => {
    return acc + ((parseFloat(p.stock) || 0) * (parseFloat(p.prix) || 0));
  }, 0);
  document.getElementById('header-stock-value').textContent = formatMoney(totalStockVal);

  // Ventes du jour
  const todayStr = new Date().toISOString().slice(0, 10);
  const todaySalesTotal = state.sales
    .filter(s => s.date && s.date.slice(0, 10) === todayStr)
    .reduce((acc, s) => acc + (parseFloat(s.totalNet) || 0), 0);
  document.getElementById('header-today-sales').textContent = formatMoney(todaySalesTotal);
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

  if (tabId === 'stock') renderStockTable();
  if (tabId === 'clients') renderCustomersTable();
  if (tabId === 'rapports') renderZReports();
}

// ==========================================
// 1. MODULE CAISSE & POINT DE VENTE (POS)
// ==========================================

function setCategoryFilter(cat) {
  state.activeCategory = cat;
  document.querySelectorAll('.cat-pill').forEach(btn => {
    btn.classList.remove('bg-sky-700', 'text-white');
    btn.classList.add('bg-slate-200', 'text-slate-700');
  });
  if (event && event.target) {
    event.target.classList.remove('bg-slate-200', 'text-slate-700');
    event.target.classList.add('bg-sky-700', 'text-white');
  }
  renderPosCatalog();
}

function clearSearch() {
  document.getElementById('pos-search').value = '';
  renderPosCatalog();
}

function renderPosCatalog() {
  const grid = document.getElementById('pos-grid');
  const search = (document.getElementById('pos-search').value || '').toLowerCase().trim();
  const colorFilter = (document.getElementById('pos-color-filter').value || '').toLowerCase().trim();

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

  grid.innerHTML = filtered.map(p => {
    const stockVal = parseFloat(p.stock) || 0;
    const isOutOfStock = stockVal <= 0;
    const isLowStock = stockVal > 0 && stockVal < (p.seuil_alerte || 1);

    let stockBadge = `<span class="bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded text-[10px] font-bold">Stock : ${stockVal} ${p.lot || 'Adaka'}</span>`;
    if (isOutOfStock) {
      stockBadge = `<span class="bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded text-[10px] font-bold">Rupture (0)</span>`;
    } else if (isLowStock) {
      stockBadge = `<span class="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded text-[10px] font-bold">Faible (${stockVal})</span>`;
    }

    return `
      <div class="product-card bg-white border border-slate-200 rounded-xl p-2.5 flex flex-col justify-between shadow-sm hover:border-sky-500 cursor-pointer relative overflow-hidden" onclick="addToCart(${p.id}, 1)">
        <div class="space-y-1">
          <div class="flex justify-between items-start">
            <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">${p.code || 'SCH'}</span>
            ${stockBadge}
          </div>
          
          <h3 class="font-bold text-slate-800 text-xs line-clamp-1 leading-snug">
            ${p.nom}
          </h3>

          <div class="flex flex-wrap gap-1 text-[10px] text-slate-600">
            <span class="bg-slate-100 px-1.5 py-0.5 rounded font-medium">${p.taille}</span>
            <span class="bg-slate-100 px-1.5 py-0.5 rounded font-medium">${p.couleur}</span>
            <span class="bg-sky-50 text-sky-700 px-1.5 py-0.5 rounded font-semibold">${p.marque}</span>
          </div>
        </div>

        <div class="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between">
          <div>
            <div class="text-[10px] text-slate-400">Prix / ${p.lot || 'Adaka'}</div>
            <div class="text-xs font-black text-sky-800">${formatMoney(p.prix)}</div>
          </div>
          
          <!-- Boutons rapides Adaka (1, 0.5, 0.25) -->
          <div class="flex gap-1" onclick="event.stopPropagation()">
            <button onclick="addToCart(${p.id}, 0.25)" class="px-1.5 py-0.5 bg-slate-100 hover:bg-sky-100 text-slate-700 hover:text-sky-800 rounded text-[10px] font-bold border border-slate-200" title="Ajouter 1/4 Adaka">
              ¼
            </button>
            <button onclick="addToCart(${p.id}, 0.5)" class="px-1.5 py-0.5 bg-slate-100 hover:bg-sky-100 text-slate-700 hover:text-sky-800 rounded text-[10px] font-bold border border-slate-200" title="Ajouter ½ Adaka">
              ½
            </button>
            <button onclick="addToCart(${p.id}, 1)" class="px-1.5 py-0.5 bg-sky-600 hover:bg-sky-700 text-white rounded text-[10px] font-bold shadow-sm" title="Ajouter 1 Adaka">
              +1
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// GESTION DU PANIER (CART)
function addToCart(productId, qty = 1) {
  const product = state.products.find(p => p.id === productId);
  if (!product) return;

  playBeep('beep');

  const existingIndex = state.cart.findIndex(item => item.productId === productId);
  if (existingIndex !== -1) {
    state.cart[existingIndex].quantite = Math.round((state.cart[existingIndex].quantite + qty) * 100) / 100;
  } else {
    state.cart.push({
      productId: product.id,
      code: product.code,
      nom: `${product.nom} ${product.taille} (${product.marque})`,
      prix: parseFloat(product.prix) || 0,
      quantite: qty,
      lot: product.lot || 'Adaka'
    });
  }

  renderCart();
}

function updateCartItemQty(index, newQty) {
  const val = parseFloat(newQty);
  if (val <= 0) {
    state.cart.splice(index, 1);
  } else {
    state.cart[index].quantite = Math.round(val * 100) / 100;
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
  document.getElementById('cart-discount').value = 0;
  renderCart();
}

function renderCart() {
  const container = document.getElementById('cart-items-container');
  const countBadge = document.getElementById('cart-item-count');
  const btnCheckout = document.getElementById('btn-checkout');

  countBadge.textContent = state.cart.length;
  
  const mobileBadge = document.getElementById('mobile-cart-badge');
  if (mobileBadge) mobileBadge.textContent = state.cart.length;

  const floatingBar = document.getElementById('mobile-floating-cart-bar');
  const floatingCount = document.getElementById('floating-cart-count');

  if (state.cart.length === 0) {
    if (floatingBar) floatingBar.classList.add('hidden');
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center h-48 text-slate-400 text-xs">
        <span class="text-3xl mb-1">🛍️</span>
        <span>Le panier est vide</span>
        <span class="text-slate-400">Cliquez sur un sachet pour l'ajouter</span>
      </div>`;
    btnCheckout.disabled = true;
    updateCartTotals();
    return;
  }

  btnCheckout.disabled = false;
  if (floatingBar && (!state.mobilePosTab || state.mobilePosTab === 'catalog')) {
    floatingBar.classList.remove('hidden');
  }
  if (floatingCount) floatingCount.textContent = state.cart.length;

  container.innerHTML = state.cart.map((item, index) => {
    const totalLine = item.quantite * item.prix;
    return `
      <div class="cart-item py-2 px-1 flex flex-col gap-1 border-b border-slate-100">
        <div class="flex justify-between items-start">
          <div class="font-bold text-slate-800 text-xs leading-tight">
            ${item.nom}
          </div>
          <button onclick="removeFromCart(${index})" class="text-slate-300 hover:text-rose-500 font-bold text-xs ml-2">✕</button>
        </div>

        <div class="flex items-center justify-between text-xs mt-1">
          <div class="flex items-center gap-1">
            <!-- Touches fractions directes -->
            <button onclick="setCartItemFraction(${index}, 0.25)" class="px-1 py-0.5 rounded text-[10px] ${item.quantite === 0.25 ? 'bg-sky-700 text-white font-bold' : 'bg-slate-100 text-slate-600'}">¼</button>
            <button onclick="setCartItemFraction(${index}, 0.5)" class="px-1 py-0.5 rounded text-[10px] ${item.quantite === 0.5 ? 'bg-sky-700 text-white font-bold' : 'bg-slate-100 text-slate-600'}">½</button>
            <button onclick="setCartItemFraction(${index}, 1)" class="px-1 py-0.5 rounded text-[10px] ${item.quantite === 1 ? 'bg-sky-700 text-white font-bold' : 'bg-slate-100 text-slate-600'}">1</button>

            <!-- Champ Quantité personnalisée -->
            <input type="number" step="0.25" min="0.01" value="${item.quantite}" onchange="updateCartItemQty(${index}, this.value)" class="w-14 text-center font-bold border border-slate-300 rounded p-0.5 text-xs">
            <span class="text-[10px] text-slate-400">${item.lot}</span>
          </div>

          <div class="text-right flex flex-col items-end gap-1">
            <div class="text-xs font-black text-slate-800">${formatMoney(totalLine)}</div>
            <div class="flex items-center gap-1">
              <span class="text-[10px] text-slate-400 font-semibold">P.U :</span>
              <input type="number" min="0" step="100" value="${item.prix}" onchange="updateCartItemPrice(${index}, this.value)" class="w-20 text-right font-black border border-slate-300 rounded px-1 py-0.5 text-xs text-sky-900 bg-sky-50 focus:bg-white focus:ring-1 focus:ring-sky-500" title="Prix unitaire négocié ou du marché (modifiable)">
              <button onclick="saveCartPriceToCatalog(${index})" class="text-[10px] text-slate-500 hover:text-emerald-700 bg-slate-100 hover:bg-emerald-50 border border-slate-200 rounded px-1 py-0.5 font-bold transition" title="Enregistrer ce prix comme nouveau prix officiel dans le catalogue">
                💾
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

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

  if (confirm(`Voulez-vous mettre à jour le prix officiel de "${prod.nom} ${prod.taille} (${prod.marque})" à ${formatMoney(item.prix)} dans le catalogue ?`)) {
    try {
      prod.prix = item.prix;
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prod)
      });
      if (!res.ok) throw new Error("Erreur sauvegarde prix");
      playBeep('success');
      await loadData();
      alert(`✅ Nouveau prix de ${formatMoney(item.prix)} enregistré dans le catalogue !`);
    } catch (err) {
      alert("Erreur lors de la mise à jour du catalogue.");
    }
  }
}

function updateCartTotals() {
  const subtotal = state.cart.reduce((sum, item) => sum + (item.quantite * item.prix), 0);
  const discountInput = parseFloat(document.getElementById('cart-discount').value) || 0;
  const netTotal = Math.max(0, subtotal - discountInput);

  document.getElementById('cart-subtotal').textContent = formatMoney(subtotal);
  document.getElementById('cart-total').textContent = formatMoney(netTotal);

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
  const subtotal = state.cart.reduce((sum, item) => sum + (item.quantite * item.prix), 0);
  const discount = parseFloat(document.getElementById('cart-discount').value) || 0;
  const netTotal = Math.max(0, subtotal - discount);

  document.getElementById('modal-checkout-total').textContent = formatMoney(netTotal);
  setPaymentMode('ESPECES');
  setExactAmount();

  const modal = document.getElementById('modal-checkout');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeModalCheckout() {
  const modal = document.getElementById('modal-checkout');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function setPaymentMode(mode) {
  state.paymentMode = mode;
  document.querySelectorAll('.paymode-btn').forEach(btn => {
    btn.classList.remove('border-2', 'border-emerald-500', 'bg-emerald-50', 'text-emerald-800');
    btn.classList.add('border', 'border-slate-300', 'text-slate-700');
  });

  const cashSection = document.getElementById('cash-calculator-section');
  if (mode === 'ESPECES') {
    document.getElementById('paymode-especes').classList.add('border-2', 'border-emerald-500', 'bg-emerald-50', 'text-emerald-800');
    cashSection.classList.remove('hidden');
  } else if (mode === 'MOBILE_MONEY') {
    document.getElementById('paymode-momo').classList.add('border-2', 'border-emerald-500', 'bg-emerald-50', 'text-emerald-800');
    cashSection.classList.add('hidden');
  } else if (mode === 'CREDIT') {
    document.getElementById('paymode-credit').classList.add('border-2', 'border-emerald-500', 'bg-emerald-50', 'text-emerald-800');
    cashSection.classList.add('hidden');
  }
}

function setExactAmount() {
  const subtotal = state.cart.reduce((sum, item) => sum + (item.quantite * item.prix), 0);
  const discount = parseFloat(document.getElementById('cart-discount').value) || 0;
  const netTotal = Math.max(0, subtotal - discount);
  document.getElementById('input-montant-recu').value = netTotal;
  calculateChange();
}

function addReceivedAmount(amount) {
  const current = parseFloat(document.getElementById('input-montant-recu').value) || 0;
  document.getElementById('input-montant-recu').value = current + amount;
  calculateChange();
}

function calculateChange() {
  const subtotal = state.cart.reduce((sum, item) => sum + (item.quantite * item.prix), 0);
  const discount = parseFloat(document.getElementById('cart-discount').value) || 0;
  const netTotal = Math.max(0, subtotal - discount);

  const recu = parseFloat(document.getElementById('input-montant-recu').value) || 0;
  const change = Math.max(0, recu - netTotal);

  document.getElementById('display-monnaie').textContent = formatMoney(change);
}

// VALIDATION DE LA VENTE
async function confirmSale(doPrint = true) {
  const subtotal = state.cart.reduce((sum, item) => sum + (item.quantite * item.prix), 0);
  const discount = parseFloat(document.getElementById('cart-discount').value) || 0;
  const netTotal = Math.max(0, subtotal - discount);

  const customerId = parseInt(document.getElementById('cart-customer-select').value) || 1;
  const customer = state.customers.find(c => c.id === customerId);

  let montantRecu = netTotal;
  let monnaieRendue = 0;
  let montantPaye = netTotal;
  let montantRestant = 0;

  if (state.paymentMode === 'ESPECES') {
    montantRecu = parseFloat(document.getElementById('input-montant-recu').value) || netTotal;
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
    items: state.cart,
    totalNet: netTotal,
    remise: discount,
    modePaiement: state.paymentMode,
    montantRecu: montantRecu,
    monnaieRendue: monnaieRendue,
    montantPaye: montantPaye,
    montantRestant: montantRestant
  };

  try {
    const res = await fetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      alert("Erreur lors de la vente : " + (data.error || "Problème serveur"));
      return;
    }

    closeModalCheckout();
    playBeep('success');
    
    // Imprimer le ticket
    if (doPrint) {
      printThermalReceipt(data.sale);
    }

    clearCart();
    await loadData();
    alert(`✅ Vente ${data.sale.ticketCode} enregistrée avec succès !`);
  } catch (err) {
    console.error("Erreur vente:", err);
    alert("Erreur réseau lors de la validation");
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
// 2. MODULE GESTION DES STOCKS (TABLEAU)
// ==========================================

function renderStockTable() {
  const tbody = document.getElementById('stock-table-body');
  const search = (document.getElementById('stock-table-search').value || '').toLowerCase().trim();
  const catFilter = document.getElementById('stock-table-cat').value;
  const statusFilter = document.getElementById('stock-table-status') ? document.getElementById('stock-table-status').value : '';

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

  // Mettre à jour les stats
  document.getElementById('stock-stat-total').textContent = state.products.length;
  const valTotal = state.products.reduce((acc, p) => acc + ((parseFloat(p.stock) || 0) * (parseFloat(p.prix) || 0)), 0);
  document.getElementById('stock-stat-valeur').textContent = formatMoney(valTotal);

  const faiblest = state.products.filter(p => (parseFloat(p.stock) || 0) > 0 && (parseFloat(p.stock) || 0) < 1).length;
  document.getElementById('stock-stat-faible').textContent = faiblest;

  const ruptures = state.products.filter(p => (parseFloat(p.stock) || 0) <= 0).length;
  document.getElementById('stock-stat-rupture').textContent = ruptures;

  tbody.innerHTML = filtered.map(p => {
    const stockNum = parseFloat(p.stock) || 0;
    const totalLineVal = stockNum * (parseFloat(p.prix) || 0);

    let stockBadgeClass = "bg-emerald-100 text-emerald-800";
    if (stockNum <= 0) stockBadgeClass = "bg-rose-100 text-rose-800 font-bold";
    else if (stockNum < 1) stockBadgeClass = "bg-amber-100 text-amber-800 font-bold";

    return `
      <tr class="hover:bg-slate-50 transition border-b border-slate-100">
        <td class="p-2.5 font-bold text-slate-500">${p.code || 'SCH'}</td>
        <td class="p-2.5 font-bold text-slate-800">${p.nom}</td>
        <td class="p-2.5 text-slate-600">${p.taille}</td>
        <td class="p-2.5 text-slate-600">${p.couleur}</td>
        <td class="p-2.5 font-semibold text-sky-800">${p.marque}</td>
        <td class="p-2.5 text-slate-500 uppercase text-[10px] font-bold">${p.lot || 'Adaka'}</td>
        <td class="p-2.5 text-center">
          <span class="px-2 py-0.5 rounded text-xs ${stockBadgeClass}">${stockNum} ${p.lot || 'Adaka'}</span>
        </td>
        <td class="p-2.5 text-right font-bold text-slate-700">
          <div class="flex items-center justify-end gap-1">
            <input type="number" step="100" min="0" value="${p.prix}" onchange="inlineUpdatePrice(${p.id}, this.value)" class="w-24 text-right font-black border border-slate-300 hover:border-sky-500 focus:border-sky-600 rounded px-1.5 py-1 text-xs text-sky-900 bg-sky-50/50 focus:bg-white focus:ring-1 focus:ring-sky-500 shadow-sm transition" title="Tapez pour modifier directement le prix du marché (enregistré automatiquement)">
            <span class="text-[10px] text-slate-400 font-semibold">${state.settings.devise || 'FCFA'}</span>
          </div>
        </td>
        <td class="p-2.5 text-right font-black text-sky-800">${formatMoney(totalLineVal)}</td>
        <td class="p-2.5 text-center space-x-1">
          <button onclick="openModalStockMovement(${p.id})" class="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded text-xs font-bold" title="Ajouter stock">📥</button>
          <button onclick="openModalEditProduct(${p.id})" class="px-2 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded text-xs font-bold" title="Modifier fiche complète">✏️</button>
          <button onclick="deleteProduct(${p.id})" class="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded text-xs font-bold" title="Supprimer">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
}

// MODIFICATION DU PRIX DU MARCHÉ EN DIRECT (TABLEAU DE STOCK)
async function inlineUpdatePrice(productId, newPrice) {
  const p = state.products.find(item => item.id === productId);
  if (!p) return;

  const val = parseFloat(newPrice);
  if (isNaN(val) || val < 0) return alert("Prix invalide");

  const ancienPrix = p.prix;
  p.prix = val;

  try {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p)
    });
    if (!res.ok) throw new Error("Erreur de sauvegarde");
    
    playBeep('beep');
    updateHeaderInfo();
    renderStockTable();
    renderPosCatalog();
  } catch (err) {
    p.prix = ancienPrix;
    renderStockTable();
    alert("Impossible d'enregistrer le nouveau prix.");
  }
}

// AJOUT / MODIFICATION D'UN ARTICLE
function openModalAddProduct() {
  document.getElementById('modal-product-title').textContent = "Ajouter un Sachet / Sac";
  document.getElementById('form-product').reset();
  document.getElementById('prod-id').value = '';
  document.getElementById('prod-stock').value = 1;
  document.getElementById('prod-lot').value = 'adaka';

  const modal = document.getElementById('modal-product');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function openModalEditProduct(id) {
  const p = state.products.find(item => item.id === id);
  if (!p) return;

  document.getElementById('modal-product-title').textContent = "Modifier l'Article #" + p.id;
  document.getElementById('prod-id').value = p.id;
  document.getElementById('prod-nom').value = p.nom;
  document.getElementById('prod-categorie').value = p.categorie || 'Autres Sachets';
  document.getElementById('prod-taille').value = p.taille;
  document.getElementById('prod-couleur').value = p.couleur;
  document.getElementById('prod-marque').value = p.marque;
  document.getElementById('prod-lot').value = p.lot || 'adaka';
  document.getElementById('prod-stock').value = p.stock;
  document.getElementById('prod-prix').value = p.prix;

  const modal = document.getElementById('modal-product');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeModalProduct() {
  const modal = document.getElementById('modal-product');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

async function saveProduct(e) {
  e.preventDefault();
  const id = document.getElementById('prod-id').value;

  const productData = {
    id: id ? parseInt(id) : undefined,
    nom: document.getElementById('prod-nom').value.trim(),
    categorie: document.getElementById('prod-categorie').value,
    taille: document.getElementById('prod-taille').value.trim(),
    couleur: document.getElementById('prod-couleur').value.trim(),
    marque: document.getElementById('prod-marque').value.trim(),
    lot: document.getElementById('prod-lot').value.trim() || 'adaka',
    stock: parseFloat(document.getElementById('prod-stock').value) || 0,
    prix: parseFloat(document.getElementById('prod-prix').value) || 0
  };

  try {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(productData)
    });
    if (!res.ok) throw new Error("Échec d'enregistrement");
    closeModalProduct();
    await loadData();
  } catch (err) {
    alert("Erreur lors de l'enregistrement de l'article");
  }
}

async function deleteProduct(id) {
  if (!confirm("Voulez-vous vraiment supprimer cet article ?")) return;
  try {
    const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error("Échec suppression");
    await loadData();
  } catch (err) {
    alert("Erreur de suppression");
  }
}

// RÉAPPROVISIONNEMENT RAPIDE
function openModalStockMovement(productId = null) {
  const select = document.getElementById('reappro-product-select');
  select.innerHTML = state.products.map(p => `
    <option value="${p.id}" ${productId === p.id ? 'selected' : ''}>
      ${p.nom} ${p.taille} ${p.couleur} - ${p.marque} (Stock actuel: ${p.stock} ${p.lot})
    </option>
  `).join('');

  document.getElementById('reappro-quantite').value = 1;
  const modal = document.getElementById('modal-reappro');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeModalReappro() {
  const modal = document.getElementById('modal-reappro');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

async function submitReappro() {
  const productId = parseInt(document.getElementById('reappro-product-select').value);
  const quantite = parseFloat(document.getElementById('reappro-quantite').value) || 0;
  const motif = document.getElementById('reappro-motif').value;

  if (quantite <= 0) return alert("Veuillez saisir une quantité positive.");

  try {
    const res = await fetch('/api/stock/movement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId,
        type: 'ENTREE',
        quantite,
        motif
      })
    });
    if (!res.ok) throw new Error("Erreur approvisionnement");
    closeModalReappro();
    await loadData();
    alert("✅ Stock réapprovisionné avec succès !");
  } catch (err) {
    alert("Erreur lors de l'entrée en stock.");
  }
}

// ==========================================
// 3. MODULE CLIENTS & CARNET DE DETTES
// ==========================================

function renderCustomersTable() {
  const tbody = document.getElementById('customers-table-body');
  const totalDettes = state.customers.reduce((sum, c) => sum + (parseFloat(c.dette) || 0), 0);
  document.getElementById('total-dettes-clients').textContent = formatMoney(totalDettes);

  tbody.innerHTML = state.customers.map(c => {
    const detteVal = parseFloat(c.dette) || 0;
    return `
      <tr class="hover:bg-slate-50 border-b border-slate-100">
        <td class="p-3 font-bold text-slate-800">${c.nom}</td>
        <td class="p-3 text-slate-600">${c.telephone || '-'}</td>
        <td class="p-3 text-slate-600">${c.adresse || '-'}</td>
        <td class="p-3 text-right font-black ${detteVal > 0 ? 'text-amber-700' : 'text-emerald-700'}">
          ${formatMoney(detteVal)}
        </td>
        <td class="p-3 text-center">
          ${detteVal > 0 ? `
            <button onclick="openModalPayDebt(${c.id})" class="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold shadow-sm">
              💵 Encaisser Règlement
            </button>
          ` : `
            <span class="text-xs text-slate-400">À jour</span>
          `}
        </td>
      </tr>
    `;
  }).join('');
}

function openModalAddCustomer() {
  document.getElementById('cust-nom').value = '';
  document.getElementById('cust-tel').value = '';
  document.getElementById('cust-adresse').value = '';
  const modal = document.getElementById('modal-customer');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeModalCustomer() {
  const modal = document.getElementById('modal-customer');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

async function saveCustomer() {
  const nom = document.getElementById('cust-nom').value.trim();
  if (!nom) return alert("Le nom est obligatoire");

  const newCust = {
    nom: nom,
    telephone: document.getElementById('cust-tel').value.trim(),
    adresse: document.getElementById('cust-adresse').value.trim(),
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
    await loadData();
  } catch (err) {
    alert("Impossible d'ajouter le client");
  }
}

function openModalPayDebt(customerId) {
  const customer = state.customers.find(c => c.id === customerId);
  if (!customer) return;

  document.getElementById('pay-debt-cust-id').value = customer.id;
  document.getElementById('pay-debt-cust-name').textContent = "Client : " + customer.nom;
  document.getElementById('pay-debt-current').textContent = "Dette due : " + formatMoney(customer.dette);
  document.getElementById('pay-debt-amount').value = customer.dette;

  const modal = document.getElementById('modal-pay-debt');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeModalPayDebt() {
  const modal = document.getElementById('modal-pay-debt');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

async function submitDebtPayment() {
  const customerId = document.getElementById('pay-debt-cust-id').value;
  const montant = parseFloat(document.getElementById('pay-debt-amount').value) || 0;
  const modePaiement = document.getElementById('pay-debt-mode').value;

  if (montant <= 0) return alert("Montant invalide");

  try {
    const res = await fetch(`/api/customers/${customerId}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ montant, modePaiement })
    });
    if (!res.ok) throw new Error("Erreur de paiement dette");
    closeModalPayDebt();
    await loadData();
    alert("✅ Règlement encaissé et déduit avec succès !");
  } catch (err) {
    alert("Erreur réseau");
  }
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

  document.getElementById('z-total-ca').textContent = formatMoney(totalCA);
  document.getElementById('z-total-especes').textContent = formatMoney(totalEspeces);
  document.getElementById('z-total-momo').textContent = formatMoney(totalMomo);
  document.getElementById('z-total-credit').textContent = formatMoney(totalCredit);

  // Marge Brute / Bénéfice Estimé
  let totalCoutAchat = 0;
  state.sales.forEach(s => {
    (s.items || []).forEach(it => {
      const prod = state.products.find(p => p.id === it.productId);
      const coutUnitaire = prod && prod.prix_achat ? parseFloat(prod.prix_achat) : (parseFloat(it.prix) * 0.85);
      totalCoutAchat += (coutUnitaire * (parseFloat(it.quantite) || 0));
    });
  });
  const margeEstimee = Math.max(0, totalCA - totalCoutAchat);
  const elemMarge = document.getElementById('z-total-marge');
  if (elemMarge) elemMarge.textContent = formatMoney(margeEstimee);

  document.getElementById('sales-count-badge').textContent = `${state.sales.length} tickets enregistrés`;

  const tbody = document.getElementById('sales-table-body');
  tbody.innerHTML = state.sales.map(s => {
    const dt = new Date(s.date);
    const dateStr = dt.toLocaleDateString('fr-FR') + ' ' + dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const itemsCount = (s.items || []).reduce((sum, i) => sum + (parseFloat(i.quantite) || 0), 0);

    return `
      <tr class="hover:bg-slate-50 border-b border-slate-100">
        <td class="p-2.5 font-bold text-sky-800">${s.ticketCode}</td>
        <td class="p-2.5 text-slate-500">${dateStr}</td>
        <td class="p-2.5 font-semibold text-slate-800">${s.clientNom}</td>
        <td class="p-2.5 text-slate-600">${itemsCount} Adaka</td>
        <td class="p-2.5 font-medium"><span class="px-2 py-0.5 rounded text-[10px] bg-slate-100">${s.modePaiement}</span></td>
        <td class="p-2.5 text-right font-black text-slate-800">${formatMoney(s.totalNet)}</td>
        <td class="p-2.5 text-center">
          <button onclick='printThermalReceipt(${JSON.stringify(s)})' class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-bold" title="Réimprimer">
            🖨️ Ticket
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// --- MODAL JOURNAL DES MOUVEMENTS DE STOCK ---
function openModalStockJournal() {
  const tbody = document.getElementById('stock-journal-table-body');
  if (!tbody) return;

  const movements = state.stockMovements || [];
  if (movements.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-400">Aucun mouvement enregistré pour l'instant.</td></tr>`;
  } else {
    tbody.innerHTML = movements.map(m => {
      const dt = new Date(m.date);
      const dateStr = dt.toLocaleDateString('fr-FR') + ' ' + dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

      let badgeClass = "bg-slate-100 text-slate-700";
      if (m.type === 'ENTREE') badgeClass = "bg-emerald-100 text-emerald-800 font-bold";
      else if (m.type === 'VENTE') badgeClass = "bg-sky-100 text-sky-800";
      else if (m.type === 'SORTIE' || m.type === 'PERTE') badgeClass = "bg-rose-100 text-rose-800 font-bold";

      return `
        <tr class="hover:bg-slate-50 border-b border-slate-100">
          <td class="p-2 text-slate-500 whitespace-nowrap">${dateStr}</td>
          <td class="p-2 font-bold text-slate-800">${m.productName || 'Article'}</td>
          <td class="p-2"><span class="px-2 py-0.5 rounded text-[10px] ${badgeClass}">${m.type}</span></td>
          <td class="p-2 text-center font-bold text-slate-800">${m.quantite}</td>
          <td class="p-2 text-center text-slate-500 font-medium">${m.ancienStock} ➔ ${m.nouveauStock}</td>
          <td class="p-2 text-slate-600">${m.motif || '-'}</td>
        </tr>
      `;
    }).join('');
  }

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

