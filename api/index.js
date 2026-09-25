require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const Tesseract = require('tesseract.js');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// Setup multer for image uploads (Vercel uses /tmp)
const upload = multer({ dest: '/tmp/' });

// Supabase Setup — service-role client (server-side only). Required because
// the api_keys table has RLS enabled with no public policies.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Auth Middleware (using api_keys table in Supabase).
// Keys are stored as SHA-256 hashes (plaintext column retired 2026-09-25);
// a key is valid when its hash matches a row with revoked_at IS NULL.
const authenticate = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid Bearer token' });
    }
    const token = authHeader.split(' ')[1];
    const keyHash = require('crypto').createHash('sha256').update(token, 'utf8').digest('hex');

    const { data, error } = await supabase
        .from('api_keys')
        .select('id')
        .eq('key_hash', keyHash)
        .is('revoked_at', null)
        .maybeSingle();

    if (error || !data) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    // Best-effort usage stamp; auth must not depend on it.
    supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id).then(() => {}, () => {});
    next();
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
    // 2026-09-24: the legacy 0.99 "1% DISC" factor is dead per Weston.
    // Double cost is exactly 2 × after-multiplier cost. Field names kept
    // stable for existing consumers.
    results.doorWithDiscount = inputs.garageDoor * inputs.multiplier;
    results.windowsWithDiscount = inputs.windows * inputs.multiplier;
    results.etcWithDiscount = inputs.etc * inputs.multiplier;
    results.totalCostWithDiscount = results.doorWithDiscount + results.windowsWithDiscount + results.etcWithDiscount;
    results.doubleCost = results.totalCostWithDiscount * 2;
    results.targetGap = calculateQuote(inputs).grandTotal - results.doubleCost;
    return results;
}

// --- ENDPOINTS ---

// Run Calculator API
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

    if (req.file) {
        try {
            const result = await Tesseract.recognize(req.file.path, 'eng');
            const text = result.data.text;
            const priceRegex = /\$?(\d{1,3}(,\d{3})*(\.\d{2})?)/g;
            const matches = text.match(priceRegex);
            if (matches && matches.length > 0) {
                const prices = matches.map(m => parseFloat(m.replace(/[$,]/g, '')));
                const maxPrice = Math.max(...prices);
                if (maxPrice > 0) inputs.garageDoor = maxPrice;
            }
            fs.unlinkSync(req.file.path);
        } catch (error) {
            console.error('OCR Error:', error);
            return res.status(500).json({ error: 'OCR processing failed' });
        }
    }

    const quote = calculateQuote(inputs);
    const analysis = calculateCostAnalysis(inputs);
    
    res.json({ inputs, quote, analysis });
});

// Estimates CRUD
app.get('/api/estimates', authenticate, async (req, res) => {
    const { data, error } = await supabase.from('estimates').select('*').order('id', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post('/api/estimates', authenticate, async (req, res) => {
    const { name, status, garageDoor, windows, etc, multiplier, baseAmount, percentFactor, installation, fuel } = req.body;
    
    const inputs = { garageDoor: garageDoor||0, windows: windows||0, etc: etc||0, multiplier: multiplier||1.08, baseAmount: baseAmount||2000, percentFactor: percentFactor||0.25, installation: installation||0, fuel: fuel||0 };
    const quote = calculateQuote(inputs);
    
    const { data, error } = await supabase.from('estimates').insert([{
        name,
        status: status || 'Pending',
        garage_door: inputs.garageDoor,
        windows: inputs.windows,
        etc: inputs.etc,
        multiplier: inputs.multiplier,
        base_amount: inputs.baseAmount,
        percent_factor: inputs.percentFactor,
        installation: inputs.installation,
        fuel: inputs.fuel,
        grand_total: quote.grandTotal,
        net_profit: quote.netProfit,
        profit_percent: quote.profitPercent
    }]).select();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data[0]);
});

app.patch('/api/estimates/:id', authenticate, async (req, res) => {
    const { status, name } = req.body;
    const updates = {};
    if (status !== undefined) updates.status = status;
    if (name !== undefined) updates.name = name;

    const { data, error } = await supabase.from('estimates').update(updates).eq('id', req.params.id).select();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, changes: data });
});

app.delete('/api/estimates/:id', authenticate, async (req, res) => {
    const { data, error } = await supabase.from('estimates').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// NOTE: /api/admin/keys was retired 2026-09-25. Key management now lives in
// the /v1/api-keys serverless functions (session-JWT auth, hashed storage,
// per-user isolation). This unauthenticated endpoint is gone for good.

// Vercel handles listening automatically
module.exports = app;
