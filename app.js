/* =========================================================
   
   Bu dosya tamamen client-side çalışır (tarayıcı içinde).
   ========================================================= */

/* ====== Sayı formatlama yardımcıları ====== */

// nf: kg gibi büyük sayıları TR formatında yazdırmak için (0 ondalık)
const nf = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });

// nf2: ton gibi daha küçük/ondalıklı değerleri yazdırmak için (3 ondalık)
const nf2 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 });

// Gauge renkleri (iyi/orta/yüksek)
const COLORS = { good: '#22c55e', mid: '#eab308', high: '#ef4444' };

/* ====== Emisyon Faktörü (EF) Tabloları ======
   EF = Activity Data * Emission Factor
   Burada demo için sabit tablolar var.
*/

// Scope 1: Yakıt türü ve birimine göre kg CO2 faktörleri  
const EF_S1 = {
  dizel:    { litre: 2.64 },   // 1 litre dizel -> 2.64 kg CO2
  benzin:   { litre: 2.31 },   // 1 litre benzin -> 2.31 kg CO2
  dogalgaz: { m3: 1.93 },      // 1 m3 doğalgaz -> 1.93 kg CO2
  lpg:      { kg: 2.98 }       // 1 kg LPG -> 2.98 kg CO2
};

// Scope 2: Ülke/şebeke karması ve yıla göre elektrik EF (kg CO2/kWh)
const EF_S2_GRID = {
  TR:   { 2025: 0.405, 2024: 0.420, 2023: 0.440 },
  EU27: { 2025: 0.230, 2024: 0.250, 2023: 0.270 },
  INTL: { 2025: 0.450, 2024: 0.470, 2023: 0.490 }
};

// Scope 3: Taşımacılık moduna göre kg CO2 / ton-km faktörleri (
const EF_S3 = { road: 0.121, rail: 0.019, ship: 0.015 };

/* ====== Kişisel demo için varsayım parametreleri ====== */

// Fatura TL -> kWh/m3 dönüşümü için demo tarifeleri
const TARIFF = { elec_tl_per_kwh: 4.50, gas_tl_per_m3: 10.00 };

// Duş için: su ısıtma doğalgaz varsayımı (basit demo modeli)
const SHOWER_KWH_PER_MIN = 0.05; // 1 dk duş -> ~0.05 kWh eşdeğeri 
const GAS_KG_PER_KWH     = 0.202; // 1 kWh ısı -> ~0.202 kg CO2 

/* ====== Demo profil modu ======
   company: Şirket mini demo
   personal: Kişisel günlük CO2
*/
let DEMO_PROFILE = 'company';

/* ====== Scope 2 EF’i "kilitleme" mantığı ======
   Demo’da şirket mini demoda EF sabit gösterilsin diye kilitli.
*/
function getS2Locked() {
  // Demo’da TR ve 2025 sabitleniyor 
  const region = (DEMO_PROFILE === 'company') ? 'TR' : 'TR';
  const year = 2025;
  return { region, year, ef: EF_S2_GRID[region][year] };
}

/* ====== Ekrandaki EF banner’larını güncelle ====== */
function updateEfBanner() {
  const b = document.getElementById('efBanner');
  const { region, year, ef } = getS2Locked();

  // Üstteki küçük bilgi etiketi
  b.textContent = `EF (kilitli): S2 ${region}/${year} = ${ef.toFixed(3)} · S1/S3 iç tablo`;

  // Scope 2 EF görüntüsü 
  const s2v = document.getElementById('s2EfView');
  if (s2v) s2v.textContent = `${region}/${year} • ${ef.toFixed(3)} kg/kWh`;

  // Kişisel demo açıklama notu
  const pNote = document.getElementById('pEfNote');
  if (pNote) {
    pNote.textContent =
      `Kişisel EF (kilitli): Elektrik TR/2024=${EF_S2_GRID.TR[2024].toFixed(3)} kg/kWh · ` +
      `Doğalgaz=1.93 kg/m³ · Özel araç=0.170 kg/km · Toplu taşıma=0.070 kg/km · ` 
      ;
  }
}

/* ====== Gauge (gösterge) çizimi ======
   Sağ tarafta iyi/orta/yüksek görseli.
*/
function drawGauge(el, value, max, label, bands = [Infinity, Infinity]) {
  el.innerHTML = '';

  // Gauge daire hesapları (SVG circle)
  const r = 90;
  const c = 2 * Math.PI * r;

  // value/max ile 0..1 arası doluluk oranı
  const pct = Math.max(0, Math.min(1, value / max));

  // eşiklere göre renk seçimi
  let color = COLORS.high; // eğer hiçbir koşula uymazsa kırmızı yap 0--x 1--y
  if (value <= bands[0]) color = COLORS.good;
  else if (value <= bands[1]) color = COLORS.mid;

  // SVG oluştur
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 220 220');

  // Arka plan çemberi
  const bg = document.createElementNS(svg.namespaceURI, 'circle');
  bg.setAttribute('cx', '110'); bg.setAttribute('cy', '110'); bg.setAttribute('r', r);
  bg.setAttribute('fill', 'none');
  bg.setAttribute('stroke', '#1e2542');
  bg.setAttribute('stroke-width', '16');
  svg.appendChild(bg);

  // Doluluk çemberi (dashoffset ile)
  const arc = document.createElementNS(svg.namespaceURI, 'circle');
  arc.setAttribute('cx', '110'); arc.setAttribute('cy', '110'); arc.setAttribute('r', r);
  arc.setAttribute('fill', 'none');
  arc.setAttribute('stroke', color);
  arc.setAttribute('stroke-width', '16');
  arc.setAttribute('stroke-linecap', 'round');
  arc.setAttribute('stroke-dasharray', c);
  arc.setAttribute('stroke-dashoffset', c * (1 - pct));
  arc.setAttribute('transform', 'rotate(-90 110 110)'); // üstten başlasın
  svg.appendChild(arc);

  // Ortadaki yazı (değer)
  const txt = document.createElementNS(svg.namespaceURI, 'text');
  txt.setAttribute('x', '110'); txt.setAttribute('y', '110');
  txt.setAttribute('text-anchor', 'middle');
  txt.setAttribute('dominant-baseline', 'middle');
  txt.setAttribute('fill', '#fff');
  txt.setAttribute('class', 'value');
  txt.textContent = label;
  svg.appendChild(txt);

  el.appendChild(svg);
}

/* ====== Company demo: DOM element referansları ====== */ 

// Seçilen modül: s1/s2/s3 dropdown
const modSel = document.getElementById('mod');

// Scope 1/2/3 alanlarının containerları (HTML’de s1Fields/s2Fields/s3Fields)
const s1 = document.getElementById('s1Fields');
const s2 = document.getElementById('s2Fields');
const s3 = document.getElementById('s3Fields');

// Sağ taraftaki legend alanı
const legend = document.getElementById('legendBox');

/* ====== Modül seçimine göre ilgili input alanlarını göster/gizle ====== */
function refreshFields() {
  const m = modSel.value;

  // sadece seçilen scope alanları görünsün
  s1.style.display = (m === 's1') ? 'grid' : 'none';
  s2.style.display = (m === 's2') ? 'grid' : 'none';
  s3.style.display = (m === 's3') ? 'grid' : 'none';

  // sağ tarafta scope’a göre eşik legendları değişsin
  if (m === 's2') {
    legend.innerHTML =
      '<span class="chip lo">≤ 2 t iyi</span><span class="chip mid">2–10 t orta</span><span class="chip hi">> 10 t yüksek</span>';
  } else if (m === 's1') {
    legend.innerHTML =
      '<span class="chip lo">≤ 5 t iyi</span><span class="chip mid">5–20 t orta</span><span class="chip hi">> 20 t yüksek</span>';
  } else {
    legend.innerHTML =
      '<span class="chip lo">≤ 1 t iyi</span><span class="chip mid">1–5 t orta</span><span class="chip hi">> 5 t yüksek</span>';
  }

  // ekranı sıfırla (her mod değiştiğinde eski sonuç kalmasın)
  document.getElementById('co2').textContent = '—';
  document.getElementById('co2t').textContent = '—';
  document.getElementById('coGauge').innerHTML = '';
  document.getElementById('coMsg').textContent = '—';
  document.getElementById('coTips').innerHTML =
    '<li>Hesapla’ya tıklayın; burada değerlendirme ve öneriler gözükecek.</li>';
}

// Dropdown değişince alanları güncelle
modSel?.addEventListener('change', refreshFields);

/* =========================================================
   "Hesapla" butonu
   ========================================================= */
document.getElementById('calc')?.addEventListener('click', () => {
  const m = modSel.value;  // seçili scope 
  let kg = 0;              // toplam sonucu kg cinsinden hesaplayacağız

  /* ----- Scope 2 hesabı ----- */
  if (m === 's2') {
    const { ef } = getS2Locked(); // demo EF (TR/2025) kilitli
    const kwh = parseFloat((document.getElementById('kwh').value || '').replace(',', '.')) || 0;
    kg = kwh * ef; // kWh * (kg/kWh) = kg
  }

  /* ----- Scope 1 hesabı ----- */
  else if (m === 's1') {
    // inputlardan yakıt tüketimlerini oku
    const d   = parseFloat((document.getElementById('diesel_l').value || '').replace(',', '.')) || 0;
    const g   = parseFloat((document.getElementById('gas_l').value || '').replace(',', '.')) || 0;
    const ng  = parseFloat((document.getElementById('ng_m3').value || '').replace(',', '.')) || 0;
    const lpg = parseFloat((document.getElementById('lpg_kg').value || '').replace(',', '.')) || 0;

    // tüketim * EF ile tek tek kg CO2 hesapla, topla
    kg =
      d   * EF_S1.dizel.litre +
      g   * EF_S1.benzin.litre +
      ng  * EF_S1.dogalgaz.m3 +
      lpg * EF_S1.lpg.kg;
  }

  /* ----- Scope 3 hesabı ----- */
  else {
    // ton ve km’leri oku
    const ton = parseFloat((document.getElementById('t_ton').value || '').replace(',', '.')) || 0;
    const rkm = parseFloat((document.getElementById('km_road').value || '').replace(',', '.')) || 0;
    const zkm = parseFloat((document.getElementById('km_rail').value || '').replace(',', '.')) || 0;
    const skm = parseFloat((document.getElementById('km_ship').value || '').replace(',', '.')) || 0;

    // ton * (km*EF toplamı)
    // çünkü EF_S3 burada "kg CO2 / ton-km" gibi düşünülmüş
    kg = ton * (rkm * EF_S3.road + zkm * EF_S3.rail + skm * EF_S3.ship);
  }

  /* ====== Sonuçları ekrana yazdır ====== */


  const tons = kg / 1000; // kg -> ton

  // kg alanı
  document.getElementById('co2').textContent = nf.format(Math.round(kg));

  // ton alanı
  document.getElementById('co2t').textContent = nf2.format(tons);

  /* ====== Gauge eşikleri ====== */

  let max = 50, bands = [2, 10];
  if (m === 's1') { max = 60; bands = [5, 20]; } // Scope 1 için
  if (m === 's3') { max = 20; bands = [1, 5]; }  // Scope 3 için

  // gauge çiz
  drawGauge(document.getElementById('coGauge'), tons, max, nf2.format(tons) + ' t', bands);

  /* ====== Sonuca göre mesaj + öneriler ====== */

  let msgT = '—', tips = [];

  if (m === 's2') {
    msgT = (tons > 10 ? 'Yüksek' : (tons > 2 ? 'Orta' : 'İyi')) + ' · Scope 2 (elektrik)';
    tips = [
      'Elektrik verimliliği projeleri',
      'Yenilenebilir kaynak alımı (PPA/I-REC)',
      'KWH/çıktı KPI takibi, pik saat yönetimi'
    ];
  } else if (m === 's1') {
    msgT = (tons > 20 ? 'Yüksek' : (tons > 5 ? 'Orta' : 'İyi')) + ' · Scope 1 (yakıt)';
    tips = [
      'Eko-sürüş ve rölanti azaltma',
      'Filo yenileme (verimli/hibrit)',
      'Kazanda verimlilik & sızıntı kontrolü'
    ];
  } else {
    msgT = (tons > 5 ? 'Yüksek' : (tons > 1 ? 'Orta' : 'İyi')) + ' · Scope 3 (taşımacılık)';
    tips = [
      'Demiryolu/denizyolu payını artırın',
      'Yük konsolidasyonu, boş km azaltımı',
      'Rota/kapasite optimizasyonu'
    ];
  }

  // mesajı yaz
  document.getElementById('coMsg').textContent = msgT + ' · ' + nf2.format(tons) + ' ton';

  // öneri listesini yaz
  document.getElementById('coTips').innerHTML = tips.map(x => `<li>${x}</li>`).join('');
});

/* ====== Temizle butonu ====== */
document.getElementById('clear')?.addEventListener('click', () => {
  // sonuçları sıfırla
  document.getElementById('co2').textContent = '—';
  document.getElementById('co2t').textContent = '—';

  // gauge ve mesajı temizle
  document.getElementById('coGauge').innerHTML = '';
  document.getElementById('coMsg').textContent = '—';

  // önerileri resetle
  document.getElementById('coTips').innerHTML =
    '<li>Hesapla’ya tıklayın; burada değerlendirme ve öneriler gözükecek.</li>';
});

/* =========================================================
   Tabs: Şirket mini demo / Kişisel demo geçişi
   ========================================================= */

// Tab butonları ve ilgili alanlar
const tabCompany = document.getElementById('tabCompany');
const tabPersonal = document.getElementById('tabPersonal');
const companyDemo = document.getElementById('companyDemo');
const personalDemo = document.getElementById('personalDemo');
const companyAdvice = document.getElementById('coAdvice');
const personalAdvice = document.getElementById('pAdvice');

/* Profil setleme: hangi demo görünür olacak? */
function setProfile(p) {
  DEMO_PROFILE = (p === 'personal') ? 'personal' : 'company';

  if (DEMO_PROFILE === 'company') {
    companyDemo.style.display = 'block';
    personalDemo.style.display = 'none';

    tabCompany.classList.remove('btn-outline');
    tabPersonal.classList.add('btn-outline');

    companyAdvice.style.display = 'block';
    personalAdvice.style.display = 'none';
  } else {
    companyDemo.style.display = 'none';
    personalDemo.style.display = 'block';

    tabPersonal.classList.remove('btn-outline');
    tabCompany.classList.add('btn-outline');

    companyAdvice.style.display = 'none';
    personalAdvice.style.display = 'block';
  }

  // EF banner’ları güncellensin
  updateEfBanner();

  // UI reset (mod alanlarını tekrar doğru göster)
  refreshFields();
}

// Tab click eventleri
tabCompany?.addEventListener('click', () => setProfile('company'));
tabPersonal?.addEventListener('click', () => setProfile('personal'));

// Açılışta default company
setProfile('company');

/* =========================================================
   Kişisel demo: yardımcı fonksiyonlar + hesapla
   ========================================================= */

// format fonksiyonu (kg gibi)
const fmt = (x, dec = 1) =>
  new Intl.NumberFormat('tr-TR', { maximumFractionDigits: dec }).format(x);

// inputtan güvenli sayı çekme
const num = (id) => {
  const el = document.getElementById(id);
  const v = parseFloat((el?.value || '').replace(',', '.'));
  return isNaN(v) ? 0 : v;
};

// kişisel önerileri render eden fonksiyon
function renderAdvice(e, g, c, t, sh, total) {
  const tipsEl = document.getElementById('tips');
  const breakdown = document.getElementById('breakdown');
  const target = 15; // demo hedefi: 15 kg/gün altında "iyi"
  const parts = [["Elektrik", e], ["Doğalgaz", g], ["Özel araç", c], ["Toplu taşıma", t], ["Duş", sh]];
  const totalPos = Math.max(total, 0.0001);

  // kalem kalem dağılım
  breakdown.innerHTML = parts
    .map(([k, v]) => `${k}: <b>${fmt(v, 1)} kg</b> (${fmt((v / totalPos) * 100, 1)}%)`)
    .join('<br>');

  // hedefe göre azaltım
  const need = Math.max(0, total - target);

  // en büyük kalem
  const biggest = parts.slice().sort((a, b) => b[1] - a[1])[0][0];

  const recs = [];
  if (need > 0) recs.push(`Hedef için <b>${fmt(need, 1)} kg/gün</b> azaltım gerekli (≈ ${fmt((need * 365) / 1000, 2)} t/yıl).`);
  else recs.push(`Hedefin altındasınız; bu seviyeyi koruyun.`);

  // basit öneriler (kalem varsa öneri ekle)
  if (e > 0) recs.push(`Elektrik: verimli cihazlar, LED, stand-by kapatma.`);
  if (g > 0) recs.push(`Doğalgaz: 1°C düşürme, izolasyon, kombi bakımı.`);
  if (c > 0) recs.push(`Araç: toplu taşıma/araç paylaşımı, rölanti/ hız kontrolü.`);
  if (t > 0) recs.push(`Toplu taşıma: kısa mesafede yürüyüş/bisiklet.`);
  if (sh > 0) recs.push(`Duş: 1–2 dk kısalt, düşük debili duş başlığı.`);

  recs.push(`Öncelik: <b>${biggest}</b> kalemi (en büyük pay).`);

  // listeyi bas
  tipsEl.innerHTML = recs.map(x => `<li>${x}</li>`).join('');
}

// Kişisel "Hesapla" click
document.getElementById('p_calc')?.addEventListener('click', () => {
  // zorunlu alan kontrolü
  const requiredIds = ['p_person', 'pp_e_tl', 'pp_g_tl', 'car_km_d', 'pt_km_d', 'sh_min_d'];
  const missing = requiredIds.some(id => !document.getElementById(id).value);
  if (missing) {
    document.getElementById('adviceBadge').textContent = 'Lütfen tüm alanları doldurun.';
    return;
  }

  // kişi sayısı min 1
  const persons = Math.max(1, num('p_person'));

  // TL/ay -> kişi başı günlük -> kWh veya m3 dönüşümü (tarife varsayımıyla)
  const e_kwh = ((num('pp_e_tl') / persons) / 30) / TARIFF.elec_tl_per_kwh;
  const g_m3  = ((num('pp_g_tl') / persons) / 30) / TARIFF.gas_tl_per_m3;

  // EF ile kg CO2 hesapla
  const e_kg = e_kwh * EF_S2_GRID.TR[2024];
  const g_kg = g_m3  * EF_S1.dogalgaz.m3;

  // ulaşım varsayımları (kg/km)
  const c_kg = num('car_km_d') * 0.170;
  const t_kg = num('pt_km_d')  * 0.070;

  // duş -> kWh -> kg CO2
  const sh_min = num('sh_min_d');
  const sh_kwh = sh_min * SHOWER_KWH_PER_MIN;
  const sh_kg  = sh_kwh * GAS_KG_PER_KWH;

  // toplam günlük ve yıllık
  const total_day  = e_kg + g_kg + c_kg + t_kg + sh_kg;
  const total_year = (total_day * 365) / 1000;

  // ekrana bas
  document.getElementById('p_co2').textContent   = fmt(total_day, 1);
  document.getElementById('p_co2_y').textContent = fmt(total_year, 2);

  // günlük değerle gauge (15/50 eşikleri)
  drawGauge(document.getElementById('pGauge'), total_day, 100, fmt(total_day, 1) + ' kg', [15, 50]);

  // üst badge
  const badge = document.getElementById('adviceBadge');
  badge.textContent = `Kişi başı günlük yaklaşık ${fmt(total_day, 1)} kg CO₂`;

  // dağılım ve öneriler
  renderAdvice(e_kg, g_kg, c_kg, t_kg, sh_kg, total_day);
});

// Kişisel "Temizle"
document.getElementById('p_clear')?.addEventListener('click', () => {
  ['p_person', 'pp_e_tl', 'pp_g_tl', 'car_km_d', 'pt_km_d', 'sh_min_d'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  document.getElementById('p_co2').textContent = '—';
  document.getElementById('p_co2_y').textContent = '—';
  document.getElementById('pGauge').innerHTML = '';
  document.getElementById('breakdown').innerHTML = '—';
  document.getElementById('tips').innerHTML =
    '<li>Değerlerinizi girip <b>Hesapla</b>’ya basın; burada kişisel öneriler çıkacak.</li>';
  document.getElementById('adviceBadge').textContent = '—';
});

// ilk açılışta EF bilgilerini yaz
updateEfBanner();

