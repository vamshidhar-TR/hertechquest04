import { chromium } from 'playwright';

const b = await chromium.launch();
const p = await b.newPage();
const errors = [];
p.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
p.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await p.goto('http://localhost:4200/', { waitUntil: 'networkidle', timeout: 30000 });
await p.waitForSelector('cc-alert-card', { timeout: 15000 });

const cards = await p.$$eval('cc-alert-card .title', (els) => els.map((e) => e.textContent.trim()));
const badges = await p.$$eval('cc-alert-card .pill', (els) => els.map((e) => e.textContent.trim()));
const tabs = await p.$$eval('.tab', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
const counts = await p.$eval('.counts', (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);

await p.screenshot({ path: '/tmp/cc-demo.png', fullPage: false });

console.log('COUNTS:', counts);
console.log('TABS:', JSON.stringify(tabs));
console.log('CARDS (' + cards.length + '):');
cards.forEach((c, i) => console.log('  ' + (badges[i] ?? '') + '  ' + c));
console.log('CONSOLE ERRORS:', errors.length);
errors.slice(0, 6).forEach((e) => console.log('  ! ' + e));
await b.close();
