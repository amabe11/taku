// Publica la web en GitHub Pages (gratis en repositorios públicos, sin tarjeta ni costos).
// Compila la variante «nube» (arranca en demostración porque no hay placa) y la sube a la rama gh-pages.
// Uso:  npm run deploy:pages
//       VITE_CLOUD_API=https://otra-api.vercel.app npm run deploy:pages   (otra dirección de API)
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, cpSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(web, 'dist-pages');
const API = process.env.VITE_CLOUD_API || 'https://taku-server.vercel.app';
const run = (cmd, cwd = web) => execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, VITE_TARGET: 'cloud', VITE_CLOUD_API: API } });

rmSync(out, { recursive: true, force: true });
run(`npx vite build --outDir dist-pages --emptyOutDir`);
rmSync(join(out, '.vite'), { recursive: true, force: true });
writeFileSync(join(out, '.nojekyll'), ''); // sirve tal cual (sin procesar con Jekyll)

const origin = execSync('git remote get-url origin', { cwd: web }).toString().trim();
const sha = execSync('git rev-parse --short HEAD', { cwd: web }).toString().trim();
const tmp = mkdtempSync(join(tmpdir(), 'ahgora-pages-'));
cpSync(out, tmp, { recursive: true });
const g = (cmd) => execSync(cmd, { cwd: tmp, stdio: 'inherit' });
g('git init -q -b gh-pages');
g('git add -A');
g(`git -c user.name="ahgora-deploy" -c user.email="deploy@users.noreply.github.com" commit -q -m "Publicación de la web (${sha})"`);
g(`git push -q -f ${origin} gh-pages`);
rmSync(tmp, { recursive: true, force: true });
console.log(`\nPublicado en la rama gh-pages desde ${sha}.`);
if (!existsSync(join(out, 'index.html'))) process.exitCode = 1;
