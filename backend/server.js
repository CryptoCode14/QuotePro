const express = require('express');
const cors = require('cors');
const multer = require('multer');
const Tesseract = require('tesseract.js');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// Setup multer for image uploads
const upload = multer({ dest: 'uploads/' });

// Ensure uploads dir exists
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Database setup
const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS estimates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        status TEXT,
        garageDoor REAL,
        windows REAL,
        etc REAL,
        multiplier REAL,
        baseAmount REAL,
        percentFactor REAL,
        installation REAL,
        fuel REAL,
        grandTotal REAL,
        netProfit REAL,
        profitPercent REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        key TEXT UNIQUE,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// Auth Middleware
const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid Bearer token' });
    }
    const token = authHeader.split(' ')[1];
    
    db.get(`SELECT * FROM api_keys WHERE key = ? AND is_active = 1`, [token], (err, row) => {
        if (err || !row) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        next();
    });
};

// Math Logic (Identical to Frontend)
function calculateQuote(inputs) {
    const results = {};
    results.totalMaterials = inputs.garageDoor + inputs.windows + inputs.etc;
    results.afterMultiplier = results.totalMaterials * inputs.multiplier;
    results.factorResult = inputs.baseAmount * inputs.percentFactor;
    results.factorPoint4 = results.afterMultiplier * 0.4;
    results.subtotalBeforeInstall = results.afterMultiplier + results.factorResult + results.factorPoint4;
    results.subtotalAfterInstall = results.subtotalBeforeInstall + inputs.installation + inputs.fuel;
    results.tenPercent = results.subtotalAfterInstall * 0.10;
    results.grandTotal = results.subtotalAfterInstall + results.tenPercent;
    results.expenses = results.afterMultiplier + results.factorResult;
    results.netProfit = results.grandTotal - results.expenses;
    results.profitPercent = results.grandTotal !== 0 ? (results.netProfit / results.grandTotal) * 100 : 0;
    return results;
}

function calculateCostAnalysis(inputs) {
    const results = {};
    const discountRate = 0.99; // Assume discount enabled by default for API
    results.doorWithDiscount = (inputs.garageDoor * inputs.multiplier) * discountRate;
    results.windowsWithDiscount = (inputs.windows * inputs.multiplier) * discountRate;
    results.etcWithDiscount = (inputs.etc * inputs.multiplier) * discountRate;
    results.totalCostWithDiscount = results.doorWithDiscount + results.windowsWithDiscount + results.etcWithDiscount;
    results.doubleCost = results.totalCostWithDiscount * 2;
    results.targetGap = calculateQuote(inputs).grandTotal - results.doubleCost;
    return results;
}

// --- ENDPOINTS ---

// Run Calculator API (Accepts JSON numbers OR an Image)
app.post('/api/calculator/run', authenticate, upload.single('screenshot'), async (req, res) => {
    let inputs = {
        garageDoor: parseFloat(req.body.garageDoor) || 0,
        windows: parseFloat(req.body.windows) || 0,
        etc: parseFloat(req.body.etc) || 0,
        multiplier: parseFloat(req.body.multiplier) || 1.08,
        baseAmount: parseFloat(req.body.baseAmount) || 2000,
        percentFactor: (parseFloat(req.body.percentFactor) || 25) / 100,
        installation: parseFloat(req.body.installation) || 0,
        fuel: parseFloat(req.body.fuel) || 0
    };

    // If a screenshot was uploaded, run OCR to extract amounts
    if (req.file) {
        try {
            const result = await Tesseract.recognize(req.file.path, 'eng');
            const text = result.data.text;
            
            // Basic Regex to find prices (e.g. $1,012.00)
            const priceRegex = /\$?(\d{1,3}(,\d{3})*(\.\d{2})?)/g;
            const matches = text.match(priceRegex);
            
            if (matches && matches.length > 0) {
                // Just as a naive example, take the largest price found as the Garage Door cost
                const prices = matches.map(m => parseFloat(m.replace(/[$,]/g, '')));
                const maxPrice = Math.max(...prices);
                if (maxPrice > 0) inputs.garageDoor = maxPrice;
            }
            
            // Cleanup uploaded file
            fs.unlinkSync(req.file.path);
        } catch (error) {
            console.error('OCR Error:', error);
            return res.status(500).json({ error: 'OCR processing failed' });
        }
    }

    const quote = calculateQuote(inputs);
    const analysis = calculateCostAnalysis(inputs);
    
    res.json({
        inputs,
        quote,
        analysis
    });
});

// Estimates CRUD
app.get('/api/estimates', authenticate, (req, res) => {
    db.all(`SELECT * FROM estimates ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/estimates', authenticate, (req, res) => {
    const { name, status, garageDoor, windows, etc, multiplier, baseAmount, percentFactor, installation, fuel } = req.body;
    
    // Auto-calculate totals
    const inputs = { garageDoor: garageDoor||0, windows: windows||0, etc: etc||0, multiplier: multiplier||1.08, baseAmount: baseAmount||2000, percentFactor: percentFactor||0.25, installation: installation||0, fuel: fuel||0 };
    const quote = calculateQuote(inputs);
    
    const stmt = db.prepare(`INSERT INTO estimates (name, status, garageDoor, windows, etc, multiplier, baseAmount, percentFactor, installation, fuel, grandTotal, netProfit, profitPercent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    
    stmt.run([name, status || 'Pending', inputs.garageDoor, inputs.windows, inputs.etc, inputs.multiplier, inputs.baseAmount, inputs.percentFactor, inputs.installation, inputs.fuel, quote.grandTotal, quote.netProfit, quote.profitPercent], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, ...req.body, grandTotal: quote.grandTotal });
    });
});

app.patch('/api/estimates/:id', authenticate, (req, res) => {
    const { status, name } = req.body;
    db.run(`UPDATE estimates SET status = COALESCE(?, status), name = COALESCE(?, name) WHERE id = ?`, [status, name, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, changes: this.changes });
    });
});

app.delete('/api/estimates/:id', authenticate, (req, res) => {
    db.run(`DELETE FROM estimates WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, changes: this.changes });
    });
});

// Admin endpoints (No auth required for local simplicity, or use a master key)
app.get('/api/admin/keys', (req, res) => {
    db.all(`SELECT * FROM api_keys`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/admin/keys', (req, res) => {
    const rawKey = 'sk_live_' + require('crypto').randomBytes(16).toString('hex');
    db.run(`INSERT INTO api_keys (name, key) VALUES (?, ?)`, [req.body.name, rawKey], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, name: req.body.name, key: rawKey, is_active: 1 });
    });
});

app.delete('/api/admin/keys/:id', (req, res) => {
    db.run(`UPDATE api_keys SET is_active = 0 WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

const PORT = process.env.PORT || 8000;
const server = app.listen(PORT, () => {
    console.log(`Backend API running on http://localhost:${PORT}`);
});
server.on('error', (e) => {
    console.error('Server error:', e);
});
