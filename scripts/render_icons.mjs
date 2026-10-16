// Rasterise app/icons/icon.svg en PNG (apple-touch-icon et icônes du manifeste) avec Chromium.
// Usage : make icons   (nécessite tests/e2e/node_modules, donc `npm --prefix tests/e2e install`)
import { chromium } from '../tests/e2e/node_modules/playwright-core/index.mjs';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url).pathname;
const svg = readFileSync(`${root}app/icons/icon.svg`, 'utf8');
const executablePath = process.env.CHROMIUM ?? '/usr/bin/chromium';
const sizes = { 'icon-180.png': 180, 'icon-192.png': 192, 'icon-512.png': 512 };

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
try {
    for (const [name, size] of Object.entries(sizes)) {
        const page = await browser.newPage({ viewport: { width: size, height: size } });
        await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
        await page.screenshot({ path: `${root}app/icons/${name}` });
        await page.close();
        console.log(`app/icons/${name}`);
    }
} finally {
    await browser.close();
}
