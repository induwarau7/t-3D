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

/* ---------- palette & stickers ---------- */
const DEFAULT_COLORS = ['#FFFFFF','#000000','#2C3E50','#3B2F2F','#556B2F','#800000','#B8860B','#00695C','#5D6D7E','#7F8C8D'];
function getStoredColors(){ return storageGet(paletteKey, []); }
function addColor(hex){ const arr = getStoredColors(); arr.unshift(hex); storageSet(paletteKey, Array.from(new Set(arr)).slice(0,18)); renderPalette(); }
function renderPalette(){
  const el = $('#colorPalette'); if(!el) return;
  el.innerHTML = '';
  const colors = getStoredColors(); const list = colors.length ? colors : DEFAULT_COLORS;
  list.forEach(c => {
    const sw = document.createElement('div'); sw.className='swatch'; sw.style.background=c; sw.title=c;
    sw.addEventListener('click', ()=> {
      frontCanvas && frontCanvas.setBackgroundColor(c, frontCanvas.renderAll.bind(frontCanvas));
      backCanvas && backCanvas.setBackgroundColor(c, backCanvas.renderAll.bind(backCanvas));
      toast('Base color applied');
      UT3D && UT3D.refresh && UT3D.refresh();
      updateLivePreview();
    });
    el.appendChild(sw);
  });
}

/* stickers store */
function getStickers(){ return storageGet(stickersKey, []); }
function addStickerToStore(dataURL, name='Sticker'){ const arr = getStickers(); arr.unshift({ id:'stk_'+Date.now(), dataURL, name }); storageSet(stickersKey, arr); renderStickers(); }
function renderStickers(){
  const grid = $('#graphicsGrid'); if(!grid) return; grid.innerHTML='';
  const list = getStickers();
  if(!list.length){
    const placeholders = [{name:'Star',color:'#C19A6B'},{name:'Badge',color:'#4B6F44'},{name:'TextArt',color:'#8A5A44'}];
    placeholders.forEach(p => {
      const item = document.createElement('div'); item.className='graphics-item';
      const preview = document.createElement('div'); preview.style.width='46px'; preview.style.height='46px'; preview.style.borderRadius='6px'; preview.style.background=p.color;
      const label = document.createElement('div'); label.style.flex='1'; label.style.fontSize='13px'; label.textContent=p.name+' (placeholder)';
      item.appendChild(preview); item.appendChild(label);
      item.addEventListener('click', ()=> {
        if(!activeCanvas) return;
        const rect = new fabric.Rect({ left:120, top:120, width:160, height:100, fill:p.color, rx:8 });
        activeCanvas.add(rect).setActiveObject(rect);
        pushSnapshot(activeCanvas); renderLayers(); updateLivePreview(); UT3D && UT3D.refresh();
        toast('Sticker added');
      });
      grid.appendChild(item);
    });
    return;
  }
  list.forEach(s => {
    const item = document.createElement('div'); item.className='graphics-item';
    const preview = document.createElement('div'); preview.style.width='46px'; preview.style.height='46px'; preview.style.borderRadius='6px'; preview.style.background = `url(${s.dataURL}) center/cover`;
    const label = document.createElement('div'); label.style.flex='1'; label.style.fontSize='13px'; label.textContent=s.name;
    item.appendChild(preview); item.appendChild(label);
    item.addEventListener('click', ()=> {
      if(!activeCanvas) return;
      fabric.Image.fromURL(s.dataURL, img => {
        const targetWidth = Math.min(240, frontCanvas.getWidth() * 0.6);
        img.scaleToWidth(targetWidth);
        img.left = (frontCanvas.getWidth() - img.getScaledWidth())/2 || 90;
        img.top = 140;
        activeCanvas.add(img).setActiveObject(img);
        pushSnapshot(activeCanvas); renderLayers(); updateLivePreview(); UT3D && UT3D.refresh();
      }, { crossOrigin:'anonymous' });
    });
    grid.appendChild(item);
  });
}

/* ---------- layers & properties ---------- */
function renderLayers(){ const el = $('#layersList'); if(!el || !activeCanvas) return; el.innerHTML=''; const objs = activeCanvas.getObjects().slice().reverse(); objs.forEach(o => { const idx = activeCanvas.getObjects().indexOf(o); const item = document.createElement('div'); item.className='layer-item'; item.innerHTML = `<div style="display:flex;gap:8px;align-items:center"><strong style="font-size:13px">${o.type}</strong><small style="color:var(--muted)">${Math.round(o.left||0)},${Math.round(o.top||0)}</small></div><div style="display:flex;gap:6px"><button class="btn-secondary btn-select" data-idx="${idx}">Select</button><button class="btn-secondary btn-up" data-idx="${idx}">Up</button><button class="btn-secondary btn-down" data-idx="${idx}">Down</button></div>`; el.appendChild(item); }); el.querySelectorAll('.btn-select').forEach(b=>b.addEventListener('click', e=>{ const idx=parseInt(e.target.dataset.idx); const obj = activeCanvas.getObjects()[idx]; activeCanvas.setActiveObject(obj); activeCanvas.renderAll(); updatePropertiesPanel(); })); el.querySelectorAll('.btn-up').forEach(b=>b.addEventListener('click', e=>{ const idx=parseInt(e.target.dataset.idx); const obj = activeCanvas.getObjects()[idx]; activeCanvas.bringForward(obj); activeCanvas.renderAll(); pushSnapshot(activeCanvas); })); el.querySelectorAll('.btn-down').forEach(b=>b.addEventListener('click', e=>{ const idx=parseInt(e.target.dataset.idx); const obj = activeCanvas.getObjects()[idx]; activeCanvas.sendBackwards(obj); activeCanvas.renderAll(); pushSnapshot(activeCanvas); })); }

function updatePropertiesPanel(){ const cont = $('#propertiesContent'); if(!cont||!activeCanvas) return; const obj = activeCanvas.getActiveObject(); cont.innerHTML=''; if(!obj){ cont.innerHTML = '<p class="no-selection">Select an element to edit properties</p>'; return; } const tpl = document.createElement('div'); tpl.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px"><label>Left: <input id="prop_left" type="number" value="${Math.round(obj.left||0)}"></label><label>Top: <input id="prop_top" type="number" value="${Math.round(obj.top||0)}"></label><label>Scale: <input id="prop_scale" type="range" min="0.2" max="3" step="0.01" value="${(obj.scaleX||1)}"></label><label>Rotate: <input id="prop_rot" type="number" value="${Math.round(obj.angle||0)}"></label><div style="display:flex;gap:8px"><button id="prop_delete" class="btn-secondary">Delete</button><button id="prop_center" class="btn-secondary">Center</button></div></div>`; cont.appendChild(tpl); $('#prop_left').addEventListener('input', e=>{ obj.left = parseFloat(e.target.value); obj.setCoords(); activeCanvas.renderAll(); pushSnapshot(activeCanvas); renderLayers(); updateLivePreview(); }); $('#prop_top').addEventListener('input', e=>{ obj.top = parseFloat(e.target.value); obj.setCoords(); activeCanvas.renderAll(); pushSnapshot(activeCanvas); renderLayers(); updateLivePreview(); }); $('#prop_scale').addEventListener('input', e=>{ const s = parseFloat(e.target.value); obj.scaleX = s; obj.scaleY = s; obj.setCoords(); activeCanvas.renderAll(); pushSnapshot(activeCanvas); updateLivePreview(); }); $('#prop_rot').addEventListener('input', e=>{ obj.angle = parseFloat(e.target.value); obj.setCoords(); activeCanvas.renderAll(); pushSnapshot(activeCanvas); updateLivePreview(); }); $('#prop_delete').addEventListener('click', ()=>{ activeCanvas.remove(obj); pushSnapshot(activeCanvas); renderLayers(); updateLivePreview(); }); $('#prop_center').addEventListener('click', ()=>{ obj.center(); obj.setCoords(); activeCanvas.renderAll(); pushSnapshot(activeCanvas); renderLayers(); updateLivePreview(); }); }

/* ---------- Live preview & price ---------- */
function updateLivePreview(){ const live = $('#livePreview'); if(!live) return; try { const data = frontCanvas.toDataURL({ format: 'png', width: 360, height: Math.round(360 * CANVAS_ASPECT) }); live.innerHTML = `<img src="${data}" style="max-width:100%;height:auto;border-radius:6px">`; const modalSummary = $('#modalOrderSummary'); if(modalSummary) modalSummary.innerHTML = `<div style="display:flex;gap:12px;align-items:center"><img src="${data}" style="width:96px;border-radius:6px"><div><div><strong>Size:</strong> ${selectedSize}</div><div><strong>Qty:</strong> ${$('#quantity').value || 1}</div><div><strong>Total:</strong> ${$('#totalPrice').textContent}</div></div></div>`; } catch(e){ console.warn('preview update failed', e); } }
function updateOrderPrices(){ if(!frontCanvas) return; const imagesCount = frontCanvas.getObjects().filter(o=>o.type==='image' || (o.type==='group' && o._objects && o._objects.some(x=>x.type==='image'))).length; const textCount = frontCanvas.getObjects().filter(o=>o.type==='textbox' || o.type==='text').length; const stickersPrice = imagesCount * 150; const textPrice = textCount * 100; let premium = 0; if (selectedSize === 'XL') premium = 200; if (selectedSize === 'XXL') premium = 400; const qty = parseInt($('#quantity').value || 1); const total = (basePriceValue + stickersPrice + textPrice + premium) * qty; $('#graphicsPrice').textContent = formatCurrency(stickersPrice); $('#textPrice').textContent = formatCurrency(textPrice); $('#premiumPrice').textContent = formatCurrency(premium); const totalEl = $('#totalPrice'); if (totalEl) { totalEl.textContent = formatCurrency(total); totalEl.dataset.raw = total; } const baseEl = $('#basePrice'); if (baseEl) baseEl.textContent = formatCurrency(basePriceValue); }
function formatCurrency(n){ const digits = Number(n||0).toFixed(2); return `${currency} ${Number(digits).toLocaleString('en-US')}`; }

/* ---------- UT3D : three.js GLTF loader + CanvasTexture ---------- */
const UT3D = (function(){
  let renderer, scene, camera, controls, model, canvasTex, animId;
  const mount = document.getElementById('threeMount');
  const status = document.getElementById('threeStatus');
  function init(){
    if(!mount){ console.warn('three mount missing'); return; }
    scene = new THREE.Scene(); scene.background = new THREE.Color(0xffffff);
    const r = mount.getBoundingClientRect(); const W = Math.max(480, Math.floor(r.width || 640)), H = Math.max(320, Math.floor(r.height || 420));
    camera = new THREE.PerspectiveCamera(40, W/H, 0.1, 2000); camera.position.set(0, 18, 60);
    renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio||1));
    renderer.setSize(W, H, false);
    mount.innerHTML = ''; mount.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.7); hemi.position.set(0,50,0); scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 0.9); dir.position.set(20,40,30); scene.add(dir);
    const amb = new THREE.AmbientLight(0xffffff, 0.25); scene.add(amb);

    if (THREE.OrbitControls) { controls = new THREE.OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.enablePan = false; controls.target.set(0,12,0); }

    status.textContent = '3D status: ready — loading default model';
    // default model load (relative path)
    loadGLB('./tshirt.glb').catch(err => {
      console.warn('default GLB load failed', err);
      status.textContent = '3D model not found. Upload a .glb or place tshirt.glb in the site root.';
    });

    window.addEventListener('resize', onResize);
    animate();
  }

  function onResize(){
    if(!renderer || !camera || !mount) return;
    const rect = mount.getBoundingClientRect(); const W = Math.max(300, Math.floor(rect.width || 640)), H = Math.max(240, Math.floor(rect.height || 360));
    renderer.setSize(W, H, false);
    camera.aspect = W/H;
    camera.updateProjectionMatrix();
  }

  function loadGLB(source){
    status.textContent = '3D status: loading model...';
    // remove old model
    if (model) {
      try {
        scene.remove(model);
        model.traverse(node => {
          if (node.isMesh) {
            node.geometry && node.geometry.dispose && node.geometry.dispose();
            if (node.material) {
              if (Array.isArray(node.material)){
                node.material.forEach(m => { m.map && m.map.dispose && m.map.dispose(); m.dispose && m.dispose(); });
              } else {
                node.material.map && node.material.map.dispose && node.material.map.dispose();
                node.material.dispose && node.material.dispose();
              }
            }
          }
        });
      } catch(e){ console.warn('failed to dispose previous model', e); }
      model = null;
    }

    const loader = new THREE.GLTFLoader();
    return new Promise((resolve,reject) => {
      // File object
      if (typeof source !== 'string' && source instanceof File) {
        const reader = new FileReader();
        reader.onload = (e) => {
          loader.parse(e.target.result, '', (gltf) => { onModelLoaded(gltf); resolve(gltf); }, err => reject(err));
        };
        reader.onerror = err => reject(err);
        reader.readAsArrayBuffer(source);
        return;
      }

      loader.load(source, (gltf) => { onModelLoaded(gltf); resolve(gltf); }, undefined, err => {
        status.textContent = '3D status: model load error (see console)';
        reject(err);
      });
    });
  }

  function onModelLoaded(gltf){
    model = gltf.scene || gltf.scenes[0];
    model.scale.set(1.6,1.6,1.6);
    model.position.set(0,0,0);
    scene.add(model);
    status.textContent = '3D status: model loaded — mapping design texture';

    // Map Fabric front canvas as texture
    const canvasEl = (frontCanvas && frontCanvas.getElement) ? frontCanvas.getElement() : document.querySelector('#frontCanvas');
    if (!canvasEl) {
      status.textContent = '3D status: front canvas missing';
      return;
    }

    canvasTex = new THREE.CanvasTexture(canvasEl);
    canvasTex.flipY = false;
    canvasTex.encoding = THREE.sRGBEncoding;
    canvasTex.needsUpdate = true;

    // Map texture to meshes - create clones of materials so we don't break original
    let mapped = 0;
    model.traverse(node => {
      if (node.isMesh) {
        let mat = null;
        try { mat = node.material ? node.material.clone() : new THREE.MeshStandardMaterial(); } catch(e) { mat = new THREE.MeshStandardMaterial(); }
        mat.map = canvasTex;
        mat.roughness = 0.7;
        mat.metalness = 0.06;
        mat.side = THREE.DoubleSide;
        // ensure UVs exist; if model's UV scale needs tweak, adjust mat.map.repeat / offset here
        node.material = mat;
        mapped++;
      }
    });

    status.textContent = mapped ? `3D status: texture mapped (meshes: ${mapped})` : '3D status: model loaded, but no mesh mapped';
    refresh();
  }

  function refresh(){
    if (canvasTex) canvasTex.needsUpdate = true;
  }

  function animate(){
    animId = requestAnimationFrame(animate);
    // optional slow rotation for subtle life
    if (model) model.rotation.y += 0.002;
    controls && controls.update();
    renderer && renderer.render(scene, camera);
  }

  function dispose(){
    cancelAnimationFrame(animId);
    window.removeEventListener('resize', onResize);
    try { renderer && renderer.dispose(); } catch(e){}
    if(mount) mount.innerHTML = '';
  }

  return { init, loadGLB, refresh, dispose };
})();

/* ---------- UI wiring ---------- */
function wireUI(){
  // view buttons
  $$('.view-btn').forEach(b => b.addEventListener('click', ()=> { $$('.view-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active'); setView(b.dataset.view); }));

  $('#zoomIn')?.addEventListener('click', ()=> changeZoom(1.15));
  $('#zoomOut')?.addEventListener('click', ()=> changeZoom(0.85));
  $('#fitToScreen')?.addEventListener('click', ()=> { zoomLevel = 1; applyZoom(); });

  $('#undoBtn')?.addEventListener('click', undo);
  $('#redoBtn')?.addEventListener('click', redo);
  $('#deleteBtn')?.addEventListener('click', ()=> { const o = activeCanvas && activeCanvas.getActiveObject(); if (!o) return toast('Select an object','warn'); activeCanvas.remove(o); pushSnapshot(activeCanvas); renderLayers(); updateLivePreview(); UT3D && UT3D.refresh(); });
  $('#duplicateBtn')?.addEventListener('click', ()=> { const o = activeCanvas && activeCanvas.getActiveObject(); if (!o) return toast('Select an object','warn'); o.clone(clone => { clone.left += 12; clone.top += 12; activeCanvas.add(clone); pushSnapshot(activeCanvas); renderLayers(); updateLivePreview(); UT3D && UT3D.refresh(); }); });

  $$('.size-btn').forEach(b => b.addEventListener('click', ()=> { $$('.size-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active'); selectedSize = b.dataset.size; updateOrderPrices(); }));

  // element buttons (admin-only by default hidden later)
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest && ev.target.closest('.element-btn');
    if (!btn) return;
    const elButtons = document.querySelector('.element-buttons');
    if (elButtons && elButtons.style.display === 'none') { toast('Adding elements is admin-only', 'warn'); return; }
    const type = btn.dataset.type;
    if (type === 'text') openTextModal();
    if (type === 'upload') triggerUpload();
    if (type === 'shapes') showShapeChoices();
    if (type === 'qr') addFakeQRCode();
  });

  // text modal
  $('#textEditorModal')?.querySelectorAll('.close-btn, #cancelText')?.forEach(b => b.addEventListener('click', closeTextModal));
  $('#applyText')?.addEventListener('click', applyTextFromModal);
  $('#fontSize')?.addEventListener('input', ()=> $('#fontSizeValue').textContent = $('#fontSize').value + 'px');

  // sticker upload admin
  $('#uploadGraphics')?.addEventListener('click', ()=> $('#graphicsUpload').click());
  $('#graphicsUpload')?.addEventListener('change', ev => {
    const files = Array.from(ev.target.files || []);
    files.forEach(f => { const r = new FileReader(); r.onload = e => addStickerToStore(e.target.result, f.name); r.readAsDataURL(f); });
    ev.target.value = ''; renderStickers();
  });

  // GLB upload to replace model
  $('#glbUpload')?.addEventListener('change', ev => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    UT3D.loadGLB(file).then(()=> toast('Model replaced','success')).catch(err=> { console.error(err); toast('Model load failed','error'); });
  });

  // rotate/pause 3D (toggle rotation)
  let paused = false;
  $('#toggle3D')?.addEventListener('click', e => { paused = !paused; e.target.textContent = paused ? 'Play' : 'Pause'; if (!paused) { /* nothing special; model auto-rotates slowly */ } });

  // save/load
  $('#saveDesignBtn')?.addEventListener('click', ()=> {
    try {
      const data = { front: frontCanvas ? frontCanvas.toJSON(['selectable','id']) : null, back: backCanvas ? backCanvas.toJSON(['selectable','id']) : null, meta: { size:selectedSize, baseColor: frontCanvas ? frontCanvas.backgroundColor : null } };
      localStorage.setItem('ultra_saved_design', JSON.stringify(data));
      toast('Design saved locally', 'success');
    } catch(e) { toast('Save failed','error'); }
  });
  $('#loadDesignBtn')?.addEventListener('click', ()=> {
    const raw = localStorage.getItem('ultra_saved_design'); if(!raw) return toast('No saved design','warn');
    try {
      const d = JSON.parse(raw);
      if (d.front && frontCanvas) frontCanvas.loadFromJSON(d.front, ()=> { frontCanvas.renderAll(); pushSnapshot(frontCanvas); });
      if (d.back && backCanvas) backCanvas.loadFromJSON(d.back, ()=> { backCanvas.renderAll(); pushSnapshot(backCanvas); });
      if (d.meta?.baseColor && frontCanvas) { frontCanvas.setBackgroundColor(d.meta.baseColor, frontCanvas.renderAll.bind(frontCanvas)); backCanvas.setBackgroundColor(d.meta.baseColor, backCanvas.renderAll.bind(backCanvas)); }
      renderLayers(); updateLivePreview(); UT3D && UT3D.refresh(); toast('Design loaded', 'success');
    } catch(e){ toast('Load failed','error'); console.warn(e); }
  });

  // help & order
  $('#helpBtn')?.addEventListener('click', ()=> openModal('#helpModal'));
  $$('#helpModal .close-btn')?.forEach(b => b.addEventListener('click', ()=> closeModal('#helpModal')));
  $('#orderNowBtn')?.addEventListener('click', ()=> { fillOrderModal(); openModal('#orderModal'); });
  $$('#orderModal .close-btn')?.forEach(b => b.addEventListener('click', ()=> closeModal('#orderModal')));

  // qty controls
  $('#qtyPlus')?.addEventListener('click', ()=> { $('#quantity').value = Math.max(1, parseInt($('#quantity').value || 1) + 1); updateOrderPrices(); });
  $('#qtyMinus')?.addEventListener('click', ()=> { $('#quantity').value = Math.max(1, parseInt($('#quantity').value || 1) - 1); updateOrderPrices(); });
  $('#quantity')?.addEventListener('change', updateOrderPrices);

  // add to cart
  $('#addToCartBtn')?.addEventListener('click', ()=> {
    const cart = storageGet('ultra_cart', []);
    const item = { id:'i_'+Date.now(), preview: frontCanvas ? frontCanvas.toDataURL({format:'png'}) : null, size:selectedSize, qty: parseInt($('#quantity').value || 1), total: parseFloat($('#totalPrice')?.dataset?.raw || basePriceValue) };
    cart.push(item); storageSet('ultra_cart', cart); toast('Added to cart', 'success');
  });

  // admin open/close
  $('#adminFloatingBtn')?.addEventListener('click', ()=> {
    const ap = $('#adminPanel'); if(!ap) return; const showIt = ap.style.display === 'none' || ap.style.display === ''; ap.style.display = showIt ? 'block' : 'none'; setAdminVisible(showIt); toast(showIt ? 'Admin opened' : 'Admin closed');
  });
  $('#adminCloseBtn')?.addEventListener('click', ()=> { const ap = $('#adminPanel'); if(ap) ap.style.display = 'none'; setAdminVisible(false); });

  // save settings
  $('#saveSettings')?.addEventListener('click', ()=> {
    const baseInput = $('#basePriceInput'); if (baseInput) basePriceValue = parseFloat(baseInput.value) || basePriceValue;
    storageSet(settingsKey, { basePriceValue, currency });
    $('#basePrice') && ($('#basePrice').textContent = formatCurrency(basePriceValue));
    toast('Settings saved (admin)', 'success');
    updateOrderPrices();
  });

  // file upload for stickers (admin)
  $('#uploadGraphics')?.addEventListener('click', ()=> $('#graphicsUpload').click());
  $('#graphicsUpload')?.addEventListener('change', ev => {
    const files = Array.from(ev.target.files || []);
    files.forEach(f => {
      const r = new FileReader();
      r.onload = e => addStickerToStore(e.target.result, f.name);
      r.readAsDataURL(f);
    });
    ev.target.value = '';
    renderStickers();
  });
}

/* ---------- helpers & simple flows ---------- */
function setAdminVisible(on){ const el = document.querySelector('.element-buttons'); if(el) el.style.display = on ? '' : 'none'; const cc = $('#customColorBtn'); if(cc) cc.style.display = on ? '' : 'none'; }
function openModal(sel){ const m = $(sel); if(!m) return; m.style.display = 'flex'; }
function closeModal(sel){ const m = $(sel); if(!m) return; m.style.display = 'none'; }

/* text modal */
function openTextModal(){ $('#textContent') && ($('#textContent').value='New text'); $('#fontSize') && ($('#fontSize').value=24); $('#fontSizeValue') && ($('#fontSizeValue').textContent='24px'); $('#textEditorModal') && ($('#textEditorModal').style.display='flex'); }
function closeTextModal(){ $('#textEditorModal') && ($('#textEditorModal').style.display='none'); }
function applyTextFromModal(){
  const content = $('#textContent') ? $('#textContent').value.trim() : '';
  if (!content) return toast('Please add text','warn');
  const font = $('#fontFamily') ? $('#fontFamily').value : 'Arial';
  const size = $('#fontSize') ? parseInt($('#fontSize').value) : 24;
  const color = $('#textColor') ? $('#textColor').value : '#000';
  const t = new fabric.Textbox(content, { left:100, top:140, fontFamily:font, fontSize:size, fill:color, editable:true });
  activeCanvas.add(t).setActiveObject(t); pushSnapshot(activeCanvas); renderLayers(); updateLivePreview(); UT3D && UT3D.refresh(); closeTextModal(); toast('Text added','success');
}

/* small shapes/qr */
function showShapeChoices(){ if(!activeCanvas) return; if (confirm('Add rectangle? OK = rectangle, Cancel = circle')) { const r = new fabric.Rect({ left:120, top:120, width:160, height:100, fill:'#A67C52', rx:8 }); activeCanvas.add(r).setActiveObject(r); } else { const c = new fabric.Circle({ left:160, top:160, radius:60, fill:'#6B8E23' }); activeCanvas.add(c).setActiveObject(c); } pushSnapshot(activeCanvas); renderLayers(); updateLivePreview(); UT3D && UT3D.refresh(); }
function addFakeQRCode(){ if(!activeCanvas) return; const rect = new fabric.Rect({ left:120, top:120, width:120, height:120, fill:'#111' }); const txt = new fabric.Text('QR', { left:150, top:160, fontSize:36, fill:'#fff' }); const grp = new fabric.Group([rect, txt], { left:120, top:120 }); activeCanvas.add(grp).setActiveObject(grp); pushSnapshot(activeCanvas); renderLayers(); updateLivePreview(); UT3D && UT3D.refresh(); toast('QR placeholder added','warn'); }

/* orders seed & modal */
function seedOrders(){ const body = $('#ordersTableBody'); if(!body) return; body.innerHTML=''; for(let i=0;i<6;i++){ const tr=document.createElement('tr'); tr.innerHTML = `<td>#ORD${1200+i}</td><td>Customer ${i+1}</td><td>${(new Date()).toLocaleDateString()}</td><td>${formatCurrency(2500 + i*300)}</td>`; body.appendChild(tr); } }
function fillOrderModal(){ const modalSummary = $('#modalOrderSummary'); if(!modalSummary) return; try { const data = frontCanvas.toDataURL({ format: 'png', width:240, height:Math.round(240*CANVAS_ASPECT) }); modalSummary.innerHTML = `<div style="display:flex;gap:12px;align-items:center"><img src="${data}" style="width:96px;border-radius:6px"><div><div><strong>Size:</strong> ${selectedSize}</div><div><strong>Qty:</strong> ${$('#quantity').value || 1}</div><div><strong>Total:</strong> ${$('#totalPrice').textContent}</div></div></div>`; } catch(e){ modalSummary.textContent='Unable to generate preview'; } }

/* view/zoom */
function setView(v){ const f = $('#frontCanvasWrapper'), b = $('#backCanvasWrapper'); if(!f||!b) return; if(v==='front'){ f.style.display=''; b.style.display='none'; activeCanvas = frontCanvas; } else if(v==='back'){ f.style.display='none'; b.style.display=''; activeCanvas = backCanvas; } else { f.style.display=''; b.style.display=''; activeCanvas = frontCanvas; } resizeAll(); renderLayers(); updatePropertiesPanel(); }
function changeZoom(factor){ zoomLevel = Math.min(Math.max(zoomLevel * factor, 0.4), 2.5); applyZoom(); }
function applyZoom(){ [frontCanvas, backCanvas].forEach(c => { if(!c) return; c.setZoom(zoomLevel); c.calcOffset(); c.renderAll(); }); $('#zoomLevel') && ($('#zoomLevel').textContent = Math.round(zoomLevel*100) + '%'); }

/* selection events */
function bindSelectionEvents(){ [frontCanvas, backCanvas].forEach(c => { if(!c) return; c.on('selection:created', updatePropertiesPanel); c.on('selection:updated', updatePropertiesPanel); c.on('selection:cleared', updatePropertiesPanel); }); }

/* ---------- start / boot ---------- */
function bootApp(){
  try {
    revealUI();
    wireUI();
    // create fabric canvases
    frontCanvas = makeCanvas('frontCanvas');
    backCanvas = makeCanvas('backCanvas');
    activeCanvas = frontCanvas;

    // visibility/resize
    $('#frontCanvasWrapper') && ($('#frontCanvasWrapper').style.display = '');
    $('#backCanvasWrapper') && ($('#backCanvasWrapper').style.display = 'none');
    resizeAll();

    pushSnapshot(frontCanvas); pushSnapshot(backCanvas);
    bindSelectionEvents();

    renderPalette(); renderStickers(); renderWareTypes(); seedOrders();
    updateOrderPrices(); updateLivePreview();

    // initialize 3D mock
    UT3D.init();

    // expose debug
    window.ultraDesigner = { frontCanvas: () => frontCanvas, backCanvas: () => backCanvas, addSticker: addStickerToStore, addColor };

    toast('App ready — 3D mockup will appear if tshirt.glb loads (see 3D status).', 'success', 3000);
  } catch(e){
    console.error('boot error', e);
    revealUI('Initialization error — check console');
    toast('Initialization error — see console', 'error', 6000);
  }
}

function formatCurrency(n){ const digits = Number(n||0).toFixed(2); return `${currency} ${Number(digits).toLocaleString('en-US')}`; }

/* ---------- run ---------- */
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(bootApp, 40);
} else {
  window.addEventListener('DOMContentLoaded', ()=> setTimeout(bootApp, 40));
}
