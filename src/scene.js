import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const PALETTE={sky:'#91dcf1',grass:'#80cd59',road:'#778398',sand:'#ffe4a4',coral:'#ff705c',cream:'#fff9df',blue:'#4cb9e5',wood:'#bd7d4d'};
export class RaceScene {
 constructor(container,race){
  this.container=container;this.race=race;this.mode='follow';this.selected=4;this.cameraReady=false;this.followHeading=0;this.lookTarget=new THREE.Vector3();this.lastFrame=performance.now();this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  this.scene=new THREE.Scene();this.scene.background=new THREE.Color(PALETTE.sky);this.scene.fog=new THREE.Fog(PALETTE.sky,180,470);
  this.camera=new THREE.PerspectiveCamera(59,1,.2,650);
  this.renderer=new THREE.WebGLRenderer({antialias:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.18;
  container.appendChild(this.renderer.domElement);this.renderer.domElement.setAttribute('aria-label','Circuito de karts en 3D. Cámara detrás del piloto; podés cambiar de auto o elegir una vista aérea.');
  this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.enabled=false;this.controls.maxPolarAngle=Math.PI/2.25;this.controls.minDistance=35;this.controls.maxDistance=600;this.controls.enablePan=false;
  this.scene.add(new THREE.HemisphereLight('#e5faff','#aec779',2.1));const sun=new THREE.DirectionalLight('#fff1c9',3.1);sun.position.set(-70,120,-40);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-145,right:145,top:115,bottom:-115,near:1,far:300});sun.shadow.normalBias=.05;sun.shadow.bias=-.0002;this.scene.add(sun);
  this.world=new THREE.Group();this.scene.add(this.world);this.build();
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(container);this.resize();
  this.renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();container.dispatchEvent(new CustomEvent('scene-error',{detail:'La vista 3D se interrumpió. Recargá la página para recuperarla.'}));});
 }
 material(color,opts={}){return new THREE.MeshStandardMaterial({color,roughness:.7,...opts});}
 mesh(geometry,color,parent=this.world,opts={}){const m=new THREE.Mesh(geometry,this.material(color,opts));m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
 box(x,y,z,w,h,d,color,parent=this.world,radius=.1){const mesh=this.mesh(new RoundedBoxGeometry(w,h,d,2,Math.min(radius,w/3,h/3,d/3)),color,parent);mesh.position.set(x,y,z);return mesh;}
 sphere(x,y,z,r,color,parent=this.world,scale=[1,1,1]){const m=this.mesh(new THREE.SphereGeometry(r,20,14),color,parent);m.position.set(x,y,z);m.scale.set(...scale);return m;}
 ribbon(track,inner,outer,y,colors){const positions=[],indices=[],colorArray=[],n=900;for(let i=0;i<=n;i++){const s=i/n*track.length,p=track.at(s),t=track.tangent(s);for(const d of [inner,outer])positions.push(p.x+t.z*d,y,p.z-t.x*d);const col=new THREE.Color(Array.isArray(colors)?colors[Math.floor(i/7)%colors.length]:colors);for(let k=0;k<2;k++)colorArray.push(col.r,col.g,col.b);if(i<n){const j=i*2;indices.push(j,j+1,j+2,j+1,j+3,j+2);}}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colorArray,3));g.setIndex(indices);g.computeVertexNormals();const m=new THREE.Mesh(g,this.material('#ffffff',{vertexColors:true,side:THREE.DoubleSide}));m.receiveShadow=true;this.world.add(m);return m;}
 build(){
  const geometries=new Set(),materials=new Set();this.world.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.geometry)geometries.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));});geometries.forEach(g=>g.dispose());materials.forEach(m=>{m.map?.dispose();m.dispose();});this.world.clear();this.floaters=[];
  const track=this.race.track;
  const island=new THREE.Mesh(new THREE.CylinderGeometry(1,1.035,7,96),[this.material('#eed394'),this.material(PALETTE.grass),this.material('#d8b277')]);island.scale.set(118,1,85);island.position.y=-3.5;island.receiveShadow=true;this.world.add(island);
  const beach=new THREE.Mesh(new THREE.CylinderGeometry(1,1.04,3,96),this.material(PALETTE.sand));beach.scale.set(126,1,92);beach.position.y=-5.4;this.world.add(beach);
  const water=new THREE.Mesh(new THREE.PlaneGeometry(1600,1600),this.material('#54cbdc',{roughness:.35}));water.rotation.x=-Math.PI/2;water.position.y=-7;this.world.add(water);
  this.ribbon(track,-7.8,7.8,.12,'#f6d99b');this.ribbon(track,-6.7,6.7,.18,PALETTE.road);this.ribbon(track,-6,6,.21,PALETTE.road);
  for(const side of [-1,1]){this.ribbon(track,side*6,side*6.75,.24,[PALETTE.coral,PALETTE.cream]);this.ribbon(track,side*5.65,side*5.8,.26,PALETTE.cream);}
  // Soft, oversized scenery keeps the racing line readable from the chase camera.
  let r=this.race.seed;const random=()=>((r=(r*1664525+1013904223)>>>0)/4294967296);
  for(let i=0;i<14;i++){const a=i/14*Math.PI*2,x=Math.sin(a)*(170+random()*40),z=Math.cos(a)*(145+random()*30);const h=20+random()*38;this.sphere(x,-10,z,1,i%3===0?'#76cfc1':i%3===1?'#9bd66b':'#68bea0',this.world,[25+random()*18,h,24+random()*18]);}
  const spots=[];for(let i=0;i<150&&spots.length<52;i++){const x=(random()-.5)*208,z=(random()-.5)*140;if((x/103)**2+(z/69)**2>1||track.nearest(x,z).distance<13)continue;spots.push({x,z,size:.7+random()*.65});}
  const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.45,.65,3.2,9),this.material(PALETTE.wood),spots.length);const crowns=new THREE.InstancedMesh(new THREE.SphereGeometry(2.6,16,12),this.material('#52b96b'),spots.length*3);const dummy=new THREE.Object3D();
  spots.forEach(({x,z,size},i)=>{dummy.position.set(x,1.6*size,z);dummy.rotation.set(0,0,0);dummy.scale.set(size,size,size);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);for(let j=0;j<3;j++){dummy.position.set(x+(j-1)*1.2*size,(4.5+(j===1?1.4:0))*size,z+(j===1?.3:0));dummy.scale.set(size,size*(j===1?1.1:.9),size);dummy.updateMatrix();crowns.setMatrixAt(i*3+j,dummy.matrix);crowns.setColorAt(i*3+j,new THREE.Color(['#55b965','#71cb61','#3faa78'][i%3]));}});trunks.castShadow=true;crowns.castShadow=true;this.world.add(trunks,crowns);
  // Flower beds: instanced petals avoid hundreds of separate draw calls.
  const flowers=[];for(let i=0;i<180;i++){const x=(random()-.5)*200,z=(random()-.5)*133;if(track.nearest(x,z).distance<9||(x/108)**2+(z/73)**2>1)continue;flowers.push({x,z,color:['#fff2a2','#ff9abb','#b5a0ff'][i%3]});}
  const petals=new THREE.InstancedMesh(new THREE.SphereGeometry(.37,7,5),this.material('#fff4bf'),flowers.length*5),centers=new THREE.InstancedMesh(new THREE.SphereGeometry(.23,8,6),this.material('#ffc64d'),flowers.length);
  flowers.forEach(({x,z,color},i)=>{for(let j=0;j<5;j++){const a=j/5*Math.PI*2;dummy.position.set(x+Math.cos(a)*.35,.45,z+Math.sin(a)*.35);dummy.scale.set(1,.45,1);dummy.updateMatrix();petals.setMatrixAt(i*5+j,dummy.matrix);petals.setColorAt(i*5+j,new THREE.Color(color));}dummy.position.set(x,.55,z);dummy.scale.set(1,.7,1);dummy.updateMatrix();centers.setMatrixAt(i,dummy.matrix);});this.world.add(petals,centers);
  for(let i=0;i<12;i++){const cloud=new THREE.Group();cloud.position.set((random()-.5)*340,45+random()*25,(random()-.5)*280);for(let j=0;j<4;j++)this.sphere((j-1.5)*4,Math.sin(j)*2,0,4.6,'#ffffff',cloud,[1.2,.75,1]);cloud.traverse(o=>{o.castShadow=false;});this.world.add(cloud);this.floaters.push({mesh:cloud,y:cloud.position.y,phase:i,speed:.14,amplitude:.6});}
  this.buildStart(track);
  this.buildStands();
  for(const [x,z,c] of [[-92,-34,'#ff987a'],[59,-72,'#aa9aef'],[89,40,'#ffd864']])this.balloon(x,24+random()*8,z,c);
  // Colourful roadside flags and a few chevrons show corners without knowing the entire route.
  for(let s=15;s<track.length;s+=27){const p=track.at(s),t=track.tangent(s),side=Math.floor(s/27)%2===0?1:-1,x=p.x+t.z*side*9.4,z=p.z-t.x*side*9.4;this.box(x,2.3,z,.13,4.6,.13,'#fffbe7');const flag=this.box(x+.62,3.65,z,1.35,1.2,.06,['#ff836b','#ffd65a','#69c6e3'][Math.floor(s/27)%3]);flag.rotation.y=Math.atan2(t.x,t.z);}
  this.carMeshes=this.race.cars.map(car=>this.createCar(car));this.cameraReady=false;this.frameTrackIfNeeded();
 }
 buildStart(track){const p=track.at(4),t=track.tangent(4),finish=new THREE.Group();finish.position.copy(p);finish.rotation.y=Math.atan2(t.x,t.z);this.world.add(finish);
  for(let x=0;x<12;x++)for(let z=0;z<3;z++)this.box(x-5.5,.29,z*.6,.99,.04,.59,(x+z)%2?'#fff8dd':'#49526a',finish,.01);
  this.box(-7.65,3.8,.3,1,7.6,1,PALETTE.coral,finish,.35);this.box(7.65,3.8,.3,1,7.6,1,PALETTE.coral,finish,.35);this.box(0,7.6,.3,17.7,2.4,1.25,PALETTE.coral,finish,.55);
  this.box(0,7.62,-.4,13.8,1.75,.1,'#fff4d6',finish,.3);this.box(0,7.62,1,13.8,1.75,.1,'#fff4d6',finish,.3);
  const sign=this.text('APEX   GRAND PRIX','#d95845',1024,160);sign.scale.set(12.5,1.45,1);sign.position.set(0,7.6,1.08);finish.add(sign);const reverse=sign.clone();reverse.position.z=-.48;reverse.rotation.y=Math.PI;finish.add(reverse);
  for(const side of [-1,1])for(let j=0;j<3;j++){this.sphere(side*(8.8+j*.8),9.5+j*.8,.3,1.25,['#ffd252','#8ecde8','#b79eec'][j],finish,[1,1.2,1]);const string=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(side*8,5,.3),new THREE.Vector3(side*(8.8+j*.8),9.5+j*.8,.3)]),new THREE.LineBasicMaterial({color:'#ddd6b3'}));finish.add(string);}
 }
 buildStands(){for(let i=0;i<5;i++){const x=-32+i*11;this.box(x,2,56,9,4,7,['#ffe1a1','#ffa18b','#acdfe1','#b7a8eb','#a2d899'][i],this.world,.5);this.box(x,4.5,56,10.2,1.1,8,'#fff6db',this.world,.45);this.box(x,1.65,52.42,6.4,2.4,.12,'#638aa0');}
  for(let j=0;j<4;j++)this.box(40,1+j*.8,-49-j*2,36,.85,2.2,['#ffd27a','#f9a1a6','#95d7e4','#c6b6ef'][j],this.world,.25);this.box(40,5.6,-53,39,.65,12,'#fff6dc',this.world,.3);for(const x of [23,57])this.box(x,3,-53,.3,6,.3,'#9cbdc1');}
 balloon(x,y,z,color){const g=new THREE.Group();g.position.set(x,y,z);this.world.add(g);this.sphere(0,0,0,4,color,g,[1,1.22,1]);this.sphere(0,-3.2,0,2,'#fff2ce',g,[1,.8,1]);this.box(0,-6.5,0,1.8,1.3,1.5,'#d49a5a',g,.3);for(const x of [-.7,.7])this.box(x,-5,0,.07,2.8,.07,'#c69d68',g);this.floaters.push({mesh:g,y,phase:x,speed:.5,amplitude:.8});}
 text(str,color,width=512,height=128){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.font=`900 ${height*.60}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(str,width/2,height/2,width*.96);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:texture,transparent:true,side:THREE.DoubleSide,depthWrite:false}));}
 createCar(car){
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);this.world.add(root);const col=car.color;
  this.box(0,.52,0,1.65,.48,2.65,col,body,.22);this.box(0,.8,1.04,1.55,.50,1.1,col,body,.24);this.box(0,.38,1.7,2.1,.22,.42,'#fff2d7',body,.10);this.box(0,.59,-1.25,1.8,.7,.48,col,body,.18);
  for(const x of [-.79,.79])this.box(x,.76,-.03,.42,.40,1.3,col,body,.15);
  this.box(0,.84,-.18,.85,.40,.8,'#3e526e',body,.15);this.box(0,1.3,-.51,.85,.8,.32,'#3e526e',body,.15);
  this.sphere(0,1.48,-.17,.42,col,body,[.9,1.15,.8]);this.sphere(0,2.08,-.19,.58,'#fff5d8',body,[1,1,.92]);this.sphere(0,2.12,-.23,.59,col,body,[1,1,.90]);this.sphere(0,2.04,.22,.44,'#354b6b',body,[1,.40,.25]);
  const stripe=this.box(0,2.61,-.17,.17,.04,.57,'#fff7e2',body,.02);
  const wheel=new THREE.Mesh(new THREE.TorusGeometry(.28,.06,7,14),this.material('#38485e'));wheel.rotation.x=Math.PI/2-.5;wheel.position.set(0,1.31,.54);body.add(wheel);for(const side of [-1,1])this.sphere(side*.26,1.36,.48,.13,'#fff2dc',body);
  const wheels=[];for(const x of [-1.04,1.04])for(const z of [-.91,1.03]){const pivot=new THREE.Group();pivot.position.set(x,.45,z);root.add(pivot);const tire=this.mesh(new THREE.CylinderGeometry(.49,.49,.47,16), '#334052',pivot);tire.rotation.z=Math.PI/2;const hub=this.mesh(new THREE.CylinderGeometry(.27,.27,.49,16),'#fff1d3',pivot);hub.rotation.z=Math.PI/2;const center=this.mesh(new THREE.CylinderGeometry(.13,.13,.51,12),col,pivot);center.rotation.z=Math.PI/2;wheels.push({pivot,tire,hub,front:z>0});}
  for(const x of [-.62,.62])this.box(x,.84,-1.51,.28,.17,.035,'#ffdd87',body,.04);
  const number=this.text(car.number,'#ffffff',128,128);number.scale.set(.62,.62,1);number.rotation.x=-Math.PI/2;number.position.set(0,1.07,1.07);body.add(number);
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=72;const ctx=canvas.getContext('2d');ctx.fillStyle='#fffbeb';ctx.beginPath();ctx.roundRect(4,4,248,62,20);ctx.fill();ctx.fillStyle='#33435c';ctx.font='800 33px sans-serif';ctx.textAlign='center';ctx.fillText(car.name,128,47);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const label=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:true}));label.scale.set(3.3,.93,1);label.position.set(0,3.65,0);root.add(label);
  root.userData={body,wheels,label};return root;
 }
 resize(){const {width,height}=this.container.getBoundingClientRect();if(!width||!height)return;this.renderer.setSize(width,height);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.frameTrackIfNeeded();}
 frameTrackIfNeeded(){if(this.mode!=='follow'&&this.race.track)this.frameTrack();}
 frameTrack(){this.camera.fov=40;this.camera.updateProjectionMatrix();const bounds=new THREE.Box3().setFromPoints(this.race.track.samples),center=bounds.getCenter(new THREE.Vector3());const direction=this.mode==='top'?new THREE.Vector3(0,1,.001):this.camera.aspect<.9?new THREE.Vector3(1.25,1.7,.25):new THREE.Vector3(.7,1,.85);direction.normalize();let distance=260;for(let pass=0;pass<6;pass++){this.camera.position.copy(center).addScaledVector(direction,distance);this.camera.lookAt(center);this.camera.updateMatrixWorld();let x=0,y=0;for(let i=0;i<this.race.track.samples.length;i+=15){const p=this.race.track.samples[i];for(const dx of [-9,9])for(const dz of [-9,9]){const q=new THREE.Vector3(p.x+dx,2,p.z+dz).project(this.camera);x=Math.max(x,Math.abs(q.x));y=Math.max(y,Math.abs(q.y));}}const factor=Math.max(x/.9,y/.65);if(Math.abs(factor-1)<.01)break;distance*=THREE.MathUtils.clamp(factor,.75,1.6);}this.controls.target.copy(center);this.controls.update();}
 setCamera(mode){this.mode=mode;this.controls.enabled=mode==='orbit';this.cameraReady=false;if(mode!=='follow')this.frameTrack();}
 selectDriver(index){this.selected=THREE.MathUtils.clamp(index,0,this.race.cars.length-1);this.setCamera('follow');}
 render(){
  const now=performance.now(),dt=Math.min((now-this.lastFrame)/1000,.05);this.lastFrame=now;const ease=1-Math.exp(-8*dt);
  this.race.cars.forEach((c,i)=>{const mesh=this.carMeshes[i];mesh.position.set(c.x,.25,c.z);mesh.rotation.y=c.heading;mesh.userData.body.rotation.z=THREE.MathUtils.lerp(mesh.userData.body.rotation.z,-c.steer*Math.min(c.speed/25,1)*.13,ease);mesh.userData.body.position.y=this.reducedMotion?0:Math.sin(c.distance*3)*Math.min(c.speed*.0015,.028);mesh.userData.wheels.forEach(w=>{w.pivot.rotation.y=w.front?c.steer*.30:0;w.tire.rotation.x=c.distance/.49;w.hub.rotation.x=c.distance/.49;});mesh.userData.label.visible=this.mode!=='follow'||i!==this.selected;mesh.userData.label.scale.setScalar(this.mode==='follow'?1:1.6);mesh.userData.label.scale.multiply(new THREE.Vector3(3.3,.93,1));});
  const car=this.race.cars[this.selected];
  if(this.mode==='follow'){
   if(!this.cameraReady){this.followHeading=car.heading;this.lookTarget.set(car.x,1.6,car.z);}
   const headingDelta=Math.atan2(Math.sin(car.heading-this.followHeading),Math.cos(car.heading-this.followHeading));this.followHeading+=headingDelta*(this.reducedMotion?1:1-Math.exp(-10*dt));
   const distance=this.camera.aspect<.8?10.8:9.3,up=this.camera.aspect<.8?5.1:4.8;
   const desired=new THREE.Vector3(car.x-Math.sin(this.followHeading)*distance,up,car.z-Math.cos(this.followHeading)*distance);
   const look=new THREE.Vector3(car.x+Math.sin(this.followHeading)*7.5,1.4,car.z+Math.cos(this.followHeading)*7.5);
   if(!this.cameraReady||this.reducedMotion){this.camera.position.copy(desired);this.lookTarget.copy(look);}else{this.camera.position.lerp(desired,1-Math.exp(-12*dt));this.lookTarget.lerp(look,1-Math.exp(-10*dt));}
   const fov=(this.camera.aspect<.8?66:61)+(this.reducedMotion?0:Math.min(car.speed*.17,5));this.camera.fov=THREE.MathUtils.lerp(this.camera.fov,fov,this.cameraReady?ease:1);this.camera.updateProjectionMatrix();this.camera.lookAt(this.lookTarget);this.cameraReady=true;
  }else if(this.mode==='orbit')this.controls.update();
  this.carMeshes.forEach((mesh,i)=>{const distance=mesh.position.distanceTo(this.camera.position);mesh.visible=this.mode!=='follow'||i===this.selected||distance>5.5;mesh.userData.label.visible=this.mode!=='follow'||(i!==this.selected&&distance>16&&distance<100);});
  if(!this.reducedMotion)this.floaters.forEach(f=>{f.mesh.position.y=f.y+Math.sin(now/1000*f.speed+f.phase)*f.amplitude;});
  this.renderer.render(this.scene,this.camera);
 }
}
