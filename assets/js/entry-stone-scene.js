import * as THREE from '../vendor/three.module.js';

// A procedural object, not a fetched model: both the stone and the jade live locally.
export function createStoneScene(container,{reduced=false,authLayout=false,onLost=()=>{}}={}){
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.6));
  renderer.setClearColor(0x07150f,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
  container.append(renderer.domElement);renderer.domElement.setAttribute('aria-hidden','true');
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(37,1,.1,70),assembly=new THREE.Group();
  camera.position.set(0,0,8.7);scene.add(assembly);
  let seed=72;const random=()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646;};
  const resources=[];const keep=item=>{resources.push(item);return item;};
  const envCanvas=document.createElement('canvas');envCanvas.width=1024;envCanvas.height=512;
  const ec=envCanvas.getContext('2d'),eg=ec.createLinearGradient(0,0,0,512);eg.addColorStop(0,'#233c30');eg.addColorStop(.38,'#849681');eg.addColorStop(.52,'#102019');eg.addColorStop(1,'#06110c');ec.fillStyle=eg;ec.fillRect(0,0,1024,512);
  const strip=ec.createLinearGradient(40,0,230,0);strip.addColorStop(0,'#39463a');strip.addColorStop(.45,'#e9e4c5');strip.addColorStop(.62,'#ffffff');strip.addColorStop(1,'#293f30');ec.fillStyle=strip;ec.fillRect(40,30,190,270);ec.fillStyle='#72967e';ec.fillRect(650,100,70,250);
  const et=keep(new THREE.CanvasTexture(envCanvas));et.mapping=THREE.EquirectangularReflectionMapping;et.colorSpace=THREE.SRGBColorSpace;
  const pmrem=new THREE.PMREMGenerator(renderer),environment=pmrem.fromEquirectangular(et);scene.environment=environment.texture;pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xc9d9be,0x091f16,1.5));
  const key=new THREE.DirectionalLight(0xffebc7,4.6);key.position.set(-3,5,5);scene.add(key);
  const rim=new THREE.DirectionalLight(0x9de7ba,3.7);rim.position.set(3,2,-2);scene.add(rim);
  const fill=new THREE.PointLight(0xafd8cb,20,20,2);fill.position.set(0,1,4);scene.add(fill);
  const coreLight=new THREE.PointLight(0x90fac0,0,10,2);assembly.add(coreLight);
  // Mineral texture: multiscale mottling plus fine granules. No remote texture asset.
  const noiseCanvas=document.createElement('canvas');noiseCanvas.width=noiseCanvas.height=512;const nc=noiseCanvas.getContext('2d');
  const pixels=nc.createImageData(512,512);for(let y=0;y<512;y++)for(let x=0;x<512;x++){const fine=random()*38;const mottling=18*Math.sin(x*.031+Math.sin(y*.034)*2)+12*Math.cos(y*.049-x*.013)+7*Math.sin(x*.16+y*.09);const v=109+mottling+fine,idx=(y*512+x)*4;pixels.data[idx]=v+7;pixels.data[idx+1]=v+6;pixels.data[idx+2]=v;pixels.data[idx+3]=255;}nc.putImageData(pixels,0,0);
  for(let i=0;i<1600;i++){const x=random()*512,y=random()*512;nc.fillStyle=i%3?'#c2c0a634':'#17241d48';nc.fillRect(x,y,random()*3+.4,random()*2+.4);}
  const mineral=keep(new THREE.CanvasTexture(noiseCanvas));mineral.wrapS=mineral.wrapT=THREE.RepeatWrapping;mineral.colorSpace=THREE.SRGBColorSpace;
  const shellMaterial=keep(new THREE.MeshStandardMaterial({color:0x74766a,map:mineral,bumpMap:mineral,bumpScale:.12,roughness:.97,metalness:.05,vertexColors:true,transparent:true,envMapIntensity:.42}));
  const base=keep(new THREE.IcosahedronGeometry(1.45,11));const positions=base.attributes.position;
  const warped=[];for(let i=0;i<positions.count;i++){const v=new THREE.Vector3().fromBufferAttribute(positions,i);const n=v.clone().normalize();const rough=1+.09*Math.sin(n.x*4+n.y*5)+.075*Math.cos(n.z*6-n.y*3)+.034*Math.sin(n.y*15+n.x*11);v.multiplyScalar(rough);v.x*=.91;v.y*=1.11;v.z*=.85;warped.push(v);}
  const partitions=Array.from({length:18},(_,i)=>{const y=1-(i+.5)/18*2,angle=i*2.399963;return {axis:new THREE.Vector3(Math.cos(angle)*Math.sqrt(1-y*y),y,Math.sin(angle)*Math.sqrt(1-y*y)),pos:[],uv:[],colors:[],normals:[],center:new THREE.Vector3(),count:0};});
  const edges=new Map();const vkey=v=>[v.x,v.y,v.z].map(n=>n.toFixed(4)).join(',');
  const normalMap=new Map();for(let i=0;i<warped.length;i+=3){const [a,b,c]=warped.slice(i,i+3);const face=b.clone().sub(a).cross(c.clone().sub(a)).normalize();for(const v of [a,b,c]){const k=vkey(v);if(!normalMap.has(k))normalMap.set(k,new THREE.Vector3());normalMap.get(k).add(face);}}normalMap.forEach(v=>v.normalize());
  const addTriangle=(part,a,b,c,color,smooth=false)=>{for(const v of [a,b,c]){part.pos.push(v.x,v.y,v.z);const n=v.clone().normalize();part.uv.push(.5+Math.atan2(n.z,n.x)/(Math.PI*2),.5+Math.asin(n.y)/Math.PI);part.colors.push(color,color*.99,color*.94);const surfaceNormal=smooth?normalMap.get(vkey(v)):b.clone().sub(a).cross(c.clone().sub(a)).normalize();part.normals.push(surfaceNormal.x,surfaceNormal.y,surfaceNormal.z);}};
  for(let i=0;i<warped.length;i+=3){const tri=warped.slice(i,i+3),center=tri[0].clone().add(tri[1]).add(tri[2]).multiplyScalar(1/3),normal=center.clone().normalize();let best=0,dot=-9;partitions.forEach((p,index)=>{const d=p.axis.dot(normal);if(d>dot){dot=d;best=index;}});const p=partitions[best];p.center.add(center);p.count++;const tint=.84+random()*.25;addTriangle(p,...tri,tint,true);const inside=tri.map(v=>v.clone().multiplyScalar(.77));addTriangle(p,inside[2],inside[1],inside[0],.42);for(let e=0;e<3;e++){const n=(e+1)%3;addTriangle(p,tri[e],inside[e],inside[n],.63);addTriangle(p,tri[e],inside[n],tri[n],.63);const id=[vkey(tri[e]),vkey(tri[n])].sort().join('|');const edge=edges.get(id);if(edge&&edge.part!==best)edge.boundary=true;else if(!edge)edges.set(id,{part:best,a:tri[e],b:tri[n],boundary:false});}}
  const shards=[];partitions.forEach((p,index)=>{if(!p.count)return;const geometry=keep(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.Float32BufferAttribute(p.pos,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(p.uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(p.colors,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(p.normals,3));const mesh=new THREE.Mesh(geometry,shellMaterial);assembly.add(mesh);shards.push({mesh,direction:p.center.multiplyScalar(1/p.count).normalize(),spin:new THREE.Vector3(random()-.5,random()-.5,random()-.5),delay:index*.008});});
  const fracturePositions=[];edges.forEach(edge=>{if(edge.boundary)for(const v of [edge.a,edge.b])fracturePositions.push(v.x*1.005,v.y*1.005,v.z*1.005);});
  const fractureGeometry=keep(new THREE.BufferGeometry());fractureGeometry.setAttribute('position',new THREE.Float32BufferAttribute(fracturePositions,3));const fractureMaterial=keep(new THREE.LineBasicMaterial({color:0xbde1a9,transparent:true,opacity:.13,depthWrite:false}));const fractures=new THREE.LineSegments(fractureGeometry,fractureMaterial);assembly.add(fractures);
  // A polished jade bi-disc gives the reveal a recognisable Chinese material form.
  const jadeGeo=keep(new THREE.TorusGeometry(.70,.34,48,128));jadeGeo.scale(1,1,.48);
  const jadeMaterial=keep(new THREE.MeshPhysicalMaterial({color:0x337652,roughness:.21,metalness:.04,clearcoat:1,clearcoatRoughness:.17,transmission:.12,thickness:1.1,ior:1.46,emissive:0x0b3a20,emissiveIntensity:.13,envMapIntensity:.8}));
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
  const jade=new THREE.Mesh(jadeGeo,jadeMaterial),jadeFacing=new THREE.Quaternion();assembly.add(jade);jade.visible=false;
  // Settle the circular disc facing the camera; keep the raw stone and shards in their original pose.
  // Chisel catches the key light just before the surface opens.
  const chisel=new THREE.Group();const metal=keep(new THREE.MeshStandardMaterial({color:0xbfb89b,metalness:.86,roughness:.27}));const shaft=new THREE.Mesh(keep(new THREE.CylinderGeometry(.035,.055,1.0,5)),metal);chisel.add(shaft);const tip=new THREE.Mesh(keep(new THREE.ConeGeometry(.058,.2,4)),metal);tip.rotation.z=Math.PI;tip.position.y=-.59;chisel.add(tip);chisel.rotation.z=-.52;chisel.visible=false;assembly.add(chisel);
  const grainGeo=keep(new THREE.BufferGeometry()),dustCount=70,dustPosition=new Float32Array(dustCount*3),dustVelocity=[];for(let i=0;i<dustCount;i++){dustVelocity.push(new THREE.Vector3((random()-.5)*5,random()*3+.7,(random()-.1)*2));}grainGeo.setAttribute('position',new THREE.BufferAttribute(dustPosition,3));const grainMat=keep(new THREE.PointsMaterial({color:0xd4dbb6,size:.021,transparent:true,opacity:0,depthWrite:false}));const dust=new THREE.Points(grainGeo,grainMat);assembly.add(dust);
  const sparkGeo=keep(new THREE.BufferGeometry()),sparkPos=new Float32Array(12*6);sparkGeo.setAttribute('position',new THREE.BufferAttribute(sparkPos,3));const sparkMat=keep(new THREE.LineBasicMaterial({color:0xe3efbd,transparent:true,opacity:0,depthWrite:false}));const sparks=new THREE.LineSegments(sparkGeo,sparkMat);assembly.add(sparks);
  let width=1,height=1,frame=0,disposed=false,paused=reduced,started=performance.now(),motionTime=0,last=started,carveStart=null,frozenTime=null,px=0,py=0,aimX=0,aimY=0,baseX=0,baseY=0,baseScale=1,entryScale=1;
  const clamp=n=>Math.max(0,Math.min(1,n)),ease=n=>1-Math.pow(1-clamp(n),3);
  function resize(){if(disposed)return;const rect=container.getBoundingClientRect();width=rect.width;height=rect.height;renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();const visibleHeight=2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.position.z,visibleWidth=visibleHeight*camera.aspect;const mobile=width<768;baseX=mobile?(authLayout?visibleWidth*.32:0):visibleWidth*.19;baseY=mobile?(authLayout?visibleHeight*(.5-175/height):-visibleHeight*(height<700?.12:.10)):-visibleHeight*.015;entryScale=mobile?Math.min(.61,height/950):Math.min(.94,width/1200);baseScale=mobile&&authLayout?Math.min(.35,280/height):entryScale;assembly.scale.setScalar(baseScale);draw(performance.now(),true);}
  function renderFrame(now){if(disposed)return;frame=0;draw(now);if(frozenTime===null&&(!paused||carveStart!==null))frame=requestAnimationFrame(renderFrame);}
  function draw(now,force=false){if(disposed)return;const dt=Math.min((now-last)/1000,.05);last=now;if(!paused&&!document.hidden)motionTime+=dt;const elapsed=frozenTime??(carveStart===null?0:(now-carveStart)/1000);px+=(aimX-px)*.06;py+=(aimY-py)*.06;
    const opened=carveStart!==null;const reveal=ease((elapsed-.24)/.78);assembly.position.set(baseX*(1-ease((elapsed-.18)/1.0)),baseY*(1-ease((elapsed-.18)/1.0))+(reduced?0:Math.sin(motionTime*.65)*.055),0);assembly.rotation.set(-.04+py*.065,-.4+(reduced?0:Math.sin(motionTime*.26)*.15)+px*.12,.06);if(opened){assembly.scale.setScalar(baseScale+(entryScale-baseScale)*reveal);assembly.rotation.y+=reveal*.25;jade.visible=true;jadeFacing.copy(assembly.quaternion).invert().multiply(camera.quaternion);jade.quaternion.identity().slerp(jadeFacing,reveal);jade.scale.setScalar(.82+.18*reveal);const r=ease((elapsed-.25)/.7);shards.forEach(({mesh,direction,spin,delay})=>{const amount=ease((elapsed-.22-delay)/.94);mesh.position.copy(direction).multiplyScalar(amount*3.1);mesh.position.y-=amount*amount*.8;mesh.rotation.set(spin.x*amount*1.0,spin.y*amount,spin.z*amount);});shellMaterial.opacity=1-ease((elapsed-.7)/.43);fractureMaterial.opacity=Math.max(0,(1-r)*Math.min(1,elapsed*11));fractures.visible=elapsed<.45;coreLight.intensity=Math.sin(Math.min(1,elapsed/.95)*Math.PI)*16;jadeMaterial.emissiveIntensity=.13+.08*reveal;
      chisel.visible=elapsed<.35;const strike=ease(elapsed/.17);chisel.position.set(.5-.32*strike,2.0-1.45*strike,1.1);if(elapsed>.17){const impact=elapsed-.17;grainMat.opacity=Math.max(0,1-impact/.88);for(let i=0;i<dustCount;i++){const v=dustVelocity[i];dustPosition[i*3]=v.x*impact;dustPosition[i*3+1]=.0+v.y*impact-impact*impact*3.7;dustPosition[i*3+2]=1.3+v.z*impact;}grainGeo.attributes.position.needsUpdate=true;const sp=clamp(impact/.40);sparkMat.opacity=1-sp;for(let i=0;i<12;i++){const angle=i/12*Math.PI*2,len=(.08+sp*.65),tail=Math.max(0,len-.11*(1-sp));sparkPos.set([Math.cos(angle)*tail,Math.sin(angle)*tail,1.5,Math.cos(angle)*len,Math.sin(angle)*len,1.5],i*6);}sparkGeo.attributes.position.needsUpdate=true;}if(elapsed<.31&&elapsed>.16){assembly.position.x+=Math.sin(elapsed*250)*.022*(1-(elapsed-.16)/.15);}}
    renderer.render(scene,camera);
  }
  function play(){if(!frame&&!disposed)frame=requestAnimationFrame(renderFrame);}
  function pointer(x,y){aimX=x;aimY=y;}
  function setPaused(value){paused=value;last=performance.now();if(!paused)play();else if(carveStart===null){cancelAnimationFrame(frame);frame=0;}}
  function carve(){if(carveStart!==null)return;carveStart=performance.now();paused=false;play();}
  const observer=new ResizeObserver(resize);observer.observe(container);
  const contextLost=event=>{event.preventDefault();cancelAnimationFrame(frame);onLost();};renderer.domElement.addEventListener('webglcontextlost',contextLost);
  resize();if(!reduced)play();
  return {pointer,setPaused,carve,previewAt(seconds){cancelAnimationFrame(frame);frame=0;paused=true;frozenTime=seconds;carveStart=performance.now();draw(performance.now(),true);},dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(frame);observer.disconnect();renderer.domElement.removeEventListener('webglcontextlost',contextLost);resources.forEach(item=>item.dispose());environment.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();}};
}
