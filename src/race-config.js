export const DRIVER_IDS=['max','lewis','charles','lando','franco'];
export const MODEL_CHOICES=['jev-latest','jev-preview','jev-1.13.0'];
export const DEFAULT_PROMPT='Complete the race as quickly as possible. Stay on the circuit, avoid contact, and learn from your recent observations.';
const strategies=[
 'Attack corner exits and overtake when there is room. Accept controlled risk, but brake before tight turns.',
 'Adapt your pace to the road ahead. Prioritize smooth steering and consistent lap times.',
 'Choose precise lines. Brake early for corners and accelerate once the car is aligned with the exit.',
 'Look for overtaking opportunities. Use clear space without sacrificing control of the car.',
 'Build speed progressively. Prioritize finishing and avoid collisions or running wide.'
];
export const validModel=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/.test(value);
export function defaultSettings(){return {version:1,prompt:DEFAULT_PROMPT,drivers:DRIVER_IDS.map((id,i)=>({id,model:'jev-latest',prompt:strategies[i]}))};}
export function validSettings(value){return !!value&&value.version===1&&typeof value.prompt==='string'&&value.prompt.length<=2000&&Array.isArray(value.drivers)&&value.drivers.length===5&&DRIVER_IDS.every(id=>value.drivers.filter(d=>d?.id===id).length===1)&&value.drivers.every(d=>validModel(d.model)&&typeof d.prompt==='string'&&d.prompt.length<=1000);}
export function cleanSettings(value){if(!validSettings(value))throw new Error('Invalid grid configuration.');return {version:1,prompt:value.prompt,drivers:DRIVER_IDS.map(id=>{const d=value.drivers.find(d=>d.id===id);return {id,model:d.model,prompt:d.prompt};})};}
