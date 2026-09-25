/**
 * OCR parser regression suite.
 *
 * Runs parsePricingText against 35 real tesseract OCR outputs from Weston's
 * iStore screenshots (fixtures/ + expected.json — ground truth manually
 * verified 2026-09-24) plus synthetic edge cases for the failure modes that
 * bit us: OCR-mangled door model codes, digitless codes, wrapped net prices.
 *
 * Usage: npm run test:ocr   (exit 0 = all pass, exit 1 = failure)
 */
import { createJiti } from "jiti";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const jiti = createJiti(import.meta.url);
const { parsePricingText } = jiti("../../src/lib/ocrParser.ts");

const EPS = 0.005;
let failures = 0;

function check(name, actual, expected) {
  const ok =
    Math.abs(actual.door - expected.door) < EPS &&
    Math.abs(actual.windows - expected.windows) < EPS &&
    Math.abs(actual.etc - expected.etc) < EPS;
  if (!ok) {
    failures++;
    console.log(`FAIL ${name}`);
    console.log(
      `  expected door=${expected.door} win=${expected.windows} etc=${expected.etc}`,
    );
    console.log(
      `  actual   door=${actual.door} win=${actual.windows} etc=${actual.etc}`,
    );
    console.log(
      `  cards: ${actual.cards.map((c) => `${c.label}[${c.kind}]$${c.netPrice}`).join(" | ")}`,
    );
  }
}

// ---- 1. Real screenshot fixtures ----
const expected = JSON.parse(
  fs.readFileSync(path.join(__dirname, "expected.json"), "utf8"),
);
const fixtureFiles = fs
  .readdirSync(path.join(__dirname, "fixtures"))
  .filter((f) => f.endsWith(".txt"));
let fixtureCount = 0;
for (const f of fixtureFiles) {
  const base = f.replace(/\.txt$/, "");
  const exp = expected[base];
  if (!exp) {
    console.log(`FAIL fixture ${base}: no expected entry`);
    failures++;
    continue;
  }
  const text = fs.readFileSync(path.join(__dirname, "fixtures", f), "utf8");
  check(`fixture ${base.slice(0, 12)}`, parsePricingText(text), exp);
  // Structural invariant: every iStore screenshot must detect its door card —
  // a missing door must stay missing, never be guessed from another card.
  if (exp.door > 0) {
    const r = parsePricingText(text);
    const doorCards = r.cards.filter((c) => c.kind === "door");
    if (doorCards.length !== 1) {
      console.log(`FAIL fixture ${base.slice(0, 12)}: expected 1 door card, got ${doorCards.length}`);
      failures++;
    } else if (Math.abs(doorCards[0].netPrice - exp.door) >= EPS) {
      console.log(`FAIL fixture ${base.slice(0, 12)}: door card price ${doorCards[0].netPrice} != ${exp.door}`);
      failures++;
    }
  }
  fixtureCount++;
}

// ---- 2. Synthetic edge cases ----
const edge = (name, text, exp) => check(`edge ${name}`, parsePricingText(text), exp);

edge("mangled-digit-door BD1NU->BDINU", `BDINU Multiplier: 1.364
ListPrice: 1,548.00 NetPrice: 2090.36
1% iStore Discount Applied
PRICE FOR FRAMING Multiplier: 1.364
List Price: 664.00 NetPrice: 896.64
1% iStore Discount Applied`, { door: 2090.36, windows: 0, etc: 896.64 });

edge("digitless-door VSAXU", `VSAXU Multiplier: 1.471
ListPrice: 6,645.00 NetPrice: 9677.05
1% iStore Discount Applied
PRICE FOR COLOR Multiplier: 1.471
List Price: 81.62 NetPrice: 118.86
1% iStore Discount Applied`, { door: 9677.05, windows: 0, etc: 118.86 });

edge("spaced-code 9 208", `9 208 Multiplier: 1.268
List Price: 949.00 NetPrice: 1191.30
1% iStore Discount Applied`, { door: 1191.3, windows: 0, etc: 0 });

edge("trailing-period 9208.", `9208.
List Price: 949.00 NetPrice: 1191.30
1% iStore Discount Applied`, { door: 1191.3, windows: 0, etc: 0 });

edge("bare-code split from tail", `9208
Multiplier: 1.268
List Price: 949.00 NetPrice: 1191.30
1% iStore Discount Applied`, { door: 1191.3, windows: 0, etc: 0 });

edge("net-price wrapped to next line", `9208 Multiplier: 1.268
List Price: 949.00
Net Price:
1191.30
1% iStore Discount Applied
PRICE FOR FRAMING Multiplier: 1.268
List Price: 720.00 Net Price: 903.83
1% iStore Discount Applied`, { door: 1191.3, windows: 0, etc: 903.83 });

edge("dropped decimal", `9208 Multiplier: 1.268
List Price: 949.00 NetPrice: 1191 30
1% iStore Discount Applied`, { door: 1191.3, windows: 0, etc: 0 });

edge("digit-run cents", `9208 Multiplier: 1.268
List Price: 94900 NetPrice: 119130
1% iStore Discount Applied`, { door: 1191.3, windows: 0, etc: 0 });

edge("FV200U is windows", `3200 Multiplier: 1.114
ListPrice: 2,232.00 NetPrice: 2461.59
1% iStore Discount Applied
PRICE FOR FV200U Multiplier: 1.114
ListPrice: 177.83 NetPrice: 196.12
1% iStore Discount Applied`, { door: 2461.59, windows: 196.12, etc: 0 });

edge("missing door is never guessed", `PRICE FOR FRAMING Multiplier: 1.364
List Price: 332.00 Net Price: 448.32
1% iStore Discount Applied
PRICE FOR COLOR Multiplier: 1.227
List Price: 120.00 Net Price: 145.77
1% iStore Discount Applied`, { door: 0, windows: 0, etc: 594.09 });

edge("discount line never a price", `9208 Multiplier: 1.268
1% iStore Discount Applied`, { door: 0, windows: 0, etc: 0 });

edge("multiplier never a price", `9208 Multiplier: 1.268
List Price: 949.00
1% iStore Discount Applied`, { door: 0, windows: 0, etc: 0 });

edge("insulated option is windows", `9208 Multiplier: 1.268
List Price: 949.00 NetPrice: 1191.30
1% iStore Discount Applied
PRICE FOR INSULATED Multiplier: 1.268
List Price: 206.58 NetPrice: 227.83
1% iStore Discount Applied`, { door: 1191.3, windows: 227.83, etc: 0 });

edge("door keeps priority beside insulated option", `9208
Multiplier: 1.268
List Price: 949.00 NetPrice: 1191.30
1% iStore Discount Applied
PRICE FOR INSULATION Multiplier: 1.268
List Price: 61.00 Net Price: 69.24
1% iStore Discount Applied`, { door: 1191.3, windows: 69.24, etc: 0 });

console.log(
  failures === 0
    ? `PASS — ${fixtureCount} fixtures + 14 edge cases`
    : `${failures} FAILURE(S)`,
);
process.exit(failures === 0 ? 0 : 1);
