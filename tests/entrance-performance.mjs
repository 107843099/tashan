import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import * as Three from '../assets/vendor/three.module.js';

// Exercise real geometry/materials with a renderer boundary, without a GPU or
// a browser process competing with the measured page. Browser visual/performance
// verification remains separate from these lifetime and geometry regressions.
const source = (await readFile(new URL('../assets/js/entry-stone-scene.js', import.meta.url), 'utf8'))
  .replace("import * as THREE from '../vendor/three.module.js';", '').replace('export async function', 'async function');
function harness({ abortAtYield, failRender = false, holdCompile = false } = {}) {
  const control = new AbortController(), renderers = [], observers = [], canvases = [], raf = new Map(), targets = [], docEvents = new Map();
  let frameId = 0, yields = 0, now = 0, finishCompile;
  function canvas() {
    const events = new Map();
    const el = { width: 0, height: 0, removed: false, setAttribute() {}, addEventListener(type, fn) { events.set(type, fn); }, removeEventListener(type) { events.delete(type); }, remove() { this.removed = true; }, events,
      getContext() { return { scale() {}, createLinearGradient() { return { addColorStop() {} }; }, fillRect() {}, createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; }, putImageData(data) { el.pixels = data.data; } }; } };
    canvases.push(el); return el;
  }
  class Renderer {
    constructor() { this.domElement = canvas(); this.sizes = []; this.renders = 0; this.compileSets = []; renderers.push(this); }
    setPixelRatio() {} setClearColor() {} setSize(...size) { this.sizes.push(size); }
    compile(scene) { const materials = new Set(); scene.traverse(object => { if (object.material) materials.add(object.material); }); this.compileSets.push(materials); return materials; }
    compileAsync(scene) { const materials = this.compile(scene); if (!holdCompile) return Promise.resolve(scene);
      return new Promise(resolve => { finishCompile = () => { assert.equal(materials.size, 0, 'cancel clears the pending vendor poll before materials are disposed'); resolve(scene); }; }); }
    render(scene, camera) { if (failRender) throw new Error('synthetic render failure'); this.scene = scene; this.camera = camera; this.renders++; }
    dispose() { this.disposed = true; } forceContextLoss() { this.contextLost = true; }
  }
  class PMREM {
    constructor() { targets.push(this); } compileEquirectangularShader() {}
    fromEquirectangular(texture) { this.source = texture; const result = { texture: new Three.Texture(), dispose() { this.disposed = true; } }; targets.push(result); return result; }
    dispose() { this.disposed = true; }
  }
  const document = { hidden: false, createElement: canvas, addEventListener(type, listener) { docEvents.set(type, listener); }, removeEventListener(type) { docEvents.delete(type); } };
  const container = { rect: { width: 1200, height: 800 }, children: [], append(el) { this.children.push(el); }, getBoundingClientRect() { return this.rect; } };
  const context = vm.createContext({ THREE: { ...Three, WebGLRenderer: Renderer, PMREMGenerator: PMREM }, document, window: { devicePixelRatio: 2 }, AbortController, DOMException, performance: { now: () => now },
    setTimeout, clearTimeout, scheduler: { async yield() { yields++; if (abortAtYield === yields) control.abort(); await new Promise(resolve => setImmediate(resolve)); } },
    requestAnimationFrame(callback) { raf.set(++frameId, callback); return frameId; }, cancelAnimationFrame(id) { raf.delete(id); },
    ResizeObserver: class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } } });
  vm.runInContext(`${source}\n globalThis.create = createStoneScene;`, context);
  return { control, renderers, targets, canvases, observers, container, document, docEvents, raf,
    get yields() { return yields; }, get finishCompile() { return finishCompile; },
    start(options = {}) { return context.create(container, { ...options, signal: control.signal }); },
    tick(ms) { now = ms; const pending = [...raf.values()]; raf.clear(); pending.forEach(fn => fn(ms)); },
    visibility(hidden) { document.hidden = hidden; docEvents.get('visibilitychange')?.(); } };
}
function meshes(h) { const all = []; h.renderers[0].scene.traverse(o => { if (o.isMesh) all.push(o); }); return all; }
function clean(h) {
  assert.equal(h.raf.size, 0);
  for (const r of h.renderers) { assert.equal(r.disposed, true); assert.equal(r.contextLost, true); assert.equal(r.domElement.removed, true); assert.equal(r.domElement.events.size, 0); }
  for (const o of h.observers) assert.equal(o.disconnected, true);
  for (const t of h.targets) assert.equal(t.disposed, true);
  assert.equal(h.docEvents.size, 0);
}

test('real shard geometry is closed with only fracture-edge walls; mineral pixels and circular jade are preserved', async () => {
  const h = harness(), scene = await h.start({ reduced: true });
  const objects = meshes(h), shards = objects.filter(m => m.material.vertexColors);
  assert.equal(shards.length, 18);
  let triangles = 0;
  for (const shard of shards) {
    const geometry = shard.geometry, positions = geometry.attributes.position, edges = new Map();
    triangles += positions.count / 3;
    const key = i => `${positions.getX(i).toFixed(4)},${positions.getY(i).toFixed(4)},${positions.getZ(i).toFixed(4)}`;
    for (let i = 0; i < positions.count; i += 3) {
      for (let e = 0; e < 3; e++) {
        const a = key(i + e), b = key(i + (e + 1) % 3), id = a < b ? `${a}|${b}` : `${b}|${a}`;
        edges.set(id, (edges.get(id) || 0) + 1);
      }
    }
    assert.ok([...edges.values()].every(count => count === 2), 'each shard must remain watertight after removing internal walls');
    assert.equal(geometry.attributes.uv.count, positions.count);
    assert.equal(geometry.attributes.normal.count, positions.count);
    assert.ok([...geometry.attributes.normal.array].every(Number.isFinite));
  }
  assert.ok(triangles < 9000, `expected substantially fewer than the old 23,040 triangles; got ${triangles}`);
  const jade = objects.find(m => m.material.isMeshPhysicalMaterial);
  jade.geometry.computeBoundingBox(); const size = jade.geometry.boundingBox.getSize(new Three.Vector3());
  assert.ok(Math.abs(size.x - size.y) < 1e-6); assert.equal(jade.material.transmission, 0);
  const mineral = h.canvases.find(c => c.pixels), expected = new Uint8ClampedArray(512 * 512 * 4);
  let seed = 72;
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    seed = seed * 16807 % 2147483647; const fine = (seed - 1) / 2147483646 * 38;
    const v = 109 + 18 * Math.sin(x * .031 + Math.sin(y * .034) * 2) + 12 * Math.cos(y * .049 - x * .013) + 7 * Math.sin(x * .16 + y * .09) + fine, i = (y * 512 + x) * 4;
    expected[i] = v + 7; expected[i + 1] = v + 6; expected[i + 2] = v; expected[i + 3] = 255;
  }
  assert.deepEqual(mineral.pixels, expected);
  scene.previewAt(1.3); jade.updateWorldMatrix(true, false);
  const facing = jade.getWorldQuaternion(new Three.Quaternion());
  assert.ok(facing.angleTo(h.renderers[0].camera.quaternion) < 1e-7, 'revealed jade faces the camera');
  assert.ok(shards.every(s => !s.visible), 'fully faded shards stop drawing');
  scene.previewAt(.5); assert.ok(shards.every(s => s.visible), 'jumping back to a diagnostic pose restores shard visibility');
  assert.equal(h.raf.size, 0); assert.ok(h.yields >= 6);
  scene.dispose(); scene.dispose(); clean(h);
});

test('idle renders at 30fps, carving resumes full cadence, hidden scenes stop, unchanged resize does not draw', async () => {
  const h = harness(), scene = await h.start(), renderer = h.renderers[0];
  assert.equal(renderer.renders, 1);
  for (let i = 1; i <= 6; i++) h.tick(i * 1000 / 60);
  assert.equal(renderer.renders, 4);
  h.observers[0].callback(); assert.equal(renderer.renders, 4); assert.equal(renderer.sizes.length, 1);
  h.container.rect = { width: 375, height: 667 }; h.observers[0].callback();
  assert.equal(renderer.camera.aspect, 375 / 667); assert.equal(renderer.sizes.length, 2);
  h.container.rect = { width: 0, height: 0 }; h.observers[0].callback(); assert.equal(renderer.sizes.length, 2);
  scene.carve(); const before = renderer.renders;
  h.tick(120); h.tick(136); assert.equal(renderer.renders, before + 2);
  h.visibility(true); assert.equal(h.raf.size, 0); h.tick(250); assert.equal(renderer.renders, before + 2);
  scene.setPaused(false); assert.equal(h.raf.size, 0);
  h.visibility(false); assert.equal(h.raf.size, 1);
  scene.dispose(); clean(h);
});

test('already-aborted and each initialisation stage release every allocated resource', async () => {
  const early = harness(); early.control.abort(); await assert.rejects(early.start(), { name: 'AbortError' }); assert.equal(early.renderers.length, 0); clean(early);
  for (let stage = 1; stage <= 7; stage++) {
    const h = harness({ abortAtYield: stage });
    await assert.rejects(h.start(), { name: 'AbortError' }); clean(h);
  }
});

test('abort while Three polls shader readiness clears its material set and releases the context promptly', async () => {
  const h = harness({ holdCompile: true }), pending = h.start();
  while (!h.finishCompile) await new Promise(resolve => setImmediate(resolve));
  h.control.abort(); await assert.rejects(pending, { name: 'AbortError' }); clean(h);
  h.finishCompile(); await new Promise(resolve => setImmediate(resolve));
});

test('render failure, later abort and context loss all clean up without leaving callbacks or canvases', async () => {
  const fail = harness({ failRender: true }); await assert.rejects(fail.start(), /synthetic render failure/); clean(fail);
  const h = harness(); await h.start(); h.control.abort(); clean(h);
  const lost = harness(); let notified = 0; await lost.start({ onLost() { notified++; } });
  lost.renderers[0].domElement.events.get('webglcontextlost')({ preventDefault() {} });
  assert.equal(notified, 1); clean(lost);
});
