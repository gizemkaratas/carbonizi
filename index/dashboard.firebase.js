import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc,
  collection, addDoc, serverTimestamp,
  query, where, orderBy, limit, getDocs
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

/* =========================
   Firebase config
========================= */
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

/* =========================
   Globals (core.js bunları kullanıyor)
========================= */
window.__isPremium = false;
window.__uid = null;

/* =========================
   Helpers
========================= */
function pickIdByScope(scope) {
  return scope === "s1" ? "pickS1" : scope === "s2" ? "pickS2" : "pickS3";
}

/* =========================
   Plan oku / kullanıcı doc yoksa oluştur
========================= */
async function loadPlan(uid) {
  const userRef = doc(db, "users", uid);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    await setDoc(
      userRef,
      { plan: "basic", createdAt: serverTimestamp() },
      { merge: true }
    );
    window.__isPremium = false;
    window.applyPremiumUI?.();
    return;
  }

  const data = snap.data() || {};
  window.__isPremium = (data.plan === "premium");
  window.applyPremiumUI?.();
}

/* =========================
   ✅ Geçmişten seç dropdown'larını doldur
   Not: orderBy bazen index ister.
   - index hatası alırsan orderBy satırını kaldırıp where+limit ile devam edebilirsin.
========================= */
async function fillScopePicker(uid, scope) {
  const sel = document.getElementById(pickIdByScope(scope));
  if (!sel) return;

  sel.innerHTML = `<option value="">— Seç —</option>`;

  // premium değilse boş kalsın
  if (!window.__isPremium) return;

  const base = collection(db, "users", uid, "uploads");

  // ✅ en yeni en üstte:
  // Eğer Firestore "index" isterse -> Console'da link verir, index oluşturursun.
  // HIZLI workaround: orderBy(...) satırını kaldır.
  const qRef = query(
    base,
    where("scope", "==", scope),
    orderBy("createdAt", "desc"),
    limit(50)
  );

  const snap = await getDocs(qRef);

  snap.forEach(d => {
    const x = d.data() || {};
    const fileName = x.fileName || "dosya";
    const rowCount = x.rowCount ?? 0;
    const totalKg = x.totalKg ?? 0;

    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = `${fileName} · ${rowCount} satır · ${totalKg} kg`;
    sel.appendChild(opt);
  });
}

/* =========================
   ✅ Seçilen upload'ın items'larını getir
   - önce rows subcollection (chunk)
   - yoksa upload doc içindeki items fallback
========================= */
async function loadUploadItems(uid, uploadId) {
  // rows chunklar
  const rowsCol = collection(db, "users", uid, "uploads", uploadId, "rows");
  const rowsSnap = await getDocs(rowsCol);

  const all = [];
  rowsSnap.forEach(r => {
    const data = r.data();
    if (Array.isArray(data?.items)) all.push(...data.items);
  });

  if (all.length > 0) return all;

  // fallback: upload doc içindeki items
  const metaSnap = await getDoc(doc(db, "users", uid, "uploads", uploadId));
  const meta = metaSnap.exists() ? metaSnap.data() : null;
  if (meta && Array.isArray(meta.items)) return meta.items;

  return [];
}

/* =========================
   ✅ Upload kaydetme (premium)
========================= */
window.saveUploadToDB = async function (uid, scope, fileName, items, totalKg) {
  if (!uid) throw new Error("uid yok");
  if (!window.__isPremium) throw new Error("premium değil");

  const uploadRef = await addDoc(collection(db, "users", uid, "uploads"), {
    scope,
    fileName: fileName || "unknown",
    rowCount: items.length,
    totalKg: totalKg,
    createdAt: serverTimestamp(),
    status: "ok",
    // küçük dosyalarda fallback
    items: items.length <= 200 ? items : null
  });

  // chunk kaydet
  const chunkSize = 200;
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    await addDoc(collection(db, "users", uid, "uploads", uploadRef.id, "rows"), {
      items: chunk
    });
  }

  return uploadRef.id;
};

/* =========================
   Dışarı aç (core.js kullanıyor)
========================= */
window.fillScopePicker = fillScopePicker;
window.loadUploadItems = loadUploadItems;

/* =========================
   ✅ Premium Upgrade (demo)
   - plan'ı Firestore’a yazar (kalıcı)
   - UI + dropdown yeniler
   - EĞER sen loadUploads’u (yüklemeler tablosu) kullanıyorsan onu da yeniler
   - Ama HTML'de yoksa ASLA patlamaz
========================= */
document.getElementById("btnUpgrade")?.addEventListener("click", async () => {
  if (!window.__uid) return alert("Oturum yok");

  await setDoc(doc(db, "users", window.__uid), { plan: "premium" }, { merge: true });

  window.__isPremium = true;
  window.applyPremiumUI?.();

  // ✅ asıl gerekli: geçmiş dropdownlarını yenile
  try {
    await fillScopePicker(window.__uid, "s1");
    await fillScopePicker(window.__uid, "s2");
    await fillScopePicker(window.__uid, "s3");
  } catch (e) {
    console.warn("fillScopePicker error:", e);
  }

  // 🛟 varsa yüklemeler tablosunu yenile (yoksa sessizce geç)
  try {
    if (typeof window.loadUploads === "function") {
      const f = document.getElementById("uploadsScopeFilter")?.value || "all";
      await window.loadUploads(window.__uid, f);
    }
  } catch (e) {
    console.warn("loadUploads optional error:", e);
  }

  alert("Premium aktif ✅");
});

/* =========================
   Auth state
   - giriş yoksa index.html'e atar
   - giriş varsa plan oku + dropdown doldur
========================= */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "./index.html";
    return;
  }

  window.__uid = user.uid;

  // ✅ önce plan
  await loadPlan(user.uid);

  // ✅ sonra dropdownlar
  try {
    await fillScopePicker(user.uid, "s1");
    await fillScopePicker(user.uid, "s2");
    await fillScopePicker(user.uid, "s3");
  } catch (e) {
    console.warn("fillScopePicker error:", e);
  }

  // ✅ eğer projede loadUploads (tablo) varsa otomatik yenile
  try {
    if (typeof window.loadUploads === "function") {
      const f = document.getElementById("uploadsScopeFilter")?.value || "all";
      await window.loadUploads(user.uid, f);
    }
  } catch (e) {
    console.warn("loadUploads optional error:", e);
  }
});
