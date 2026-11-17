// Monta web/ para Vercel: landing (web-src/index.html) + la app real en modo demo (/app).
// Uso: node scripts/build-web.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'web');
fs.mkdirSync(out, { recursive: true });
// Conserva .vercel (enlace con el proyecto de Vercel)
for (const e of fs.readdirSync(out)) if (e !== '.vercel') fs.rmSync(path.join(out, e), { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'vendor'), { recursive: true });

const copy = (from, to) => fs.copyFileSync(path.join(root, from), path.join(out, to));
copy('web-src/index.html', 'index.html');

// Descarga para Windows: web/descargar/faisp-windows.zip a partir de la última compilación release
const exe = path.join(root, 'target/release/faisp.exe');
if (fs.existsSync(exe)) {
  const tmp = path.join(os.tmpdir(), 'faisp-zip');
  const stage = path.join(tmp, 'faisp');
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  for (const [f, from] of [['faisp.exe', 'target/release/faisp.exe'], ['WebView2Loader.dll', 'assets/WebView2Loader.dll'], ['faisp.ico', 'assets/faisp.ico'], ['Instalar.cmd', 'assets/dist/Instalar.cmd'], ['Desinstalar.cmd', 'assets/dist/Desinstalar.cmd'], ['LEEME.txt', 'assets/dist/LEEME.txt']]) fs.copyFileSync(path.join(root, from), path.join(stage, f));
  fs.mkdirSync(path.join(out, 'descargar'), { recursive: true });
  const zip = path.join(out, 'descargar', 'faisp-windows.zip');
  execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${stage}' -DestinationPath '${zip}' -Force`], { stdio: 'inherit' });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('Descarga de Windows:', zip, Math.round(fs.statSync(zip).size / 1024 / 1024 * 10) / 10, 'MB');
} else console.warn('Sin target/release/faisp.exe: la web sale sin descarga de Windows (compila con cargo build --release)');
// macOS y Linux: los compila GitHub Actions (workflow «Compilar macOS y Linux»); se bajan a dist-ci/ con
//   gh run download <id> -D dist-ci
fs.mkdirSync(path.join(out, 'descargar'), { recursive: true });
for (const f of ['faisp-macos.zip', 'faisp-linux-x64.tar.gz']) {
  const hit = ['dist-ci', 'dist-ci/faisp-macos', 'dist-ci/faisp-linux'].map(d => path.join(root, d, f)).find(p => fs.existsSync(p));
  if (hit) { fs.copyFileSync(hit, path.join(out, 'descargar', f)); console.log('Descarga:', f); } else console.warn('Sin ' + f + ' (descárgalo de GitHub Actions a dist-ci/)');
}
// Si falta un paquete, su botón de la web sale como «próximamente»
{
  const ip = path.join(out, 'index.html'); let h = fs.readFileSync(ip, 'utf8');
  for (const f of ['faisp-macos.zip', 'faisp-linux-x64.tar.gz', 'faisp-windows.zip'])
    if (!fs.existsSync(path.join(out, 'descargar', f))) h = h.replace(new RegExp('<a class="btn accent" href="/descargar/' + f.replace(/./g, '\.') + '" download>[^<]*</a>'), '<a class="btn" aria-disabled="true">Próximamente</a>');
  if (!fs.existsSync(path.join(out, 'descargar', 'faisp-macos.zip'))) h = h.replace('macOS (Intel y Apple Silicon)', 'macOS (próximamente)');
  fs.writeFileSync(ip, h);
}
// version.json: la app lo consulta para avisar de actualizaciones (y comprobar la huella del paquete)
{
  const version = /^version\s*=\s*"([^"]+)"/m.exec(fs.readFileSync(path.join(root, 'Cargo.toml'), 'utf8'))[1];
  let notes = ''; try { notes = execFileSync('git', ['log', '-1', '--format=%s'], { cwd: root }).toString().trim(); } catch {}
  const info = f => { const p = path.join(out, 'descargar', f); if (!fs.existsSync(p)) return null; const b = fs.readFileSync(p); return { url: 'https://faisp.vercel.app/descargar/' + f, size: b.length, sha256: createHash('sha256').update(b).digest('hex') }; };
  const files = { windows: info('faisp-windows.zip'), macos: info('faisp-macos.zip'), linux: info('faisp-linux-x64.tar.gz') };
  const w = files.windows || {};
  fs.writeFileSync(path.join(out, 'descargar', 'version.json'), JSON.stringify({ version, channel: 'alfa', date: new Date().toISOString().slice(0, 10), notes, size: w.size, sha256: w.sha256, url: w.url, files }, null, 2));
}
copy('web-src/demo-api.js', 'demo-api.js');
for (const f of ['app.js', 'app.css', 'logos.js', 'icon.svg', 'icon-192.png', 'icon-256.png', 'icon-512.png', 'manifest.json', 'vendor/marked.js', 'vendor/purify.js', 'studio.js', 'vendor/three/three.module.min.js', 'vendor/three/LICENSE', 'vendor/three/addons/controls/OrbitControls.js', 'vendor/three/addons/loaders/GLTFLoader.js', 'vendor/three/addons/loaders/OBJLoader.js', 'vendor/three/addons/utils/BufferGeometryUtils.js', 'm.css', 'm.js', 'm-manifest.json', 'apple-touch-icon.png']) { fs.mkdirSync(path.dirname(path.join(out, f)), { recursive: true }); copy('ui/' + f, f); }
// Documento de metadatos del cliente OAuth (CIMD) para los conectores remotos
fs.mkdirSync(path.join(out, 'oauth'), { recursive: true });
copy('web-src/client-metadata.json', 'oauth/client-metadata.json');

let app = fs.readFileSync(path.join(root, 'ui/index.html'), 'utf8');
app = app.replace('<title>faisp</title>', '<title>faisp — demo web</title>');
app = app.replace('<script src="/app.js"></script>', '<script src="/demo-api.js"></script>\n  <script src="/app.js"></script>');
app = app.replace('</body>', `  <a href="/" class="demo-note" title="Las respuestas son de ejemplo: la demo no usa claves ni accede a tu ordenador">Demo web · respuestas de ejemplo</a>
  <style>.demo-note{position:fixed;right:14px;bottom:10px;z-index:30;font-size:12px;color:var(--muted);background:var(--card);border:1px solid var(--line);border-radius:999px;padding:3px 12px;text-decoration:none}</style>
</body>`);
fs.writeFileSync(path.join(out, 'app.html'), app);
// Versión de teléfono (demo): la misma interfaz /m que se usa emparejada con el PC
let m = fs.readFileSync(path.join(root, 'ui/m.html'), 'utf8');
m = m.replace('<script src="/m.js"></script>', '<script src="/demo-api.js"></script>\n  <script src="/m.js"></script>');
fs.writeFileSync(path.join(out, 'm.html'), m);

fs.writeFileSync(path.join(out, 'vercel.json'), JSON.stringify({
  cleanUrls: true,
  headers: [{ source: '/(.*)', headers: [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  ] }],
}, null, 2));

const files = [];
const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : files.push(path.relative(out, p).replace(/\\/g, '/')); } };
walk(out);
console.log('web/ listo:', files.join(', '));
