import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import candleURL from './assets/candle-v2.png';
import {projectPoint,onScreen,rayEnd,clampDistance,apertureEffect,imageFileError,SCREEN_SIZE,OBJECT_SIZE} from './optics.mjs';

const $=id=>document.getElementById(id);
const state={u:30,v:24,aperture:1,object:'letter',point:0,trace:'all',view:'apparatus',flat:false};
const colors=['#cf582f','#147fa8','#8058bf'];
const points={letter:[{x:77,y:51},{x:185,y:55},{x:77,y:201}],candle:[{x:128,y:17},{x:118,y:84},{x:133,y:223}]};
const toPoint=p=>({x:(p.x/256-.5)*OBJECT_SIZE,y:(.5-p.y/256)*OBJECT_SIZE});
const artwork=document.createElement('canvas');artwork.width=artwork.height=256;
const screenArt=document.createElement('canvas');screenArt.width=screenArt.height=512;
const candle=new Image();
const imageLayer=document.createElement('canvas');imageLayer.width=imageLayer.height=512;
let uploadedArt=null,uploadSequence=0,customText='光',plate,rim,shownAperture=0;
const names={letter:'不对称的 F',candle:'熟悉的蜡烛',text:'我的文字',plane:'飞机图标',pawn:'棋子剪影',upload:'我的图片'};
// Symmetric uniform-area samples approximate a circular aperture, without a blur dependency.
const apertureSamples=[{x:0,y:0}];
for(let i=0;i<24;i++){const r=Math.sqrt((i+.5)/24),a=i*2.399963;apertureSamples.push({x:r*Math.cos(a),y:r*Math.sin(a)},{x:-r*Math.cos(a),y:-r*Math.sin(a)});}
let objectBounds={left:64,right:196,top:40,bottom:220}, renderer,scene,camera,controls,world,objectGroup,screenGroup,boxGroup,rayGroup,pointGroup;
let objectTexture,screenTexture,sourceMaterial,screenMaterial,queued=false,webgl=false,drag=null;
const labels=[];
const origin=new THREE.Vector3(0,11,0), pointer=new THREE.Vector2(), picker=new THREE.Raycaster();
const draggables=[], pointTargets=[];
function activePoints(){return state.trace==='one'?[state.point]:state.trace==='two'?[state.point,(state.point+1)%3]:[0,1,2];}
function paintArtwork(){
  const c=artwork.getContext('2d');c.clearRect(0,0,256,256);
  if(state.object==='letter'){
    c.fillStyle='#efac48';c.fillRect(64,40,29,180);c.fillRect(64,40,132,30);c.fillRect(64,112,99,29);
    objectBounds={left:64,right:196,top:40,bottom:220};
  }else if(state.object==='candle'&&candle.complete&&candle.naturalWidth){
    c.drawImage(candle,88,8,80,240);
  }else if(state.object==='upload'&&uploadedArt){c.drawImage(uploadedArt,0,0);
  }else if(['text','plane','pawn'].includes(state.object)){
    const value=state.object==='text'?customText:state.object==='plane'?'✈':'♟';
    c.fillStyle=state.object==='pawn'?'#287f97':'#df932e';c.textAlign='center';c.textBaseline='middle';
    c.font='bold 180px "Segoe UI Symbol","Microsoft YaHei",sans-serif';
    const size=Math.min(180,180*220/Math.max(1,c.measureText(value).width));
    c.font=`bold ${size}px "Segoe UI Symbol","Microsoft YaHei",sans-serif`;c.fillText(value,128,137);
  }
  const pixels=c.getImageData(0,0,256,256).data,b={left:256,right:0,top:256,bottom:0};
  const targets=[{x:75,y:48},{x:190,y:93},{x:98,y:206}],best=targets.map(p=>({...p,d:Infinity}));
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    const k=(y*256+x)*4;if(pixels[k+3]<=32)continue;
    b.left=Math.min(b.left,x);b.right=Math.max(b.right,x);b.top=Math.min(b.top,y);b.bottom=Math.max(b.bottom,y);
    if(pixels[k]+pixels[k+1]+pixels[k+2]>40)targets.forEach((t,i)=>{const d=(x-t.x)**2+(y-t.y)**2;if(d<best[i].d)best[i]={x,y,d};});
  }
  if(b.right>=b.left)objectBounds=b;
  if(!['letter','candle'].includes(state.object))points[state.object]=best.map(({x,y})=>({x,y}));
  if(objectTexture)objectTexture.needsUpdate=true;
}
function dot(c,x,y,r,color,text=''){
  c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fillStyle=color;c.fill();c.strokeStyle='white';c.lineWidth=2;c.stroke();
  if(text){c.font='bold 19px sans-serif';c.fillStyle=color;c.strokeStyle='white';c.lineWidth=4;c.strokeText(text,x+10,y-10);c.fillText(text,x+10,y-10);}
}
function paintImages(){
  const src=$('sourcePreview').getContext('2d');src.fillStyle='#f0f6f8';src.fillRect(0,0,256,256);src.drawImage(artwork,0,0);
  points[state.object].forEach((p,i)=>dot(src,p.x,p.y,i===state.point?7:5,colors[i],String.fromCharCode(65+i)));
  const c=screenArt.getContext('2d'),size=screenArt.width,ratio=state.v/state.u,ppu=size/SCREEN_SIZE;
  c.fillStyle='#142c38';c.fillRect(0,0,size,size);
  const effect=apertureEffect(state.aperture,state.u,state.v),radius=effect.blurMM/10*ppu/2;
  const layer=imageLayer.getContext('2d');layer.clearRect(0,0,size,size);
  // Sum shifted ideal images: each aperture position produces a displaced image.
  // Render into the full fixed screen, so outside image centres can contribute at edges.
  if(state.trace==='all'){
    layer.save();layer.globalCompositeOperation='lighter';layer.globalAlpha=1/apertureSamples.length;
    for(const sample of apertureSamples){
      layer.save();layer.translate(size/2+sample.x*radius,size/2+sample.y*radius);layer.scale(-ratio*ppu*OBJECT_SIZE/256,-ratio*ppu*OBJECT_SIZE/256);
      layer.drawImage(artwork,-128,-128);layer.restore();
    }layer.restore();
  }else for(const i of activePoints()){
    const p=projectPoint(toPoint(points[state.object][i]),state.u,state.v);
    layer.beginPath();layer.arc(size/2+p.x*ppu,size/2-p.y*ppu,radius,0,Math.PI*2);layer.fillStyle=colors[i];layer.fill();
  }
  c.save();c.globalAlpha=1-Math.exp(-.65*Math.pow(effect.relativeLight,.35));c.drawImage(imageLayer,0,0);c.restore();
  const target=$('screenPreview').getContext('2d');target.drawImage(screenArt,0,0,384,384);
  if(screenTexture)screenTexture.needsUpdate=true;
}
function build3D(){
  try{renderer=new THREE.WebGLRenderer({canvas:$('scene'),antialias:true,alpha:true,powerPreference:'low-power'});}catch{return;}
  webgl=true;renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.setClearColor(0xeaf3f8,1);
  scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xffffff,0x7c94a6,2.6));
  const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(20,70,45);scene.add(light);
  camera=new THREE.PerspectiveCamera(40,1,.1,1000);
  // Register picking before OrbitControls, so object drags do not rotate the camera.
  $('scene').addEventListener('pointerdown',startDrag);
  controls=new OrbitControls(camera,$('scene'));controls.enablePan=false;controls.enableDamping=false;
  controls.minDistance=22;controls.maxDistance=320;controls.maxPolarAngle=Math.PI*.49;
  controls.addEventListener('change',requestRender);
  world=new THREE.Group();scene.add(world);
  addBox(world,[100,1.6,145],[0,-1.5,7],0xd3e2e9);
  const grid=new THREE.GridHelper(140,28,0xb2c9d5,0xd0e0e7);grid.position.set(0,-.64,7);world.add(grid);
  for(const x of [-4,4])addBox(world,[.65,.6,118],[x,.2,7],0x91aab8);
  objectGroup=new THREE.Group();world.add(objectGroup);
  const objectBase=addBox(objectGroup,[14,1.2,5],[0,1,0],0xcd6b3e);objectBase.userData.drag='u';draggables.push(objectBase);
  addBox(objectGroup,[.65,5.5,.65],[0,4,0],0x9aadb6);
  addBox(objectGroup,[13,13,.35],[0,11,-.2],0x314e60);
  objectTexture=new THREE.CanvasTexture(artwork);objectTexture.colorSpace=THREE.SRGBColorSpace;
  sourceMaterial=new THREE.MeshBasicMaterial({map:objectTexture,transparent:true,side:THREE.DoubleSide,depthWrite:false});
  const objectPlane=new THREE.Mesh(new THREE.PlaneGeometry(12,12),sourceMaterial);objectPlane.position.set(0,11,.03);objectGroup.add(objectPlane);
  objectPlane.userData.drag='u';draggables.push(objectPlane);
  // Same luminous pattern on the face toward the hole; world x/y stay consistent.
  const reversePlane=new THREE.Mesh(new THREE.PlaneGeometry(12,12),sourceMaterial);reversePlane.position.set(0,11,-.4);objectGroup.add(reversePlane);
  const shape=new THREE.Shape();shape.moveTo(-9,-9);shape.lineTo(9,-9);shape.lineTo(9,9);shape.lineTo(-9,9);shape.closePath();
  const hole=new THREE.Path();hole.absarc(0,0,.48,0,Math.PI*2,true);shape.holes.push(hole);
  plate=new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshStandardMaterial({color:0x294554,roughness:.9,side:THREE.DoubleSide}));plate.position.y=11;world.add(plate);
  addBox(world,[20,1,3],[0,1.4,0],0x597581);
  rim=new THREE.Mesh(new THREE.RingGeometry(.48,.65,24),new THREE.MeshBasicMaterial({color:0xedb354,side:THREE.DoubleSide}));rim.position.set(0,11,.025);world.add(rim);
  screenGroup=new THREE.Group();world.add(screenGroup);
  const screenBase=addBox(screenGroup,[21,1.1,4],[0,1,0],0x148b94);screenBase.userData.drag='v';draggables.push(screenBase);
  addBox(screenGroup,[19.2,19.2,.6],[0,11,-.4],0x7c9ca8);
  screenTexture=new THREE.CanvasTexture(screenArt);screenTexture.colorSpace=THREE.SRGBColorSpace;
  screenMaterial=new THREE.MeshBasicMaterial({map:screenTexture,side:THREE.FrontSide});
  const screenPlane=new THREE.Mesh(new THREE.PlaneGeometry(18,18),screenMaterial);screenPlane.position.set(0,11,.01);screenGroup.add(screenPlane);screenPlane.userData.drag='v';draggables.push(screenPlane);
  boxGroup=new THREE.Group();rayGroup=new THREE.Group();pointGroup=new THREE.Group();world.add(boxGroup,rayGroup,pointGroup);
  addLabel('物体 · 拖动橙色底座','object',()=>new THREE.Vector3(0,19,state.u));
  addLabel('小孔','hole',()=>new THREE.Vector3(0,22,0));
  addLabel('光屏 · 拖动青色底座','screen',()=>new THREE.Vector3(0,23,-state.v));
  $('scene').addEventListener('pointermove',moveDrag);$('scene').addEventListener('pointerup',endDrag);$('scene').addEventListener('pointercancel',endDrag);$('scene').addEventListener('lostpointercapture',endDrag);
  $('scene').addEventListener('webglcontextlost',e=>{e.preventDefault();webgl=false;state.flat=true;$('fallbackNotice').hidden=false;$('fallbackNotice').textContent='3D 显示暂不可用，已切换到相同参数的二维光路。';update();});
  $('scene').addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','='].includes(e.key))return;e.preventDefault();
    if(['+','=','-'].includes(e.key))return zoom(e.key==='-'?1.18:.85);
    if(state.view==='screen')return;
    const offset=camera.position.clone().sub(controls.target),spherical=new THREE.Spherical().setFromVector3(offset);
    spherical.theta+=e.key==='ArrowLeft'?.13:e.key==='ArrowRight'?-.13:0;
    spherical.phi=THREE.MathUtils.clamp(spherical.phi+(e.key==='ArrowUp'?-.1:e.key==='ArrowDown'?.1:0),.1,Math.PI*.49);
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));controls.update();
  });
}
function addBox(parent,size,position,color){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),new THREE.MeshStandardMaterial({color,roughness:.85}));mesh.position.set(...position);parent.add(mesh);return mesh;
}
function clearGroup(group){while(group.children.length){const child=group.children[0];group.remove(child);child.traverse(o=>{o.geometry?.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();});}}
function addLabel(text,kind,position){const node=document.createElement('span');node.className='scene-label '+kind;node.textContent=text;$('sceneLabels').append(node);labels.push({node,position});}
function sphere(parent,p,color,r=.28){const mesh=new THREE.Mesh(new THREE.SphereGeometry(r,12,8),new THREE.MeshBasicMaterial({color}));mesh.position.copy(p);parent.add(mesh);return mesh;}
function path(points,color){const geometry=new THREE.BufferGeometry().setFromPoints(points);rayGroup.add(new THREE.Line(geometry,new THREE.LineBasicMaterial({color})));}
function arrow(a,b,color){const d=b.clone().sub(a);if(d.length()<1)return;const marker=new THREE.ArrowHelper(d.clone().normalize(),a.clone().lerp(b,.55),Math.min(3,d.length()*.2),color,1,.5);rayGroup.add(marker);}
function updateWorld(){
  if(!webgl)return;
  if(shownAperture!==state.aperture){
    // Visible opening is enlarged for recognition; physical diameter remains in mm.
    const radius=.3+state.aperture*.16,shape=new THREE.Shape();shape.moveTo(-9,-9);shape.lineTo(9,-9);shape.lineTo(9,9);shape.lineTo(-9,9);shape.closePath();
    const hole=new THREE.Path();hole.absarc(0,0,radius,0,Math.PI*2,true);shape.holes.push(hole);
    plate.geometry.dispose();plate.geometry=new THREE.ShapeGeometry(shape);rim.geometry.dispose();rim.geometry=new THREE.RingGeometry(radius,radius+.17,24);shownAperture=state.aperture;
  }
  objectGroup.position.z=state.u;screenGroup.position.z=-state.v;
  clearGroup(boxGroup);const cut=state.view!=='apparatus';
  addBox(boxGroup,[18,.4,state.v],[0,1.8,-state.v/2],0x304a59);
  if(!cut){addBox(boxGroup,[18,.4,state.v],[0,20.2,-state.v/2],0x304a59);for(const x of [-9.2,9.2])addBox(boxGroup,[.4,18.4,state.v],[x,11,-state.v/2],0x304a59);}
  else {for(const x of [-9,9]){addBox(boxGroup,[.12,.12,state.v],[x,20,-state.v/2],0x86aab6);addBox(boxGroup,[.12,.12,state.v],[x,2,-state.v/2],0x86aab6);}}
  clearGroup(rayGroup);clearGroup(pointGroup);pointTargets.length=0;
  if(state.view==='rays')for(const i of activePoints()){
    const p=toPoint(points[state.object][i]),a=new THREE.Vector3(p.x,11+p.y,state.u),end=rayEnd(p,state.u,state.v),b=new THREE.Vector3(end.x,11+end.y,end.z);
    path([a,origin,b],colors[i]);arrow(a,origin,colors[i]);arrow(origin,b,colors[i]);
    sphere(rayGroup,b,colors[i],.12);
    // Two boundary rays show why one point produces a finite spot.
    const physicalRadius=state.aperture/20;
    for(const sign of [-1,1]){
      const q=new THREE.Vector3(0,11+sign*physicalRadius,0),endPoint=projectPoint(p,state.u,state.v);
      const t=new THREE.Vector3(endPoint.x,11+endPoint.y+sign*physicalRadius*(1+state.v/state.u),-state.v);
      const direction=t.clone().sub(q),limit=Math.min(1,...['x','y'].map(axis=>{const start=axis==='y'?q.y-11:q.x,delta=direction[axis];return delta===0?Infinity:((delta>0?9:-9)-start)/delta;}));
      path([a,q,q.clone().addScaledVector(direction,limit)],colors[i]);
    }
  }
  points[state.object].forEach((p,i)=>{const q=toPoint(p);const m=sphere(pointGroup,new THREE.Vector3(q.x,11+q.y,state.u+.14),colors[i],i===state.point?.37:.26);m.userData.point=i;pointTargets.push(m);});
  pointGroup.visible=state.view!=='screen';
  if(state.view==='screen')setCamera();
  requestRender();
}
function setCamera(){
  if(!webgl)return;
  const aspect=$('viewport').clientWidth/$('viewport').clientHeight;
  camera.aspect=aspect;camera.updateProjectionMatrix();
  if(state.view==='screen'){
    controls.target.set(0,11,-state.v);camera.position.set(0,11,-state.v+Math.max(29,29/aspect));
    // Hide intervening geometry in this fixed receiver-face inspection view.
    world.children.forEach(o=>o.visible=o===screenGroup);
    controls.enableRotate=false;controls.enableZoom=false;
  }else{
    world.children.forEach(o=>o.visible=true);
    controls.target.set(0,7,(state.u-state.v)/2);
    const span=Math.max(72,state.u+state.v+20),distance=span*(aspect<1?1.4:1.05)/Math.min(aspect,1.5);
    const direction=state.view==='rays'?new THREE.Vector3(1,.55,1.15):new THREE.Vector3(1,.8,1.3);
    camera.position.copy(controls.target).add(direction.normalize().multiplyScalar(distance*1.65));
    controls.enableRotate=true;controls.enableZoom=true;
  }
  controls.update();requestRender();
}
function requestRender(){if(!queued&&webgl&&!state.flat){queued=true;requestAnimationFrame(()=>{queued=false;if(!webgl||state.flat)return;renderer.render(scene,camera);updateLabels();});}}
function updateLabels(){
  const w=$('viewport').clientWidth,h=$('viewport').clientHeight;
  for(const item of labels){const p=item.position().project(camera);item.node.hidden=state.view==='screen'||state.flat||p.z>1||p.z< -1||Math.abs(p.x)>.95||Math.abs(p.y)>.85;item.node.style.left=((p.x+1)*w/2)+'px';item.node.style.top=((1-p.y)*h/2)+'px';}
}
function zoom(factor){if(!webgl||state.flat||state.view==='screen')return;const offset=camera.position.clone().sub(controls.target);offset.setLength(THREE.MathUtils.clamp(offset.length()*factor,22,320));camera.position.copy(controls.target).add(offset);controls.update();}
function pick(e){const r=$('scene').getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);picker.setFromCamera(pointer,camera);}
function startDrag(e){
  if(!webgl||state.flat||state.view==='screen')return;pick(e);
  const point=picker.intersectObjects(pointTargets)[0];
  if(point){controls.enabled=false;state.point=point.object.userData.point;state.trace='one';state.view='rays';update();$('scene').setPointerCapture(e.pointerId);return;}
  const hit=picker.intersectObjects(draggables)[0];if(!hit)return;
  const normal=camera.getWorldDirection(new THREE.Vector3());normal.z=0;if(normal.lengthSq()<.01)return;normal.normalize();
  const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(normal,hit.point);
  drag={key:hit.object.userData.drag,plane,offset:(hit.object.userData.drag==='u'?state.u:-state.v)-hit.point.z};
  controls.enabled=false;$('scene').setPointerCapture(e.pointerId);
}
function moveDrag(e){if(!drag)return;pick(e);const hit=picker.ray.intersectPlane(drag.plane,new THREE.Vector3());if(!hit)return;const value=(hit.z+drag.offset)*(drag.key==='u'?1:-1);state[drag.key]=clampDistance(value,drag.key==='u'?12:10,drag.key==='u'?60:48,state[drag.key]);update();}
function endDrag(){drag=null;if(controls)controls.enabled=true;}
function drawDiagram(){
  const svg=$('diagram'),w=Math.max(280,$('viewport').clientWidth),h=$('viewport').clientHeight;
  const scale=(w-75)/(state.u+state.v),x=35+state.u*scale,y=h*.46,vertical=Math.min(11,(h-160)/24),px=z=>x-z*scale,py=yy=>y-yy*vertical;
  const line=(x1,y1,x2,y2,color,extra='')=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" ${extra}/>`;
  const text=(xx,yy,t,color='#385569')=>`<text x="${Math.max(38,Math.min(w-38,xx))}" y="${yy}" text-anchor="middle" fill="${color}">${t}</text>`;
  let out='<title id="diagramTitle">小孔成像侧面光路图：物体上方的点对应光屏下方</title><style>text{font:13px "Microsoft YaHei",sans-serif}line{stroke-width:2}</style>';
  out+=`<rect x="${x}" y="${py(9)}" width="${state.v*scale}" height="${18*vertical}" fill="#e0edf3" stroke="#8cabb9" stroke-dasharray="5 4"/>`;
  const gap=3+state.aperture;
  out+=line(15,y,w-15,y,'#a0b7c3','stroke-dasharray="4 5"')+line(x,py(9),x,y-gap,'#284c60')+line(x,y+gap,x,py(-9),'#284c60')+line(px(-state.v),py(9),px(-state.v),py(-9),'#087e8b');
  for(const i of activePoints()){
    const p=toPoint(points[state.object][i]),end=rayEnd(p,state.u,state.v),sx=px(state.u),sy=py(p.y),ex=px(end.z),ey=py(end.y);
    out+=line(sx,sy,x,y,colors[i])+line(x,y,ex,ey,colors[i])+`<circle cx="${sx}" cy="${sy}" r="5" fill="${colors[i]}"/><circle cx="${ex}" cy="${ey}" r="5" fill="${colors[i]}"/>`+text(sx+6,sy-10,String.fromCharCode(65+i),colors[i]);
  }
  out+=text(35,py(9)-16,'物体')+text(x,py(9)-16,'小孔')+text(px(-state.v),py(9)-16,'光屏');
  out+=line(35,h-67,x,h-67,'#ba541f')+text((35+x)/2,h-75,'u = '+state.u+' cm','#ba541f');
  out+=line(x,h-39,w-40,h-39,'#087e8b')+text((x+w-40)/2,h-47,'L = '+state.v+' cm','#087e8b');
  svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.innerHTML=out;
}
function update(){
  const ratio=state.v/state.u,selected=projectPoint(toPoint(points[state.object][state.point]),state.u,state.v);
  $('objectRange').value=$('objectNumber').value=state.u;$('screenRange').value=$('screenNumber').value=state.v;
  const effect=apertureEffect(state.aperture,state.u,state.v);
  $('apertureRange').value=state.aperture;$('apertureValue').textContent=state.aperture.toFixed(1);
  $('blurValue').textContent=effect.blurMM.toFixed(1)+' mm';$('lightValue').textContent=effect.relativeLight.toFixed(2)+'×';
  document.querySelectorAll('[data-aperture]').forEach(b=>b.setAttribute('aria-pressed',Number(b.dataset.aperture)===state.aperture));
  $('textControls').hidden=state.object!=='text';$('uploadedChoice').disabled=!uploadedArt;
  for(const [key,selector] of [['view','[data-view]'],['object','[data-object]'],['trace','[data-trace]'],['point','[data-point]']])document.querySelectorAll(selector).forEach(b=>b.setAttribute('aria-pressed',String(b.dataset[key])===String(state[key])));
  $('flat').setAttribute('aria-pressed',state.flat);$('scene').hidden=state.flat;$('diagram').toggleAttribute('hidden',!state.flat);$('sceneLabels').hidden=state.flat;
  document.querySelectorAll('.camera-tools button').forEach(b=>b.disabled=state.flat||(state.view==='screen'&&b.id!=='homeView'));
  $('viewTitle').textContent=state.flat?'二维光路 · 同一组实验参数':({apparatus:'完整装置 · 不透光暗箱',rays:'剖面观察 · 彩色光线为辅助示意',screen:'接收面正视 · 固定光屏尺寸'})[state.view];
  $('sceneNote').textContent=state.flat?'正侧面显示中心光路，左右不同的点可能重叠。孔隙放大示意；有限孔径的光斑请看右侧光屏。':state.view==='apparatus'?'暗箱阻挡外界杂散光。调节小孔直径，再切到“看光屏”比较清晰度和亮度。':state.view==='rays'?'隐藏箱壁以观察内部；中心线和边缘线为辅助示意。有限小孔使一个物点形成光斑，孔的可见尺寸已放大。':'从接收光的一面观察光屏。固定距离调节孔径：像的几何比例不变，但边缘和亮度改变。';
  $('gesture').textContent=state.flat?'物体、小孔、光屏在同一条轴线上':state.view==='screen'?'接收面视角已固定 · 下方滑块可改变成像':'拖动空白处旋转 · 滚轮缩放 · 拖动彩色底座调整距离';
  $('ratio').textContent=ratio.toFixed(2)+' 倍';$('resultText').textContent='倒立 · '+(Math.abs(ratio-1)<.0001?'等大':ratio>1?'放大':'缩小');
  $('calculation').textContent=`${state.v} ÷ ${state.u} = ${ratio.toFixed(2)}`;
  const extremes=[{x:objectBounds.left,y:objectBounds.top},{x:objectBounds.right,y:objectBounds.bottom}];
  const blurRadius=effect.blurMM/20;
  const clipped=extremes.some(p=>{const q=projectPoint(toPoint(p),state.u,state.v);return Math.abs(q.x)+blurRadius>9||Math.abs(q.y)+blurRadius>9;});
  $('cropNote').textContent=clipped?'像的一部分超出光屏，已被截去。':'像完整落在光屏上。';
  $('objectDescription').textContent=names[state.object];$('sourceHint').textContent=state.object==='candle'?'火焰朝上，像的火焰朝哪边？':'比较物体与倒像的上下、左右位置。';
  $('stepName').textContent={one:'① 一个物点',two:'② 两个物点',all:'③ 完整成像'}[state.trace];
  $('pointExplanation').textContent=state.trace==='all'?'每个物点形成一个小光斑，所有光斑叠加成倒像。孔变大时，边缘逐渐模糊。':Math.abs(selected.x)-blurRadius>9||Math.abs(selected.y)-blurRadius>9?'所选物点的光被暗箱侧壁挡住。试着缩短孔屏距离。':state.trace==='two'?'比较两个物点及其光斑：穿孔后位置倒转。试着改变小孔直径。':`${String.fromCharCode(65+state.point)} 点形成直径约 ${effect.blurMM.toFixed(1)} mm 的光斑。小孔变大，光斑也变大。`;
  paintImages();updateWorld();if(state.flat)drawDiagram();
}
function resize(){if(webgl){renderer.setSize($('viewport').clientWidth,$('viewport').clientHeight,false);camera.aspect=$('viewport').clientWidth/$('viewport').clientHeight;camera.updateProjectionMatrix();if(state.view==='screen')setCamera();requestRender();}if(state.flat)drawDiagram();}
for(const [range,number,key,min,max] of [['objectRange','objectNumber','u',12,60],['screenRange','screenNumber','v',10,48]]){
  $(range).addEventListener('input',()=>{state[key]=Number($(range).value);update();});
  const commit=()=>{state[key]=clampDistance($(number).value,min,max,state[key]);update();};
  $(number).addEventListener('change',commit);$(number).addEventListener('blur',commit);$(number).addEventListener('keydown',e=>{if(e.key==='Enter')commit();});
}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{state.view=b.dataset.view;state.flat=!webgl;update();setCamera();}));
document.querySelectorAll('[data-object]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.object==='upload'&&!uploadedArt)return;uploadSequence++;state.object=b.dataset.object;state.trace='all';$('uploadStatus').textContent='';paintArtwork();update();}));
document.querySelectorAll('[data-point]').forEach(b=>b.addEventListener('click',()=>{state.point=Number(b.dataset.point);state.trace='one';state.view='rays';update();setCamera();}));
document.querySelectorAll('[data-trace]').forEach(b=>b.addEventListener('click',()=>{state.trace=b.dataset.trace;state.view='rays';update();setCamera();}));
$('sourcePreview').addEventListener('click',e=>{const r=e.currentTarget.getBoundingClientRect(),x=(e.clientX-r.left)*256/r.width,y=(e.clientY-r.top)*256/r.height;let best=0;points[state.object].forEach((p,i)=>{const q=points[state.object][best];if(Math.hypot(p.x-x,p.y-y)<Math.hypot(q.x-x,q.y-y))best=i;});state.point=best;state.trace='one';state.view='rays';update();setCamera();});
$('flat').addEventListener('click',()=>{state.flat=webgl?!state.flat:true;if(state.flat)state.view='rays';update();if(!state.flat)setCamera();});
$('reset').addEventListener('click',()=>{endDrag();uploadSequence++;uploadedArt=null;customText='光';$('customText').value=customText;$('imageUpload').value='';$('uploadStatus').textContent='';Object.assign(state,{u:30,v:24,aperture:1,object:'letter',point:0,trace:'all',view:'apparatus',flat:!webgl});paintArtwork();update();setCamera();});
$('apertureRange').addEventListener('input',()=>{state.aperture=Math.max(.5,Math.min(5,Number($('apertureRange').value)));update();});
document.querySelectorAll('[data-aperture]').forEach(b=>b.addEventListener('click',()=>{state.aperture=Number(b.dataset.aperture);update();}));
function applyText(){customText=Array.from($('customText').value.trim()).slice(0,8).join('')||'光';$('customText').value=customText;state.object='text';state.trace='all';paintArtwork();update();}
$('applyText').addEventListener('click',applyText);$('customText').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing)applyText();});
$('imageUpload').addEventListener('change',async()=>{
  const file=$('imageUpload').files?.[0];if(!file)return;
  const sequence=++uploadSequence,error=imageFileError(file);if(error){$('uploadStatus').textContent=error;$('imageUpload').value='';return;}
  $('uploadStatus').textContent='正在本机读取图片…';const url=URL.createObjectURL(file);
  try{
    const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;});
    if(sequence!==uploadSequence)return;
    if(image.naturalWidth*image.naturalHeight>20000000)throw Error('图片尺寸超过 2000 万像素，请先缩小。');
    const target=document.createElement('canvas');target.width=target.height=256;
    const c=target.getContext('2d'),scale=232/Math.max(image.naturalWidth,image.naturalHeight),w=image.naturalWidth*scale,h=image.naturalHeight*scale;c.drawImage(image,(256-w)/2,(256-h)/2,w,h);
    const pixels=c.getImageData(0,0,256,256).data;let visible=false;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>32){visible=true;break;}
    if(!visible)throw Error('图片完全透明，请换一张有可见内容的图片。');
    uploadedArt=target;state.object='upload';state.trace='all';paintArtwork();update();$('uploadStatus').textContent='已载入本机图片；未上传网络。复位会清除。';
  }catch(error){if(sequence===uploadSequence)$('uploadStatus').textContent=error instanceof Error?error.message:'无法读取这张图片，请换一张 PNG、JPG 或 WebP。';}
  finally{URL.revokeObjectURL(url);if(sequence===uploadSequence)$('imageUpload').value='';}
});
$('zoomIn').addEventListener('click',()=>zoom(.85));$('zoomOut').addEventListener('click',()=>zoom(1.18));$('homeView').addEventListener('click',setCamera);
candle.onload=()=>{if(state.object==='candle'){paintArtwork();update();}};
candle.onerror=()=>{document.querySelector('[data-object="candle"]').disabled=true;$('fallbackNotice').hidden=false;$('fallbackNotice').textContent='蜡烛图片未能加载，可以继续使用字母 F。';if(state.object==='candle'){state.object='letter';paintArtwork();update();}};
candle.src=candleURL;
paintArtwork();build3D();
if(!webgl){state.flat=true;state.view='rays';$('fallbackNotice').hidden=false;$('fallbackNotice').textContent='此设备无法开启 3D，已切换到二维光路。距离操作和成像计算仍可使用。';}
update();resize();setCamera();new ResizeObserver(resize).observe($('viewport'));
