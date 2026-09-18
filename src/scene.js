import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const PALETTE={sky:'#b7e4ed',grass:'#a6ca79',road:'#697884',sand:'#f3dfb2',coral:'#ee8069',cream:'#fff9df',blue:'#4cb9e5',wood:'#bd7d4d'};
export class RaceScene {
 constructor(container,race){
  this.container=container;this.race=race;this.mode='follow';this.selected=4;this.orbitAngle=0;this.orbitHeight=0;this.cameraReady=false;this.followHeading=0;this.lookTarget=new THREE.Vector3();this.lastFrame=performance.now();this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  this.scene=new THREE.Scene();this.scene.background=new THREE.Color(PALETTE.sky);this.scene.fog=new THREE.Fog(PALETTE.sky,180,470);
  this.camera=new THREE.PerspectiveCamera(59,1,.2,650);
  this.renderer=new THREE.WebGLRenderer({antialias:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;
  container.appendChild(this.renderer.domElement);this.renderer.domElement.setAttribute('aria-label','3D Formula racing circuit. Drag to orbit the selected driver; choose another driver or an aerial view.');
  this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.enabled=false;this.controls.maxPolarAngle=Math.PI/2.25;this.controls.minDistance=35;this.controls.maxDistance=600;this.controls.enablePan=false;
  this.scene.add(new THREE.HemisphereLight('#e5faff','#aec779',2.1));const sun=new THREE.DirectionalLight('#fff1c9',3.1);sun.position.set(-70,120,-40);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-145,right:145,top:115,bottom:-115,near:1,far:300});sun.shadow.normalBias=.05;sun.shadow.bias=-.0002;this.scene.add(sun);
  let pointer=null;const canvas=this.renderer.domElement;
  canvas.addEventListener('pointerdown',e=>{if(this.mode!=='follow')return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!pointer||pointer.id!==e.pointerId)return;this.orbitAngle-=(e.clientX-pointer.x)*.007;this.orbitHeight=THREE.MathUtils.clamp(this.orbitHeight+(e.clientY-pointer.y)*.035,-2,9);pointer.x=e.clientX;pointer.y=e.clientY;});
  canvas.addEventListener('pointerup',()=>pointer=null);canvas.addEventListener('pointercancel',()=>pointer=null);canvas.addEventListener('dblclick',()=>{this.orbitAngle=0;this.orbitHeight=0;});
  this.world=new THREE.Group();this.scene.add(this.world);this.build();
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(container);this.resize();
  this.renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();container.dispatchEvent(new CustomEvent('scene-error',{detail:'The 3D view was interrupted. Reload the page to recover it.'}));});
 }
 material(color,opts={}){return new THREE.MeshStandardMaterial({color,roughness:.7,...opts});}
 mesh(geometry,color,parent=this.world,opts={}){const m=new THREE.Mesh(geometry,this.material(color,opts));m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
 box(x,y,z,w,h,d,color,parent=this.world,radius=.1){const mesh=this.mesh(new RoundedBoxGeometry(w,h,d,2,Math.min(radius,w/3,h/3,d/3)),color,parent);mesh.position.set(x,y,z);return mesh;}
 sphere(x,y,z,r,color,parent=this.world,scale=[1,1,1]){const m=this.mesh(new THREE.SphereGeometry(r,20,14),color,parent);m.position.set(x,y,z);m.scale.set(...scale);return m;}
 ribbon(track,inner,outer,y,colors){const positions=[],indices=[],colorArray=[],n=900;for(let i=0;i<=n;i++){const s=i/n*track.length,p=track.at(s),t=track.tangent(s);for(const d of [inner,outer])positions.push(p.x+t.z*d,y,p.z-t.x*d);const col=new THREE.Color(Array.isArray(colors)?colors[Math.floor(i/7)%colors.length]:colors);for(let k=0;k<2;k++)colorArray.push(col.r,col.g,col.b);if(i<n){const j=i*2;indices.push(j,j+1,j+2,j+1,j+3,j+2);}}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colorArray,3));g.setIndex(indices);g.computeVertexNormals();const m=new THREE.Mesh(g,this.material('#ffffff',{vertexColors:true,side:THREE.DoubleSide}));m.receiveShadow=true;this.world.add(m);return m;}
 build(){
  const geometries=new Set(),materials=new Set();this.world.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.geometry)geometries.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));});geometries.forEach(g=>g.dispose());materials.forEach(m=>{m.map?.dispose();m.dispose();});this.world.clear();this.floaters=[];
  const track=this.race.track;
  const island=new THREE.Mesh(new THREE.CylinderGeometry(1,1.035,7,96),[this.material('#eed394'),this.material(PALETTE.grass),this.material('#d8b277')]);island.scale.set(142,1,142);island.position.y=-3.5;island.receiveShadow=true;this.world.add(island);
  const beach=new THREE.Mesh(new THREE.CylinderGeometry(1,1.04,3,96),this.material(PALETTE.sand));beach.scale.set(150,1,150);beach.position.y=-5.4;this.world.add(beach);
  const water=new THREE.Mesh(new THREE.PlaneGeometry(1600,1600),this.material('#78c6ce',{roughness:.35}));water.rotation.x=-Math.PI/2;water.position.y=-7;this.world.add(water);
  this.ribbon(track,-7.8,7.8,.12,'#f6d99b');this.ribbon(track,-6.7,6.7,.18,PALETTE.road);this.ribbon(track,-6,6,.21,PALETTE.road);
  for(const side of [-1,1]){this.ribbon(track,side*6,side*6.75,.24,[PALETTE.coral,PALETTE.cream]);this.ribbon(track,side*5.65,side*5.8,.26,PALETTE.cream);}
  // Soft, oversized scenery keeps the racing line readable from the chase camera.
  let r=this.race.seed;const random=()=>((r=(r*1664525+1013904223)>>>0)/4294967296);
  for(let i=0;i<14;i++){const a=i/14*Math.PI*2,x=Math.sin(a)*(170+random()*40),z=Math.cos(a)*(145+random()*30);const h=20+random()*38;this.sphere(x,-10,z,1,i%3===0?'#76cfc1':i%3===1?'#9bd66b':'#68bea0',this.world,[25+random()*18,h,24+random()*18]);}
  const spots=[];for(let i=0;i<150&&spots.length<52;i++){const x=(random()-.5)*208,z=(random()-.5)*140;if((x/103)**2+(z/69)**2>1||track.nearest(x,z).distance<13)continue;spots.push({x,z,size:.7+random()*.65});}
  const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.45,.65,3.2,9),this.material(PALETTE.wood),spots.length);const crowns=new THREE.InstancedMesh(new THREE.SphereGeometry(2.6,16,12),this.material('#52b96b'),spots.length*3);const dummy=new THREE.Object3D();
  spots.forEach(({x,z,size},i)=>{dummy.position.set(x,1.6*size,z);dummy.rotation.set(0,0,0);dummy.scale.set(size,size,size);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);for(let j=0;j<3;j++){dummy.position.set(x+(j-1)*1.2*size,(4.5+(j===1?1.4:0))*size,z+(j===1?.3:0));dummy.scale.set(size,size*(j===1?1.1:.9),size);dummy.updateMatrix();crowns.setMatrixAt(i*3+j,dummy.matrix);crowns.setColorAt(i*3+j,new THREE.Color(['#73ad70','#90bb6c','#66a986'][i%3]));}});trunks.castShadow=true;crowns.castShadow=true;this.world.add(trunks,crowns);
  // Flower beds: instanced petals avoid hundreds of separate draw calls.
  const flowers=[];for(let i=0;i<180;i++){const x=(random()-.5)*200,z=(random()-.5)*133;if(track.nearest(x,z).distance<9||(x/108)**2+(z/73)**2>1)continue;flowers.push({x,z,color:['#fff2a2','#ff9abb','#b5a0ff'][i%3]});}
  const petals=new THREE.InstancedMesh(new THREE.SphereGeometry(.37,7,5),this.material('#fff4bf'),flowers.length*5),centers=new THREE.InstancedMesh(new THREE.SphereGeometry(.23,8,6),this.material('#ffc64d'),flowers.length);
  flowers.forEach(({x,z,color},i)=>{for(let j=0;j<5;j++){const a=j/5*Math.PI*2;dummy.position.set(x+Math.cos(a)*.35,.45,z+Math.sin(a)*.35);dummy.scale.set(1,.45,1);dummy.updateMatrix();petals.setMatrixAt(i*5+j,dummy.matrix);petals.setColorAt(i*5+j,new THREE.Color(color));}dummy.position.set(x,.55,z);dummy.scale.set(1,.7,1);dummy.updateMatrix();centers.setMatrixAt(i,dummy.matrix);});this.world.add(petals,centers);
  for(let i=0;i<12;i++){const cloud=new THREE.Group();cloud.position.set((random()-.5)*340,45+random()*25,(random()-.5)*280);for(let j=0;j<4;j++)this.sphere((j-1.5)*4,Math.sin(j)*2,0,4.6,'#ffffff',cloud,[1.2,.75,1]);cloud.traverse(o=>{o.castShadow=false;});this.world.add(cloud);this.floaters.push({mesh:cloud,y:cloud.position.y,phase:i,speed:.14,amplitude:.6});}
  this.buildStart(track);
  // Place the paddock outside the generated circuit, never on the roadway.
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
  const sign=this.text('JEVRACE','#d95845',1024,160);sign.scale.set(12.5,1.45,1);sign.position.set(0,7.6,1.08);finish.add(sign);const reverse=sign.clone();reverse.position.z=-.48;reverse.rotation.y=Math.PI;finish.add(reverse);
  for(const side of [-1,1])for(let j=0;j<3;j++){this.sphere(side*(8.8+j*.8),9.5+j*.8,.3,1.25,['#ffd252','#8ecde8','#b79eec'][j],finish,[1,1.2,1]);const string=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(side*8,5,.3),new THREE.Vector3(side*(8.8+j*.8),9.5+j*.8,.3)]),new THREE.LineBasicMaterial({color:'#ddd6b3'}));finish.add(string);}
 }
 buildStands(){const bounds=new THREE.Box3().setFromPoints(this.race.track.samples);const z=bounds.max.z+17;
  for(let i=0;i<5;i++){const x=-24+i*12;this.box(x,2,z,10,4,7,['#e5aa8c','#d5c4ea','#c3dbe1','#e4d4a4','#b7ceb5'][i],this.world,.35);this.box(x,4.5,z,11,1.1,8,'#fff6df',this.world,.3);this.box(x,1.65,z-3.58,7,2.4,.12,'#668b9a');}
 }
 balloon(x,y,z,color){const g=new THREE.Group();g.position.set(x,y,z);this.world.add(g);this.sphere(0,0,0,4,color,g,[1,1.22,1]);this.sphere(0,-3.2,0,2,'#fff2ce',g,[1,.8,1]);this.box(0,-6.5,0,1.8,1.3,1.5,'#d49a5a',g,.3);for(const x of [-.7,.7])this.box(x,-5,0,.07,2.8,.07,'#c69d68',g);this.floaters.push({mesh:g,y,phase:x,speed:.5,amplitude:.8});}
 text(str,color,width=512,height=128){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.font=`900 ${height*.60}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(str,width/2,height/2,width*.96);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:texture,transparent:true,side:THREE.DoubleSide,depthWrite:false}));}
 createCar(car){
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);this.world.add(root);const col=car.color;
  const dark='#263848',trim='#fff6df';
  // Open-wheel single seater: tapered nose, low sidepods, exposed slicks and two wings.
  this.box(0,.42,0,1.3,.40,3.65,col,body,.16);
  const nose=this.mesh(new THREE.CylinderGeometry(.25,.51,2.4,4),col,body);nose.rotation.x=Math.PI/2;nose.rotation.z=Math.PI/4;nose.position.set(0,.65,1.50);nose.scale.y=1;
  this.box(0,.38,2.62,2.85,.13,.62,dark,body,.04);this.box(0,.52,2.69,2.65,.08,.25,col,body,.025);
  for(const x of [-1.38,1.38])this.box(x,.53,2.6,.09,.44,.72,col,body,.025);
  for(const x of [-.70,.70]){this.box(x,.63,-.35,.65,.47,1.65,col,body,.17);this.box(x,.72,.4,.4,.2,.08,dark,body,.035);this.box(x,.44,-.2,.04,.04,1.55,trim,body,.01);}
  this.box(0,.79,-.10,.78,.30,1.13,dark,body,.17);
  this.box(0,1,-.93,.63,.77,1.0,col,body,.19);
  this.box(0,1.39,-.89,.32,.23,.34,dark,body,.05);
  this.box(0,.84,-2,.13,1.05,.23,dark,body,.03);
  this.box(0,1.43,-2.1,2.52,.16,.74,col,body,.04);this.box(0,1.6,-2.22,2.45,.1,.3,trim,body,.03);
  for(const x of [-1.23,1.23])this.box(x,1.36,-2.12,.08,.65,.88,col,body,.02);
  this.sphere(0,1.24,-.15,.35,trim,body,[1,1,.94]);this.sphere(0,1.28,-.19,.35,col,body,[1,1,.92]);this.sphere(0,1.22,.13,.29,dark,body,[1,.36,.22]);
  const halo=new THREE.Mesh(new THREE.TorusGeometry(.52,.045,6,18,Math.PI*1.55),this.material(dark));halo.rotation.x=Math.PI/2;halo.rotation.z=-.86;halo.scale.y=1.3;halo.position.set(0,1.4,.12);body.add(halo);this.box(0,1.1,.75,.06,.6,.07,dark,body,.02);
  const wheels=[];for(const x of [-1.23,1.23])for(const z of [-1.43,1.48]){const pivot=new THREE.Group();pivot.position.set(x,.48,z);root.add(pivot);const tire=this.mesh(new THREE.CylinderGeometry(.51,.51,.51,20),dark,pivot);tire.rotation.z=Math.PI/2;const hub=this.mesh(new THREE.CylinderGeometry(.29,.29,.53,16),'#526372',pivot);hub.rotation.z=Math.PI/2;const center=this.mesh(new THREE.CylinderGeometry(.11,.11,.55,12),trim,pivot);center.rotation.z=Math.PI/2;
   for(const side of [-1,1]){const ring=new THREE.Mesh(new THREE.TorusGeometry(.39,.024,5,20),this.material('#e8ce79'));ring.rotation.y=Math.PI/2;ring.position.x=side*.263;pivot.add(ring);}
   const arm=this.box(x*.6,.5,z,.9,.075,.1,dark,body,.02);arm.rotation.y=x>0?.22:-.22;wheels.push({pivot,tire,hub,front:z>0});}
  const number=this.text(car.number,trim,128,128);number.scale.set(.5,.68,1);number.rotation.x=-Math.PI/2;number.position.set(0,.9,1.45);body.add(number);
  const labelMesh=this.text(car.short,dark,512,100);const texture=labelMesh.material.map;labelMesh.geometry.dispose();labelMesh.material.dispose();
  const label=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:true}));label.scale.set(5.2,1,1);label.position.set(0,3.1,0);root.add(label);
  root.userData={body,wheels,label};return root;
 }
 resize(){const {width,height}=this.container.getBoundingClientRect();if(!width||!height)return;this.renderer.setSize(width,height);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.frameTrackIfNeeded();}
 frameTrackIfNeeded(){if(this.mode!=='follow'&&this.race.track)this.frameTrack();}
 frameTrack(){this.camera.fov=40;this.camera.updateProjectionMatrix();const bounds=new THREE.Box3().setFromPoints(this.race.track.samples),center=bounds.getCenter(new THREE.Vector3());const direction=this.mode==='top'?new THREE.Vector3(0,1,.001):this.camera.aspect<.9?new THREE.Vector3(1.25,1.7,.25):new THREE.Vector3(.7,1,.85);direction.normalize();let distance=260;for(let pass=0;pass<6;pass++){this.camera.position.copy(center).addScaledVector(direction,distance);this.camera.lookAt(center);this.camera.updateMatrixWorld();let x=0,y=0;for(let i=0;i<this.race.track.samples.length;i+=15){const p=this.race.track.samples[i];for(const dx of [-9,9])for(const dz of [-9,9]){const q=new THREE.Vector3(p.x+dx,2,p.z+dz).project(this.camera);x=Math.max(x,Math.abs(q.x));y=Math.max(y,Math.abs(q.y));}}const factor=Math.max(x/.9,y/.65);if(Math.abs(factor-1)<.01)break;distance*=THREE.MathUtils.clamp(factor,.75,1.6);}this.controls.target.copy(center);this.controls.update();}
 setCamera(mode){if(mode==='follow'){this.orbitAngle=0;this.orbitHeight=0;}this.mode=mode;this.scene.fog.near=mode==='follow'?180:700;this.scene.fog.far=mode==='follow'?470:1600;this.controls.enabled=mode==='orbit';this.cameraReady=false;if(mode!=='follow')this.frameTrack();}
 selectDriver(index){this.selected=THREE.MathUtils.clamp(index,0,this.race.cars.length-1);this.setCamera('follow');}
 render(){
  const now=performance.now(),dt=Math.min((now-this.lastFrame)/1000,.05);this.lastFrame=now;const ease=1-Math.exp(-8*dt);
  this.race.cars.forEach((c,i)=>{const mesh=this.carMeshes[i];mesh.position.set(c.x,.25,c.z);mesh.rotation.y=c.heading;mesh.userData.body.rotation.z=THREE.MathUtils.lerp(mesh.userData.body.rotation.z,-c.steer*Math.min(c.speed/25,1)*.13,ease);mesh.userData.body.position.y=this.reducedMotion?0:Math.sin(c.distance*3)*Math.min(c.speed*.0015,.028);mesh.userData.wheels.forEach(w=>{w.pivot.rotation.y=w.front?c.steer*.30:0;w.tire.rotation.x=c.distance/.49;w.hub.rotation.x=c.distance/.49;});mesh.userData.label.visible=this.mode!=='follow'||i!==this.selected;mesh.userData.label.scale.setScalar(this.mode==='follow'?1:1.6);mesh.userData.label.scale.multiply(new THREE.Vector3(5.2,1,1));});
  const car=this.race.cars[this.selected];
  if(this.mode==='follow'){
   if(!this.cameraReady){this.followHeading=car.heading;this.lookTarget.set(car.x,1.6,car.z);}
   const headingDelta=Math.atan2(Math.sin(car.heading-this.followHeading),Math.cos(car.heading-this.followHeading));this.followHeading+=headingDelta*(this.reducedMotion?1:1-Math.exp(-10*dt));
   const distance=this.camera.aspect<.8?12.5:11.5,up=(this.camera.aspect<.8?5.4:4.8)+this.orbitHeight;
   const desired=new THREE.Vector3(car.x-Math.sin(this.followHeading+this.orbitAngle)*distance,up,car.z-Math.cos(this.followHeading+this.orbitAngle)*distance);
   const look=new THREE.Vector3(car.x+Math.sin(this.followHeading)*Math.max(0,Math.cos(this.orbitAngle))*6,1.0,car.z+Math.cos(this.followHeading)*Math.max(0,Math.cos(this.orbitAngle))*6);
   if(!this.cameraReady||this.reducedMotion){this.camera.position.copy(desired);this.lookTarget.copy(look);}else{this.camera.position.lerp(desired,1-Math.exp(-12*dt));this.lookTarget.lerp(look,1-Math.exp(-10*dt));}
   const fov=(this.camera.aspect<.8?66:61)+(this.reducedMotion?0:Math.min(car.speed*.17,5));this.camera.fov=THREE.MathUtils.lerp(this.camera.fov,fov,this.cameraReady?ease:1);this.camera.updateProjectionMatrix();this.camera.lookAt(this.lookTarget);this.cameraReady=true;
  }else if(this.mode==='orbit')this.controls.update();
  this.carMeshes.forEach((mesh,i)=>{const distance=mesh.position.distanceTo(this.camera.position);mesh.visible=this.mode!=='follow'||i===this.selected||(!this.race.cars[i].finished&&distance>5.5);mesh.userData.label.visible=this.mode!=='follow'||(i!==this.selected&&distance>16&&distance<100);});
  if(!this.reducedMotion)this.floaters.forEach(f=>{f.mesh.position.y=f.y+Math.sin(now/1000*f.speed+f.phase)*f.amplitude;});
  this.renderer.render(this.scene,this.camera);
 }
}
