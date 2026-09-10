import { createStoneScene } from '../assets/js/entry-stone-scene.js';
let scene, pending;
async function preview(seconds) {
  pending?.abort(); scene?.dispose(); scene = null;
  const controller = new AbortController(); pending = controller;
  try {
    const created = await createStoneScene(document.querySelector('.entrance-canvas'), { reduced: true, signal: controller.signal });
    if (pending !== controller) { created.dispose(); return; }
    scene = created;
    if (seconds > 0) scene.previewAt(seconds);
    document.getElementById('pose-label').textContent = seconds === 0 ? '原石' : seconds < 1 ? '石壳剥落' : '玉芯';
  } catch (error) { if (error.name !== 'AbortError') throw error; }
}
document.querySelectorAll('[data-pose]').forEach(button => button.addEventListener('click', () => preview(Number(button.dataset.pose))));
preview(0);
