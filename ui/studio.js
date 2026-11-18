// Estudio de faisp: visor 3D de modelos (Blockbench .bbmodel, JSON de bloque/ítem de Minecraft,
// glTF/GLB y OBJ) para revisar y pedir cambios a la IA. Las reglas de UV y sombreado son las del
// juego y de Blockbench (las mismas que usa el Estudio de modelos de Modpack Launcher).
import * as THREE from 'three';
import { OrbitControls } from '/vendor/three/addons/controls/OrbitControls.js';
import { GLTFLoader } from '/vendor/three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from '/vendor/three/addons/loaders/OBJLoader.js';

const DIRS = ['north', 'south', 'east', 'west', 'up', 'down'];
const SHADE = { up: 1, down: 0.5, north: 0.8, south: 0.8, east: 0.6, west: 0.6 };
const rad = THREE.MathUtils.degToRad;

function corners(d, a, b) {
  const [x1, y1, z1] = a, [x2, y2, z2] = b;
  switch (d) {
    case 'north': return [[x2, y2, z1], [x1, y2, z1], [x2, y1, z1], [x1, y1, z1]];
    case 'south': return [[x1, y2, z2], [x2, y2, z2], [x1, y1, z2], [x2, y1, z2]];
    case 'east': return [[x2, y2, z2], [x2, y2, z1], [x2, y1, z2], [x2, y1, z1]];
    case 'west': return [[x1, y2, z1], [x1, y2, z2], [x1, y1, z1], [x1, y1, z2]];
    case 'up': return [[x1, y2, z1], [x2, y2, z1], [x1, y2, z2], [x2, y2, z2]];
    case 'down': return [[x1, y1, z2], [x2, y1, z2], [x1, y1, z1], [x2, y1, z1]];
  }
}
function defaultUv(d, from, to) {
  const [x1, y1, z1] = from, [x2, y2, z2] = to;
  switch (d) {
    case 'up': return [x1, z1, x2, z2];
    case 'down': return [x1, 16 - z2, x2, 16 - z1];
    case 'north': return [16 - x2, 16 - y2, 16 - x1, 16 - y1];
    case 'south': return [x1, 16 - y2, x2, 16 - y1];
    case 'west': return [z1, 16 - y2, z2, 16 - y1];
    case 'east': return [16 - z2, 16 - y2, 16 - z1, 16 - y1];
  }
}
// UV de caja (entidades de Blockbench): la tira desplegada a partir de uv_offset
function boxUv(e) {
  const [u, v] = e.uv_offset || [0, 0];
  const s = [0, 1, 2].map(i => Math.floor(Math.abs(e.to[i] - e.from[i]) + 1e-7));
  const [w, h, d] = s;
  const f = {
    north: [d, d, d + w, d + h], east: [0, d, d, d + h], south: [d * 2 + w, d, d * 2 + w * 2, d + h], west: [d + w, d, d * 2 + w, d + h],
    up: [d + w, d, d, 0], down: [d + w * 2, 0, d + w, d],
  };
  if (e.mirror_uv) { const t = f.east; f.east = f.west; f.west = t; for (const k of DIRS) { const r = f[k]; f[k] = [r[2], r[1], r[0], r[3]]; } }
  for (const k of DIRS) f[k] = [f[k][0] + u, f[k][1] + v, f[k][2] + u, f[k][3] + v];
  return f;
}

const missing = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 2; const g = c.getContext('2d');
  g.fillStyle = '#f800f8'; g.fillRect(0, 0, 1, 1); g.fillRect(1, 1, 1, 1); g.fillStyle = '#000'; g.fillRect(1, 0, 1, 1); g.fillRect(0, 1, 1, 1);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; return t;
})();
function loadTex(url) {
  return new Promise(res => {
    if (!url) return res(null);
    new THREE.TextureLoader().load(url, t => { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; res(t); }, undefined, () => res(null));
  });
}

/** Una caja con sus caras. faces: {dir: {uv:[u1,v1,u2,v2] en px, tex: {three,uw,uh}|null, rotation}} */
function boxMesh(from, to, faces, game, mats) {
  const pos = [], uv = [], groups = [], list = [];
  for (const d of DIRS) {
    const f = faces[d]; if (!f) continue;
    const t = f.tex;
    const shade = game ? SHADE[d] : 1;
    const key = (t?.key || 'x') + '|' + (game ? shade : 'lit');
    let m = mats.get(key);
    if (!m) {
      const map = t?.three || missing;
      m = game ? new THREE.MeshBasicMaterial({ map, color: new THREE.Color(shade, shade, shade), alphaTest: 0.1, side: THREE.DoubleSide, transparent: false })
        : new THREE.MeshLambertMaterial({ map, alphaTest: 0.1, side: THREE.DoubleSide });
      mats.set(key, m);
    }
    let mi = list.indexOf(m); if (mi < 0) { list.push(m); mi = list.length - 1; }
    const c = corners(d, from, to);
    const [u1, v1, u2, v2] = f.uv;
    const uw = t?.uw || 16, uh = t?.uh || 16;
    const uvs = [[u1, v1], [u2, v1], [u2, v2], [u1, v2]];
    const rot = ((f.rotation || 0) / 90) & 3;
    const r = i => uvs[(i + rot) % 4];
    const cu = [r(0), r(1), r(3), r(2)];
    groups.push({ start: pos.length / 3, mat: mi });
    for (const k of [0, 2, 1, 1, 2, 3]) { pos.push(...c[k]); uv.push(cu[k][0] / uw, 1 - cu[k][1] / uh); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  groups.forEach(g => geo.addGroup(g.start, 6, g.mat));
  return new THREE.Mesh(geo, list.length ? list : [new THREE.MeshBasicMaterial({ visible: false })]);
}
function pivotWrap(obj, origin, rotXYZ) {
  if (!rotXYZ || (!rotXYZ[0] && !rotXYZ[1] && !rotXYZ[2])) return obj;
  const p = new THREE.Group();
  p.position.set(origin[0], origin[1], origin[2]);
  p.rotation.set(rad(rotXYZ[0]), rad(rotXYZ[1]), rad(rotXYZ[2]), 'ZYX');
  obj.position.set(-origin[0], -origin[1], -origin[2]);
  p.add(obj);
  return p;
}

// ---------- Blockbench ----------
async function buildBB(j, game) {
  const res = j.resolution || { width: 16, height: 16 };
  const texs = await Promise.all((j.textures || []).map(async (t, i) => {
    const three = await loadTex(t.source || null);
    return { key: 'bb' + i, three, uw: t.uv_width || res.width || t.width || 16, uh: t.uv_height || res.height || t.height || 16, uuid: t.uuid };
  }));
  const texOf = ref => (ref === null || ref === undefined) ? null : typeof ref === 'number' ? texs[ref] || null : texs.find(t => t.uuid === ref) || texs[0] || null;
  const mats = new Map(), parts = [];
  const byId = new Map((j.elements || []).map(e => [e.uuid, e]));
  const used = new Set();
  const buildEl = e => {
    if (e.type && e.type !== 'cube') return null;
    used.add(e.uuid);
    const inf = e.inflate || 0;
    const from = e.from.map(v => v - inf), to = e.to.map(v => v + inf);
    const faces = {};
    const auto = e.box_uv ?? j.meta?.box_uv;
    const bu = auto ? boxUv(e) : null;
    for (const d of DIRS) {
      const f = e.faces?.[d];
      if (auto) { faces[d] = { uv: bu[d], tex: texOf(f?.texture ?? 0) }; continue; }
      if (!f || f.texture === null) continue;
      faces[d] = { uv: f.uv || defaultUv(d, from, to), tex: texOf(f.texture), rotation: f.rotation };
    }
    const mesh = boxMesh(from, to, faces, game, mats);
    const o = pivotWrap(mesh, e.origin || [0, 0, 0], e.rotation);
    o.userData = { sel: true, name: e.name || 'cubo', kind: 'cubo', id: e.uuid };
    mesh.userData.pick = o;
    parts.push({ id: e.uuid, name: e.name || 'cubo', kind: 'cubo', obj: o });
    return o;
  };
  const buildGroup = (g, depth) => {
    const inner = new THREE.Group();
    const node = { id: g.uuid, name: g.name || 'grupo', kind: 'grupo', depth, children: [] };
    parts.push(node);
    for (const c of g.children || []) {
      if (typeof c === 'string') { const e = byId.get(c); const o = e && buildEl(e); if (o) { inner.add(o); parts[parts.length - 1].depth = depth + 1; } }
      else { const o = buildGroup(c, depth + 1); inner.add(o); }
    }
    const rot = g.rotation;
    let o = inner;
    if (rot && (rot[0] || rot[1] || rot[2])) o = pivotWrap(inner, g.origin || [0, 0, 0], rot);
    const holder = new THREE.Group(); holder.add(o);
    holder.userData = { sel: true, name: node.name, kind: 'grupo', id: g.uuid };
    node.obj = holder;
    if (g.visibility === false) holder.visible = false;
    return holder;
  };
  const root = new THREE.Group();
  for (const n of j.outliner || []) {
    if (typeof n === 'string') { const e = byId.get(n); const o = e && buildEl(e); if (o) { root.add(o); parts[parts.length - 1].depth = 0; } }
    else root.add(buildGroup(n, 0));
  }
  for (const e of j.elements || []) if (!used.has(e.uuid)) { const o = buildEl(e); if (o) { root.add(o); parts[parts.length - 1].depth = 0; } }
  return { root, parts, front: '-z' };
}

// ---------- JSON de Minecraft ----------
async function buildMC(j, game, opts) {
  // Herencia: textures y elements del padre si este no los trae (solo modelos del proyecto)
  let model = { ...j, textures: { ...(j.textures || {}) } };
  for (let i = 0, p = j.parent; p && i < 6; i++) {
    if (model.elements && !/item\/(generated|handheld)/.test(p) && !/block\/cube/.test(p)) break;
    if (/^(minecraft:)?(item\/(generated|handheld)|block\/cube(_all|_column|_bottom_top)?|block\/block)$/.test(p)) { model.vanillaParent = p.replace('minecraft:', ''); break; }
    const pj = await opts.loadParent?.(p).catch(() => null); if (!pj) break;
    model.textures = { ...(pj.textures || {}), ...model.textures };
    if (!model.elements && pj.elements) model.elements = pj.elements;
    p = pj.parent;
  }
  const resolveRef = r => { let x = r; for (let i = 0; i < 8 && typeof x === 'string' && x.startsWith('#'); i++) x = model.textures[x.slice(1)]; return typeof x === 'string' ? x : null; };
  const cache = new Map();
  const tex = async r => {
    const ref = resolveRef(r); if (!ref) return null;
    if (!cache.has(ref)) cache.set(ref, (async () => {
      const three = await loadTex(await opts.textureUrl?.(ref)); if (!three) return null;
      const img = three.image; const fh = img.height > img.width ? img.width : img.height;
      return { key: ref, three, uw: 16, uh: 16 * img.height / fh };
    })());
    return cache.get(ref);
  };
  let elements = model.elements;
  const vp = model.vanillaParent || '';
  if (!elements && /^block\/cube/.test(vp)) {
    const T = model.textures;
    const pickT = d => T[d] ? '#' + d : vp === 'block/cube_all' ? '#all' : (d === 'up' || d === 'down') ? (T.end ? '#end' : T.top && d === 'up' ? '#top' : T.bottom && d === 'down' ? '#bottom' : '#side') : (T.side ? '#side' : '#all');
    elements = [{ from: [0, 0, 0], to: [16, 16, 16], faces: Object.fromEntries(DIRS.map(d => [d, { texture: pickT(d) }])) }];
  }
  const mats = new Map(), parts = [], root = new THREE.Group();
  if (!elements && /item\/(generated|handheld)/.test(vp)) {
    // Ítem plano: cada píxel opaco es un cubito, como en el juego
    const t = await tex('#layer0');
    if (t) {
      const img = t.three.image, c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0); const W = img.width, H = Math.min(img.height, img.width);
      const d = g.getImageData(0, 0, W, H).data, op = (x, y) => x >= 0 && y >= 0 && x < W && y < H && d[(y * W + x) * 4 + 3] > 0;
      const sx = 16 / W, sy = 16 / H;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!op(x, y)) continue;
        const uvp = [x * sx, y * sy, (x + 1) * sx, (y + 1) * sy], faces = { south: { uv: uvp, tex: t }, north: { uv: [uvp[2], uvp[1], uvp[0], uvp[3]], tex: t } };
        if (!op(x - 1, y)) faces.west = { uv: uvp, tex: t }; if (!op(x + 1, y)) faces.east = { uv: uvp, tex: t };
        if (!op(x, y - 1)) faces.up = { uv: uvp, tex: t }; if (!op(x, y + 1)) faces.down = { uv: uvp, tex: t };
        root.add(boxMesh([x * sx, 16 - (y + 1) * sy, 7.5], [(x + 1) * sx, 16 - y * sy, 8.5], faces, game, mats));
      }
    }
    return { root, parts: [{ id: 'item', name: 'ítem plano', kind: 'cubo', depth: 0, obj: root }], front: '+z' };
  }
  for (const [i, e] of (elements || []).entries()) {
    const faces = {};
    for (const d of DIRS) { const f = e.faces?.[d]; if (!f) continue; faces[d] = { uv: f.uv || defaultUv(d, e.from, e.to), tex: await tex(f.texture), rotation: f.rotation }; }
    const mesh = boxMesh(e.from, e.to, faces, game, mats);
    const r = e.rotation; const rot = r ? [r.axis === 'x' ? r.angle : 0, r.axis === 'y' ? r.angle : 0, r.axis === 'z' ? r.angle : 0] : null;
    const o = pivotWrap(mesh, r?.origin || [8, 8, 8], rot);
    const name = e.name || `cubo ${i + 1}`;
    o.userData = { sel: true, name, kind: 'cubo', id: 'e' + i }; mesh.userData.pick = o;
    parts.push({ id: 'e' + i, name, kind: 'cubo', depth: 0, obj: o });
    root.add(o);
  }
  return { root, parts, front: '+z' };
}

// ---------- Visor ----------
export function open(el, opts) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  el.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 5000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(40, 80, 60); scene.add(sun);
  const grid = new THREE.GridHelper(64, 64, 0x666666, 0x3a3a3a); grid.material.transparent = true; grid.material.opacity = 0.5; scene.add(grid);
  const state = { game: true, wire: false, spin: false, model: null, parts: [], selected: null, helper: null };
  let alive = true;

  const resize = () => { const w = el.clientWidth || 300, h = el.clientHeight || 300; renderer.setSize(w, h, false); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%'; camera.aspect = w / h; camera.updateProjectionMatrix(); };
  const ro = new ResizeObserver(resize); ro.observe(el); resize();
  const loop = () => { if (!alive) return; controls.autoRotate = state.spin; controls.update(); if (state.helper) state.helper.update(); renderer.render(scene, camera); requestAnimationFrame(loop); };
  loop();

  const frame = (obj, front) => {
    const box = new THREE.Box3().setFromObject(obj); if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const r = Math.max(size.x, size.y, size.z) || 16, dist = r * 2.1;
    const dz = front === '-z' ? -1 : 1;
    camera.position.set(c.x + dist * 0.55, c.y + dist * 0.35, c.z + dz * dist);
    controls.target.copy(c); controls.update();
    grid.position.y = box.min.y; grid.scale.setScalar(Math.max(1, r / 32));
  };

  async function load() {
    const name = opts.name || '';
    const ext = (name.split('.').pop() || '').toLowerCase();
    let built;
    if (ext === 'glb' || ext === 'gltf') {
      const g = await new GLTFLoader().loadAsync(opts.url);
      built = { root: g.scene, parts: [], front: '+z' };
      g.scene.traverse(o => { if (o.isMesh) { built.parts.push({ id: o.uuid, name: o.name || 'malla', kind: 'malla', depth: 0, obj: o }); o.userData = { sel: true, name: o.name || 'malla', kind: 'malla', id: o.uuid }; } });
    } else if (ext === 'obj') {
      const txt = await (await fetch(opts.url)).text();
      const o = new OBJLoader().parse(txt);
      built = { root: o, parts: [], front: '+z' };
      o.traverse(m => { if (m.isMesh) { m.material = new THREE.MeshLambertMaterial({ color: 0xc8c8c8 }); built.parts.push({ id: m.uuid, name: m.name || 'malla', kind: 'malla', depth: 0, obj: m }); m.userData = { sel: true, name: m.name || 'malla', kind: 'malla', id: m.uuid }; } });
    } else {
      const r = await fetch(opts.url); if (!r.ok) throw new Error('No se pudo leer el archivo');
      const j = JSON.parse(await r.text());
      if (j.meta && (j.elements || j.outliner)) built = await buildBB(j, state.game);
      else if (j.elements || j.parent || j.textures) built = await buildMC(j, state.game, opts);
      else throw new Error('No reconozco este formato de modelo');
    }
    if (state.model) scene.remove(state.model);
    clearSel();
    state.model = built.root; state.parts = built.parts;
    scene.add(built.root);
    applyWire();
    return built;
  }
  const applyWire = () => state.model?.traverse(o => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.wireframe = state.wire; }); });
  const clearSel = () => { if (state.helper) { scene.remove(state.helper); state.helper.geometry?.dispose(); } state.helper = null; state.selected = null; };
  const select = id => {
    clearSel();
    const p = state.parts.find(x => x.id === id); if (!p?.obj) { opts.onSelect?.(null); return; }
    state.selected = p;
    state.helper = new THREE.BoxHelper(p.obj, 0xffb347); scene.add(state.helper);
    opts.onSelect?.(p);
  };
  // Clic en la vista: elige la pieza (sin confundirlo con girar la cámara)
  let down = null;
  renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4 || !state.model) return;
    const r = renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObject(state.model, true).find(h => h.object.visible);
    if (!hit) { clearSel(); opts.onSelect?.(null); return; }
    let o = hit.object.userData.pick || hit.object;
    while (o && !o.userData?.sel) o = o.parent;
    if (o) select(o.userData.id);
  });

  let first = true;
  const ready = load().then(b => { if (first) frame(b.root, b.front); first = false; return b; });
  return {
    ready,
    parts: () => state.parts,
    select,
    selected: () => state.selected,
    async reload() { const keep = { pos: camera.position.clone(), target: controls.target.clone() }; const sel = state.selected?.id; const b = await load(); camera.position.copy(keep.pos); controls.target.copy(keep.target); if (sel) select(sel); return b; },
    set(k, v) { state[k] = v; if (k === 'wire') applyWire(); if (k === 'grid') grid.visible = v; if (k === 'game') return this.reload(); },
    get: k => state[k],
    frame: () => state.model && frame(state.model, '+z'),
    snapshot: () => { const bg = scene.background; scene.background = new THREE.Color(0x2b2b30); renderer.render(scene, camera); const u = renderer.domElement.toDataURL('image/png'); scene.background = bg; renderer.render(scene, camera); return u; },
    dispose() { alive = false; ro.disconnect(); controls.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); },
  };
}

export const MODEL_RE = /\.(bbmodel|gltf|glb|obj)$|[\\/]models[\\/].+\.json$/i;
window.Studio = { open, MODEL_RE };
window.dispatchEvent(new Event('studio-ready'));
