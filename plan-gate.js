import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

// ✅ Senin Firebase config (birebir)
const firebaseConfig = {
  apiKey: "AIzaSyCPGjInLgdVkN0mSSE0TRsAJwCCDax7TiI",
  authDomain: "carbonizi.firebaseapp.com",
  projectId: "carbonizi",
  storageBucket: "carbonizi.firebasestorage.app",
  messagingSenderId: "789010907611",
  appId: "1:789010907611:web:8d279f92ad8a23b75a67fe",
  measurementId: "G-EH6MCV9CW3"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function ensureUserDoc(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  // Doküman yoksa oluştur (plan default: free)
  if (!snap.exists()) {
    await setDoc(ref, {
      email: user.email || "",
      plan: "free",
      createdAt: serverTimestamp()
    });
    return "free";
  }

  // Varsa plan oku
  const data = snap.data() || {};
  return data.plan || "free";
}

function applyPlan(plan) {
  const isPremium = (plan === "premium");

  // premium-only alanları aç/kapat
  document.querySelectorAll(".premium-only").forEach(el => {
    el.style.display = isPremium ? "" : "none";
  });

  // küçük banner (varsa)
  const badge = document.getElementById("premiumBadge");
  if (badge) badge.textContent = isPremium ? "⭐ Premium aktif" : "🔒 Premium’da açılır";

  // body data attr (istersen debug)
  document.body.dataset.plan = plan;
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    applyPlan("free");
    return;
  }
  const plan = await ensureUserDoc(user);
  applyPlan(plan);
});
