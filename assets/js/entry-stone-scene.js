import * as THREE from '../vendor/three.module.js';

// Both objects are procedural and local. Build in short, cancellable stages so
// logging in or typing does not have to wait for the entire scene to initialise.
export async function createStoneScene(container, { reduced = false, authLayout = false, onLost = () => {}, signal } = {}) {
  const resources = new Set(), compiling = new Set(), lifetime = new AbortController();
  let renderer, pmrem, observer, refreshVisibility, frame = 0, disposed = false, ready = false;
  const keep = item => { resources.add(item); return item; };
  const abortError = () => new DOMException('Stone scene was cancelled.', 'AbortError');
  const check = () => { if (disposed || signal?.aborted) throw abortError(); };
  const stop = () => { if (frame) cancelAnimationFrame(frame); frame = 0; };
  function dispose() {
    if (disposed) return;
    disposed = true;
    stop();
    // The bundled Three compileAsync polls its material Set. Empty it before
    // disposing programs, otherwise a pending poll can read a deleted program.
    compiling.forEach(materials => materials.clear());
    compiling.clear();
    lifetime.abort();
    signal?.removeEventListener('abort', dispose);
    observer?.disconnect();
    document.removeEventListener('visibilitychange', visibilityChanged);
    renderer?.domElement.removeEventListener('webglcontextlost', contextLost);
    pmrem?.dispose();
    pmrem = null;
    resources.forEach(item => item.dispose());
    resources.clear();
    renderer?.dispose();
    renderer?.forceContextLoss();
    renderer?.domElement.remove();
  }
  function waitFor(promise) {
    check();
    return new Promise((resolve, reject) => {
      const abort = () => reject(abortError());
      lifetime.signal.addEventListener('abort', abort, { once: true });
      Promise.resolve(promise).then(resolve, reject).finally(() => lifetime.signal.removeEventListener('abort', abort));
    });
  }
  async function yieldMain() {
    check();
    await waitFor(globalThis.scheduler?.yield ? globalThis.scheduler.yield() : new Promise(resolve => setTimeout(resolve, 0)));
    check();
  }
  async function compileScene(object, camera, targetScene) {
    check();
    if (!renderer.compileAsync) { renderer.compile(object, camera, targetScene); await yieldMain(); return; }
    const originalCompile = renderer.compile;
    let materials;
    renderer.compile = function (...args) {
      materials = originalCompile.apply(this, args);
      compiling.add(materials);
      return materials;
    };
    let promise;
    try { promise = renderer.compileAsync(object, camera, targetScene); }
    finally { renderer.compile = originalCompile; }
    try { await waitFor(promise); check(); }
    finally { compiling.delete(materials); }
  }
  function contextLost(event) { event.preventDefault(); dispose(); onLost(); }
  function visibilityChanged() {
    if (!ready || disposed) return;
    refreshVisibility?.();
  }
  signal?.addEventListener('abort', dispose, { once: true });
  try {
    check();
    await yieldMain();
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.setClearColor(0x07150f, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    container.append(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(37, 1, .1, 70), assembly = new THREE.Group();
    camera.position.set(0, 0, 8.7);
    scene.add(assembly);
    let seed = 72;
    const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

    // Same light-strip composition at half resolution: a quarter of the PMREM
    // pixels is sufficient for this small, rough stone and its soft jade polish.
    const envCanvas = document.createElement('canvas');
    envCanvas.width = 512; envCanvas.height = 256;
    const ec = envCanvas.getContext('2d');
    ec.scale(.5, .5);
    const eg = ec.createLinearGradient(0, 0, 0, 512);
    eg.addColorStop(0, '#233c30'); eg.addColorStop(.38, '#849681'); eg.addColorStop(.52, '#102019'); eg.addColorStop(1, '#06110c');
    ec.fillStyle = eg; ec.fillRect(0, 0, 1024, 512);
    const strip = ec.createLinearGradient(40, 0, 230, 0);
    strip.addColorStop(0, '#39463a'); strip.addColorStop(.45, '#e9e4c5'); strip.addColorStop(.62, '#ffffff'); strip.addColorStop(1, '#293f30');
    ec.fillStyle = strip; ec.fillRect(40, 30, 190, 270); ec.fillStyle = '#72967e'; ec.fillRect(650, 100, 70, 250);
    const et = keep(new THREE.CanvasTexture(envCanvas));
    et.mapping = THREE.EquirectangularReflectionMapping; et.colorSpace = THREE.SRGBColorSpace;
    pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    await yieldMain();

    scene.add(new THREE.HemisphereLight(0xc9d9be, 0x091f16, 1.5));
    const key = new THREE.DirectionalLight(0xffebc7, 4.6); key.position.set(-3, 5, 5); scene.add(key);
    const rim = new THREE.DirectionalLight(0x9de7ba, 3.7); rim.position.set(3, 2, -2); scene.add(rim);
    const fill = new THREE.PointLight(0xafd8cb, 20, 20, 2); fill.position.set(0, 1, 4); scene.add(fill);
    const coreLight = new THREE.PointLight(0x90fac0, 0, 10, 2); assembly.add(coreLight);

    // Keep every original mineral pixel and PRNG call. The row-dependent sine
    // is constant across 512 pixels; bounded batches leave room for input.
    const noiseCanvas = document.createElement('canvas'); noiseCanvas.width = noiseCanvas.height = 512;
    const nc = noiseCanvas.getContext('2d'), pixels = nc.createImageData(512, 512);
    let budgetStart = performance.now();
    for (let y = 0; y < 512; y++) {
      const rowSin = Math.sin(y * .034) * 2;
      for (let x = 0; x < 512; x++) {
        const fine = random() * 38;
        const mottling = 18 * Math.sin(x * .031 + rowSin) + 12 * Math.cos(y * .049 - x * .013) + 7 * Math.sin(x * .16 + y * .09);
        const v = 109 + mottling + fine, idx = (y * 512 + x) * 4;
        pixels.data[idx] = v + 7; pixels.data[idx + 1] = v + 6; pixels.data[idx + 2] = v; pixels.data[idx + 3] = 255;
      }
      if (y % 8 === 7 && performance.now() - budgetStart >= 6) { await yieldMain(); budgetStart = performance.now(); }
    }
    nc.putImageData(pixels, 0, 0);
    for (let i = 0; i < 1600; i++) {
      const x = random() * 512, y = random() * 512;
      nc.fillStyle = i % 3 ? '#c2c0a634' : '#17241d48'; nc.fillRect(x, y, random() * 3 + .4, random() * 2 + .4);
    }
    const mineral = keep(new THREE.CanvasTexture(noiseCanvas));
    mineral.wrapS = mineral.wrapT = THREE.RepeatWrapping; mineral.colorSpace = THREE.SRGBColorSpace;
    const shellMaterial = keep(new THREE.MeshStandardMaterial({ color: 0x74766a, map: mineral, bumpMap: mineral, bumpScale: .12, roughness: .97, metalness: .05, vertexColors: true, transparent: true, envMapIntensity: .42 }));
    await yieldMain();

    const base = keep(new THREE.IcosahedronGeometry(1.45, 11)), positions = base.attributes.position;
    const warped = [], vertices = new Map();
    budgetStart = performance.now();
    for (let i = 0; i < positions.count; i++) {
      const outer = new THREE.Vector3().fromBufferAttribute(positions, i), n = outer.clone().normalize();
      const rough = 1 + .09 * Math.sin(n.x * 4 + n.y * 5) + .075 * Math.cos(n.z * 6 - n.y * 3) + .034 * Math.sin(n.y * 15 + n.x * 11);
      outer.multiplyScalar(rough); outer.x *= .91; outer.y *= 1.11; outer.z *= .85;
      const id = `${outer.x.toFixed(4)},${outer.y.toFixed(4)},${outer.z.toFixed(4)}`;
      let vertex = vertices.get(id);
      if (!vertex) {
        n.copy(outer).normalize();
        vertex = { id: vertices.size, outer, inner: outer.clone().multiplyScalar(.77), u: .5 + Math.atan2(n.z, n.x) / (Math.PI * 2), v: .5 + Math.asin(n.y) / Math.PI, normal: new THREE.Vector3() };
        vertices.set(id, vertex);
      }
      warped.push(vertex);
      if (i % 192 === 191 && performance.now() - budgetStart >= 6) { await yieldMain(); budgetStart = performance.now(); }
    }
    // Smooth only the original outer surface. UVs, keys and inner vertices are
    // shared; radial extrusion leaves spherical UV coordinates unchanged.
    const face = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3();
    for (let i = 0; i < warped.length; i += 3) {
      const a = warped[i], b = warped[i + 1], c = warped[i + 2];
      face.crossVectors(ab.subVectors(b.outer, a.outer), ac.subVectors(c.outer, a.outer)).normalize();
      a.normal.add(face); b.normal.add(face); c.normal.add(face);
      if (i % 288 === 0 && performance.now() - budgetStart >= 6) { await yieldMain(); budgetStart = performance.now(); }
    }
    vertices.forEach(v => v.normal.normalize());
    const partitions = Array.from({ length: 18 }, (_, i) => {
      const y = 1 - (i + .5) / 18 * 2, angle = i * 2.399963;
      return { axis: new THREE.Vector3(Math.cos(angle) * Math.sqrt(1 - y * y), y, Math.sin(angle) * Math.sqrt(1 - y * y)), pos: [], uv: [], colors: [], normals: [], center: new THREE.Vector3(), count: 0 };
    });
    const addTriangle = (part, a, b, c, color, inner = false, smooth = false, mixed = null) => {
      const va = mixed?.[0] || (inner ? a.inner : a.outer), vb = mixed?.[1] || (inner ? b.inner : b.outer), vc = mixed?.[2] || (inner ? c.inner : c.outer);
      if (!smooth) face.crossVectors(ab.subVectors(vb, va), ac.subVectors(vc, va)).normalize();
      const triangle = [a, b, c], coords = [va, vb, vc];
      for (let i = 0; i < 3; i++) {
        const vertex = triangle[i], v = coords[i], normal = smooth ? vertex.normal : face;
        part.pos.push(v.x, v.y, v.z); part.uv.push(vertex.u, vertex.v);
        part.colors.push(color, color * .99, color * .94); part.normals.push(normal.x, normal.y, normal.z);
      }
    };
    const edges = new Map(), center = new THREE.Vector3(), radial = new THREE.Vector3();
    for (let i = 0; i < warped.length; i += 3) {
      const tri = [warped[i], warped[i + 1], warped[i + 2]];
      center.copy(tri[0].outer).add(tri[1].outer).add(tri[2].outer).multiplyScalar(1 / 3); radial.copy(center).normalize();
      let best = 0, dot = -9;
      for (let j = 0; j < partitions.length; j++) { const d = partitions[j].axis.dot(radial); if (d > dot) { dot = d; best = j; } }
      const part = partitions[best]; part.center.add(center); part.count++;
      addTriangle(part, ...tri, .84 + random() * .25, false, true);
      addTriangle(part, tri[2], tri[1], tri[0], .42, true);
      for (let e = 0; e < 3; e++) {
        const a = tri[e], b = tri[(e + 1) % 3], id = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
        const edge = edges.get(id);
        if (!edge) edges.set(id, { part: best, a, b, other: null });
        else if (edge.part !== best) edge.other = { part: best, a, b };
      }
      if (i % 144 === 0 && performance.now() - budgetStart >= 6) { await yieldMain(); budgetStart = performance.now(); }
    }
    const fracturePositions = [];
    const addWall = ({ part, a, b }) => {
      addTriangle(partitions[part], a, a, b, .63, false, false, [a.outer, a.inner, b.inner]);
      addTriangle(partitions[part], a, b, b, .63, false, false, [a.outer, b.inner, b.outer]);
    };
    // Thickness belongs to real shard boundaries, not all 8,640 triangle edges.
    // Add a wall for each of the two opposing shards, preserving closed shells.
    let edgeIndex = 0;
    for (const edge of edges.values()) {
      if (edge.other) {
        addWall(edge); addWall(edge.other);
        for (const { outer: v } of [edge.a, edge.b]) fracturePositions.push(v.x * 1.005, v.y * 1.005, v.z * 1.005);
      }
      if (++edgeIndex % 192 === 0 && performance.now() - budgetStart >= 6) { await yieldMain(); budgetStart = performance.now(); }
    }
    const shards = [];
    for (let index = 0; index < partitions.length; index++) {
      const p = partitions[index]; if (!p.count) continue;
      const geometry = keep(new THREE.BufferGeometry());
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(p.uv, 2));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(p.colors, 3)); geometry.setAttribute('normal', new THREE.Float32BufferAttribute(p.normals, 3));
      const mesh = new THREE.Mesh(geometry, shellMaterial); assembly.add(mesh);
      shards.push({ mesh, direction: p.center.multiplyScalar(1 / p.count).normalize(), spin: new THREE.Vector3(random() - .5, random() - .5, random() - .5), delay: index * .008 });
      if (performance.now() - budgetStart >= 6) { await yieldMain(); budgetStart = performance.now(); }
    }
    base.dispose(); resources.delete(base);
    const fractureGeometry = keep(new THREE.BufferGeometry()); fractureGeometry.setAttribute('position', new THREE.Float32BufferAttribute(fracturePositions, 3));
    const fractureMaterial = keep(new THREE.LineBasicMaterial({ color: 0xbde1a9, transparent: true, opacity: .13, depthWrite: false }));
    const fractures = new THREE.LineSegments(fractureGeometry, fractureMaterial); assembly.add(fractures);
    await yieldMain();

    // Uniform X/Y dimensions and camera-facing reveal keep the jade bi circular.
    const jadeGeo = keep(new THREE.TorusGeometry(.70, .34, 32, 96)); jadeGeo.scale(1, 1, .48);
    // CSS supplies the background; there is no opaque scene behind the jade for
    // transmission to sample. Retain its polish without a full-screen extra pass.
    const jadeMaterial = keep(new THREE.MeshPhysicalMaterial({ color: 0x337652, roughness: .21, metalness: .04, clearcoat: 1, clearcoatRoughness: .17, ior: 1.46, emissive: 0x0b3a20, emissiveIntensity: .13, envMapIntensity: .8 }));
  jadeMaterial.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 jadePosition;').replace('#include <begin_vertex>','#include <begin_vertex>\njadePosition = position;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
    varying vec3 jadePosition;
    float jhash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
    float jnoise(vec3 p){vec3 i=floor(p);vec3 f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(jhash(i),jhash(i+vec3(1,0,0)),f.x),mix(jhash(i+vec3(0,1,0)),jhash(i+vec3(1,1,0)),f.x),f.y),mix(mix(jhash(i+vec3(0,0,1)),jhash(i+vec3(1,0,1)),f.x),mix(jhash(i+vec3(0,1,1)),jhash(i+vec3(1,1,1)),f.x),f.y),f.z);}
    float jcloud(vec3 p){return .5*jnoise(p)+.25*jnoise(p*2.1)+.125*jnoise(p*4.3)+.0625*jnoise(p*8.7);}
  `).replace('#include <color_fragment>',`#include <color_fragment>
    float cloud=jcloud(jadePosition*5.0);
    float vein=pow(abs(sin(jadePosition.y*7.0+jadePosition.x*3.0+cloud*12.0)),35.0);
    diffuseColor.rgb *= .67+cloud*.64;
    diffuseColor.rgb += vec3(.055,.08,.033)*vein*.24;`);};
    const jade = new THREE.Mesh(jadeGeo, jadeMaterial), jadeFacing = new THREE.Quaternion(); assembly.add(jade); jade.visible = false;
    const chisel = new THREE.Group(), metal = keep(new THREE.MeshStandardMaterial({ color: 0xbfb89b, metalness: .86, roughness: .27 }));
    const shaft = new THREE.Mesh(keep(new THREE.CylinderGeometry(.035, .055, 1, 5)), metal); chisel.add(shaft);
    const tip = new THREE.Mesh(keep(new THREE.ConeGeometry(.058, .2, 4)), metal); tip.rotation.z = Math.PI; tip.position.y = -.59; chisel.add(tip);
    chisel.rotation.z = -.52; chisel.visible = false; assembly.add(chisel);
    const grainGeo = keep(new THREE.BufferGeometry()), dustCount = 70, dustPosition = new Float32Array(dustCount * 3), dustVelocity = [];
    for (let i = 0; i < dustCount; i++) dustVelocity.push(new THREE.Vector3((random() - .5) * 5, random() * 3 + .7, (random() - .1) * 2));
    grainGeo.setAttribute('position', new THREE.BufferAttribute(dustPosition, 3));
    const grainMat = keep(new THREE.PointsMaterial({ color: 0xd4dbb6, size: .021, transparent: true, opacity: 0, depthWrite: false }));
    const dust = new THREE.Points(grainGeo, grainMat); dust.visible = false; assembly.add(dust);
    const sparkGeo = keep(new THREE.BufferGeometry()), sparkPos = new Float32Array(12 * 6);
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
    const sparkMat = keep(new THREE.LineBasicMaterial({ color: 0xe3efbd, transparent: true, opacity: 0, depthWrite: false }));
    const sparks = new THREE.LineSegments(sparkGeo, sparkMat); sparks.visible = false; assembly.add(sparks);
    await yieldMain();

    const environment = keep(pmrem.fromEquirectangular(et)); scene.environment = environment.texture;
    pmrem.dispose(); pmrem = null;
    await yieldMain();
    // Lights and environment are final here. Hidden reveal materials are also
    // compiled, so the first strike does not incur a second compilation hitch.
    await compileScene(scene, camera);
    await yieldMain();

    let width = 0, height = 0, paused = reduced, motionTime = 0, last = performance.now(), lastRender = -Infinity;
    let carveStart = null, frozenTime = null, px = 0, py = 0, aimX = 0, aimY = 0, baseX = 0, baseY = 0, baseScale = 1, entryScale = 1;
    const clamp = n => Math.max(0, Math.min(1, n)), ease = n => 1 - Math.pow(1 - clamp(n), 3);
    function draw(now) {
      if (disposed) return;
      const dt = Math.max(0, Math.min((now - last) / 1000, .05)); last = now; lastRender = now;
      if (!paused && !document.hidden) motionTime += dt;
      const elapsed = frozenTime ?? (carveStart === null ? 0 : (now - carveStart) / 1000);
      const smoothing = 1 - Math.pow(.94, dt * 60);
      px += (aimX - px) * smoothing; py += (aimY - py) * smoothing;
      const opened = carveStart !== null, reveal = ease((elapsed - .24) / .78);
      assembly.position.set(baseX * (1 - ease((elapsed - .18) / 1)), baseY * (1 - ease((elapsed - .18) / 1)) + (reduced ? 0 : Math.sin(motionTime * .65) * .055), 0);
      assembly.rotation.set(-.04 + py * .065, -.4 + (reduced ? 0 : Math.sin(motionTime * .26) * .15) + px * .12, .06);
      assembly.scale.setScalar(opened ? baseScale + (entryScale - baseScale) * reveal : baseScale);
      if (opened) {
        assembly.rotation.y += reveal * .25;
        jade.visible = true;
        jadeFacing.copy(assembly.quaternion).invert().multiply(camera.quaternion);
        jade.quaternion.identity().slerp(jadeFacing, reveal);
        jade.scale.setScalar(.82 + .18 * reveal);
        shellMaterial.opacity = 1 - ease((elapsed - .7) / .43);
        for (const { mesh, direction, spin, delay } of shards) {
          mesh.visible = shellMaterial.opacity > 0;
          if (!mesh.visible) continue;
          const amount = ease((elapsed - .22 - delay) / .94);
          mesh.position.copy(direction).multiplyScalar(amount * 3.1); mesh.position.y -= amount * amount * .8;
          mesh.rotation.set(spin.x * amount, spin.y * amount, spin.z * amount);
        }
        const r = ease((elapsed - .25) / .7);
        fractureMaterial.opacity = Math.max(0, (1 - r) * Math.min(1, elapsed * 11)); fractures.visible = elapsed < .45;
        coreLight.intensity = Math.sin(Math.min(1, elapsed / .95) * Math.PI) * 16;
        jadeMaterial.emissiveIntensity = .13 + .08 * reveal;
        chisel.visible = elapsed < .35;
        const strike = ease(elapsed / .17); chisel.position.set(.5 - .32 * strike, 2 - 1.45 * strike, 1.1);
        const impact = elapsed - .17;
        dust.visible = impact > 0 && impact < .88;
        sparks.visible = impact > 0 && impact < .40;
        if (dust.visible) {
          grainMat.opacity = 1 - impact / .88;
          for (let i = 0; i < dustCount; i++) {
            const v = dustVelocity[i]; dustPosition[i * 3] = v.x * impact;
            dustPosition[i * 3 + 1] = v.y * impact - impact * impact * 3.7; dustPosition[i * 3 + 2] = 1.3 + v.z * impact;
          }
          grainGeo.attributes.position.needsUpdate = true;
        }
        if (sparks.visible) {
          const sp = clamp(impact / .40); sparkMat.opacity = 1 - sp;
          for (let i = 0; i < 12; i++) {
            const angle = i / 12 * Math.PI * 2, len = .08 + sp * .65, tail = Math.max(0, len - .11 * (1 - sp));
            sparkPos.set([Math.cos(angle) * tail, Math.sin(angle) * tail, 1.5, Math.cos(angle) * len, Math.sin(angle) * len, 1.5], i * 6);
          }
          sparkGeo.attributes.position.needsUpdate = true;
        }
        if (elapsed < .31 && elapsed > .16) assembly.position.x += Math.sin(elapsed * 250) * .022 * (1 - (elapsed - .16) / .15);
      }
      renderer.render(scene, camera);
    }
    function canPlay() { return !disposed && !document.hidden && frozenTime === null && (!paused || carveStart !== null); }
    function renderFrame(now) {
      frame = 0;
      if (!canPlay()) return;
      // Idle movement is deliberately slow. Keep the strike at display cadence.
      if (carveStart !== null || now - lastRender >= 1000 / 30 - .5) draw(now);
      play();
    }
    function play() { if (!frame && ready && canPlay()) frame = requestAnimationFrame(renderFrame); }
    function resize() {
      if (disposed) return;
      const rect = container.getBoundingClientRect(), nextWidth = Math.round(rect.width), nextHeight = Math.round(rect.height);
      if (!(nextWidth > 0 && nextHeight > 0) || (width === nextWidth && height === nextHeight)) return;
      width = nextWidth; height = nextHeight;
      renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
      const visibleHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z, visibleWidth = visibleHeight * camera.aspect, mobile = width < 768;
      baseX = mobile ? (authLayout ? visibleWidth * .32 : 0) : visibleWidth * .19;
      baseY = mobile ? (authLayout ? visibleHeight * (.5 - 175 / height) : -visibleHeight * (height < 700 ? .12 : .10)) : -visibleHeight * .015;
      entryScale = mobile ? Math.min(.61, height / 950) : Math.min(.94, width / 1200);
      baseScale = mobile && authLayout ? Math.min(.35, 280 / height) : entryScale;
      if (!document.hidden) draw(performance.now());
    }
    function pointer(x, y) { aimX = x; aimY = y; }
    function setPaused(value) {
      paused = Boolean(value); last = performance.now();
      if (!paused) play(); else if (carveStart === null || document.hidden) stop();
    }
    function carve() {
      if (disposed || carveStart !== null) return;
      carveStart = performance.now(); paused = false; lastRender = -Infinity; play();
    }
    refreshVisibility = () => {
      last = performance.now();
      if (document.hidden) stop();
      else { draw(last); play(); }
    };
    check(); ready = true;
    observer = new ResizeObserver(resize); observer.observe(container);
    document.addEventListener('visibilitychange', visibilityChanged);
    resize(); play();
    return {
      pointer, setPaused, carve,
      previewAt(seconds) { if (disposed) return; stop(); paused = true; frozenTime = Math.max(0, seconds); carveStart = performance.now(); draw(performance.now()); },
      dispose
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
