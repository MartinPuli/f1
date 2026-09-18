import { ACTIONS } from '../src/simulation.js';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export async function api(request,env={}){
 const path=new URL(request.url).pathname;
 if(path==='/api/status')return json({configured:!!env.TYPESAFE_API_KEY});
 if(path!=='/api/decide')return json({error:'No encontrado'},404);
 if(request.method!=='POST')return json({error:'Método no permitido'},405);
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'Origen no permitido'},403);
 const key=env.TYPESAFE_API_KEY||request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
 if(!key)return json({error:'Configurá tu API key de TypeSafe para conectar Jev.'},401);
 try{
  const raw=await request.text();if(raw.length>50000)return json({error:'Solicitud demasiado grande'},413);
  const body=JSON.parse(raw);if(!Array.isArray(body.states)||body.states.length<1||body.states.length>5)return json({error:'Se necesitan entre 1 y 5 observaciones.'},400);
  const states=body.states;
  for(const s of states)if(!Number.isFinite(s.speed_mps)||!Array.isArray(s.visible_road)||s.visible_road.length!==5||!s.visible_road.every(p=>Number.isFinite(p.right)&&Number.isFinite(p.forward)))return json({error:'Observación inválida.'},400);
  const criteria={push_left:'Accelerate, gentle left steering (-0.30).',push_straight:'Accelerate, straight steering.',push_right:'Accelerate, gentle right steering (+0.30).',coast_left:'Coast, medium left steering (-0.38).',coast_straight:'Coast, steering centered.',coast_right:'Coast, medium right steering (+0.38).',brake_left:'Brake strongly and turn left (-0.50).',brake_straight:'Brake strongly, steering centered.',brake_right:'Brake strongly and turn right (+0.50).',sharp_left:'Slow tight left turn (-0.80).',sharp_right:'Slow tight right turn (+0.80).'};
  const decisions=await Promise.all(states.map(async state=>{
   const result=await fetch('https://api.typesafe.ai/v1/systemone',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(20000),body:JSON.stringify({model:'jev-latest',state:JSON.stringify(state),questions:{drive:{type:'choice',instructions:'You drive a race car on an unknown closed circuit. Choose the safest fast action for the next 0.25 simulation seconds. You only know the local observation. right is positive to your right, forward is positive ahead. Road points are centerline samples in car-relative meters. Positive heading_error means turn right. Negative means left. Stay within half the road width and avoid nearby cars. Steering is normalized [-1,1] times 0.42 radians, wheelbase 3.1 m. Grip allows at most 18 m/s² lateral acceleration. Use your previous observations in memory. Do not assume anything about unseen track. Prefer completing all three laps. Respect the supplied driving style.',criteria}}})});
   if(!result.ok){if(result.status===401||result.status===403)throw new Error('TypeSafe rechazó la API key. Revisá la configuración.');if(result.status===429)throw new Error('TypeSafe alcanzó su límite de solicitudes. Esperá y reintentá.');throw new Error(`TypeSafe no está disponible (${result.status}). La carrera quedó pausada.`);}
   const data=await result.json(),a=data.answers?.drive;if(!a||!ACTIONS[a.choice])throw new Error('Jev devolvió una decisión no reconocida.');
   return {choice:a.choice,confidence:Number.isFinite(a.confidence)?a.confidence:null};
  }));return json({decisions});
 }catch(e){return json({error:e.name==='TimeoutError'?'Jev tardó demasiado. La carrera quedó pausada.':e instanceof SyntaxError?'Solicitud inválida.':e.message||'No se pudo conectar con Jev.'},e instanceof SyntaxError?400:502);}
}
