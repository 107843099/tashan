import {createStoneScene} from '../assets/js/entry-stone-scene.js';
let scene;function preview(seconds){scene?.dispose();scene=createStoneScene(document.querySelector('.entrance-canvas'),{reduced:true});if(seconds>0)scene.previewAt(seconds);document.getElementById('pose-label').textContent=seconds===0?'原石':seconds<1?'石壳剥落':'玉芯';}
document.querySelectorAll('[data-pose]').forEach(button=>button.addEventListener('click',()=>preview(Number(button.dataset.pose))));preview(0);
