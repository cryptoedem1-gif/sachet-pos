const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'db.json');
const PUBLIC_DIR = fs.existsSync(path.join(__dirname, 'public')) ? path.join(__dirname, 'public') : __dirname;

let activeTunnel = null;
let tunnelUrl = null;

// Ensure db.json exists
if (!fs.existsSync(DB_FILE)) {
  console.log("Fichier db.json non trouvé, initialisation via import_csv.js...");
  require('./import_csv.js');
}

function readDb() {
  try {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error("Erreur de lecture db.json:", err);
    return { settings: {}, products: [], customers: [], sales: [], stockMovements: [] };
  }
}

function writeDb(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error("Erreur d'écriture db.json:", err);
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

  // Add / Edit Product
  if (pathname === '/api/products' && method === 'POST') {
    const body = await parseBody(req);
    const db = readDb();
    
    if (body.id) {
      // Edit
      const index = db.products.findIndex(p => p.id === body.id);
      if (index !== -1) {
        db.products[index] = { ...db.products[index], ...body };
      } else {
        db.products.push(body);
      }
    } else {
      // Create new
      const maxId = db.products.reduce((max, p) => Math.max(max, p.id || 0), 0);
      const newProduct = {
        ...body,
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

  // Stock Movement (Approvisionnement / Ajustement / Perte)
  if (pathname === '/api/stock/movement' && method === 'POST') {
    const body = await parseBody(req);
    const { productId, type, quantite, motif } = body;
    const db = readDb();
    const product = db.products.find(p => p.id === parseInt(productId));

    if (!product) {
      return sendJson(res, 404, { error: "Produit non trouvé" });
    }

    const qteNum = parseFloat(quantite) || 0;
    const oldStock = parseFloat(product.stock) || 0;
    let newStock = oldStock;

    if (type === 'ENTREE') {
      newStock = oldStock + qteNum;
    } else if (type === 'SORTIE' || type === 'PERTE') {
      newStock = Math.max(0, oldStock - qteNum);
    } else if (type === 'AJUSTEMENT') {
      newStock = qteNum;
    }

    product.stock = Math.round(newStock * 100) / 100;

    const movement = {
      id: Date.now(),
      date: new Date().toISOString(),
      productId: product.id,
      productName: product.nom + ' ' + product.taille + ' ' + product.marque,
      type: type,
      quantite: qteNum,
      ancienStock: oldStock,
      nouveauStock: product.stock,
      motif: motif || (type === 'ENTREE' ? 'Réapprovisionnement' : 'Ajustement')
    };

    db.stockMovements = db.stockMovements || [];
    db.stockMovements.unshift(movement);

    writeDb(db);
    return sendJson(res, 200, { success: true, product, movement, products: db.products });
  }

  // Register a Sale (Point de Vente POS)
  if (pathname === '/api/sales' && method === 'POST') {
    const saleData = await parseBody(req);
    const db = readDb();

    // Verify and decrement stocks
    const saleItems = saleData.items || [];
    const stockErrors = [];

    // Check availability
    for (const item of saleItems) {
      const prod = db.products.find(p => p.id === item.productId);
      if (!prod) {
        stockErrors.push(`Produit #${item.productId} introuvable.`);
      }
    }

    if (stockErrors.length > 0) {
      return sendJson(res, 400, { error: stockErrors.join(' ') });
    }

    // Process stock decrement
    for (const item of saleItems) {
      const prod = db.products.find(p => p.id === item.productId);
      const currentStock = parseFloat(prod.stock) || 0;
      const qte = parseFloat(item.quantite) || 0;
      const updatedStock = Math.max(0, Math.round((currentStock - qte) * 100) / 100);
      prod.stock = updatedStock;

      // Log movement
      db.stockMovements = db.stockMovements || [];
      db.stockMovements.unshift({
        id: Date.now() + Math.random(),
        date: new Date().toISOString(),
        productId: prod.id,
        productName: prod.nom + ' ' + prod.taille + ' ' + prod.marque,
        type: 'VENTE',
        quantite: qte,
        ancienStock: currentStock,
        nouveauStock: updatedStock,
        motif: `Vente #${saleData.ticketNumber || 'TICKET'}`
      });
    }

    // Process customer debt if sale is credit or partial
    if (saleData.customerId && saleData.montantRestant && saleData.montantRestant > 0) {
      const client = db.customers.find(c => c.id === parseInt(saleData.customerId));
      if (client) {
        client.dette = (parseFloat(client.dette) || 0) + parseFloat(saleData.montantRestant);
      }
    }

    // Format and save sale
    const saleId = (db.sales.length > 0 ? Math.max(...db.sales.map(s => s.id || 0)) : 0) + 1;
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const ticketCode = `TK-${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${String(saleId).padStart(4, '0')}`;

    const completeSale = {
      id: saleId,
      ticketCode: ticketCode,
      date: now.toISOString(),
      clientNom: saleData.clientNom || 'Client Comptoir',
      clientId: saleData.customerId || 1,
      items: saleItems,
      totalNet: parseFloat(saleData.totalNet) || 0,
      modePaiement: saleData.modePaiement || 'ESPECES',
      montantRecu: parseFloat(saleData.montantRecu) || 0,
      monnaieRendue: parseFloat(saleData.monnaieRendue) || 0,
      montantPaye: parseFloat(saleData.montantPaye) || 0,
      montantRestant: parseFloat(saleData.montantRestant) || 0,
      notes: saleData.notes || ''
    };

    db.sales.unshift(completeSale);
    writeDb(db);

    return sendJson(res, 201, { success: true, sale: completeSale, products: db.products, customers: db.customers });
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

  // Start Localtunnel for Public Internet Access Worldwide
  if (pathname === '/api/tunnel/start' && method === 'POST') {
    if (tunnelUrl) {
      return sendJson(res, 200, { success: true, url: tunnelUrl });
    }

    const { exec } = require('child_process');
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
    let csv = "ID,Code,Nom,Taille,Couleur,Marque,Conditionnement,Stock (Adaka),Prix Unitaire (FCFA),Prix Total (FCFA),Categorie\n";
    for (const p of db.products) {
      const total = (parseFloat(p.stock) || 0) * (parseFloat(p.prix) || 0);
      csv += `"${p.id}","${p.code || ''}","${p.nom || ''}","${p.taille || ''}","${p.couleur || ''}","${p.marque || ''}","${p.lot || 'adaka'}","${p.stock}","${p.prix}","${total}","${p.categorie || ''}"\n`;
    }
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="inventaire_sachets.csv"'
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
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      }
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(` 🚀 SACHET-POS est en ligne avec succès !`);
  console.log(` 🌐 Accédez au logiciel sur : http://localhost:${PORT}`);
  console.log(` 📦 Articles chargés : ${readDb().products.length} articles`);
  console.log(`=======================================================`);
});
