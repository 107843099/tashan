// All positions are centimetres relative to the pinhole; light travels toward -z.
export const SCREEN_SIZE = 18;
export const OBJECT_SIZE = 12;
export function apertureEffect(d,u,v){
  if(![d,u,v].every(Number.isFinite)||d<=0||u<=0||v<=0)throw new RangeError('Positive aperture and distances required');
  return {blurMM:d*(1+v/u),relativeLight:d*d*(24/v)**2};
}
export function imageFileError(file){
  if(!file)return '';
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))return '请选择 PNG、JPG 或 WebP 图片。';
  if(file.size>8*1024*1024)return '图片超过 8 MB，请选择较小的图片。';
  return '';
}
export function projectPoint(point, u, v) {
  if (![u,v,point.x,point.y].every(Number.isFinite) || u <= 0 || v <= 0) throw new RangeError('Distances must be positive and finite');
  return {x:-point.x*v/u, y:-point.y*v/u, z:-v};
}
export function onScreen(point) { return Math.abs(point.x)<=SCREEN_SIZE/2 && Math.abs(point.y)<=SCREEN_SIZE/2; }
export function clampDistance(value, min, max, previous) {
  if (String(value).trim()==='' || !Number.isFinite(Number(value))) return previous;
  return Math.max(min, Math.min(max, Math.round(Number(value))));
}
// Stop a ray at the first opaque wall if its projected point is outside the screen.
export function rayEnd(point,u,v) {
  const image=projectPoint(point,u,v);
  const t=Math.min(1,(SCREEN_SIZE/2)/Math.max(Math.abs(image.x),Math.abs(image.y)));
  return {x:image.x*t,y:image.y*t,z:image.z*t};
}
