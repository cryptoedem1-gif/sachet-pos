const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const ALT_PORT = 5101;
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'db.json');
const PUBLIC_DIR = fs.existsSync(path.join(__dirname, 'public')) ? path.join(__dirname, 'public') : __dirname;

let activeTunnel = null;
let tunnelUrl = null;

// Détection automatique d'un tunnel Cloudflare déjà actif
try {
  const cLogPath = path.join(__dirname, 'cloudflared.log');
  if (fs.existsSync(cLogPath)) {
    const cLog = fs.readFileSync(cLogPath, 'utf8');
    const matches = [...cLog.matchAll(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/g)];
    if (matches.length > 0) {
      tunnelUrl = matches[matches.length - 1][0];
      console.log("🌐 Tunnel Cloudflare actif détecté :", tunnelUrl);
    }
  }
} catch (e) {}

// Ensure db.json exists
if (!fs.existsSync(DB_FILE)) {
  console.log("Fichier db.json non trouvé, initialisation via import_csv.js...");
  require('./import_csv.js');
}

function readDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed === 'object') {
        parsed.products = Array.isArray(parsed.products) ? parsed.products : [];
        parsed.products.forEach(p => {
          p.unites_par_adaka = parseInt(p.unites_par_adaka) || 20;
          p.stock = parseFloat(p.stock) || 0;
          if (p.stock_unites === undefined || isNaN(p.stock_unites)) {
            p.stock_unites = Math.round(p.stock * p.unites_par_adaka);
          }
          p.cout_unitaire_achat = Math.round(((parseFloat(p.prix_achat) || 0) / p.unites_par_adaka) * 100) / 100;
          if (!p.prix_detail_unite || p.prix_detail_unite <= 0) {
            if (p.prix_detail && p.prix_detail <= 100) {
              p.prix_detail_unite = p.prix_detail;
            } else {
              p.prix_detail_unite = Math.max(5, Math.round(((parseFloat(p.prix_detail) || parseFloat(p.prix_gros) || 1000) / p.unites_par_adaka) / 5) * 5);
            }
          }
        });
        parsed.customers = Array.isArray(parsed.customers) ? parsed.customers : [];
        parsed.sales = Array.isArray(parsed.sales) ? parsed.sales : [];
        parsed.stockMovements = Array.isArray(parsed.stockMovements) ? parsed.stockMovements : [];
        parsed.suppliers = Array.isArray(parsed.suppliers) ? parsed.suppliers : [];
        parsed.approvisionnements = Array.isArray(parsed.approvisionnements) ? parsed.approvisionnements : [];
        parsed.customerPayments = Array.isArray(parsed.customerPayments) ? parsed.customerPayments : [];
        parsed.dettes = Array.isArray(parsed.dettes) ? parsed.dettes : [];
        parsed.reglementsDettes = Array.isArray(parsed.reglementsDettes) ? parsed.reglementsDettes : [];
        parsed.depenses = Array.isArray(parsed.depenses) ? parsed.depenses : [];
        parsed.clotures = Array.isArray(parsed.clotures) ? parsed.clotures : [];

        // Reprise automatique des dettes existantes si dettes est vide
        if (parsed.dettes.length === 0) {
          let seedId = 1;
          parsed.customers.forEach(c => {
            const dVal = parseFloat(c.dette) || 0;
            if (dVal > 0) {
              parsed.dettes.push({
                id: seedId,
                code: `DET-CLI-${String(seedId).padStart(4, '0')}`,
                type: 'CLIENT',
                tierId: c.id,
                tierNom: c.nom,
                telephone: c.telephone || '',
                date: new Date().toISOString(),
                dateEcheance: null,
                description: "Créance antérieure (reprise d'historique comptable)",
                reference: `REPORT-${c.id}`,
                montantInitial: dVal,
                montantRegle: 0,
                soldeRestant: dVal,
                statut: 'NON_REGLEE',
                observations: "Dette initiale enregistrée avant le suivi individualisé",
                dateCreation: new Date().toISOString(),
                annulee: false
              });
              seedId++;
            }
          });
          parsed.suppliers.forEach(s => {
            const sVal = parseFloat(s.solde_dette) || 0;
            if (sVal > 0) {
              parsed.dettes.push({
                id: seedId,
                code: `DET-FRN-${String(seedId).padStart(4, '0')}`,
                type: 'FOURNISSEUR',
                tierId: s.id,
                tierNom: s.nom,
                telephone: s.telephone || '',
                date: new Date().toISOString(),
                dateEcheance: null,
                description: "Dette antérieure (reprise d'historique fournisseur)",
                reference: `REPORT-FRN-${s.id}`,
                montantInitial: sVal,
                montantRegle: 0,
                soldeRestant: sVal,
                statut: 'NON_REGLEE',
                observations: "Dette fournisseur initiale",
                dateCreation: new Date().toISOString(),
                annulee: false
              });
              seedId++;
            }
          });
        }

        parsed.settings = parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : {};
        return parsed;
      }
    }
  } catch (err) {
    console.error("Avertissement lecture db.json, tentative de récupération depuis db.json.bak:", err);
    try {
      if (fs.existsSync(DB_FILE + '.bak')) {
        const bakData = fs.readFileSync(DB_FILE + '.bak', 'utf8');
        const parsedBak = JSON.parse(bakData);
        if (parsedBak && typeof parsedBak === 'object') {
          console.log("Restauration de secours réussie depuis db.json.bak !");
          return parsedBak;
        }
      }
    } catch (bakErr) {
      console.error("Échec récupération backup:", bakErr);
    }
  }
  return {
    settings: {
      shop_name: "MIAKIARA",
      shop_phone: "+228 90 33 33 28  / +228 99 53 91 83",
      shop_address: "Grand Marché Moderne TSEVIE BOUTIQUE 22",
      devise: "FCFA",
      receipt_footer: "Merci pour votre confiance ! MIAKIARA - Sachets & Emballages.",
      codePIN: "1234"
    },
    products: [],
    customers: [],
    sales: [],
    stockMovements: [],
    suppliers: [],
    approvisionnements: [],
    customerPayments: [],
    dettes: [],
    reglementsDettes: []
  };
}

function writeDb(data) {
  try {
    // 1. Sauvegarde automatique de sécurité (.bak) avant écrasement
    if (fs.existsSync(DB_FILE)) {
      try {
        const stats = fs.statSync(DB_FILE);
        if (stats.size > 200) {
          fs.copyFileSync(DB_FILE, DB_FILE + '.bak');
        }
      } catch (e) {}
    }

    // 2. Écriture atomique sécurisée via fichier temporaire (.tmp) puis renommage
    const tmpFile = DB_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpFile, DB_FILE);
    return true;
  } catch (err) {
    console.error("Erreur critique d'écriture atomique db.json:", err);
    return false;
  }
}

// MIME types dictionary
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        if (!body) return resolve({});
        const parsed = JSON.parse(body);
        resolve(parsed);
      } catch (err) {
        resolve({ raw: body });
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  // Route API : Synchronisation en direct (heartbeat mtime)
  if (pathname === '/api/sync' && method === 'GET') {
    let lastUpdated = 0;
    try {
      if (fs.existsSync(DB_FILE)) {
        lastUpdated = fs.statSync(DB_FILE).mtimeMs;
      }
    } catch (e) {}
    return sendJson(res, 200, { lastUpdated });
  }

  // --- API ROUTES ---
  if (pathname === '/api/data' && method === 'GET') {
    const db = readDb();
    return sendJson(res, 200, db);
  }

  // Update Settings
  if (pathname === '/api/settings' && method === 'POST') {
    const body = await parseBody(req);
    const db = readDb();
    db.settings = { ...db.settings, ...body };
    writeDb(db);
    return sendJson(res, 200, { success: true, settings: db.settings });
  }

  // --- SUPPLIERS API ---
  if (pathname === '/api/suppliers' && method === 'GET') {
    const db = readDb();
    return sendJson(res, 200, db.suppliers || []);
  }

  if (pathname === '/api/suppliers' && method === 'POST') {
    const body = await parseBody(req);
    const db = readDb();
    db.suppliers = db.suppliers || [];

    if (!body.nom || !body.nom.trim()) {
      return sendJson(res, 400, { error: "Le nom du fournisseur est obligatoire." });
    }

    if (body.id) {
      const idx = db.suppliers.findIndex(s => s.id === parseInt(body.id));
      if (idx !== -1) {
        db.suppliers[idx] = { ...db.suppliers[idx], ...body, id: parseInt(body.id) };
      } else {
        db.suppliers.push({ ...body, id: parseInt(body.id) });
      }
    } else {
      const maxId = db.suppliers.reduce((max, s) => Math.max(max, s.id || 0), 0);
      const newSupplier = {
        id: maxId + 1,
        nom: body.nom.trim(),
        telephone: body.telephone ? body.telephone.trim() : '',
        adresse: body.adresse ? body.adresse.trim() : '',
        solde_dette: parseFloat(body.solde_dette) || 0,
        notes: body.notes || ''
      };
      db.suppliers.push(newSupplier);
    }
    writeDb(db);
    return sendJson(res, 200, { success: true, suppliers: db.suppliers });
  }

  if (pathname.startsWith('/api/suppliers/') && method === 'DELETE') {
    const id = parseInt(pathname.replace('/api/suppliers/', ''));
    const db = readDb();
    db.suppliers = (db.suppliers || []).filter(s => s.id !== id);
    writeDb(db);
    return sendJson(res, 200, { success: true, suppliers: db.suppliers });
  }

  // --- APPROVISIONNEMENTS API ---
  if (pathname === '/api/approvisionnements' && method === 'GET') {
    const db = readDb();
    return sendJson(res, 200, db.approvisionnements || []);
  }

  if (pathname === '/api/approvisionnements' && method === 'POST') {
    const body = await parseBody(req);
    const db = readDb();
    db.approvisionnements = db.approvisionnements || [];
    db.products = db.products || [];

    const productId = parseInt(body.productId);
    const product = db.products.find(p => p.id === productId);
    if (!product) {
      return sendJson(res, 404, { error: "Article sélectionné introuvable dans l'inventaire." });
    }

    const qteAchetee = parseFloat(body.quantite) || 0;
    if (qteAchetee <= 0) {
      return sendJson(res, 400, { error: "La quantité approvisionnée doit être positive." });
    }

    const prixAchatUnitaire = parseFloat(body.prixAchatUnitaire) || 0;
    const montantAchatTotal = Math.round((qteAchetee * prixAchatUnitaire) * 100) / 100;
    const fraisTransport = parseFloat(body.fraisTransport) || 0;
    const autresFrais = parseFloat(body.autresFrais) || 0;
    const totalFraisAnnexes = fraisTransport + autresFrais;

    // Coût réel d'acquisition total et unitaire (frais inclus)
    const coutReelAcquisition = montantAchatTotal + totalFraisAnnexes;
    const coutUnitaireReel = qteAchetee > 0 ? (coutReelAcquisition / qteAchetee) : prixAchatUnitaire;

    // Prix de vente en gros et au détail prévus
    const prixVenteGros = parseFloat(body.prixVenteGros) || product.prix_gros || product.prix || Math.round(coutUnitaireReel * 1.15);
    const prixVenteDetail = parseFloat(body.prixVenteDetail) || product.prix_detail || Math.round(prixVenteGros * 1.10);

    const unitesParAdaka = parseInt(body.unites_par_adaka) || product.unites_par_adaka || 20;
    const prixDetailUnite = parseFloat(body.prixDetailUnite) || product.prix_detail_unite || Math.max(5, Math.round((prixVenteDetail / unitesParAdaka) / 5) * 5);
    const coutUnitaireReelUnit = Math.round((coutUnitaireReel / unitesParAdaka) * 100) / 100;
    const margeDetailUnit = Math.round((prixDetailUnite - coutUnitaireReelUnit) * 100) / 100;

    // Calcul automatique des marges commerciales
    const margeBruteUnitaire = prixVenteGros - coutUnitaireReel;
    const margeBruteTotale = Math.round((margeBruteUnitaire * qteAchetee) * 100) / 100;
    const tauxMarge = coutUnitaireReel > 0 ? ((margeBruteUnitaire / coutUnitaireReel) * 100) : 0;
    const tauxMarque = prixVenteGros > 0 ? ((margeBruteUnitaire / prixVenteGros) * 100) : 0;

    // Recalcul du Coût Moyen Pondéré (CMP) et mise à jour du stock
    const ancienStock = parseFloat(product.stock) || 0;
    const ancienCout = parseFloat(product.prix_achat) || coutUnitaireReel;
    const nouveauStock = Math.round((ancienStock + qteAchetee) * 1000) / 1000;
    
    let nouveauCMP = coutUnitaireReel;
    if (nouveauStock > 0 && ancienStock > 0) {
      nouveauCMP = ((ancienStock * ancienCout) + (qteAchetee * coutUnitaireReel)) / nouveauStock;
    }
    nouveauCMP = Math.round(nouveauCMP * 100) / 100;

    // Mise à jour de la fiche article
    product.unites_par_adaka = unitesParAdaka;
    product.stock = nouveauStock;
    product.stock_unites = Math.round(nouveauStock * unitesParAdaka);
    product.prix_achat = nouveauCMP;
    product.cout_unitaire_achat = Math.round((nouveauCMP / unitesParAdaka) * 100) / 100;
    product.prix_gros = prixVenteGros;
    product.prix_detail = prixVenteDetail;
    product.prix_detail_unite = prixDetailUnite;
    product.prix = prixVenteGros;
    product.marge_brute_unitaire = Math.round((prixVenteGros - nouveauCMP) * 100) / 100;
    product.taux_marge = nouveauCMP > 0 ? Math.round(((product.marge_brute_unitaire / nouveauCMP) * 100) * 100) / 100 : 0;
    product.taux_marque = prixVenteGros > 0 ? Math.round(((product.marge_brute_unitaire / prixVenteGros) * 100) * 100) / 100 : 0;
    if (body.fournisseurId) {
      product.fournisseurId = parseInt(body.fournisseurId);
      product.fournisseurNom = body.fournisseurNom || '';
    }

    const appId = (db.approvisionnements.length > 0 ? Math.max(...db.approvisionnements.map(a => a.id || 0)) : 0) + 1;
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const bonCode = `APP-${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${String(appId).padStart(3, '0')}`;

    // Gestion de la dette fournisseur si achat à crédit
    if (body.fournisseurId && body.modeReglement === 'CREDIT') {
      const supplier = (db.suppliers || []).find(s => s.id === parseInt(body.fournisseurId));
      if (supplier) {
        supplier.solde_dette = (parseFloat(supplier.solde_dette) || 0) + coutReelAcquisition;
      }
      db.dettes = db.dettes || [];
      const maxDetId = db.dettes.reduce((max, d) => Math.max(max, d.id || 0), 0);
      const newSuppDebt = {
        id: maxDetId + 1,
        code: `DET-FRN-${String(maxDetId + 1).padStart(4, '0')}`,
        type: 'FOURNISSEUR',
        tierId: supplier ? supplier.id : parseInt(body.fournisseurId),
        tierNom: supplier ? supplier.nom : (body.fournisseurNom || 'Fournisseur'),
        telephone: supplier ? (supplier.telephone || '') : '',
        date: body.date || now.toISOString(),
        dateEcheance: body.dateEcheance || null,
        description: `Achat à crédit Bon #${bonCode} (${product.nom})`,
        reference: bonCode,
        montantInitial: coutReelAcquisition,
        montantRegle: 0,
        soldeRestant: coutReelAcquisition,
        statut: 'NON_REGLEE',
        observations: body.notes || '',
        approId: appId,
        dateCreation: now.toISOString(),
        annulee: false
      };
      db.dettes.unshift(newSuppDebt);
    }

    const productFullName = product.designation || (product.nom + (product.taille ? ' ' + product.taille : '') + (product.couleur && product.couleur !== 'transparent' ? ' ' + product.couleur : '') + (product.marque ? ' - ' + product.marque : ''));
    const newAppro = {
      id: appId,
      code: bonCode,
      codeBon: bonCode,
      date: body.date || now.toISOString(),
      fournisseurId: body.fournisseurId ? parseInt(body.fournisseurId) : null,
      fournisseurNom: body.fournisseurNom || 'Fournisseur Général',
      modeReglement: body.modeReglement || 'ESPECES',
      productId: product.id,
      productCode: product.code || `SCH-${String(product.id).padStart(3, '0')}`,
      productNom: productFullName,
      productName: productFullName,
      quantite: qteAchetee,
      unitesParAdaka: unitesParAdaka,
      uniteAchat: body.uniteAchat || product.lot || 'Adaka',
      prixAchatUnitaire: prixAchatUnitaire,
      montantAchatTotal: montantAchatTotal,
      fraisTransport: fraisTransport,
      autresFrais: autresFrais,
      totalFraisAnnexes: totalFraisAnnexes,
      coutReelAcquisition: coutReelAcquisition,
      coutUnitaireReel: Math.round(coutUnitaireReel * 100) / 100,
      coutUnitaireReelUnit: coutUnitaireReelUnit,
      prixVenteGros: prixVenteGros,
      prixVenteDetail: prixVenteDetail,
      prixDetailUnite: prixDetailUnite,
      margeBruteUnitaire: Math.round(margeBruteUnitaire * 100) / 100,
      margeBruteTotale: Math.round(margeBruteTotale * 100) / 100,
      margeDetailUnit: margeDetailUnit,
      tauxMarge: Math.round(tauxMarge * 100) / 100,
      tauxMarque: Math.round(tauxMarque * 100) / 100,
      ancienStock: ancienStock,
      nouveauStock: nouveauStock,
      ancienStockUnites: Math.round(ancienStock * unitesParAdaka),
      nouveauStockUnites: Math.round(nouveauStock * unitesParAdaka),
      nouveauCMP: nouveauCMP,
      notes: body.notes || ''
    };

    db.approvisionnements.unshift(newAppro);

    // Enregistrement dans l'historique des mouvements de stock
    db.stockMovements = db.stockMovements || [];
    db.stockMovements.unshift({
      id: Date.now() + Math.random(),
      date: newAppro.date,
      productId: product.id,
      productCode: newAppro.productCode,
      productName: newAppro.productNom,
      type: 'ENTREE',
      quantite: qteAchetee,
      quantiteAdaka: qteAchetee,
      quantiteUnites: Math.round(qteAchetee * unitesParAdaka),
      ancienStock: ancienStock,
      nouveauStock: nouveauStock,
      ancienStockAdaka: ancienStock,
      nouveauStockAdaka: nouveauStock,
      ancienStockUnites: Math.round(ancienStock * unitesParAdaka),
      nouveauStockUnites: Math.round(nouveauStock * unitesParAdaka),
      motif: `Approvisionnement ${bonCode} (${newAppro.fournisseurNom})`
    });

    writeDb(db);
    return sendJson(res, 201, {
      success: true,
      approvisionnement: newAppro,
      product: product,
      products: db.products,
      suppliers: db.suppliers
    });
  }

  // DELETE /api/approvisionnements/:id
  if (pathname.startsWith('/api/approvisionnements/') && method === 'DELETE') {
    const id = parseInt(pathname.replace('/api/approvisionnements/', ''));
    const db = readDb();
    const appro = (db.approvisionnements || []).find(a => a.id === id);
    if (!appro) {
      return sendJson(res, 404, { error: "Approvisionnement introuvable." });
    }

    const product = (db.products || []).find(p => p.id === appro.productId);
    if (product) {
      const qte = parseFloat(appro.quantite) || 0;
      const unitesParAdaka = product.unites_par_adaka || appro.unitesParAdaka || 20;
      const oldStock = parseFloat(product.stock) || 0;
      product.stock = Math.max(0, Math.round((oldStock - qte) * 1000) / 1000);
      product.stock_unites = Math.round(product.stock * unitesParAdaka);
      
      db.stockMovements = db.stockMovements || [];
      db.stockMovements.unshift({
        id: Date.now() + Math.random(),
        date: new Date().toISOString(),
        productId: product.id,
        productName: product.nom,
        type: 'SORTIE',
        quantite: qte,
        quantiteAdaka: qte,
        quantiteUnites: Math.round(qte * unitesParAdaka),
        ancienStock: oldStock,
        nouveauStock: product.stock,
        ancienStockAdaka: oldStock,
        nouveauStockAdaka: product.stock,
        ancienStockUnites: Math.round(oldStock * unitesParAdaka),
        nouveauStockUnites: product.stock_unites,
        motif: `Annulation Approvisionnement #${appro.code || appro.id}`
      });
    }

    if (appro.fournisseurId && appro.modeReglement === 'CREDIT') {
      const supplier = (db.suppliers || []).find(s => s.id === appro.fournisseurId);
      if (supplier) {
        supplier.solde_dette = Math.max(0, (parseFloat(supplier.solde_dette) || 0) - (appro.coutReelAcquisition || 0));
      }
      db.dettes = db.dettes || [];
      const linkedSuppDebt = db.dettes.find(d => d.approId === id);
      if (linkedSuppDebt) {
        linkedSuppDebt.annulee = true;
        linkedSuppDebt.soldeRestant = 0;
        linkedSuppDebt.statut = 'SOLDEE';
        linkedSuppDebt.observations = (linkedSuppDebt.observations ? linkedSuppDebt.observations + ' | ' : '') + `Annulé suite à suppression du Bon #${appro.code || id}`;
      }
    }

    db.approvisionnements = (db.approvisionnements || []).filter(a => a.id !== id);
    writeDb(db);
    return sendJson(res, 200, { success: true, message: "Approvisionnement annulé et stock restauré." });
  }

  // ==========================================
  // API DÉPENSES DE FONCTIONNEMENT (PETITE CAISSE)
  // ==========================================
  if (pathname === '/api/depenses' && method === 'GET') {
    const db = readDb();
    return sendJson(res, 200, db.depenses || []);
  }

  if (pathname === '/api/depenses' && method === 'POST') {
    const body = await parseBody(req);
    const db = readDb();
    db.depenses = db.depenses || [];
    const montant = parseFloat(body.montant) || 0;
    if (montant <= 0) {
      return sendJson(res, 400, { error: "Le montant de la dépense doit être supérieur à 0." });
    }
    const maxId = db.depenses.reduce((m, d) => Math.max(m, d.id || 0), 0);
    const newDep = {
      id: maxId + 1,
      date: body.date || new Date().toISOString(),
      motif: (body.motif || 'Dépense diverse').trim(),
      categorie: body.categorie || 'AUTRE',
      montant: montant,
      modePaiement: body.modePaiement || 'CAISSE_ESPECES',
      beneficiaire: (body.beneficiaire || '').trim(),
      observation: (body.observation || '').trim(),
      dateCreation: new Date().toISOString()
    };
    db.depenses.unshift(newDep);
    writeDb(db);
    return sendJson(res, 201, { success: true, depense: newDep });
  }

  if (pathname.startsWith('/api/depenses/') && method === 'DELETE') {
    const id = parseInt(pathname.replace('/api/depenses/', ''));
    const db = readDb();
    const idx = (db.depenses || []).findIndex(d => d.id === id);
    if (idx === -1) return sendJson(res, 404, { error: "Dépense introuvable." });
    db.depenses.splice(idx, 1);
    writeDb(db);
    return sendJson(res, 200, { success: true, message: "Dépense supprimée avec succès." });
  }

  // ==========================================
  // API CLÔTURE DE CAISSE (RAPPORT Z)
  // ==========================================
  if (pathname === '/api/cloture/preview' && method === 'GET') {
    const db = readDb();
    const queryDate = parsedUrl.query.date || new Date().toISOString().slice(0, 10);
    
    // Filtrage des ventes du jour
    const ventesJour = (db.sales || []).filter(s => s.date && s.date.slice(0, 10) === queryDate);
    const ventesCount = ventesJour.length;
    const chiffreAffairesBrut = ventesJour.reduce((acc, s) => acc + (parseFloat(s.totalBrut || s.totalNet) || 0), 0);
    const remisesTotal = ventesJour.reduce((acc, s) => acc + (parseFloat(s.remise) || 0), 0);
    const chiffreAffairesNet = ventesJour.reduce((acc, s) => acc + (parseFloat(s.totalNet) || 0), 0);
    const margeBruteEstimee = ventesJour.reduce((acc, s) => acc + (parseFloat(s.margeBruteTotale || s.margeTotale) || 0), 0);

    // Ventilation des encaissements des ventes
    let especesVentes = 0;
    let momoVentes = 0;
    let creditVentes = 0;
    ventesJour.forEach(s => {
      const mode = (s.modePaiement || 'ESPECES').toUpperCase();
      const tot = parseFloat(s.totalNet) || 0;
      if (mode === 'ESPECES') {
        especesVentes += tot;
      } else if (mode === 'MOBILE_MONEY' || mode === 'TMONEY' || mode === 'FLOOZ') {
        momoVentes += tot;
      } else if (mode === 'CREDIT') {
        creditVentes += (s.soldeRestant !== undefined ? parseFloat(s.soldeRestant) : tot);
        if (s.acomptePaye && parseFloat(s.acomptePaye) > 0) {
          especesVentes += parseFloat(s.acomptePaye);
        }
      } else {
        especesVentes += tot;
      }
    });

    // Règlements de dettes perçus aujourd'hui (créances clients recouvrées)
    const reglementsJour = (db.reglementsDettes || []).filter(r => r.date && r.date.slice(0, 10) === queryDate && r.typeDette !== 'FOURNISSEUR');
    let recouvrementsDettesEspeces = 0;
    let recouvrementsDettesMomo = 0;
    reglementsJour.forEach(r => {
      const m = (r.modePaiement || 'ESPECES').toUpperCase();
      const mt = parseFloat(r.montant) || 0;
      if (m === 'ESPECES') {
        recouvrementsDettesEspeces += mt;
      } else {
        recouvrementsDettesMomo += mt;
      }
    });
    const totalRecouvrementsDettes = recouvrementsDettesEspeces + recouvrementsDettesMomo;

    // Dépenses du jour (Petite caisse)
    const depensesJour = (db.depenses || []).filter(d => d.date && d.date.slice(0, 10) === queryDate);
    let depensesCaisseEspeces = 0;
    let depensesMomo = 0;
    let totalDepenses = 0;
    depensesJour.forEach(d => {
      const m = (d.modePaiement || 'CAISSE_ESPECES').toUpperCase();
      const mt = parseFloat(d.montant) || 0;
      totalDepenses += mt;
      if (m === 'CAISSE_ESPECES') {
        depensesCaisseEspeces += mt;
      } else if (m === 'MOBILE_MONEY') {
        depensesMomo += mt;
      }
    });

    // Total théorique des espèces attendues dans le tiroir-caisse
    const especesTheoriquesEnCaisse = Math.max(0, especesVentes + recouvrementsDettesEspeces - depensesCaisseEspeces);
    const beneficeNetEstime = Math.round(margeBruteEstimee - totalDepenses);

    return sendJson(res, 200, {
      date: queryDate,
      ventesCount,
      chiffreAffairesBrut,
      remisesTotal,
      chiffreAffairesNet,
      margeBruteEstimee,
      especesVentes,
      momoVentes,
      creditVentes,
      recouvrementsDettesEspeces,
      recouvrementsDettesMomo,
      totalRecouvrementsDettes,
      depensesCaisseEspeces,
      depensesMomo,
      totalDepenses,
      especesTheoriquesEnCaisse,
      beneficeNetEstime,
      reglementsCount: reglementsJour.length,
      depensesCount: depensesJour.length
    });
  }

  if (pathname === '/api/clotures' && method === 'POST') {
    const body = await parseBody(req);
    const db = readDb();
    db.clotures = db.clotures || [];

    const queryDate = body.date || new Date().toISOString().slice(0, 10);
    const especesReelles = parseFloat(body.especesPhysiques !== undefined ? body.especesPhysiques : body.especesReelles) || 0;
    const fondDeCaisse = parseFloat(body.fondDeCaisse) || 0;
    const especesTheoriques = parseFloat(body.especesTheoriquesEnCaisse !== undefined ? body.especesTheoriquesEnCaisse : body.especesTheoriques) || 0;
    const ecart = Math.round((especesReelles - (fondDeCaisse + especesTheoriques)) * 100) / 100;

    const maxId = db.clotures.reduce((m, c) => Math.max(m, c.id || 0), 0);
    const newCloture = {
      id: maxId + 1,
      code: `Z-${queryDate.replace(/-/g, '')}-${String(maxId + 1).padStart(3, '0')}`,
      date: queryDate,
      timestamp: new Date().toISOString(),
      caissier: (body.caissier || 'Gérant').trim(),
      chiffreAffairesNet: parseFloat(body.chiffreAffairesNet) || 0,
      ventesCount: parseInt(body.ventesCount) || 0,
      margeBruteEstimee: parseFloat(body.margeBruteEstimee) || 0,
      beneficeNetEstime: parseFloat(body.beneficeNetEstime) || 0,
      especesVentes: parseFloat(body.especesVentes) || 0,
      momoVentes: parseFloat(body.momoVentes) || 0,
      creditVentes: parseFloat(body.creditVentes) || 0,
      totalRecouvrementsDettes: parseFloat(body.totalRecouvrementsDettes) || 0,
      totalDepenses: parseFloat(body.totalDepenses) || 0,
      fondDeCaisse: fondDeCaisse,
      especesTheoriques: especesTheoriques,
      especesPhysiques: especesReelles,
      ecart: ecart,
      ecartCaisse: ecart,
      statutEcart: ecart === 0 ? 'CONFORME' : (ecart > 0 ? 'EXCEDENT' : 'DEFICIT'),
      observations: (body.observations || '').trim()
    };

    db.clotures.unshift(newCloture);
    writeDb(db);
    return sendJson(res, 201, { success: true, cloture: newCloture });
  }

  if (pathname === '/api/clotures' && method === 'GET') {
    const db = readDb();
    return sendJson(res, 200, db.clotures || []);
  }

  // Add / Edit Product (Enrichi avec Prix Gros, Prix Détail et Marges)
  if (pathname === '/api/products' && method === 'POST') {
    const body = await parseBody(req);
    const db = readDb();

    if (!body.nom || !body.nom.trim()) {
      return sendJson(res, 400, { error: "La désignation du produit est obligatoire." });
    }
    
    const prixAchat = parseFloat(body.prix_achat) || 0;
    const prixGros = parseFloat(body.prix_gros) || parseFloat(body.prix) || 0;
    const prixDetail = parseFloat(body.prix_detail) || prixGros;
    const stock = parseFloat(body.stock) || 0;
    const seuilAlerte = parseFloat(body.seuil_alerte) || 1;

    const margeGros = Math.max(0, prixGros - prixAchat);
    const tauxMarge = prixAchat > 0 ? Math.round(((margeGros / prixAchat) * 100) * 100) / 100 : 0;
    const tauxMarque = prixGros > 0 ? Math.round(((margeGros / prixGros) * 100) * 100) / 100 : 0;

    const unitesParAdaka = parseInt(body.unites_par_adaka) || 20;
    let prixDetailUnite = parseFloat(body.prix_detail_unite);
    if (!prixDetailUnite || prixDetailUnite <= 0) {
      if (prixDetail && prixDetail <= 100) {
        prixDetailUnite = prixDetail;
      } else {
        prixDetailUnite = Math.max(5, Math.round((prixDetail / unitesParAdaka) / 5) * 5);
      }
    }
    const coutUnitaireAchat = Math.round((prixAchat / unitesParAdaka) * 100) / 100;
    const stockUnites = Math.round(stock * unitesParAdaka);

    const cleanProductData = {
      ...body,
      nom: body.nom.trim(),
      designation: body.designation ? body.designation.trim() : body.nom.trim(),
      categorie: body.categorie || 'Sachets Divers',
      taille: body.taille || '',
      couleur: body.couleur || '',
      marque: body.marque || '',
      lot: body.lot || body.unite_achat || 'Adaka',
      unites_par_adaka: unitesParAdaka,
      stock: stock,
      stock_unites: stockUnites,
      prix_achat: prixAchat,
      cout_unitaire_achat: coutUnitaireAchat,
      prix_gros: prixGros,
      prix_detail: prixDetail,
      prix_detail_unite: prixDetailUnite,
      prix: prixGros,
      seuil_alerte: seuilAlerte,
      marge_brute_unitaire: Math.round(margeGros * 100) / 100,
      taux_marge: tauxMarge,
      taux_marque: tauxMarque,
      fournisseurId: body.fournisseurId ? parseInt(body.fournisseurId) : null,
      fournisseurNom: body.fournisseurNom || '',
      unite_achat: body.unite_achat || body.lot || 'Adaka',
      unite_vente: body.unite_vente || 'Adaka'
    };

    if (body.id) {
      const index = db.products.findIndex(p => p.id === parseInt(body.id));
      if (index !== -1) {
        db.products[index] = { ...db.products[index], ...cleanProductData, id: parseInt(body.id) };
      } else {
        db.products.push({ ...cleanProductData, id: parseInt(body.id) });
      }
    } else {
      const maxId = db.products.reduce((max, p) => Math.max(max, p.id || 0), 0);
      const newProduct = {
        ...cleanProductData,
        id: maxId + 1,
        code: body.code || `SCH-${String(maxId + 1).padStart(3, '0')}`
      };
      db.products.push(newProduct);
    }

    writeDb(db);
    return sendJson(res, 200, { success: true, products: db.products });
  }

  // Delete Product
  if (pathname.startsWith('/api/products/') && method === 'DELETE') {
    const id = parseInt(pathname.replace('/api/products/', ''));
    const db = readDb();
    db.products = db.products.filter(p => p.id !== id);
    writeDb(db);
    return sendJson(res, 200, { success: true, products: db.products });
  }

  // Stock Movement (Approvisionnement / Réapprovisionnement Rapide / Ajustement / Perte)
  if (pathname === '/api/stock/movement' && method === 'POST') {
    const body = await parseBody(req);
    const { 
      productId, 
      type, // 'ENTREE' (Réappro) | 'AJUSTEMENT' (Inventaire/Correction) | 'SORTIE' | 'PERTE'
      quantite, 
      stockReel,
      modeAjustement, // 'stockReel' ou 'delta'
      motif, 
      uniteMouvement, // 'adaka' ou 'unites'
      prixAchat,
      fraisAnnexes,
      fournisseurId,
      fournisseurNom,
      dateOperation,
      observation,
      auteur
    } = body;
    const db = readDb();
    const product = db.products.find(p => p.id === parseInt(productId));

    if (!product) {
      return sendJson(res, 404, { error: "Produit non trouvé" });
    }

    const unitesParAdaka = Math.max(1, parseInt(product.unites_par_adaka) || 20);
    const oldStockAdaka = parseFloat(product.stock) || 0;
    const oldStockUnits = product.stock_unites !== undefined ? parseInt(product.stock_unites) : Math.round(oldStockAdaka * unitesParAdaka);

    let newStockAdaka = oldStockAdaka;
    let newStockUnits = oldStockUnits;
    let qteAdaka = 0;
    let qteUnits = 0;
    let ecartAdaka = 0;
    let ecartUnits = 0;
    let finalMotif = (motif || '').trim();

    if (type === 'ENTREE') {
      // 1. RÉAPPROVISIONNEMENT : Ajouter du stock
      const qteNum = Math.abs(parseFloat(quantite) || 0);
      if (uniteMouvement === 'unites') {
        qteUnits = Math.round(qteNum);
        qteAdaka = Math.round((qteUnits / unitesParAdaka) * 1000) / 1000;
      } else {
        qteAdaka = Math.round(qteNum * 1000) / 1000;
        qteUnits = Math.round(qteAdaka * unitesParAdaka);
      }

      newStockAdaka = Math.round((oldStockAdaka + qteAdaka) * 1000) / 1000;
      newStockUnits = oldStockUnits + qteUnits;

      if (!finalMotif) finalMotif = 'Réapprovisionnement marchandise';

      // Mise à jour optionnelle du conditionnement (unités par adaka) si renseigné
      if (body.unitesParAdaka && parseInt(body.unitesParAdaka) > 0) {
        product.unites_par_adaka = parseInt(body.unitesParAdaka);
        newStockUnits = Math.round(newStockAdaka * product.unites_par_adaka);
      }

      // Mise à jour optionnelle du prix d'achat si renseigné
      if (prixAchat !== undefined && prixAchat !== null && parseFloat(prixAchat) > 0) {
        product.prix_achat = parseFloat(prixAchat);
        product.cout_unitaire_achat = Math.round((product.prix_achat / (product.unites_par_adaka || unitesParAdaka)) * 100) / 100;
      }

      // Mise à jour optionnelle des prix de vente en gros et au détail si renseignés
      if (body.prixGros && parseFloat(body.prixGros) > 0) {
        product.prix_gros = parseFloat(body.prixGros);
        product.prix = product.prix_gros;
      }
      if (body.prixDetail && parseFloat(body.prixDetail) > 0) {
        product.prix_detail = parseFloat(body.prixDetail);
      }
      if (body.prixDetailUnite && parseFloat(body.prixDetailUnite) > 0) {
        product.prix_detail_unite = parseFloat(body.prixDetailUnite);
      }

      // Recalcul des marges
      const curPxAchat = product.prix_achat || 0;
      const curPxGros = product.prix_gros || product.prix || 0;
      const curUnites = product.unites_par_adaka || unitesParAdaka;
      product.cout_unitaire_achat = curUnites > 0 ? Math.round((curPxAchat / curUnites) * 100) / 100 : curPxAchat;
      product.marge_brute_unitaire = Math.round((curPxGros - curPxAchat) * 100) / 100;
      product.taux_marge = curPxAchat > 0 ? Math.round(((product.marge_brute_unitaire / curPxAchat) * 100) * 100) / 100 : 0;
      product.taux_marque = curPxGros > 0 ? Math.round(((product.marge_brute_unitaire / curPxGros) * 100) * 100) / 100 : 0;

      // Mise à jour optionnelle du fournisseur
      if (fournisseurId) {
        product.fournisseurId = parseInt(fournisseurId);
        const supp = (db.suppliers || []).find(s => s.id === product.fournisseurId);
        if (supp) product.fournisseurNom = supp.nom;
        else if (fournisseurNom) product.fournisseurNom = fournisseurNom;
      }

    } else if (type === 'AJUSTEMENT') {
      // 2. AJUSTEMENT DE STOCK : Inventaire physique ou correction
      // Ne crée AUCUN coût d'achat artificiel ni faux frais
      if (stockReel !== undefined && stockReel !== null && stockReel !== '') {
        const reelVal = Math.max(0, parseFloat(stockReel) || 0);
        if (uniteMouvement === 'unites') {
          newStockUnits = Math.round(reelVal);
          newStockAdaka = Math.round((newStockUnits / unitesParAdaka) * 1000) / 1000;
        } else {
          newStockAdaka = Math.round(reelVal * 1000) / 1000;
          newStockUnits = Math.round(newStockAdaka * unitesParAdaka);
        }
      } else {
        // Ajustement par delta (quantité ajoutée ou déduite manuellement)
        const deltaVal = parseFloat(quantite) || 0;
        if (uniteMouvement === 'unites') {
          newStockUnits = Math.max(0, oldStockUnits + Math.round(deltaVal));
          newStockAdaka = Math.round((newStockUnits / unitesParAdaka) * 1000) / 1000;
        } else {
          newStockAdaka = Math.max(0, Math.round((oldStockAdaka + deltaVal) * 1000) / 1000);
          newStockUnits = Math.round(newStockAdaka * unitesParAdaka);
        }
      }

      ecartAdaka = Math.round((newStockAdaka - oldStockAdaka) * 1000) / 1000;
      ecartUnits = newStockUnits - oldStockUnits;

      if (!finalMotif) {
        finalMotif = ecartUnits === 0 ? "Inventaire physique (Conforme)" : (ecartUnits < 0 ? "Perte ou casse" : "Inventaire physique (Surplus)");
      }

    } else if (type === 'SORTIE' || type === 'PERTE') {
      const qteNum = Math.abs(parseFloat(quantite) || 0);
      if (uniteMouvement === 'unites') {
        qteUnits = Math.round(qteNum);
        qteAdaka = Math.round((qteUnits / unitesParAdaka) * 1000) / 1000;
      } else {
        qteAdaka = Math.round(qteNum * 1000) / 1000;
        qteUnits = Math.round(qteAdaka * unitesParAdaka);
      }
      newStockAdaka = Math.max(0, Math.round((oldStockAdaka - qteAdaka) * 1000) / 1000);
      newStockUnits = Math.max(0, oldStockUnits - qteUnits);
      if (!finalMotif) finalMotif = type === 'PERTE' ? 'Perte ou casse' : 'Sortie manuelle de stock';
    }

    product.stock = newStockAdaka;
    product.stock_unites = newStockUnits;

    const pxAchatSaisi = parseFloat(prixAchat) || product.prix_achat || 0;
    const fraisSaisis = parseFloat(fraisAnnexes) || 0;
    const totalAchat = type === 'ENTREE' ? ((pxAchatSaisi * qteAdaka) + fraisSaisis) : null;

    const movement = {
      id: Date.now(),
      date: dateOperation ? new Date(dateOperation).toISOString() : new Date().toISOString(),
      productId: product.id,
      productName: `${product.nom} ${product.taille || ''} ${product.marque || ''}`.trim(),
      type: type, // 'ENTREE' | 'AJUSTEMENT' | 'SORTIE' | 'PERTE'
      uniteMouvement: uniteMouvement || 'adaka',
      quantite: type === 'ENTREE' ? qteAdaka : (type === 'AJUSTEMENT' ? ecartAdaka : -qteAdaka),
      quantiteAdaka: type === 'ENTREE' ? qteAdaka : ecartAdaka,
      quantiteUnites: type === 'ENTREE' ? qteUnits : ecartUnits,
      stockReelAdaka: type === 'AJUSTEMENT' ? newStockAdaka : null,
      stockReelUnites: type === 'AJUSTEMENT' ? newStockUnits : null,
      ecartAdaka: type === 'AJUSTEMENT' ? ecartAdaka : null,
      ecartUnites: type === 'AJUSTEMENT' ? ecartUnits : null,
      ancienStock: oldStockAdaka,
      nouveauStock: product.stock,
      ancienStockAdaka: oldStockAdaka,
      nouveauStockAdaka: product.stock,
      ancienStockUnites: oldStockUnits,
      nouveauStockUnites: product.stock_unites,
      prixAchat: type === 'ENTREE' ? pxAchatSaisi : null,
      fraisAnnexes: type === 'ENTREE' ? fraisSaisis : null,
      montantTotalAchat: totalAchat,
      fournisseurId: type === 'ENTREE' ? (product.fournisseurId || null) : null,
      fournisseurNom: type === 'ENTREE' ? (product.fournisseurNom || '') : '',
      motif: finalMotif,
      observation: (observation || '').trim(),
      auteur: (auteur || 'Commerçant MIAKIARA').trim()
    };

    if (type === 'ENTREE') {
      db.approvisionnements = db.approvisionnements || [];
      const appId = (db.approvisionnements.length > 0 ? Math.max(...db.approvisionnements.map(a => a.id || 0)) : 0) + 1;
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const bonCode = `APP-${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${String(appId).padStart(3, '0')}`;
      
      const newAppro = {
        id: appId,
        code: bonCode,
        date: dateOperation ? new Date(dateOperation).toISOString() : now.toISOString(),
        fournisseurId: product.fournisseurId || null,
        fournisseurNom: product.fournisseurNom || 'Fournisseur Général',
        modeReglement: 'ESPECES',
        productId: product.id,
        productNom: `${product.nom} ${product.taille || ''} ${product.marque || ''}`.trim(),
        quantite: qteAdaka,
        unitesParAdaka: product.unites_par_adaka || 20,
        uniteAchat: product.lot || 'Adaka',
        prixAchatUnitaire: pxAchatSaisi,
        montantAchatTotal: Math.round(pxAchatSaisi * qteAdaka),
        fraisTransport: fraisSaisis,
        autresFrais: 0,
        totalFraisAnnexes: fraisSaisis,
        coutReelAcquisition: totalAchat,
        coutUnitaireReel: qteAdaka > 0 ? Math.round((totalAchat / qteAdaka) * 100) / 100 : pxAchatSaisi,
        coutUnitaireReelUnit: Math.round((totalAchat / (qteAdaka * (product.unites_par_adaka || 20))) * 100) / 100,
        prixVenteGros: product.prix_gros,
        prixVenteDetail: product.prix_detail,
        prixDetailUnite: product.prix_detail_unite,
        ancienStock: oldStockAdaka,
        nouveauStock: product.stock,
        ancienStockUnites: oldStockUnits,
        nouveauStockUnites: product.stock_unites,
        notes: observation || motif || ''
      };
      db.approvisionnements.unshift(newAppro);
    }

    db.stockMovements = db.stockMovements || [];
    db.stockMovements.unshift(movement);

    writeDb(db);
    return sendJson(res, 200, { success: true, product, movement, products: db.products, approvisionnements: db.approvisionnements });
  }

  // Register a Sale (Point de Vente POS avec Marges & Modes Gros / Détail / Vente par Montant)
  if (pathname === '/api/sales' && method === 'POST') {
    const saleData = await parseBody(req);
    const db = readDb();

    const saleItems = saleData.items || [];
    if (saleItems.length === 0) {
      return sendJson(res, 400, { error: "Le panier de vente est vide." });
    }

    const stockErrors = [];
    const autoriserStockNegatif = !!saleData.autoriserStockNegatif;

    // Vérifier les disponibilités de stock (en unités et en adaka)
    for (const item of saleItems) {
      const prod = db.products.find(p => p.id === item.productId);
      if (!prod) {
        stockErrors.push(`Produit #${item.productId} introuvable.`);
      } else if (!autoriserStockNegatif) {
        const unitesParAdaka = prod.unites_par_adaka || 20;
        const currentUnitsDispo = prod.stock_unites !== undefined ? prod.stock_unites : Math.round((parseFloat(prod.stock) || 0) * unitesParAdaka);
        
        let unitesDemande = 0;
        if (item.unitesVendues !== undefined) {
          unitesDemande = parseInt(item.unitesVendues);
        } else if (item.modeVente === 'DETAIL' || item.modeVente === 'DETAIL_MONTANT') {
          unitesDemande = parseInt(item.quantite) || 1;
        } else {
          unitesDemande = Math.round((parseFloat(item.quantite) || 0) * unitesParAdaka);
        }

        if (currentUnitsDispo < unitesDemande) {
          stockErrors.push(`Stock insuffisant pour "${prod.nom}" : ${currentUnitsDispo} unité(s) (${prod.stock} adaka) disponible(s), demandé ${unitesDemande} unité(s).`);
        }
      }
    }

    if (stockErrors.length > 0) {
      return sendJson(res, 400, { error: stockErrors.join(' ') });
    }

    // Calcul des marges commerciales et décrémentation progressive des stocks
    let totalMargeTicket = 0;
    let hasGros = false;
    let hasDetail = false;

    const saleId = (db.sales.length > 0 ? Math.max(...db.sales.map(s => s.id || 0)) : 0) + 1;
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const ticketCode = saleData.ticketCode || `TK-${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${String(saleId).padStart(4, '0')}`;

    for (const item of saleItems) {
      const prod = db.products.find(p => p.id === item.productId);
      const unitesParAdaka = prod.unites_par_adaka || 20;
      const currentStockAdaka = parseFloat(prod.stock) || 0;
      const currentStockUnits = prod.stock_unites !== undefined ? prod.stock_unites : Math.round(currentStockAdaka * unitesParAdaka);

      let unitesVendues = 0;
      let fractionAdaka = 0;
      let prixVenteTotalLigne = 0;

      if (item.modeVente === 'DETAIL_MONTANT') {
        prixVenteTotalLigne = parseFloat(item.montantEncaisse || item.totalNet || item.total || item.prix) || 0;
        unitesVendues = parseInt(item.unitesVendues) || parseInt(item.quantite) || 1;
        fractionAdaka = Math.round((unitesVendues / unitesParAdaka) * 1000) / 1000;
      } else if (item.modeVente === 'DETAIL') {
        unitesVendues = parseInt(item.unitesVendues) || parseInt(item.quantite) || 1;
        fractionAdaka = Math.round((unitesVendues / unitesParAdaka) * 1000) / 1000;
        prixVenteTotalLigne = Math.round(((parseFloat(item.prix) || prod.prix_detail_unite || 0) * unitesVendues) * 100) / 100;
      } else {
        // Mode GROS (Adaka entier ou multiple)
        fractionAdaka = parseFloat(item.quantite) || 1;
        unitesVendues = Math.round(fractionAdaka * unitesParAdaka);
        prixVenteTotalLigne = Math.round(((parseFloat(item.prix) || prod.prix_gros || prod.prix || 0) * fractionAdaka) * 100) / 100;
      }

      const updatedStockAdaka = Math.max(0, Math.round((currentStockAdaka - fractionAdaka) * 1000) / 1000);
      const updatedStockUnits = Math.max(0, currentStockUnits - unitesVendues);

      prod.stock = updatedStockAdaka;
      prod.stock_unites = updatedStockUnits;

      // Coût d'achat réel proportionnel aux unités vendues
      const coutAchatAdaka = parseFloat(prod.prix_achat) || 0;
      const coutAchatUnite = coutAchatAdaka / unitesParAdaka;
      const coutAchatTotalLigne = Math.round((coutAchatUnite * unitesVendues) * 100) / 100;
      const margeLigneTotale = Math.round((prixVenteTotalLigne - coutAchatTotalLigne) * 100) / 100;

      item.unitesVendues = unitesVendues;
      item.fractionAdaka = fractionAdaka;
      item.coutAchatUnitaire = Math.round(coutAchatUnite * 100) / 100;
      item.coutTotalLigne = coutAchatTotalLigne;
      item.margeTotale = margeLigneTotale;
      item.total = prixVenteTotalLigne;
      item.modeVente = item.modeVente || (fractionAdaka >= 1 ? 'GROS' : 'DETAIL');

      if (item.modeVente === 'GROS') hasGros = true;
      if (item.modeVente === 'DETAIL' || item.modeVente === 'DETAIL_MONTANT') hasDetail = true;

      totalMargeTicket += margeLigneTotale;

      // Enregistrement dans le journal des mouvements avec traçabilité complète
      db.stockMovements = db.stockMovements || [];
      db.stockMovements.unshift({
        id: Date.now() + Math.random(),
        date: new Date().toISOString(),
        productId: prod.id,
        productName: prod.nom + ' ' + (prod.taille || '') + ' ' + (prod.marque || ''),
        type: 'VENTE',
        modeVente: item.modeVente,
        quantite: fractionAdaka,
        quantiteAdaka: fractionAdaka,
        quantiteUnites: unitesVendues,
        ancienStock: currentStockAdaka,
        nouveauStock: updatedStockAdaka,
        ancienStockAdaka: currentStockAdaka,
        nouveauStockAdaka: updatedStockAdaka,
        ancienStockUnites: currentStockUnits,
        nouveauStockUnites: updatedStockUnits,
        montantVente: prixVenteTotalLigne,
        coutAchat: coutAchatTotalLigne,
        margeBrute: margeLigneTotale,
        motif: `Vente #${ticketCode} (${item.modeVente}: ${unitesVendues} u / ${fractionAdaka} adaka)`
      });
    }

    const typeVente = (hasGros && hasDetail) ? 'MIXTE' : (hasGros ? 'GROS' : 'DETAIL');

    // Gestion du compte client en cas de vente à crédit
    if (saleData.customerId && saleData.montantRestant && saleData.montantRestant > 0) {
      const client = db.customers.find(c => c.id === parseInt(saleData.customerId));
      if (client) {
        client.dette = (parseFloat(client.dette) || 0) + parseFloat(saleData.montantRestant);
      }
      db.dettes = db.dettes || [];
      const maxDetId = db.dettes.reduce((max, d) => Math.max(max, d.id || 0), 0);
      const newClientDebt = {
        id: maxDetId + 1,
        code: `DET-CLI-${String(maxDetId + 1).padStart(4, '0')}`,
        type: 'CLIENT',
        tierId: client ? client.id : parseInt(saleData.customerId),
        tierNom: client ? client.nom : (saleData.clientNom || 'Client'),
        telephone: client ? (client.telephone || '') : '',
        date: now.toISOString(),
        dateEcheance: saleData.dateEcheance || null,
        description: `Vente #${ticketCode} à crédit (${saleItems.length} article(s))`,
        reference: ticketCode,
        montantInitial: parseFloat(saleData.montantRestant),
        montantRegle: 0,
        soldeRestant: parseFloat(saleData.montantRestant),
        statut: 'NON_REGLEE',
        observations: saleData.notes || '',
        saleId: saleId,
        dateCreation: now.toISOString(),
        annulee: false
      };
      db.dettes.unshift(newClientDebt);
    }

    const completeSale = {
      id: saleId,
      ticketCode: ticketCode,
      date: now.toISOString(),
      clientNom: saleData.clientNom || 'Client Comptoir',
      clientId: saleData.customerId || 1,
      items: saleItems,
      totalNet: parseFloat(saleData.totalNet) || 0,
      totalMarge: Math.round(totalMargeTicket * 100) / 100,
      margeCommerciale: Math.round(totalMargeTicket * 100) / 100,
      typeVente: typeVente,
      modePaiement: saleData.modePaiement || 'ESPECES',
      montantRecu: parseFloat(saleData.montantRecu) || 0,
      monnaieRendue: parseFloat(saleData.monnaieRendue) || 0,
      montantPaye: parseFloat(saleData.montantPaye) || 0,
      montantRestant: parseFloat(saleData.montantRestant) || 0,
      notes: saleData.notes || ''
    };

    db.sales.unshift(completeSale);
    writeDb(db);

    return sendJson(res, 201, { success: true, sale: completeSale, products: db.products, customers: db.customers, dettes: db.dettes });
  }

  // Cancel Sale (Annulation de Vente & Retour Marchandise en Adaka & Unités)
  if (pathname.startsWith('/api/sales/') && pathname.endsWith('/cancel') && method === 'POST') {
    const parts = pathname.split('/');
    const saleId = parseInt(parts[3]);
    const db = readDb();
    const sale = (db.sales || []).find(s => s.id === saleId);

    if (!sale) {
      return sendJson(res, 404, { error: "Vente introuvable." });
    }

    if (sale.annulee) {
      return sendJson(res, 400, { error: "Cette vente a déjà été annulée." });
    }

    // Restituer les stocks (en unités et en fraction d'adaka)
    for (const item of (sale.items || [])) {
      const prod = (db.products || []).find(p => p.id === item.productId);
      if (prod) {
        const unitesParAdaka = prod.unites_par_adaka || 20;
        const fraction = item.fractionAdaka !== undefined ? parseFloat(item.fractionAdaka) : (parseFloat(item.quantite) || 0);
        const unites = item.unitesVendues !== undefined ? parseInt(item.unitesVendues) : Math.round(fraction * unitesParAdaka);

        const currentStockAdaka = parseFloat(prod.stock) || 0;
        const currentStockUnits = prod.stock_unites !== undefined ? prod.stock_unites : Math.round(currentStockAdaka * unitesParAdaka);

        const restoredStockAdaka = Math.round((currentStockAdaka + fraction) * 1000) / 1000;
        const restoredStockUnits = currentStockUnits + unites;

        prod.stock = restoredStockAdaka;
        prod.stock_unites = restoredStockUnits;

        db.stockMovements = db.stockMovements || [];
        db.stockMovements.unshift({
          id: Date.now() + Math.random(),
          date: new Date().toISOString(),
          productId: prod.id,
          productName: prod.nom,
          type: 'ENTREE',
          modeVente: 'RETOUR',
          quantite: fraction,
          quantiteAdaka: fraction,
          quantiteUnites: unites,
          ancienStock: currentStockAdaka,
          nouveauStock: restoredStockAdaka,
          ancienStockAdaka: currentStockAdaka,
          nouveauStockAdaka: restoredStockAdaka,
          ancienStockUnites: currentStockUnits,
          nouveauStockUnites: restoredStockUnits,
          motif: `Annulation vente / Retour ${sale.ticketCode}`
        });
      }
    }

    // Déduire la dette client si c'était à crédit
    if (sale.clientId && sale.montantRestant && sale.montantRestant > 0) {
      const client = (db.customers || []).find(c => c.id === sale.clientId);
      if (client) {
        client.dette = Math.max(0, (parseFloat(client.dette) || 0) - parseFloat(sale.montantRestant));
      }
      db.dettes = db.dettes || [];
      const linkedDebt = db.dettes.find(d => d.saleId === saleId);
      if (linkedDebt) {
        linkedDebt.annulee = true;
        linkedDebt.soldeRestant = 0;
        linkedDebt.statut = 'SOLDEE';
        linkedDebt.observations = (linkedDebt.observations ? linkedDebt.observations + ' | ' : '') + `Annulée suite à l'annulation du ticket #${sale.ticketCode}`;
      }
    }

    sale.annulee = true;
    sale.dateAnnulation = new Date().toISOString();
    writeDb(db);

    return sendJson(res, 200, { success: true, message: "Vente annulée avec succès et stocks réintégrés !", sale });
  }

  // Add / Edit Customer
  if (pathname === '/api/customers' && method === 'POST') {
    const body = await parseBody(req);
    const db = readDb();
    db.customers = db.customers || [];

    if (body.id) {
      const index = db.customers.findIndex(c => c.id === body.id);
      if (index !== -1) {
        db.customers[index] = { ...db.customers[index], ...body };
      } else {
        db.customers.push(body);
      }
    } else {
      const maxId = db.customers.reduce((max, c) => Math.max(max, c.id || 0), 0);
      db.customers.push({
        id: maxId + 1,
        nom: body.nom,
        telephone: body.telephone || '',
        adresse: body.adresse || '',
        dette: parseFloat(body.dette) || 0
      });
    }

    writeDb(db);
    return sendJson(res, 200, { success: true, customers: db.customers });
  }

  // Customer Debt Payment (Règlement de dette)
  if (pathname.startsWith('/api/customers/') && pathname.endsWith('/payment') && method === 'POST') {
    const parts = pathname.split('/');
    const customerId = parseInt(parts[3]);
    const body = await parseBody(req);
    const db = readDb();
    const customer = db.customers.find(c => c.id === customerId);

    if (!customer) {
      return sendJson(res, 404, { error: "Client introuvable" });
    }

    const montantPaye = parseFloat(body.montant) || 0;
    const oldDette = customer.dette || 0;
    customer.dette = Math.max(0, oldDette - montantPaye);

    // Save payment log
    db.customerPayments = db.customerPayments || [];
    db.customerPayments.unshift({
      id: Date.now(),
      date: new Date().toISOString(),
      customerId: customer.id,
      customerNom: customer.nom,
      montant: montantPaye,
      modePaiement: body.modePaiement || 'ESPECES',
      ancienneDette: oldDette,
      nouvelleDette: customer.dette,
      notes: body.notes || 'Règlement de crédit'
    });

    writeDb(db);
    return sendJson(res, 200, { success: true, customer, customers: db.customers });
  }

  // --- SECTION 14 : API DETTES & RÈGLEMENTS (CLIENTS & FOURNISSEURS) ---

  // 1. Liste complète des Dettes et Règlements
  if (pathname === '/api/dettes' && method === 'GET') {
    const db = readDb();
    return sendJson(res, 200, {
      success: true,
      dettes: db.dettes || [],
      reglements: db.reglementsDettes || []
    });
  }

  // 2. Enregistrement d'une Nouvelle Dette (Existante ou Manuelle)
  if (pathname === '/api/dettes' && method === 'POST') {
    const body = await parseBody(req);
    const db = readDb();
    db.dettes = db.dettes || [];
    db.reglementsDettes = db.reglementsDettes || [];
    db.customers = db.customers || [];
    db.suppliers = db.suppliers || [];

    const type = (body.type || 'CLIENT').toUpperCase();
    if (type !== 'CLIENT' && type !== 'FOURNISSEUR') {
      return sendJson(res, 400, { error: "Le type de dette doit être 'CLIENT' ou 'FOURNISSEUR'." });
    }

    const tierNom = (body.tierNom || body.nom || '').trim();
    if (!tierNom) {
      return sendJson(res, 400, { error: "Le nom du " + (type === 'CLIENT' ? 'client' : 'fournisseur') + " est obligatoire." });
    }

    const montantInitial = parseFloat(body.montantInitial || body.montant) || 0;
    if (montantInitial <= 0) {
      return sendJson(res, 400, { error: "Le montant initial de la dette doit être supérieur à 0 FCFA." });
    }

    const montantDejaRegle = Math.max(0, parseFloat(body.montantDejaRegle) || 0);
    if (montantDejaRegle > montantInitial) {
      return sendJson(res, 400, { error: "Le montant déjà réglé ne peut pas dépasser le montant initial de la dette." });
    }

    const soldeRestant = Math.max(0, montantInitial - montantDejaRegle);
    let statut = 'NON_REGLEE';
    if (soldeRestant === 0) {
      statut = 'SOLDEE';
    } else if (montantDejaRegle > 0) {
      statut = 'PARTIEL';
    }

    const telephone = (body.telephone || '').trim();
    const dateEcheance = body.dateEcheance || null;
    const now = new Date();
    const dateOp = body.date || now.toISOString();

    if (dateEcheance && soldeRestant > 0 && new Date(dateEcheance) < now) {
      statut = 'EN_RETARD';
    }

    let tierId = body.tierId ? parseInt(body.tierId) : null;
    if (type === 'CLIENT') {
      let client = tierId ? db.customers.find(c => c.id === tierId) : null;
      if (!client) {
        client = db.customers.find(c => c.nom && c.nom.toLowerCase() === tierNom.toLowerCase());
      }
      if (!client) {
        const maxCustId = db.customers.reduce((max, c) => Math.max(max, c.id || 0), 0);
        client = {
          id: maxCustId + 1,
          nom: tierNom,
          telephone: telephone || '',
          adresse: body.adresse || 'Ajouté via Dettes',
          dette: soldeRestant
        };
        db.customers.push(client);
      } else {
        client.dette = Math.max(0, (parseFloat(client.dette) || 0) + soldeRestant);
        if (telephone && (!client.telephone || client.telephone === '-')) {
          client.telephone = telephone;
        }
      }
      tierId = client.id;
    } else {
      let supplier = tierId ? db.suppliers.find(s => s.id === tierId) : null;
      if (!supplier) {
        supplier = db.suppliers.find(s => s.nom && s.nom.toLowerCase() === tierNom.toLowerCase());
      }
      if (!supplier) {
        const maxSuppId = db.suppliers.reduce((max, s) => Math.max(max, s.id || 0), 0);
        supplier = {
          id: maxSuppId + 1,
          nom: tierNom,
          telephone: telephone || '',
          adresse: body.adresse || 'Ajouté via Dettes',
          solde_dette: soldeRestant,
          notes: body.observations || ''
        };
        db.suppliers.push(supplier);
      } else {
        supplier.solde_dette = Math.max(0, (parseFloat(supplier.solde_dette) || 0) + soldeRestant);
        if (telephone && !supplier.telephone) {
          supplier.telephone = telephone;
        }
      }
      tierId = supplier.id;
    }

    const maxId = db.dettes.reduce((max, d) => Math.max(max, d.id || 0), 0);
    const newId = maxId + 1;
    const prefix = type === 'CLIENT' ? 'DET-CLI' : 'DET-FRN';
    const code = body.code || `${prefix}-${String(newId).padStart(4, '0')}`;

    const newDette = {
      id: newId,
      code: code,
      type: type,
      tierId: tierId,
      tierNom: tierNom,
      telephone: telephone,
      date: dateOp,
      dateEcheance: dateEcheance,
      description: body.description || (type === 'CLIENT' ? 'Créance client (Saisie manuelle)' : 'Dette fournisseur (Saisie manuelle)'),
      reference: body.reference || '',
      montantInitial: montantInitial,
      montantDejaRegleInitial: montantDejaRegle,
      montantRegle: montantDejaRegle,
      soldeRestant: soldeRestant,
      statut: statut,
      observations: body.observations || '',
      dateCreation: now.toISOString(),
      annulee: false
    };

    db.dettes.unshift(newDette);

    if (montantDejaRegle > 0) {
      const maxRegId = db.reglementsDettes.reduce((max, r) => Math.max(max, r.id || 0), 0);
      const newRegId = maxRegId + 1;
      const regCode = `REG-INIT-${String(newRegId).padStart(4, '0')}`;
      db.reglementsDettes.unshift({
        id: newRegId,
        code: regCode,
        detteId: newDette.id,
        detteCode: newDette.code,
        type: type,
        tierId: tierId,
        tierNom: tierNom,
        telephone: telephone,
        date: dateOp,
        montant: montantDejaRegle,
        modePaiement: body.modePaiementInitial || 'ESPECES',
        reference: body.referenceReglementInitial || 'Acompte initial',
        commentaire: 'Acompte / règlement partiel enregistré lors de la création de la dette',
        auteur: body.auteur || 'Gérant',
        ancienSolde: montantInitial,
        nouveauSolde: soldeRestant,
        annule: false
      });
    }

    writeDb(db);
    return sendJson(res, 201, {
      success: true,
      dette: newDette,
      dettes: db.dettes,
      reglements: db.reglementsDettes,
      customers: db.customers,
      suppliers: db.suppliers
    });
  }

  // 3. Enregistrement d'un Règlement Successif sur une Dette
  if (pathname.startsWith('/api/dettes/') && pathname.endsWith('/reglement') && method === 'POST') {
    const parts = pathname.split('/');
    const detteId = parseInt(parts[3]);
    const body = await parseBody(req);
    const db = readDb();
    db.dettes = db.dettes || [];
    db.reglementsDettes = db.reglementsDettes || [];

    const dette = db.dettes.find(d => d.id === detteId);
    if (!dette) {
      return sendJson(res, 404, { error: "Dette introuvable (ID #" + detteId + ")." });
    }

    if (dette.annulee) {
      return sendJson(res, 400, { error: "Cette dette a été annulée. Aucun règlement ne peut être ajouté." });
    }

    const soldeActuel = parseFloat(dette.soldeRestant) || 0;
    if (soldeActuel <= 0) {
      return sendJson(res, 400, { error: "Cette dette est déjà entièrement soldée (Solde: 0 FCFA)." });
    }

    const montant = parseFloat(body.montant) || 0;
    if (montant <= 0) {
      return sendJson(res, 400, { error: "Le montant du règlement doit être supérieur à 0 FCFA." });
    }

    // Garde-fou Anti-Trop-Perçu (Section 14.D.5)
    if (montant > soldeActuel && !body.forcerTropPercu) {
      return sendJson(res, 400, {
        error: "Trop-perçu détecté",
        tropPercu: true,
        soldeRestant: soldeActuel,
        montantSaisi: montant,
        difference: Math.round((montant - soldeActuel) * 100) / 100,
        message: `Le montant payé (${montant.toLocaleString('fr-FR')} FCFA) dépasse le solde restant (${soldeActuel.toLocaleString('fr-FR')} FCFA) de ${(montant - soldeActuel).toLocaleString('fr-FR')} FCFA.`
      });
    }

    const montantEffectif = montant;
    const nouveauSolde = Math.max(0, Math.round((soldeActuel - montantEffectif) * 100) / 100);
    const nouveauMontantRegle = Math.round(((parseFloat(dette.montantRegle) || 0) + montantEffectif) * 100) / 100;

    dette.montantRegle = nouveauMontantRegle;
    dette.soldeRestant = nouveauSolde;
    dette.statut = nouveauSolde <= 0 ? 'SOLDEE' : 'PARTIEL';
    dette.dateDernierReglement = new Date().toISOString();

    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const maxRegId = db.reglementsDettes.reduce((max, r) => Math.max(max, r.id || 0), 0);
    const newRegId = maxRegId + 1;
    const regCode = `REG-${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${String(newRegId).padStart(4, '0')}`;

    const newReglement = {
      id: newRegId,
      code: regCode,
      detteId: dette.id,
      detteCode: dette.code,
      type: dette.type,
      tierId: dette.tierId,
      tierNom: dette.tierNom,
      telephone: dette.telephone || '',
      date: body.date || now.toISOString(),
      montant: montantEffectif,
      modePaiement: body.modePaiement || 'ESPECES',
      reference: body.reference ? body.reference.trim() : '',
      commentaire: body.commentaire ? body.commentaire.trim() : (body.motif || 'Règlement de dette'),
      auteur: body.auteur || 'Caisse',
      ancienSolde: soldeActuel,
      nouveauSolde: nouveauSolde,
      annule: false
    };

    db.reglementsDettes.unshift(newReglement);

    if (dette.type === 'CLIENT') {
      const client = (db.customers || []).find(c => c.id === dette.tierId);
      if (client) {
        client.dette = Math.max(0, Math.round(((parseFloat(client.dette) || 0) - montantEffectif) * 100) / 100);
      }
    } else {
      const supplier = (db.suppliers || []).find(s => s.id === dette.tierId);
      if (supplier) {
        supplier.solde_dette = Math.max(0, Math.round(((parseFloat(supplier.solde_dette) || 0) - montantEffectif) * 100) / 100);
      }
    }

    writeDb(db);
    return sendJson(res, 201, {
      success: true,
      message: `Règlement de ${montantEffectif.toLocaleString('fr-FR')} FCFA enregistré avec succès !`,
      reglement: newReglement,
      dette: dette,
      dettes: db.dettes,
      reglements: db.reglementsDettes,
      customers: db.customers,
      suppliers: db.suppliers
    });
  }

  // 4. Annulation sécurisée d'un Règlement
  if (pathname.startsWith('/api/dettes/reglements/') && pathname.endsWith('/annuler') && method === 'POST') {
    const parts = pathname.split('/');
    const regId = parseInt(parts[4]);
    const body = await parseBody(req);
    const db = readDb();
    db.reglementsDettes = db.reglementsDettes || [];
    db.dettes = db.dettes || [];

    const reg = db.reglementsDettes.find(r => r.id === regId);
    if (!reg) {
      return sendJson(res, 404, { error: "Règlement introuvable (ID #" + regId + ")." });
    }

    if (reg.annule) {
      return sendJson(res, 400, { error: "Ce règlement a déjà été annulé." });
    }

    const dette = db.dettes.find(d => d.id === reg.detteId);
    if (!dette) {
      return sendJson(res, 404, { error: "Dette associée introuvable." });
    }

    reg.annule = true;
    reg.dateAnnulation = new Date().toISOString();
    reg.motifAnnulation = body.motif || 'Annulation manuelle validée par le gérant';

    const reglementsActifs = db.reglementsDettes.filter(r => r.detteId === dette.id && !r.annule);
    const totalRegleActif = reglementsActifs.reduce((sum, r) => sum + (parseFloat(r.montant) || 0), 0);

    dette.montantRegle = totalRegleActif;
    dette.soldeRestant = Math.max(0, Math.round((parseFloat(dette.montantInitial) - totalRegleActif) * 100) / 100);
    dette.statut = dette.soldeRestant <= 0 ? 'SOLDEE' : (dette.montantRegle > 0 ? 'PARTIEL' : 'NON_REGLEE');

    if (dette.type === 'CLIENT') {
      const client = (db.customers || []).find(c => c.id === dette.tierId);
      if (client) {
        client.dette = Math.round(((parseFloat(client.dette) || 0) + reg.montant) * 100) / 100;
      }
    } else {
      const supplier = (db.suppliers || []).find(s => s.id === dette.tierId);
      if (supplier) {
        supplier.solde_dette = Math.round(((parseFloat(supplier.solde_dette) || 0) + reg.montant) * 100) / 100;
      }
    }

    writeDb(db);
    return sendJson(res, 200, {
      success: true,
      message: "Règlement annulé et solde de la dette restauré !",
      reglement: reg,
      dette: dette,
      dettes: db.dettes,
      reglements: db.reglementsDettes,
      customers: db.customers,
      suppliers: db.suppliers
    });
  }

  // 5. Suppression d'une Dette sans Règlements
  if (pathname.startsWith('/api/dettes/') && method === 'DELETE') {
    const id = parseInt(pathname.replace('/api/dettes/', ''));
    const db = readDb();
    db.dettes = db.dettes || [];
    db.reglementsDettes = db.reglementsDettes || [];

    const dette = db.dettes.find(d => d.id === id);
    if (!dette) {
      return sendJson(res, 404, { error: "Dette introuvable." });
    }

    const reglementsValides = db.reglementsDettes.filter(r => r.detteId === id && !r.annule);
    if (reglementsValides.length > 0) {
      return sendJson(res, 400, {
        error: `Impossible de supprimer cette dette car elle possède ${reglementsValides.length} règlement(s) enregistré(s). Annulez les règlements d'abord.`
      });
    }

    if (dette.type === 'CLIENT') {
      const client = (db.customers || []).find(c => c.id === dette.tierId);
      if (client) {
        client.dette = Math.max(0, Math.round(((parseFloat(client.dette) || 0) - (dette.soldeRestant || 0)) * 100) / 100);
      }
    } else {
      const supplier = (db.suppliers || []).find(s => s.id === dette.tierId);
      if (supplier) {
        supplier.solde_dette = Math.max(0, Math.round(((parseFloat(supplier.solde_dette) || 0) - (dette.soldeRestant || 0)) * 100) / 100);
      }
    }

    db.dettes = db.dettes.filter(d => d.id !== id);
    writeDb(db);
    return sendJson(res, 200, { success: true, message: "Dette supprimée avec succès !", dettes: db.dettes });
  }

  // Reset to initial Excel data
  if (pathname === '/api/reset' && method === 'POST') {
    require('./import_csv.js');
    const db = readDb();
    return sendJson(res, 200, { success: true, message: "Données réinitialisées !", data: db });
  }

  // Download Full Database Backup JSON
  if (pathname === '/api/backup' && method === 'GET') {
    const db = readDb();
    const d = new Date();
    const filename = `Sauvegarde_SachetPOS_${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}.json`;
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`
    });
    return res.end(JSON.stringify(db, null, 2));
  }

  // Restore Database from uploaded JSON
  if (pathname === '/api/restore' && method === 'POST') {
    const body = await parseBody(req);
    if (!body || !Array.isArray(body.products)) {
      return sendJson(res, 400, { error: "Fichier de sauvegarde invalide (articles manquants)." });
    }
    writeDb(body);
    console.log("Base de données restaurée avec succès !");
    return sendJson(res, 200, { success: true, message: "Sauvegarde restaurée avec succès !", data: body });
  }

  // Network Info for Mobile Connection
  if (pathname === '/api/network-info' && method === 'GET') {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    let localIp = '127.0.0.1';
    let tailscaleIp = null;

    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if ('IPv4' !== iface.family || iface.internal) continue;
        if (iface.address.startsWith('100.')) {
          tailscaleIp = iface.address;
        } else if (!localIp || localIp === '127.0.0.1') {
          localIp = iface.address;
        }
      }
    }

    return sendJson(res, 200, {
      port: PORT,
      localIp: localIp,
      localUrl: `http://${localIp}:${PORT}`,
      tailscaleIp: tailscaleIp,
      tailscaleUrl: tailscaleIp ? `http://${tailscaleIp}:${PORT}` : null,
      tunnelUrl: tunnelUrl
    });
  }

  // Start Tunnel (Cloudflare prioritaire, sinon Localtunnel) for Public Internet Access Worldwide
  if (pathname === '/api/tunnel/start' && method === 'POST') {
    if (tunnelUrl) {
      return sendJson(res, 200, { success: true, url: tunnelUrl });
    }

    const { exec } = require('child_process');
    const cfCandidates = [
      "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe",
      "C:\\Program Files\\cloudflared\\cloudflared.exe"
    ];
    let cfPath = cfCandidates.find(p => fs.existsSync(p));

    if (cfPath) {
      activeTunnel = exec(`"${cfPath}" tunnel --url http://localhost:${PORT}`);
      let responded = false;
      const parseCf = (data) => {
        const text = data.toString();
        const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (match && !responded) {
          tunnelUrl = match[0];
          responded = true;
          console.log("🌐 Tunnel Cloudflare Public Ouvert :", tunnelUrl);
          return sendJson(res, 200, { success: true, url: tunnelUrl });
        }
      };
      activeTunnel.stdout.on('data', parseCf);
      activeTunnel.stderr.on('data', parseCf);
      setTimeout(() => {
        if (!responded) {
          responded = true;
          if (tunnelUrl) return sendJson(res, 200, { success: true, url: tunnelUrl });
          return sendJson(res, 500, { error: "Délai de connexion Cloudflare dépassé" });
        }
      }, 15000);
      return;
    }

    activeTunnel = exec(`npx --yes localtunnel --port ${PORT}`);

    let responded = false;
    activeTunnel.stdout.on('data', data => {
      const text = data.toString();
      const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.loca\.lt/);
      if (match && !responded) {
        tunnelUrl = match[0];
        responded = true;
        console.log("🌐 Tunnel Public Ouvert :", tunnelUrl);
        return sendJson(res, 200, { success: true, url: tunnelUrl });
      }
    });

    activeTunnel.stderr.on('data', err => {
      console.log("Tunnel info:", err.toString());
    });

    setTimeout(() => {
      if (!responded) {
        responded = true;
        if (tunnelUrl) {
          return sendJson(res, 200, { success: true, url: tunnelUrl });
        }
        return sendJson(res, 500, { error: "Délai de connexion dépassé" });
      }
    }, 12000);
    return;
  }

  // Export Products to CSV (Format compatible Excel)
  if (pathname === '/api/export-csv' && method === 'GET') {
    const db = readDb();
    let csv = "ID,Code,Nom,Taille,Couleur,Marque,Conditionnement,Stock,Prix Achat (FCFA),Prix Gros (FCFA),Prix Detail (FCFA),Marge Brute Unitaire (FCFA),Taux Marge (%),Valeur Stock Achat (FCFA),Valeur Stock Vente (FCFA),Categorie\n";
    for (const p of db.products) {
      const stock = parseFloat(p.stock) || 0;
      const pAchat = parseFloat(p.prix_achat) || 0;
      const pGros = parseFloat(p.prix_gros) || parseFloat(p.prix) || 0;
      const pDetail = parseFloat(p.prix_detail) || pGros;
      const marge = Math.max(0, pGros - pAchat);
      const tauxMarge = pAchat > 0 ? Math.round(((marge / pAchat) * 100) * 10) / 10 : 0;
      const valAchat = Math.round(stock * pAchat);
      const valVente = Math.round(stock * pGros);
      csv += `"${p.id}","${p.code || ''}","${p.nom || ''}","${p.taille || ''}","${p.couleur || ''}","${p.marque || ''}","${p.lot || 'Adaka'}","${stock}","${pAchat}","${pGros}","${pDetail}","${marge}","${tauxMarge}%","${valAchat}","${valVente}","${p.categorie || ''}"\n`;
    }
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="inventaire_sachets_miakiara.csv"'
    });
    return res.end("\uFEFF" + csv); // BOM for Excel utf-8
  }

  // --- STATIC FILE SERVING ---
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback to index.html for SPA-like experience
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end("404 Fichier non trouvé");
      } else {
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        });
        res.end(content);
      }
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(` 🚀 SACHET-POS est en ligne avec succès !`);
  console.log(` 🌐 Accès Principal : http://localhost:${PORT}`);
  console.log(` 📦 Articles chargés : ${readDb().products.length} articles`);
  console.log(`=======================================================`);
});

// Port secondaire automatique (5101) pour compatibilité absolue avec les raccourcis bureau et PWA Chrome
if (!process.env.RENDER && String(PORT) !== String(ALT_PORT)) {
  const altServer = http.createServer((req, res) => {
    server.emit('request', req, res);
  });
  altServer.on('error', (err) => {
    if (err.code !== 'EADDRINUSE') {
      console.warn(`[Port ${ALT_PORT}] Information:`, err.message);
    }
  });
  try {
    altServer.listen(ALT_PORT, '0.0.0.0', () => {
      console.log(` 🔗 Port Raccourci Bureau & PWA actif : http://127.0.0.1:${ALT_PORT}`);
    });
  } catch (e) {}
}

