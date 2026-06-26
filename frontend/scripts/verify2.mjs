import { chromium } from 'playwright';

const b = await chromium.launch();
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
const titles = () => p.$$eval('cc-alert-card .title', (els) => els.map((e) => e.textContent.trim()));

await p.goto('http://localhost:4200/', { waitUntil: 'networkidle', timeout: 30000 });
await p.waitForSelector('cc-alert-card', { timeout: 15000 });
console.log('INITIAL cards:', (await titles()).length);

// 1. Threshold slider → 30% (live re-scan)
await p.$eval('input[type=range]', (el) => {
  el.value = '30';
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
await p.waitForTimeout(1300);
const at30 = await titles();
console.log('AFTER 30% (' + at30.length + '): withholding gone =', !at30.some((t) => /withheld/i.test(t)));

// reset to 20%
await p.$eval('input[type=range]', (el) => {
  el.value = '20';
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
await p.waitForTimeout(1300);

// 2. NL config bar → parse + echo
await p.fill('.nl-input', "show me what's missing on the Johnson return over 20%");
await p.click('.analyze');
await p.waitForSelector('.echo', { timeout: 8000 });
console.log('ECHO:', (await p.$eval('.echo-text', (e) => e.textContent.trim())));

// 3. Switch client → Smith
await p.selectOption('.client select', 'SMITH');
await p.waitForTimeout(1600);
const smith = await titles();
console.log('SMITH cards (' + smith.length + '):', smith.join(' | '));

console.log('PAGEERRORS:', errs.length, errs.slice(0, 4));
await b.close();
