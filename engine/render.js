// Cascade Clarity signal-card renderer
// usage: node render.js payload.json out.png
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

(async () => {
  const payload = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const out = process.argv[3] || 'signal-card.png';
  const tpl = path.join(__dirname, 'card.html');
  const browser = await chromium.launch({ args: ['--no-sandbox','--font-render-hinting=none'] });
  const page = await browser.newPage({ viewport: { width: 1240, height: 1754 }, deviceScaleFactor: 2 });
  await page.addInitScript(d => { window.__DATA__ = d; }, payload);
  await page.goto('file://' + tpl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.screenshot({ path: out, clip: { x:0, y:0, width:1240, height:1754 } });
  await browser.close();
  console.log('OK ' + out);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
