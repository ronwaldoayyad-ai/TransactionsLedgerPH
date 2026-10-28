// Self-contained vector artwork only. Never serve or insert uploaded XML as HTML.
const {XMLParser,XMLValidator}=require('fast-xml-parser');
const MAX_UPLOAD=131072,MAX_SVG=65536;
const elements=new Set(['svg','g','defs','path','rect','circle','ellipse','line','polyline','polygon','linearGradient','radialGradient','stop','clipPath','mask','title','desc']);
const numbers=new Set(['x','y','x1','y1','x2','y2','cx','cy','r','rx','ry','width','height','fx','fy','fr','offset','opacity','fill-opacity','stroke-opacity','stroke-width','stroke-miterlimit','stroke-dashoffset','stroke-dasharray','stop-opacity']);
const paints=new Set(['fill','stroke','stop-color','color']);
const options={ 'fill-rule':['nonzero','evenodd'], 'clip-rule':['nonzero','evenodd'], 'stroke-linecap':['butt','round','square'], 'stroke-linejoin':['miter','round','bevel'], 'gradientUnits':['objectBoundingBox','userSpaceOnUse'], 'clipPathUnits':['objectBoundingBox','userSpaceOnUse'], 'maskUnits':['objectBoundingBox','userSpaceOnUse'], 'maskContentUnits':['objectBoundingBox','userSpaceOnUse'], 'spreadMethod':['pad','reflect','repeat'], 'vector-effect':['none','non-scaling-stroke'] };
const escape=s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const fail=message=>{throw Object.assign(Error(message),{status:400})};
function sanitizeGroupLogo(raw){
 if(typeof raw!=='string'||!raw.trim()||Buffer.byteLength(raw,'utf8')>MAX_UPLOAD)fail('Choose an SVG file up to 128 KB.');
 let source=raw.replace(/^\uFEFF/,'').trim().replace(/^<\?xml\s[^?]*\?>\s*/i,'').replace(/<!--[\s\S]*?-->/g,'');
 if(/<!(?!\[CDATA\[)|<\?|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(source)||XMLValidator.validate(source)!==true)fail('Choose a valid, self-contained SVG without document declarations or external entities.');
 let nodes;try{nodes=new XMLParser({preserveOrder:true,ignoreAttributes:false,processEntities:false,parseTagValue:false,trimValues:false}).parse(source)}catch{fail('The SVG could not be read. Export it as a plain SVG and try again.')}
 const roots=nodes.filter(n=>!('#text'in n&&String(n['#text']).trim()===''));if(roots.length!==1||!Array.isArray(roots[0].svg))fail('The file must contain one SVG image.');
 let count=0;const ids=new Set(),refs=[];
 function attribute(key,value){
  const v=String(value).trim();if(v.length>MAX_SVG)fail('The SVG is too complex. Export a simplified plain SVG.');
  if(key==='xmlns')return v==='http://www.w3.org/2000/svg'?v:fail('Only the standard SVG namespace is supported.');
  if(key==='id'){if(!/^[a-zA-Z_][\w.-]{0,100}$/.test(v)||ids.has(v))fail('SVG identifiers must be unique and valid.');ids.add(v);return v}
  if(paints.has(key)){const ref=v.match(/^url\(#([a-zA-Z_][\w.-]{0,100})\)$/);if(ref){refs.push(ref[1]);return v}if(/^(?:#[a-fA-F0-9]{3,8}|[a-zA-Z]{1,24}|(?:rgb|rgba)\([\d.,%\s]+\))$/.test(v))return v;fail('Use self-contained SVG colours or local gradients.')}
  if(['clip-path','mask'].includes(key)){const ref=v.match(/^url\(#([a-zA-Z_][\w.-]{0,100})\)$/);if(!ref)fail('SVG masks and clipping must refer to a local definition.');refs.push(ref[1]);return v}
  if(key==='d'){if(!/^[MmZzLlHhVvCcSsQqTtAaEe\d.,+\-\s]*$/.test(v))fail('The SVG contains an unsupported vector path.');return v}
  if(key==='viewBox'){const a=v.split(/[\s,]+/).map(Number);if(a.length!==4||!a.every(Number.isFinite)||a[2]<=0||a[3]<=0||Math.max(...a.map(Math.abs))>100000)fail('The SVG needs a valid viewBox.');return a.join(' ')}
  if(key==='points'||numbers.has(key)){if(!/^[\d.eE,+\-\s%]+(?:px)?$/.test(v)&&v!=='none')fail('The SVG contains an unsupported numeric attribute.');return v}
  if(key==='transform'||key==='gradientTransform'){if(!/^(?:(?:matrix|translate|scale|rotate|skewX|skewY)\([\d.eE,+\-\s]+\)\s*)+$/.test(v))fail('The SVG contains an unsupported transform.');return v}
  if(key==='preserveAspectRatio'){if(!/^(?:none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max)(?:\s+(?:meet|slice))?)$/.test(v))fail('The SVG contains an invalid aspect ratio.');return v}
  if(options[key]?.includes(v))return v;
  fail('The SVG contains unsupported content ('+key+'). Use vector paths, fills and local gradients, or upload a PNG instead.');
 }
 // Flatten ordinary exported class/id/tag rules into SVG presentation attributes.
 // The original stylesheet is never returned to the browser.
 const rules=[];
 function declarations(text){
  if(/[\\@{}]/.test(text))fail('The SVG contains unsupported CSS. Try a PNG instead.');
  return text.split(';').filter(s=>s.trim()).map(entry=>{const pos=entry.indexOf(':');if(pos<1)fail('The SVG has invalid styling.');const key=entry.slice(0,pos).trim();let value=entry.slice(pos+1).trim();const important=/\s*!important\s*$/i.test(value);value=value.replace(/\s*!important\s*$/i,'');if(key==='enable-background')return null;if(!paints.has(key)&&!numbers.has(key)&&!options[key]&&!['clip-path','mask','transform'].includes(key))fail('The SVG contains unsupported CSS ('+key+'). Try a PNG instead.');return {key,value:attribute(key,value),important}}).filter(Boolean);
 }
 function collect(nodes,depth=0){if(depth>24)fail('The SVG is too complex.');for(const node of nodes){const tag=Object.keys(node).find(k=>k!==':@');if(tag==='metadata'||tag?.startsWith('sodipodi:'))continue;if(tag==='style'){
   for(const [key,value]of Object.entries(node[':@']||{}))if(key!=='@_type'||value!=='text/css')fail('The SVG stylesheet contains unsupported attributes.');
   const css=node[tag].map(n=>{if(typeof n['#text']!=='string')fail('The SVG stylesheet is invalid.');return n['#text']}).join('').replace(/\/\*[\s\S]*?\*\//g,'');
   const rest=css.replace(/([^{}]+)\{([^{}]*)\}/g,(_,selectors,body)=>{const values=declarations(body);for(const selector of selectors.split(',')){const match=selector.trim().match(/^(?:([A-Za-z][\w-]*))?(?:([.#])([\w-]+))?$/);if(!match||(!match[1]&&!match[2])||rules.length>=256)fail('The SVG uses unsupported CSS selectors. Try a PNG instead.');rules.push({tag:match[1],kind:match[2],name:match[3],specificity:(match[1]?1:0)+(match[2]==='#'?100:match[2]?10:0),values})}return ''});if(rest.trim())fail('The SVG stylesheet contains unsupported rules. Try a PNG instead.');
  }else if(Array.isArray(node[tag]))collect(node[tag],depth+1)}}
 collect(roots);
 function render(node,depth,parent){
  if(depth>24||++count>2000)fail('The SVG is too complex. Export a simplified plain SVG.');
  const tag=Object.keys(node).find(k=>k!==':@');
  if(tag==='style'||tag==='metadata'||tag?.startsWith('sodipodi:'))return '';
  if(tag==='#text'){const text=String(node[tag]);if(['title','desc'].includes(parent))return escape(text.slice(0,1000));if(text.trim())fail('Convert SVG text to vector outlines before uploading.');return ''}
  if(!elements.has(tag)||(tag==='svg'&&depth!==0))fail('The SVG contains unsupported elements. Export a plain SVG with text converted to outlines.');
  const attrs={},raw=node[':@']||{},classes=String(raw['@_class']||'').trim().split(/\s+/),priorities=new Map();if(String(raw['@_class']||'').length>512||classes.some(c=>c&&!/^[\w-]+$/.test(c)))fail('The SVG contains invalid class names.');
  for(const [name,value]of Object.entries(raw)){
   const key=name.replace(/^@_/,'');if(key==='style'||key==='class'||key==='enable-background'||/^xmlns:|^inkscape:|^sodipodi:/.test(key))continue;
   if(/^(?:aria-[\w-]+|role|version|xml:space|data-[\w-]+)$/.test(key))continue;
   attrs[key]=attribute(key,value);
  }
  const apply=(values,specificity)=>{for(const v of values){const score=specificity+(v.important?10000:0);if(score>=(priorities.get(v.key)??-1)){attrs[v.key]=v.value;priorities.set(v.key,score)}}};
  for(const rule of rules)if((!rule.tag||rule.tag===tag)&&(!rule.kind||rule.kind==='.'&&classes.includes(rule.name)||rule.kind==='#'&&raw['@_id']===rule.name))apply(rule.values,rule.specificity);
  if(raw['@_style'])apply(declarations(String(raw['@_style'])),1000);
  if(tag==='svg'){
   if(!attrs.viewBox){const w=Number(String(attrs.width||'').replace(/px$/,'')),h=Number(String(attrs.height||'').replace(/px$/,''));if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0||w>100000||h>100000)fail('Export the SVG with a viewBox or numeric width and height.');attrs.viewBox='0 0 '+w+' '+h}
   attrs.xmlns='http://www.w3.org/2000/svg';delete attrs.width;delete attrs.height;
  }
  return '<'+tag+Object.entries(attrs).map(([k,v])=>' '+k+'="'+escape(v)+'"').join('')+'>'+node[tag].map(n=>render(n,depth+1,tag)).join('')+'</'+tag+'>';
 }
 const svg=render(roots[0],0,null);if(refs.some(id=>!ids.has(id)))fail('The SVG references a missing local gradient, mask or clip path.');if(Buffer.byteLength(svg,'utf8')>MAX_SVG)fail('The simplified SVG must be no larger than 64 KB.');return svg;
}
module.exports={sanitizeGroupLogo,MAX_UPLOAD,MAX_SVG};
