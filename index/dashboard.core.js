/* =========================================================
   dashboard.core.js  (SAFE FIXED)
   - gridRegion / gridYear kaldırıldı
   - Scope2 EF sabit (TR/2024)
   - Rapor tablosuna GENEL TOPLAM eklendi
   ========================================================= */

/* ===== Genel yardımcılar ===== */
const nf  = new Intl.NumberFormat('tr-TR',{maximumFractionDigits:0});
const nf2 = new Intl.NumberFormat('tr-TR',{maximumFractionDigits:3});
const pad = n=>String(n).padStart(2,'0');
const yyyymm = d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}`;
const safeParseFloat = (v)=>{
  const n = parseFloat(String(v ?? '').toString().replace(',','.'));
  return isFinite(n)? n : NaN;
};
const read = async f=>{
  const b=await f.arrayBuffer();
  const wb=XLSX.read(b,{type:'array'});
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:""});
};
function downloadXlsx(filename, rows, sheetName='Sheet1'){
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const wbout = XLSX.write(wb,{bookType:'xlsx', type:'array'});
  const blob = new Blob([wbout],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1500);
}
function toCSV(rows, headers){
  const esc = v => `"${String(v??'').replaceAll('"','""')}"`;
  return [headers.join(','), ...rows.map(r=>headers.map(h=>esc(r[h])).join(','))].join('\n');
}
function downloadText(filename, text, mime='text/plain'){
  const blob = new Blob([text], {type:mime});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1500);
}

/* ===== DOM ===== */
const fileS1 = document.getElementById('fileS1');
const fileS2 = document.getElementById('fileS2');
const fileS3 = document.getElementById('fileS3');

const calcS1 = document.getElementById('calcS1');
const calcS2 = document.getElementById('calcS2');
const calcS3 = document.getElementById('calcS3');

const sampleS1 = document.getElementById('sampleS1');
const sampleS2 = document.getElementById('sampleS2');
const sampleS3 = document.getElementById('sampleS3');

const runReport = document.getElementById('runReport');
const dlCsv = document.getElementById('dlCsv');
const dlJson = document.getElementById('dlJson');

const btnUpgrade = document.getElementById('btnUpgrade');
const insightsEl = document.getElementById('insights');

/* ===== EF tabloları ===== */
const EF_S1 = {
  'dizel':     { 'litre': 2.64, 'l': 2.64, 'kg': 3.16 },
  'benzin':    { 'litre': 2.31, 'l': 2.31 },
  'dogalgaz':  { 'm3': 1.93 }, 'doğalgaz': { 'm3': 1.93 },
  'lpg':       { 'litre': 1.51, 'l': 1.51, 'kg': 1.61 },
  'komur':     { 'kg': 2.42 }, 'kömür': { 'kg': 2.42 }
};
const EF_S2_GRID = {
  TR:   { 2025: 0.405, 2024: 0.420, 2023: 0.440 },
  EU27: { 2025: 0.230, 2024: 0.250, 2023: 0.270 },
  INTL: { 2025: 0.450, 2024: 0.470, 2023: 0.490 }
};

// ✅ Ülke/Şebeke kaldırıldı → sabit EF
function getGridEF(){
  // İstersen 2025 yap: return EF_S2_GRID.TR[2025];
  return EF_S2_GRID.TR[2024];
}

const EF_S3 = { road:0.121, rail:0.019, ship:0.015 };

/* ===== Store (oturum) ===== */
const store = []; // {scope,date,kg,category,meta}

/* ===== Premium UI (DB’den gelecek) ===== */
window.__isPremium = false; // Firestore plan yazacak
window.__uid = null;

function applyPremiumUI(){
  document.body.classList.toggle('premium-on', window.__isPremium);

  const status = document.getElementById('premiumStatus');
  if(status) status.style.display = window.__isPremium ? 'block' : 'none';

  // premium-only butonlar
  document.querySelectorAll('.premium-only').forEach(el=>{
    el.style.display = window.__isPremium ? '' : 'none';
  });

  if(btnUpgrade){
    if(window.__isPremium){
      btnUpgrade.textContent = 'Premium Aktif';
      btnUpgrade.disabled = true;
      btnUpgrade.style.opacity = '0.7';
      btnUpgrade.style.cursor = 'default';
    }else{
      btnUpgrade.textContent = "Premium'a Geç";
      btnUpgrade.disabled = false;
      btnUpgrade.style.opacity = '';
      btnUpgrade.style.cursor = '';
    }
  }
}
window.applyPremiumUI = applyPremiumUI;
applyPremiumUI();

/* ===== Scope bazlı store yönetimi ===== */
function normScopeGlobal(v){
  const s = String(v||"").toLowerCase().trim();
  if(s === "s1" || s === "scope1" || s === "scope 1" || s === "1") return "s1";
  if(s === "s2" || s === "scope2" || s === "scope 2" || s === "2") return "s2";
  if(s === "s3" || s === "scope3" || s === "scope 3" || s === "3") return "s3";
  if(s === "all" || s === "tümü" || s === "tum" || s === "tumu") return "all";
  return s;
}

function replaceScopeInStore(scope, items){
  for(let i=store.length-1;i>=0;i--){
    if(normScopeGlobal(store[i]?.scope) === normScopeGlobal(scope)) store.splice(i,1);
  }
  (items||[]).forEach(it=>{
    store.push({ ...it, scope: normScopeGlobal(scope) });
  });
}

/* ===== Validasyon ===== */
const S1_REQUIRED = ['sirket_kodu','tesis_kodu','tarih','yakit_tipi','miktar','birim','veri_kaynagi'];
const S2_REQUIRED = ['sirket_kodu','tesis_kodu','ay','yil','tuketim_kwh','veri_kaynagi'];
const S3_REQUIRED = ['sirket_kodu','tesis_kodu','tarih','mod','ton','km','ef_kaynagi'];

function ensureColumns(rows, required){
  const header = rows.length ? Object.keys(rows[0]).map(h=>String(h).toLowerCase().trim()) : [];
  const missing = required.filter(r=>!header.includes(r));
  return { header, missing };
}

/* ===== Grafik ===== */
function makePie(ctx,labels,data,title){
  if(!ctx) return;
  if(ctx._chart) ctx._chart.destroy();
  const safe = v=> (isFinite(parseFloat(v))? parseFloat(v) : 0);
  const dataKg = (data||[]).map(safe);
  const totalKg = dataKg.reduce((a,b)=>a+b,0);

  const labelPlugin = {
    id:'valueLabels',
    afterDatasetsDraw(chart){
      const c = chart.ctx; c.save();
      c.font = '700 12px ui-sans-serif,system-ui,Segoe UI,Roboto,Arial';
      c.fillStyle = '#fff'; c.textAlign='center'; c.textBaseline='middle';
      const meta = chart.getDatasetMeta(0);
      meta.data.forEach((el, i)=>{
        const kg = dataKg[i]||0; if(kg<=0) return;
        const pct = totalKg ? (kg/totalKg*100).toFixed(1) : '0.0';
        const tons = kg/1000.0;
        const p = el.tooltipPosition();
        c.fillText(`${pct}%`, p.x, p.y - 6);
        c.fillText(`${nf2.format(tons)} t`, p.x, p.y + 8);
      });
      c.restore();
    }
  };

  ctx._chart = new Chart(ctx, {
    type:'pie',
    data:{ labels, datasets:[{ data:dataKg }] },
    options:{
      animation:false,
      plugins:{
        legend:{ labels:{ color:'#e6e9f2' }},
        title:{ display:true, text:title, color:'#e6e9f2' },
        tooltip:{ callbacks:{
          label:(context)=>{
            const kg = (context.parsed||0);
            const t = kg/1000.0;
            const pct = totalKg ? (kg/totalKg*100).toFixed(1) : '0.0';
            return `${context.label}: ${nf.format(kg)} kg • ${nf2.format(t)} t • ${pct}%`;
          }
        }}
      }
    },
    plugins:[labelPlugin]
  });
}

function makeReportChart(period, scope, rows){
  const ctx=document.getElementById('reportChart'); if(!ctx) return;
  if(ctx._chart) ctx._chart.destroy();

  if(!rows || !rows.length){
    ctx._chart = new Chart(ctx, {
      type:'bar',
      data:{ labels:[], datasets:[{label:'tCO₂', data:[]}] }
    });
    return;
  }

  if(scope==='all'){
    const labels = rows.map(r=>r[0]);
    const s1 = rows.map(r=> (r[1].s1||0)/1000);
    const s2 = rows.map(r=> (r[1].s2||0)/1000);
    const s3 = rows.map(r=> (r[1].s3||0)/1000);
    ctx._chart = new Chart(ctx, {
      type:'bar',
      data:{ labels, datasets:[
        {label:'S1 (tCO₂)', data:s1},
        {label:'S2 (tCO₂)', data:s2},
        {label:'S3 (tCO₂)', data:s3}
      ]},
      options:{
        plugins:{
          legend:{labels:{color:'#e6e9f2'}},
          title:{display:true,text:(period==='yearly'?'Yıllık':'Aylık')+' Toplam tCO₂ (Stacked)',color:'#e6e9f2'}
        },
        scales:{
          x:{stacked:true,ticks:{color:'#e6e9f2'}},
          y:{stacked:true,ticks:{color:'#e6e9f2'}}
        }
      }
    });
  }else{
    const lbls = rows.map(r=>r[0]);
    const data = rows.map(r=> (r[1]/1000));
    ctx._chart = new Chart(ctx,{
      type:'bar',
      data:{labels:lbls, datasets:[{label:'tCO₂', data}]},
      options:{
        plugins:{
          legend:{labels:{color:'#e6e9f2'}},
          title:{display:true,text:(period==='yearly'?'Yıllık':'Aylık')+' Toplam tCO₂',color:'#e6e9f2'}
        },
        scales:{x:{ticks:{color:'#e6e9f2'}},y:{ticks:{color:'#e6e9f2'}}}
      }
    });
  }
}

/* ===== Sekmeler ===== */
document.querySelectorAll('.tab').forEach(t=>{
  t.addEventListener('click', ()=>{
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    t.classList.add('active');
    ['s1','s2','s3'].forEach(id=>{
      document.getElementById(id).style.display=(t.dataset.scope===id?'grid':'none');
    });
  });
});

/* ===== Templates ===== */
sampleS1?.addEventListener('click', ()=>{
  const rows = [
    { sirket_kodu:'TALAY', tesis_kodu:'IST', tarih:'2024-12-01', yakit_tipi:'dizel',    miktar:100,  birim:'litre', veri_kaynagi:'manuel' },
    { sirket_kodu:'TALAY', tesis_kodu:'IST', tarih:'2024-12-03', yakit_tipi:'lpg',      miktar:60,   birim:'litre', veri_kaynagi:'fatura' },
    { sirket_kodu:'TALAY', tesis_kodu:'IST', tarih:'2024-12-05', yakit_tipi:'benzin',   miktar:40,   birim:'litre', veri_kaynagi:'manuel' },
    { sirket_kodu:'TALAY', tesis_kodu:'IST', tarih:'2024-12-07', yakit_tipi:'doğalgaz', miktar:300,  birim:'m3',    veri_kaynagi:'fatura' },
    { sirket_kodu:'TALAY', tesis_kodu:'IST', tarih:'2024-12-10', yakit_tipi:'kömür',    miktar:120,  birim:'kg',    veri_kaynagi:'manuel' }
  ];
  downloadXlsx('carbonizi_scope1_sablon.xlsx', rows, 'S1');
});
sampleS2?.addEventListener('click', ()=>{
  const rows = [
    { sirket_kodu:'TALAY', tesis_kodu:'IST', ay:10, yil:2024, tuketim_kwh:12000, veri_kaynagi:'fatura' },
    { sirket_kodu:'TALAY', tesis_kodu:'IST', ay:11, yil:2024, tuketim_kwh:13500, veri_kaynagi:'fatura' },
    { sirket_kodu:'TALAY', tesis_kodu:'IST', ay:12, yil:2024, tuketim_kwh:15000, veri_kaynagi:'manuel' },
    { sirket_kodu:'TALAY', tesis_kodu:'IZM', ay:12, yil:2024, tuketim_kwh:8600,  veri_kaynagi:'fatura' }
  ];
  downloadXlsx('carbonizi_scope2_sablon.xlsx', rows, 'S2');
});
sampleS3?.addEventListener('click', ()=>{
  const rows = [
    { sirket_kodu:'TALAY', tesis_kodu:'IST', tarih:'2024-12-05', mod:'road', ton:12.5, km:420, ef_kaynagi:'default' },
    { sirket_kodu:'TALAY', tesis_kodu:'IST', tarih:'2024-12-06', mod:'rail', ton:18,   km:650, ef_kaynagi:'default' },
    { sirket_kodu:'TALAY', tesis_kodu:'IST', tarih:'2024-12-08', mod:'ship', ton:220,  km:900, ef_kaynagi:'default' },
    { sirket_kodu:'TALAY', tesis_kodu:'IZM', tarih:'2024-12-10', mod:'karayolu', ton:8.2, km:310, ef_kaynagi:'default' }
  ];
  downloadXlsx('carbonizi_scope3_sablon.xlsx', rows, 'S3');
});

/* ===== Firebase geçmiş seçimi (premium) ===== */
const loadedUploads = new Set();

async function getSelectedHistoryItems(scope){
  if(!window.__isPremium) return { uploadId:"", items:[] };

  const selId = scope==="s1" ? "pickS1" : scope==="s2" ? "pickS2" : "pickS3";
  const uploadId = document.getElementById(selId)?.value || "";
  if(!uploadId) return { uploadId:"", items:[] };

  if(!window.__uid) { alert("Oturum bulunamadı. Lütfen yeniden giriş yap."); return { uploadId:"", items:[] }; }
  if(!window.loadUploadItems) { alert("loadUploadItems bulunamadı (firebase script kontrol)."); return { uploadId:"", items:[] }; }

  try{
    const items = await window.loadUploadItems(window.__uid, uploadId);
    return { uploadId, items: Array.isArray(items) ? items : [] };
  }catch(e){
    console.error("getSelectedHistoryItems error:", e);
    alert("Geçmiş yükleme hatası: " + (e?.message || e));
    return { uploadId:"", items:[] };
  }
}

function renderScopeFromItems(scope, items){
  const sumKg = (items||[]).reduce((a,b)=>a + (b?.kg||0), 0);
  const parts = {};
  (items||[]).forEach(it=>{
    const k = it?.category || 'other';
    parts[k] = (parts[k]||0) + (it?.kg||0);
  });

  if(scope==="s1"){
    document.getElementById("s1kg").textContent = nf.format(sumKg);
    document.getElementById("s1t").textContent  = nf2.format(sumKg/1000);
    makePie(document.getElementById("chartS1"), Object.keys(parts), Object.values(parts), "Scope 1 Dağılımı (Geçmiş)");
  } else if(scope==="s2"){
    document.getElementById("s2kg").textContent = nf.format(sumKg);
    document.getElementById("s2t").textContent  = nf2.format(sumKg/1000);
    makePie(document.getElementById("chartS2"), Object.keys(parts), Object.values(parts), "Scope 2 Dağılımı (Geçmiş)");
  } else if(scope==="s3"){
    document.getElementById("s3kg").textContent = nf.format(sumKg);
    document.getElementById("s3t").textContent  = nf2.format(sumKg/1000);
    makePie(document.getElementById("chartS3"), Object.keys(parts), Object.values(parts), "Scope 3 Dağılımı (Geçmiş)");
  }
}

async function loadHistory(scope){
  const selId = scope==="s1" ? "pickS1" : scope==="s2" ? "pickS2" : "pickS3";
  const uploadId = document.getElementById(selId)?.value;
  if(!uploadId) return alert("Önce geçmişten bir kayıt seç.");

  if(!window.__uid) return alert("Oturum bulunamadı. Lütfen yeniden giriş yap.");
  if(!window.__isPremium) return alert("Geçmişten seçme premiumda aktif.");
  if(!window.loadUploadItems) return alert("loadUploadItems bulunamadı (firebase script kontrol).");

  try{
    const items = await window.loadUploadItems(window.__uid, uploadId);
    if(!items || !items.length){
      alert("Bu upload’ın satır verisi (rows/items) boş.");
      return;
    }

    // ✅ double counting yok
    if(!loadedUploads.has(uploadId)){
      loadedUploads.add(uploadId);
    } else {
      // zaten yüklendiyse store'a tekrar basma
    }

    // ✅ store’da ilgili scope’u tamamen bununla değiştir
    replaceScopeInStore(scope, items);
    renderScopeFromItems(scope, items);

    // ✅ raporu otomatik güncelle
    const scopeSel = document.getElementById("scopeSel");
    if(scopeSel) scopeSel.value = scope;
    document.getElementById("runReport")?.click();

    alert(`Yüklendi ✅\nSatır: ${items.length}`);
  }catch(e){
    console.error("History load error:", e);
    alert("Geçmiş yükleme hatası: " + (e?.message || e));
  }
}

document.getElementById("loadS1")?.addEventListener("click", ()=>loadHistory("s1"));
document.getElementById("loadS2")?.addEventListener("click", ()=>loadHistory("s2"));
document.getElementById("loadS3")?.addEventListener("click", ()=>loadHistory("s3"));

/* ===== Scope 1 ===== */
calcS1?.addEventListener('click', async ()=>{
  const errorsEl=document.getElementById('s1errors'); errorsEl.textContent='';
  const f=fileS1?.files?.[0];
  const hist = await getSelectedHistoryItems('s1');
  let rows = [];
  if(!f && !hist.uploadId) return alert('Dosya seçin veya geçmişten bir kayıt seçin');

  if(f){
    rows = await read(f);
    const {missing}=ensureColumns(rows,S1_REQUIRED);
    if(missing.length){ errorsEl.textContent='Eksik kolon: '+missing.join(', '); return; }
  }

  let sumKg=0; const toAdd=[];

  for(let idx=0; idx<rows.length; idx++){
    const r = rows[idx];
    const d = new Date(r.tarih);
    const yakitRaw = String(r.yakit_tipi||'').toLowerCase().trim();
    const yakitKey = yakitRaw.replaceAll('ğ','g').replaceAll('ı','i').replaceAll('ş','s').replaceAll('ç','c').replaceAll('ö','o').replaceAll('ü','u');
    const birim = String(r.birim||'').toLowerCase().trim();
    const miktar = safeParseFloat(r.miktar);
    const ef = (EF_S1[yakitKey]||{})[birim] || 0;

    if(!isFinite(miktar) || miktar<0){ errorsEl.textContent = `Satır ${idx+2}: miktar geçersiz`; return; }
    if(!ef){ errorsEl.textContent = `Satır ${idx+2}: EF bulunamadı (yakit_tipi/birim)`; return; }

    const kg = miktar * ef;
    sumKg += kg;

    toAdd.push({
      scope:'s1',
      date: isFinite(d.getTime()) ? yyyymm(d) : 'unknown',
      kg,
      category: yakitKey,
      meta: { yakit_tipi:yakitRaw, birim, miktar }
    });
  }

  const combinedItems = [...(hist.items||[]), ...toAdd];
  const combinedSumKg = combinedItems.reduce((a,b)=>a + (b?.kg||0), 0);
  const combinedParts = {};
  combinedItems.forEach(it=>{
    const k = it?.category || 'other';
    combinedParts[k] = (combinedParts[k]||0) + (it?.kg||0);
  });

  replaceScopeInStore('s1', combinedItems);

  document.getElementById('s1kg').textContent = nf.format(combinedSumKg);
  document.getElementById('s1t').textContent  = nf2.format(combinedSumKg/1000);
  makePie(document.getElementById('chartS1'), Object.keys(combinedParts), Object.values(combinedParts), 'Scope 1 Dağılımı');
});

/* ===== Scope 2 ===== */
calcS2?.addEventListener('click', async ()=>{
  const errorsEl=document.getElementById('s2errors'); errorsEl.textContent='';
  const f=fileS2?.files?.[0];
  const hist = await getSelectedHistoryItems('s2');
  let rows = [];
  if(!f && !hist.uploadId) return alert('Dosya seçin veya geçmişten bir kayıt seçin');

  if(f){
    rows = await read(f);
    const {missing}=ensureColumns(rows,S2_REQUIRED);
    if(missing.length){ errorsEl.textContent='Eksik kolon: '+missing.join(', '); return; }
  }

  const gridEF = getGridEF();
  const parts={ elektrik:0 };
  const toAdd=[];

  for(let idx=0; idx<rows.length; idx++){
    const r = rows[idx];
    const ay = +r.ay;
    const yil = +r.yil;
    const kwh = safeParseFloat(r.tuketim_kwh);

    if(!isFinite(kwh) || kwh<0){ errorsEl.textContent = `Satır ${idx+2}: tuketim_kwh geçersiz`; return; }

    const d = new Date(yil, (isFinite(ay)? (ay-1) : 0), 1);
    const kg = kwh * gridEF;

    parts.elektrik += kg;

    toAdd.push({
      scope:'s2',
      date: yyyymm(d),
      kg,
      category:'elektrik',
      meta:{ ay, yil, kwh, gridEF }
    });
  }

  const combinedItems = [...(hist.items||[]), ...toAdd];
  const combinedSumKg = combinedItems.reduce((a,b)=>a + (b?.kg||0), 0);

  replaceScopeInStore('s2', combinedItems);

  document.getElementById('s2kg').textContent = nf.format(combinedSumKg);
  document.getElementById('s2t').textContent  = nf2.format(combinedSumKg/1000);
  makePie(document.getElementById('chartS2'), ['elektrik'], [combinedSumKg], `Scope 2 (EF sabit TR/2024=${gridEF})`);
});

/* ===== Scope 3 ===== */
function normalizeMode(v){
  const s = String(v||'').toLowerCase().trim();
  if(['road','karayolu','kara','truck','ttruck'].includes(s)) return 'road';
  if(['rail','demiryolu','tren'].includes(s)) return 'rail';
  if(['ship','sea','denizyolu','gemi'].includes(s)) return 'ship';
  return s;
}

calcS3?.addEventListener('click', async ()=>{
  const errorsEl=document.getElementById('s3errors'); errorsEl.textContent='';
  const f=fileS3?.files?.[0];
  const hist = await getSelectedHistoryItems('s3');
  let rows = [];
  if(!f && !hist.uploadId) return alert('Dosya seçin veya geçmişten bir kayıt seçin');

  if(f){
    rows = await read(f);
    const {missing}=ensureColumns(rows,S3_REQUIRED);
    if(missing.length){ errorsEl.textContent='Eksik kolon: '+missing.join(', '); return; }
  }

  const toAdd=[];
  for(let idx=0; idx<rows.length; idx++){
    const r = rows[idx];
    const d = new Date(r.tarih);
    const mod = normalizeMode(r.mod);
    const ton = safeParseFloat(r.ton);
    const km  = safeParseFloat(r.km);
    const ef  = EF_S3[mod] || 0;

    if(!isFinite(ton) || ton<0 || !isFinite(km) || km<0){ errorsEl.textContent = `Satır ${idx+2}: ton/km geçersiz`; return; }
    if(!ef){ errorsEl.textContent = `Satır ${idx+2}: EF yok (mod road/rail/ship)`; return; }

    const kg = ton * km * ef;

    toAdd.push({
      scope:'s3',
      date: isFinite(d.getTime()) ? yyyymm(d) : 'unknown',
      kg,
      category:mod,
      meta:{ ton, km, ef }
    });
  }

  const combinedItems = [...(hist.items||[]), ...toAdd];
  const combinedSumKg = combinedItems.reduce((a,b)=>a + (b?.kg||0), 0);
  const combinedParts = {};
  combinedItems.forEach(it=>{
    const k = it?.category || 'other';
    combinedParts[k] = (combinedParts[k]||0) + (it?.kg||0);
  });

  replaceScopeInStore('s3', combinedItems);

  document.getElementById('s3kg').textContent = nf.format(combinedSumKg);
  document.getElementById('s3t').textContent  = nf2.format(combinedSumKg/1000);
  makePie(document.getElementById('chartS3'), Object.keys(combinedParts), Object.values(combinedParts), 'Scope 3 Dağılımı');
});

/* ===== Raporlar ===== */
let lastExportRows = [];
let lastExportHeaders = [];

function renderReportTable(period, scope, grouped){
  const sNorm = normScopeGlobal(scope);
  const el = document.getElementById('reportTable');
  if(!el) return;

  if(sNorm === 'all'){
    const rows = grouped.map(([k,v])=>({
      donem:k,
      s1_kg: (v.s1||0),
      s2_kg: (v.s2||0),
      s3_kg: (v.s3||0),
      toplam_kg: (v.s1||0)+(v.s2||0)+(v.s3||0)
    }));

    const totalRow = rows.reduce((a,r)=>({
      donem:'GENEL TOPLAM',
      s1_kg: a.s1_kg + r.s1_kg,
      s2_kg: a.s2_kg + r.s2_kg,
      s3_kg: a.s3_kg + r.s3_kg,
      toplam_kg: a.toplam_kg + r.toplam_kg
    }), {donem:'GENEL TOPLAM', s1_kg:0, s2_kg:0, s3_kg:0, toplam_kg:0});

    const exportRows = [...rows, totalRow].map(r=>({
      donem:r.donem,
      s1_kg:nf.format(r.s1_kg),
      s2_kg:nf.format(r.s2_kg),
      s3_kg:nf.format(r.s3_kg),
      toplam_kg:nf.format(r.toplam_kg)
    }));

    lastExportHeaders = ['donem','s1_kg','s2_kg','s3_kg','toplam_kg'];
    lastExportRows = exportRows;

    el.innerHTML = `
      <table>
        <thead><tr>
          <th>Dönem</th><th>S1 (kg)</th><th>S2 (kg)</th><th>S3 (kg)</th><th>Toplam (kg)</th>
        </tr></thead>
        <tbody>
          ${rows.map(r=>`
            <tr>
              <td>${r.donem}</td>
              <td>${nf.format(r.s1_kg)}</td>
              <td>${nf.format(r.s2_kg)}</td>
              <td>${nf.format(r.s3_kg)}</td>
              <td>${nf.format(r.toplam_kg)}</td>
            </tr>`).join('')}
          <tr style="border-top:2px solid var(--border);font-weight:800">
            <td>GENEL TOPLAM</td>
            <td>${nf.format(totalRow.s1_kg)}</td>
            <td>${nf.format(totalRow.s2_kg)}</td>
            <td>${nf.format(totalRow.s3_kg)}</td>
            <td>${nf.format(totalRow.toplam_kg)}</td>
          </tr>
        </tbody>
      </table>
    `;
  } else {
    const rows = grouped.map(([k,kg])=>({ donem:k, kg:(kg||0) }));
    const totalKg = rows.reduce((a,r)=>a + r.kg, 0);

    const exportRows = [
      ...rows.map(r=>({donem:r.donem, kg:nf.format(r.kg), ton:nf2.format(r.kg/1000)})),
      {donem:'GENEL TOPLAM', kg:nf.format(totalKg), ton:nf2.format(totalKg/1000)}
    ];

    lastExportHeaders = ['donem','kg','ton'];
    lastExportRows = exportRows;

    el.innerHTML = `
      <table>
        <thead><tr><th>Dönem</th><th>kg CO₂</th><th>t CO₂</th></tr></thead>
        <tbody>
          ${rows.map(r=>`
            <tr><td>${r.donem}</td><td>${nf.format(r.kg)}</td><td>${nf2.format(r.kg/1000)}</td></tr>
          `).join('')}
          <tr style="border-top:2px solid var(--border);font-weight:800">
            <td>GENEL TOPLAM</td><td>${nf.format(totalKg)}</td><td>${nf2.format(totalKg/1000)}</td>
          </tr>
        </tbody>
      </table>
    `;
  }
}

function buildInsights(scope, grouped){
  const sNorm = normScopeGlobal(scope);
  if(!window.__isPremium || !insightsEl) return;

  if(sNorm === 'all'){
    insightsEl.innerHTML = `<div class="muted"><b>Premium içgörü:</b> Scope kırılımı ve dönem bazlı toplamlar hazır.</div>`;
    return;
  }
  if(!grouped.length){
    insightsEl.innerHTML = `<div class="muted"><b>Premium içgörü:</b> Veri yok.</div>`;
    return;
  }
  const max = grouped.reduce((a,b)=> (b[1]>a[1]? b : a), grouped[0]);
  insightsEl.innerHTML = `
    <div class="muted"><b>Premium içgörü:</b> En yüksek dönem: <span class="mono">${max[0]}</span> (${nf.format(max[1])} kg)</div>
  `;
}

runReport?.addEventListener('click', ()=>{
  const period = document.getElementById('period')?.value || 'monthly';
  const scope  = document.getElementById('scopeSel')?.value || 's1';

  const keyFn = (rec)=>{
    if(period === 'yearly'){
      const y = String(rec.date||'').slice(0,4);
      return y && y !== 'unkn' ? y : 'unknown';
    }
    return rec.date || 'unknown';
  };

  const sNorm = normScopeGlobal(scope);
  const filtered = (sNorm === 'all') ? store.slice() : store.filter(x=>normScopeGlobal(x.scope) === sNorm);

  if(!filtered.length){
    const rt = document.getElementById('reportTable');
    if(rt) rt.innerHTML = `<div class="muted">Henüz veri yok. Önce S1/S2/S3 hesapla.</div>`;
    if(insightsEl) insightsEl.innerHTML = '';
    makeReportChart(period, scope, []);
    return;
  }

  if(sNorm === 'all'){
    const map = new Map();
    filtered.forEach(rec=>{
      const k = keyFn(rec);
      if(!map.has(k)) map.set(k, {s1:0,s2:0,s3:0});
      const obj = map.get(k);
      const rsc = normScopeGlobal(rec.scope);
      obj[rsc] = (obj[rsc]||0) + (rec.kg||0);
    });
    const grouped = Array.from(map.entries()).sort((a,b)=> String(a[0]).localeCompare(String(b[0])));
    makeReportChart(period, scope, grouped);
    renderReportTable(period, scope, grouped);
    buildInsights(scope, grouped);
  } else {
    const map = new Map();
    filtered.forEach(rec=>{
      const k = keyFn(rec);
      map.set(k, (map.get(k)||0) + (rec.kg||0));
    });
    const grouped = Array.from(map.entries()).sort((a,b)=> String(a[0]).localeCompare(String(b[0])));
    makeReportChart(period, scope, grouped);
    renderReportTable(period, scope, grouped);
    buildInsights(scope, grouped);
  }
});

/* ===== Export butonları ===== */
dlCsv?.addEventListener('click', ()=>{
  if(!window.__isPremium) return;
  if(!lastExportRows.length) return alert('Önce rapor sorgula.');
  const csv = toCSV(lastExportRows, lastExportHeaders);
  downloadText('carbonizi_rapor.csv', csv, 'text/csv;charset=utf-8');
});

dlJson?.addEventListener('click', ()=>{
  if(!window.__isPremium) return;
  if(!lastExportRows.length) return alert('Önce rapor sorgula.');

  const ws = XLSX.utils.json_to_sheet(lastExportRows, { header: lastExportHeaders });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Rapor');

  const wbout = XLSX.write(wb, { bookType:'xlsx', type:'array' });
  const blob = new Blob([wbout], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'carbonizi_rapor.xlsx';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1500);
});
