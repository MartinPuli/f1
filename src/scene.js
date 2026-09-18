import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class RaceScene {
 constructor(container,race){
  this.container=container;this.race=race;this.mode='orbit';this.selected=0;this.vision=false;
  this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#111917');this.scene.fog=new THREE.Fog('#111917',260,540);
  this.camera=new THREE.PerspectiveCamera(38,1,1,800);this.camera.position.set(133,177,158);
  this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.4;
  container.appendChild(this.renderer.domElement);this.renderer.domElement.setAttribute('aria-label','Circuito 3D con cinco pilotos. Arrastrá para girar y usá la rueda para acercarte.');
  this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.target.set(0,0,0);this.controls.enableDamping=true;this.controls.maxPolarAngle=Math.PI/2.2;this.controls.minDistance=30;this.controls.maxDistance=650;this.controls.enablePan=false;
  this.scene.add(new THREE.HemisphereLight('#d5eee1','#304130',2.3));const light=new THREE.DirectionalLight('#ffe4b5',3.3);light.position.set(-80,130,40);light.castShadow=true;light.shadow.mapSize.set(2048,2048);Object.assign(light.shadow.camera,{left:-140,right:140,top:110,bottom:-110,near:1,far:330});light.shadow.bias=-.001;this.scene.add(light);
  this.world=new THREE.Group();this.scene.add(this.world);this.build();
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(container);this.resize();
 }
 material(color,opts={}){return new THREE.MeshStandardMaterial({color,roughness:.85,...opts});}
 box(x,y,z,w,h,d,color,parent=this.world){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),this.material(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
 ribbon(track,inner,outer,y,colors){const positions=[],indices=[],colorArray=[];const n=900;for(let i=0;i<=n;i++){const s=i/n*track.length,p=track.at(s),t=track.tangent(s);for(const d of [inner,outer])positions.push(p.x+t.z*d,y,p.z-t.x*d);const col=new THREE.Color(Array.isArray(colors)?colors[Math.floor(i/5)%colors.length]:colors);for(let k=0;k<2;k++)colorArray.push(col.r,col.g,col.b);if(i<n){const j=i*2;indices.push(j,j+1,j+2,j+1,j+3,j+2);}}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colorArray,3));g.setIndex(indices);g.computeVertexNormals();const m=new THREE.Mesh(g,this.material('#ffffff',{vertexColors:true,side:THREE.DoubleSide}));m.receiveShadow=true;this.world.add(m);return m;}
 build(){
  this.world.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>{m.map?.dispose();m.dispose();});}});this.world.clear();const track=this.race.track;
  const island=this.box(0,-3.4,0,205,6,142,'#273b30');const edges=new THREE.LineSegments(new THREE.EdgesGeometry(island.geometry),new THREE.LineBasicMaterial({color:'#4d6651',transparent:true,opacity:.3}));edges.position.copy(island.position);this.world.add(edges);
  this.ribbon(track,-9,9,.015,'#526154');this.ribbon(track,-7.5,7.5,.045,'#374a43');
  this.ribbon(track,-6,6,.08,'#252d2e');
  for(const side of [-1,1]){this.ribbon(track,side*6,side*6.85,.10,['#d4dfcc','#c8453b']);this.ribbon(track,side*5.68,side*5.79,.12,'#d9ddcf');this.ribbon(track,side*9.5,side*9.75,.13,'#677b6a');}
  // Start / finish markings laid across the track.
  const p=track.at(4),t=track.tangent(4),yaw=Math.atan2(t.x,t.z),finish=new THREE.Group();finish.position.copy(p);finish.rotation.y=yaw;this.world.add(finish);
  for(let x=0;x<12;x++)for(let z=0;z<3;z++)this.box(x-5.5,.14,z*.65,.98,.025,.65,(x+z)%2?'#e7eadf':'#202629',finish);
  this.box(-8,4,1,.45,8,.45,'#78867f',finish);this.box(8,4,1,.45,8,.45,'#78867f',finish);this.box(0,7.8,1,17,1.7,.8,'#172220',finish);
  const banner=this.text('APEX / UNKNOWN','#d9ff73',1024,100);banner.scale.set(14,1.4,1);banner.position.set(0,7.9,1.45);finish.add(banner);
  // Pit buildings and grandstands on the outside of the main straight.
  for(let i=0;i<6;i++){this.box(-25+i*10,2.2,54,8,4.4,7,'#879185');this.box(-25+i*10,4.6,54,8.7,.35,8,'#c4d0b9');this.box(-25+i*10,2.4,50.4,6.5,2.3,.13,'#283d3e');this.box(-25+i*10,.8,50.2,7,.2,.2,'#caff61');}
  for(let j=0;j<5;j++){this.box(43,1+j*.65,-48-j*1.6,40,.7,1.7,j%2?'#61726d':'#9aac9f');}
  this.box(43,5.2,-53,43,.6,12,'#b9c8b1');
  let r=this.race.seed;const rand=()=>((r=(r*1664525+1013904223)>>>0)/4294967296);
  const treeG=new THREE.ConeGeometry(2,5,7),treeM=this.material('#3a6046'),trunkG=new THREE.CylinderGeometry(.22,.3,2,5),trunkM=this.material('#5b5541');
  for(let i=0;i<140;i++){const x=(rand()-.5)*190,z=(rand()-.5)*126;if(track.nearest(x,z).distance<14||z>45&&x>-34&&x<39||z< -41&&x>18&&x<68)continue;const trunk=new THREE.Mesh(trunkG,trunkM);trunk.position.set(x,1,z);this.world.add(trunk);const crown=new THREE.Mesh(treeG,treeM);crown.position.set(x,4,z);const size=.65+rand()*.8;crown.scale.setScalar(size);crown.castShadow=true;this.world.add(crown);}
  for(let s=0;s<track.length;s+=38){const p=track.at(s),t=track.tangent(s);const x=p.x+t.z*10,z=p.z-t.x*10;this.box(x,3.5,z,.16,7,.16,'#71847b');this.box(x,7,z,1.9,.15,.7,'#dde8ce');}
  const word=this.text('UNKNOWN VALLEY','#788c72',1024,160);word.rotation.x=-Math.PI/2;word.position.set(-33,.1,5);word.scale.set(37,5.8,1);this.world.add(word);
  this.carMeshes=this.race.cars.map(car=>this.createCar(car));
  this.visionMesh=new THREE.Mesh(new THREE.CircleGeometry(42,48,Math.PI/2-.47,.94),new THREE.MeshBasicMaterial({color:'#ceff5e',transparent:true,opacity:.10,side:THREE.DoubleSide,depthWrite:false}));this.visionMesh.rotation.x=-Math.PI/2;this.world.add(this.visionMesh);
 }
 text(str,color,width=512,height=128){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.font=`700 ${height*.62}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(str,width/2,height/2);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:texture,transparent:true,side:THREE.DoubleSide,depthWrite:false}));}
 createCar(car){const g=new THREE.Group();this.world.add(g);const col=car.color;
  this.box(0,.62,0,1.18,.48,3.1,col,g);this.box(0,.45,1.85,.42,.28,1.6,col,g);this.box(0,.31,2.45,2.3,.14,.55,col,g);this.box(0,1.02,-1.65,2.25,.16,.55,col,g);this.box(0,.64,-1.6,.16,.65,.2,'#1b2020',g);this.box(0,.7,-.15,.7,.38,.9,'#172022',g);
  for(const x of [-.98,.98])for(const z of [-1.05,1.3]){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.45,.45,.4,12),this.material('#111716'));wheel.rotation.z=Math.PI/2;wheel.position.set(x,.43,z);wheel.castShadow=true;g.add(wheel);const rim=new THREE.Mesh(new THREE.CylinderGeometry(.23,.23,.415,12),this.material('#7c867e'));rim.rotation.z=Math.PI/2;rim.position.copy(wheel.position);g.add(rim);}
  const helmet=new THREE.Mesh(new THREE.SphereGeometry(.29,12,8),this.material('#e1e7d7'));helmet.position.set(0,1.03,-.15);g.add(helmet);
  const ring=new THREE.Mesh(new THREE.RingGeometry(2.1,2.2,40),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.6,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.18;g.add(ring);g.userData.ring=ring;
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=80;const ctx=canvas.getContext('2d');ctx.fillStyle='#111917dd';ctx.roundRect(8,5,240,67,16);ctx.fill();ctx.fillStyle=col;ctx.font='bold 36px sans-serif';ctx.textAlign='center';ctx.fillText(car.name,128,51);const label=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),depthTest:false}));label.scale.set(9,2.8,1);label.position.set(0,5.5,0);g.add(label);return g;
 }
 resize(){const {width,height}=this.container.getBoundingClientRect();if(!width||!height)return;this.renderer.setSize(width,height);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();if(this.mode!=='follow')this.frameTrack();}
 frameTrack(){
  const bounds=new THREE.Box3().setFromPoints(this.race.track.samples),center=bounds.getCenter(new THREE.Vector3());
  const direction=this.mode==='top'?new THREE.Vector3(0,1,.0001):this.camera.aspect<.9?new THREE.Vector3(1.25,1.7,.25):new THREE.Vector3(.7,1,.85);
  direction.normalize();let distance=260;
  const points=this.race.track.samples.filter((_,i)=>i%10===0);
  for(let pass=0;pass<6;pass++){
   this.camera.position.copy(center).addScaledVector(direction,distance);this.camera.lookAt(center);this.camera.updateMatrixWorld();
   let extentX=0,extentY=0;
   for(const p of points)for(const dx of [-9,9])for(const dz of [-9,9]){const q=new THREE.Vector3(p.x+dx,2,p.z+dz).project(this.camera);extentX=Math.max(extentX,Math.abs(q.x));extentY=Math.max(extentY,Math.abs(q.y));}
   const factor=Math.max(extentX/.90,extentY/.68);if(Math.abs(factor-1)<.01)break;distance*=THREE.MathUtils.clamp(factor,.75,1.6);
  }
  this.controls.target.copy(center);this.controls.update();
 }
 setCamera(mode){this.mode=mode;this.controls.enabled=mode==='orbit';if(mode!=='follow')this.frameTrack();}
 render(){this.race.cars.forEach((c,i)=>{const mesh=this.carMeshes[i];mesh.position.set(c.x,.15,c.z);mesh.rotation.y=c.heading;mesh.userData.ring.visible=i===this.selected;});const car=this.race.cars[this.selected];
  if(this.mode==='follow'){const pos=new THREE.Vector3(car.x-Math.sin(car.heading)*22,15,car.z-Math.cos(car.heading)*22);this.camera.position.lerp(pos,.055);this.camera.lookAt(car.x+Math.sin(car.heading)*9,1,car.z+Math.cos(car.heading)*9);}else if(this.mode==='orbit')this.controls.update();
  this.visionMesh.visible=this.vision;this.visionMesh.position.set(car.x,.2,car.z);this.visionMesh.rotation.z=-car.heading+Math.PI;
  this.renderer.render(this.scene,this.camera);
 }
}
