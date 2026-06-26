import { chromium } from 'playwright';

const b = await chromium.launch();
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
const titles = () => p.$$eval('cc-alert-card .title', (els) => els.map((e) => e.textContent.trim()));

await p.goto('http://localhost:4200/', { waitUntil: 'networkidle', timeout: 30000 });
await p.waitForSelector('cc-alert-card', { timeout: 15000 });

console.log('JOHNSON cards:', (await titles()).length);
const cites = await p.$$eval('cc-alert-card .cite', (els) => els.length);
const hasHandsFree = await p.$$eval('.hf', (els) => els.length > 0);
const hasAsk = await p.$$eval('cc-alert-card .ask', (els) => els.length);
console.log('citations rendered:', cites, '| hands-free toggle:', hasHandsFree, '| ask buttons:', hasAsk);
await p.screenshot({ path: '/tmp/cc-aligned.png' });

// Switch to Garcia (control) — expect zero cards
await p.selectOption('.client select', 'garcia');
await p.waitForTimeout(1500);
const garcia = await titles();
console.log('GARCIA cards (expect 0):', garcia.length);
const emptyMsg = await p.$$eval('.empty', (e) => e.length);
console.log('GARCIA empty-state shown:', emptyMsg > 0);

// Switch to Thompson — expect the multi-year selector (2 selects in topbar)
await p.selectOption('.client select', 'thompson');
await p.waitForTimeout(1500);
const selects = await p.$$eval('.client select', (els) => els.length);
const tcards = await titles();
console.log('THOMPSON cards:', tcards.length, '| topbar selects (2 = year picker present):', selects);

console.log('PAGEERRORS:', errs.length, errs.slice(0, 5));
await b.close();
