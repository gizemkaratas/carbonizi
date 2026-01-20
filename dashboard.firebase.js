import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc,
  collection, addDoc, serverTimestamp,
  query, orderBy, limit, getDocs, where
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCPGjInLgdVkN0mSSE0TRsAJwCCDax7TiI",
  authDomain: "carbonizi.firebaseapp.com",
  projectId: "carbonizi",
  storageBucket: "carbonizi.firebasestorage.app",
  messagingSenderId: "789010907611",
  appId: "1:789010907611:web:8d279f92ad8a23b75a67fe"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ✅ Scope bazlı geçmiş upload listesini dropdown'a bas
async function fillScopePicker(uid, scope){
  const sel = document.getElementById(scope === "s1" ? "pickS1" : scope === "s2" ? "pickS2" : "pickS3");
  if(!sel) return;

  sel.innerHTML = `<option value="">— Seç —</option>`;

  // premium değilse dropdown boş kalsın
  if(!window.__isPremium) return;

  const base = collection(db, "users", uid, "uploads");
  const qRef = query(base, where("scope","==", scope), limit(30));
  const snap = await getDocs(qRef);

  snap.forEach(d=>{
    const x = d.data() || {};
    const label = `${(x.fileName||"dosya")} · ${(x.rowCount??0)} satır · ${(x.totalKg??0)} kg`;
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = label;
    sel.appendChild(opt);
  });
}

// ✅ Seçilen upload'ın rows/items verilerini çek
async function loadUploadItems(uid, uploadId){
  const rowsSnap = await getDocs(collection(db, "users", uid, "uploads", uploadId, "rows"));
  const all = [];
  rowsSnap.forEach(r=>{
    const data = r.data();
    if(Array.isArray(data?.items)) all.push(...data.items);
  });

  // ✅ rows yoksa upload doc içindeki items’ten dene
  if(all.length === 0){
    const metaSnap = await getDoc(doc(db, "users", uid, "uploads", uploadId));
    const meta = metaSnap.exists() ? metaSnap.data() : null;
    if(meta && Array.isArray(meta.items)) return meta.items;
  }

  return all; // [{scope,date,kg,category,meta}, ...]
}

// dışarı aç
window.fillScopePicker = fillScopePicker;
window.loadUploadItems = loadUploadItems;

async function loadPlan(uid){
  const userRef = doc(db, "users", uid);
  const snap = await getDoc(userRef);

  // ✅ user doc yoksa oluştur (premium/plan okumak için şart)
  if(!snap.exists()){
    await setDoc(userRef, {
      plan: "basic",
      createdAt: serverTimestamp()
    }, { merge: true });

    window.__isPremium = false;
    window.applyPremiumUI?.();
    return;
  }

  const data = snap.data();
  window.__isPremium = (data.plan === "premium");
  window.applyPremiumUI?.();
}

/* ✅ Firestore’a upload kaydetme (premium) */
window.saveUploadToDB = async function(uid, scope, fileName, items, totalKg){
  const uploadRef = await addDoc(collection(db, "users", uid, "uploads"), {
    scope,
    fileName: fileName || "unknown",
    rowCount: items.length,
    totalKg: totalKg,
    createdAt: serverTimestamp(),
    status: "ok",
    // ✅ küçük dosyalarda fallback: items’i direkt burada da tut
    items: items.length <= 200 ? items : null
  });

  // 1MB limitine takılmamak için satırları paketliyoruz
  const chunkSize = 200;
  for(let i=0; i<items.length; i+=chunkSize){
    const chunk = items.slice(i, i+chunkSize);
    await addDoc(collection(db, "users", uid, "uploads", uploadRef.id, "rows"), {
      items: chunk
    });
  }

  return uploadRef.id;
};

function fmtDate(ts){
  try{
    if(!ts) return "-";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString("tr-TR");
  }catch{
    return "-";
  }
}

window.loadUploads = async function(uid, scopeFilter="all"){
  const box = document.getElementById("uploadsBox");
  if(!box) return;

  if(!window.__isPremium){
    const pickS1 = document.getElementById("pickS1");
    const pickS2 = document.getElementById("pickS2");
    const pickS3 = document.getElementById("pickS3");
    if(pickS1) pickS1.innerHTML = `<option value="">— Seç —</option>`;
    if(pickS2) pickS2.innerHTML = `<option value="">— Seç —</option>`;
    if(pickS3) pickS3.innerHTML = `<option value="">— Seç —</option>`;

    box.innerHTML = `
      <div style="padding:12px; opacity:.85">
        Standart kullanıcı: Geçmiş yüklemeler premiumda açıktır.
      </div>`;
    return;
  }

  box.innerHTML = "Yüklemeler yükleniyor...";

  const base = collection(db, "users", uid, "uploads");
  let qRef;

  if(scopeFilter === "all"){
    qRef = query(base, orderBy("createdAt","desc"), limit(50));
  }else{
    qRef = query(base, where("scope","==", scopeFilter), limit(50));
  }

  const snap = await getDocs(qRef);

  if(snap.empty){
    box.innerHTML = `<div class="muted">Henüz kayıtlı upload yok. Premium kullanıcı olarak dosya yükleyip “Hesapla” de.</div>`;
    return;
  }

  const rows = [];
  snap.forEach(docu=>{
    const d = docu.data();
    rows.push({
      id: docu.id,
      scope: d.scope || "-",
      fileName: d.fileName || "-",
      rowCount: d.rowCount ?? "-",
      totalKg: d.totalKg ?? "-",
      createdAt: d.createdAt
    });
  });

  // ✅ Üstteki "Geçmişten seç (S1/S2/S3)" dropdown'larını doldur
  const picks = {
    s1: document.getElementById("pickS1"),
    s2: document.getElementById("pickS2"),
    s3: document.getElementById("pickS3"),
  };

  ["s1","s2","s3"].forEach(sc=>{
    const sel = picks[sc];
    if(!sel) return;
    sel.innerHTML = `<option value="">— Seç —</option>`;
  });

  const normScope = (v)=>{
    const s = String(v||"").toLowerCase().trim();
    if(s === "s1" || s === "scope1" || s === "scope 1" || s === "1") return "s1";
    if(s === "s2" || s === "scope2" || s === "scope 2" || s === "2") return "s2";
    if(s === "s3" || s === "scope3" || s === "scope 3" || s === "3") return "s3";
    return s;
  };

  rows.forEach(r=>{
    const sc = normScope(r.scope);
    const sel = picks[sc];
    if(!sel) return;

    const label = `${r.fileName} · ${r.rowCount} satır · ${r.totalKg} kg`;
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = label;
    sel.appendChild(opt);
  });

  box.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Tarih</th>
          <th>Scope</th>
          <th>Dosya</th>
          <th>Satır</th>
          <th>Toplam kg</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r=>`
          <tr>
            <td>${fmtDate(r.createdAt)}</td>
            <td>${String(r.scope).toUpperCase()}</td>
            <td>${r.fileName}</td>
            <td>${r.rowCount}</td>
            <td>${r.totalKg}</td>
            <td><button class="btn ghost" data-upload="${r.id}" type="button">Aç</button></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  box.querySelectorAll("button[data-upload]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const uploadId = btn.getAttribute("data-upload");
      showUploadDetail(uid, uploadId);
    });
  });
};

async function showUploadDetail(uid, uploadId){
  const detail = document.getElementById("uploadDetail");
  if(!detail) return;

  detail.innerHTML = "Detay yükleniyor...";

  const metaSnap = await getDoc(doc(db, "users", uid, "uploads", uploadId));
  if(!metaSnap.exists()){
    detail.innerHTML = "Upload bulunamadı.";
    return;
  }
  const meta = metaSnap.data();

  detail.innerHTML = `
    <div><b>Upload ID:</b> ${uploadId}</div>
    <div><b>Scope:</b> ${meta.scope || "-"}</div>
    <div><b>Dosya:</b> ${meta.fileName || "-"}</div>
    <div><b>Satır sayısı:</b> ${meta.rowCount ?? "-"}</div>
    <div><b>Toplam kg:</b> ${meta.totalKg ?? "-"}</div>
    <div><b>Tarih:</b> ${fmtDate(meta.createdAt)}</div>
    <hr style="border:0;border-top:1px solid var(--border);margin:10px 0">
    <div class="muted">Satır paketleri (rows) kaydediliyor. İstersen bir sonraki adımda burada satırları da açarız.</div>
  `;
}

/* Filtre/yenile butonları */
document.getElementById("refreshUploads")?.addEventListener("click", ()=>{
  if(!window.__uid) return;
  const f = document.getElementById("uploadsScopeFilter")?.value || "all";
  window.loadUploads(window.__uid, f);
});
document.getElementById("uploadsScopeFilter")?.addEventListener("change", (e)=>{
  if(!window.__uid) return;
  window.loadUploads(window.__uid, e.target.value || "all");
});

onAuthStateChanged(auth, async (user)=>{
  if(!user){
    window.location.href = "./index.html";
    return;
  }
  window.__uid = user.uid;
  await loadPlan(user.uid);

  // ✅ Geçmiş dropdown'larını tabloya bağımlı olmadan doldur
  try{
    await fillScopePicker(user.uid, "s1");
    await fillScopePicker(user.uid, "s2");
    await fillScopePicker(user.uid, "s3");
  }catch(e){ console.warn('fillScopePicker error', e); }

  const f = document.getElementById("uploadsScopeFilter")?.value || "all";
  await window.loadUploads(user.uid, f);
});

document.getElementById("btnUpgrade")?.addEventListener("click", async ()=>{
  if(!window.__uid) return;

  await setDoc(doc(db, "users", window.__uid), { plan: "premium" }, { merge: true });

  window.__isPremium = true;
  window.applyPremiumUI?.();

  try{
    await fillScopePicker(window.__uid, "s1");
    await fillScopePicker(window.__uid, "s2");
    await fillScopePicker(window.__uid, "s3");
  }catch(e){ console.warn('fillScopePicker error', e); }

  const f = document.getElementById("uploadsScopeFilter")?.value || "all";
  await window.loadUploads(window.__uid, f);

  alert("Premium aktif ✅");
});
