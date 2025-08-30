/* script.js
   Ultra Pro — Fabric canvas + Three.js GLTF mockup integration
   Place 'tshirt.glb' in same folder (repo root). Use GitHub Pages or a local server.
*/

/* ---------- small DOM helpers ---------- */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
function toast(msg, type='default', t=3000){
  try {
    const container = document.getElementById('notifications') || (() => { const d=document.createElement('div'); d.id='notifications'; d.className='notifications-container'; document.body.appendChild(d); return d; })();
    const el = document.createElement('div'); el.className = 'toast ' + (type==='default' ? '' : type); el.textContent = msg;
    container.appendChild(el);
    requestAnimationFrame(()=> el.style.opacity = '0.98');
    setTimeout(()=> { el.style.opacity = '0'; setTimeout(()=> el.remove(), 320); }, t);
  } catch(e){ console.warn(e); }
}

/* ---------- boot safety ---------- */
function revealUI(msg){
  const loader = $('#loadingScreen'), main = $('#mainApp');
  if (loader) loader.style.display = 'none';
  if (main) main.style.display = '';
  if (msg) {
    const banner = document.getElementById('bootBanner') || (() => { const b=document.createElement('div'); b.id='bootBanner'; b.style.cssText='background:#fff3cd;border:1px solid #ffeeba;color:#613400;padding:10px;border-radius:6px;margin:10px 18px;font-weight:600'; (main || document.body).insertBefore(b, (main || document.body).firstChild); return b; })();
    banner.textContent = msg;
    setTimeout(()=> banner.remove(), 6000);
  }
}
setTimeout(()=> revealUI('Partial load: interface shown to avoid stuck loader'), 2000);

/* ---------- global app state ---------- */
let frontCanvas = null, backCanvas = null, activeCanvas = null;
const undoStack = { front: [], back: [] }, redoStack = { front: [], back: [] };
const CANVAS_ASPECT = 700/500;
let zoomLevel = 1;
let selectedSize = 'M';
let basePriceValue = 2500;
let currency = 'LKR';

const stickersKey = 'ultra_stickers_v3';
const paletteKey = 'ultra_colors_v3';
const wareKey = 'ultra_ware_v3';
const settingsKey = 'ultra_settings_v3';

/* ---------- storage helpers ---------- */
function storageGet(k, fallback){ try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch(e){ return fallback; } }
function storageSet(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){ console.warn(e); } }

/* ---------- Fabric canvas helpers ---------- */
function makeCanvas(id){
  const c = new fabric.Canvas(id, { preserveObjectStacking:true, enableRetinaScaling:true, backgroundColor:'#ffffff' });
  // subtle print area guide
  const guide = new fabric.Rect({ left:60, top:80, width:380, height:480, fill:'rgba(255,255,255,0)', stroke:'rgba(0,0,0,0.06)', selectable:false, rx:8 });
  c.add(guide);
  c.on('object:added', ()=> { pushSnapshot(c); renderLayers(); updatePropertiesPanel(); UT3D && UT3D.refresh(); updateLivePreview(); });
  c.on('object:modified', ()=> { pushSnapshot(c); renderLayers(); updatePropertiesPanel(); UT3D && UT3D.refresh(); updateLivePreview(); });
  c.on('object:removed', ()=> { pushSnapshot(c); renderLayers(); updateLivePreview(); UT3D && UT3D.refresh(); });
  // ensure after:render triggers 3D refresh
  c.on('after:render', ()=> { UT3D && UT3D.refresh && UT3D.refresh(); });
  return c;
}
function snapshotName(c){ return c === frontCanvas ? 'front' : 'back'; }
function pushSnapshot(c){
  try {
    const key = snapshotName(c);
    undoStack[key].push(JSON.stringify(c.toJSON(['selectable','id'])));
    if (undoStack[key].length > 80) undoStack[key].shift();
    redoStack[key] = [];
  } catch(e){ console.warn(e); }
}
function undo(){ if(!activeCanvas) return toast('No active canvas','warn'); const key=snapshotName(activeCanvas); if(undoStack[key].length<=1) return toast('Nothing to undo','warn'); const last = undoStack[key].pop(); redoStack[key].push(last); const prev = undoStack[key][undoStack[key].length-1]; activeCanvas.loadFromJSON(prev, ()=> { activeCanvas.renderAll(); renderLayers(); updatePropertiesPanel(); UT3D && UT3D.refresh(); updateLivePreview(); }); }
function redo(){ if(!activeCanvas) return toast('No active canvas','warn'); const key=snapshotName(activeCanvas); if(!redoStack[key] || !redoStack[key].length) return toast('Nothing to redo','warn'); const next = redoStack[key].pop(); activeCanvas.loadFromJSON(next, ()=> { activeCanvas.renderAll(); renderLayers(); updatePropertiesPanel(); UT3D && UT3D.refresh(); updateLivePreview(); }); }

/* DPR-aware resize */
function resizeFabricCanvasToWrapper(fabricCanvas, wrapperSelector){
  if(!fabricCanvas) return;
  const wrapper = typeof wrapperSelector === 'string' ? document.querySelector(wrapperSelector) : wrapperSelector;
  if(!wrapper) return;
  wrapper.style.display = wrapper.style.display || 'block';
  const style = window.getComputedStyle(wrapper);
  const padLeft = parseFloat(style.paddingLeft)||0, padRight = parseFloat(style.paddingRight)||0;
  const innerWidth = Math.max(140, wrapper.clientWidth - padLeft - padRight);
  const cssW = Math.round(innerWidth);
  const cssH = Math.round(cssW * CANVAS_ASPECT);
  const DPR = window.devicePixelRatio || 1;
  const canvasEl = fabricCanvas.getElement();
  if(!canvasEl) return;
  canvasEl.style.width = cssW + 'px';
  canvasEl.style.height = cssH + 'px';
  canvasEl.width = cssW * DPR;
  canvasEl.height = cssH * DPR;
  fabricCanvas.setWidth(cssW);
  fabricCanvas.setHeight(cssH);
  fabricCanvas.setZoom(zoomLevel);
  fabricCanvas.calcOffset();
  fabricCanvas.renderAll();
  wrapper.style.minHeight = cssH + 'px';
}
function resizeAll(){
  resizeFabricCanvasToWrapper(frontCanvas, '#frontCanvasWrapper');
  resizeFabricCanvasToWrapper(backCanvas, '#backCanvasWrapper');
  updateLivePreview();
}
window.addEventListener('resize', ()=> { clearTimeout(window.__ultra_r); window.__ultra_r = setTimeout(()=> resizeAll(), 120); });

# (rest of script truncated for brevity - full script continues in file)
