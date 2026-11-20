// SAKU – logik app
const API = "https://api.alquran.cloud/v1";
const ED = "quran-uthmani,en.transliteration,ms.basmeih";
const $app = document.getElementById("app");
const mem = {};

/* ---------- Utiliti ---------- */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const go = h => { location.hash = h; };
const simpan = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const ambil = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
function toast(t) { const el = document.getElementById("toast"); el.textContent = t; el.classList.add("show"); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("show"), 1800); }
const loading = (t = "Memuatkan…") => `<div class="loading">${t}</div>`;
const ralat = () => `<div class="card notice">Tidak dapat menyambung ke pangkalan data al-Quran. Semak sambungan internet dan cuba lagi.</div>`;

async function api(path) {
  if (mem[path]) return mem[path];
  const r = await fetch(API + path);
  if (!r.ok) throw new Error(r.status);
  const j = await r.json();
  if (j.code !== 200) throw new Error(j.status);
  return (mem[path] = j.data);
}

// "2:155-157" -> ["2:155","2:156","2:157"]
function pecahRef(ref) {
  const [s, a] = ref.split(":"); const [m, n] = a.split("-").map(Number);
  const out = []; for (let i = m; i <= (n || m); i++) out.push(`${s}:${i}`); return out;
}
async function ambilAyat(ref) {
  const d = await api(`/ayah/${ref}/editions/${ED}`);
  return { ref, ar: d[0].text, tr: d[1].text, ms: d[2].text, surah: d[0].surah.englishName, surahAr: d[0].surah.name };
}
async function ambilBanyak(refs) {
  const semua = refs.flatMap(pecahRef);
  return Promise.all(semua.map(ambilAyat));
}

/* ---------- Bookmark & sejarah ---------- */
let SET = Object.assign({ tema: "auto", translit: true, bhsHadis: "ind", zon: null, zonNama: "", lat: null, lon: null }, ambil("saku_set", {}));
const simpanSet = () => simpan("saku_set", SET);
let BM = ambil("saku_bm", []);
let HIST = ambil("saku_hist", []);
const isBM = ref => BM.includes(ref);
function togBM(ref, btn) {
  BM = isBM(ref) ? BM.filter(r => r !== ref) : [ref, ...BM];
  simpan("saku_bm", BM);
  if (btn) { btn.classList.toggle("on", isBM(ref)); btn.textContent = isBM(ref) ? "★ Disimpan" : "☆ Simpan"; }
  toast(isBM(ref) ? "Disimpan" : "Dibuang dari simpanan");
}
function catatSejarah(q) { HIST = [q, ...HIST.filter(x => x !== q)].slice(0, 15); simpan("saku_hist", HIST); }

/* ---------- Kad ayat ---------- */
function kadAyat(a, label) {
  return `<article class="card ayat" data-ref="${a.ref}">
    <div class="ref"><b>${esc(a.surah)} · ${a.ref}</b>${label || ""}</div>
    <p class="arab">${esc(a.ar)}</p>
    ${SET.translit && a.tr ? `<p class="translit">${esc(a.tr)}</p>` : ""}
    <p class="terj">${esc(a.ms)}</p>
    <div class="acts">
      <button class="${isBM(a.ref) ? "on" : ""}" data-act="bm">${isBM(a.ref) ? "★ Disimpan" : "☆ Simpan"}</button>
      <button data-act="salin">⧉ Salin</button>
      <button data-act="kongsi">↗ Kongsi</button>
      <button data-act="buka">Buka surah</button>
    </div></article>`;
}
let terakhir = {};
$app.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const card = b.closest("[data-ref]"); const ref = card?.dataset.ref;
  const a = terakhir[ref];
  if (b.dataset.act === "bm") togBM(ref, b);
  if (b.dataset.act === "buka") go(`#/surah/${ref.split(":")[0]}/${ref.split(":")[1]}`);
  if (!a) return;
  const teks = a.jenis === "h" ? `${a.surah}\n\n${a.ar}\n\nMaksud: ${a.ms}\n\n— ${a.ref}\nDikongsi dari SAKU` : `${a.ar}\n\n${a.ms}\n\n— ${a.surah} ${a.ref} (Terjemahan Abdullah Basmeih)\nDikongsi dari SAKU`;
  if (b.dataset.act === "salin") { try { await navigator.clipboard.writeText(teks); toast("Disalin"); } catch (x) { toast("Tidak dapat menyalin"); } }
  if (b.dataset.act === "kongsi") {
    if (navigator.share) navigator.share({ text: teks }).catch(() => {});
    else { try { await navigator.clipboard.writeText(teks); toast("Disalin untuk dikongsi"); } catch (x) {} }
  }
});
function daftar(list) { list.forEach(a => (terakhir[a.ref] = a)); }

function fontCtl() {
  return `<div class="fontctl muted">Saiz tulisan Arab <button onclick="ubahFont(-2)">A−</button><button onclick="ubahFont(2)">A+</button></div>`;
}
function ubahFont(d) {
  const s = Math.min(44, Math.max(20, ambil("saku_font", 28) + d));
  simpan("saku_font", s); document.documentElement.style.setProperty("--arabsize", s + "px");
}

/* ---------- Carian ---------- */
const norm = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9: ]/g, " ").replace(/\s+/g, " ").trim();
function padanTopik(q) {
  const n = " " + norm(q) + " ";
  return TOPICS.map(t => {
    let skor = 0;
    t.kata.forEach(k => { if (n.includes(" " + norm(k))) skor += 2; });
    norm(t.nama).split(" ").forEach(w => { if (w.length > 3 && !["rasa","kepada","allah","dengan"].includes(w) && n.includes(" " + w)) skor += 1; });
    return { t, skor };
  }).filter(x => x.skor > 0).sort((a, b) => b.skor - a.skor).map(x => x.t);
}
let SURAH = null;
async function senaraiSurah() { if (!SURAH) SURAH = await api("/surah"); return SURAH; }
const nSurah = s => norm(s).replace(/^(al|an|ar|as|at|ad|adh|az|ash|ath)\s/, "").replace(/\s/g, "");

async function viewCari(q) {
  catatSejarah(q);
  $app.innerHTML = `<button class="back" onclick="go('#/')">← Kembali</button><h2 class="sec">Carian: “${esc(q)}”</h2><div id="hasil">${loading()}</div>`;
  const out = [];
  const m = q.trim().match(/^(\d{1,3})\s*[:.\s]\s*(\d{1,3})$/);
  if (m) { go(`#/surah/${m[1]}/${m[2]}`); return; }
  if (/^\d{1,3}$/.test(q.trim()) && +q <= 114) { go(`#/surah/${+q}`); return; }

  const topik = padanTopik(q);
  if (topik.length) out.push(`<p class="muted small">Topik berkaitan dengan apa yang anda rasa:</p><div class="chips">${topik.map(chipTopik).join("")}</div>`);

  try {
    const list = await senaraiSurah(); const nq = nSurah(q);
    const s = nq.length > 2 ? list.filter(x => nSurah(x.englishName).includes(nq) || norm(x.englishNameTranslation).includes(norm(q))) : [];
    if (s.length) out.push(`<h2 class="sec">Surah</h2><div class="list">${s.map(barisSurah).join("")}</div>`);
  } catch (e) {}

  out.push(`<h2 class="sec">Dalam terjemahan al-Quran</h2><div id="terj">${loading("Mencari dalam terjemahan…")}</div>`);
  document.getElementById("hasil").innerHTML = out.join("");

  cariTerj(q, document.getElementById("terj"));
}

async function cariTerj(q, el) {
  const kata = norm(q).split(" ").filter(w => w.length > 3 && !["saya","sedang","mahu","ingin","rasa","sangat","untuk","dengan","yang","tidak"].includes(w));
  if (!kata.length) { el.innerHTML = `<p class="muted small">Taip satu perkataan utama untuk mencari dalam terjemahan.</p>`; return; }
  try {
    const d = await api(`/search/${encodeURIComponent(kata[0])}/all/ms.basmeih`);
    const ms = d.matches.slice(0, 30);
    el.innerHTML = `<p class="muted small">${d.count} ayat mengandungi “${esc(kata[0])}”${d.count > 30 ? " (30 pertama ditunjukkan)" : ""}.</p>
      <div class="list">${ms.map(x => `<a href="#/surah/${x.surah.number}/${x.numberInSurah}"><div class="num"><i>${x.numberInSurah}</i></div><div class="grow"><b>${esc(x.surah.englishName)} ${x.surah.number}:${x.numberInSurah}</b><div class="small muted">${esc(x.text.slice(0, 160))}${x.text.length > 160 ? "…" : ""}</div></div></a>`).join("")}</div>`;
  } catch (e) { el.innerHTML = `<p class="muted small">Tiada ayat ditemui untuk “${esc(kata[0])}”.</p>`; }
}


/* ---------- Paparan ---------- */
const chipTopik = t => `<button class="chip" onclick="go('#/topik/${t.id}')"><span>${t.emoji}</span>${esc(t.nama)}</button>`;
const barisSurah = s => `<a href="#/surah/${s.number}"><div class="num"><i>${s.number}</i></div><div class="grow"><b>${esc(s.englishName)}</b><div class="small muted">${esc(s.englishNameTranslation)} · ${s.numberOfAyahs} ayat</div></div><span class="ar">${esc(s.name)}</span></a>`;
const lencana = st => st === "disemak" ? `<span class="badge ok">✓ Disemak</span>` : `<span class="badge">Belum disemak</span>`;

function viewUtama() {
  const jj = new Date().getHours();
  const waktu = jj < 12 ? "Selamat pagi" : jj < 15 ? "Selamat tengah hari" : jj < 19 ? "Selamat petang" : "Selamat malam";
  $app.innerHTML = `
  <section class="hero">
    <p class="salam">السَّلَامُ عَلَيْكُمْ</p>
    <h1>${waktu}.<br>Apa yang anda rasa hari ini?</h1>
    <form class="searchbox" onsubmit="event.preventDefault();const v=this.q.value.trim();if(v)go('#/cari/'+encodeURIComponent(v))">
      <input name="q" placeholder="cth: saya sedang sedih, hutang, 2:286" autocomplete="off" enterkeyhint="search">
      <button>Cari</button>
    </form>
    <div class="hint">Taip perasaan, masalah, nama surah atau nombor ayat.</div>
  </section>
  <a href="#/solat" class="card next" id="homeSolat" style="display:${SET.zon ? "block" : "none"};text-decoration:none"></a>
  <h2 class="sec">Panduan kehidupan</h2>
  <div class="chips">${TOPICS.map(chipTopik).join("")}</div>
  ${HIST.length ? `<h2 class="sec">Carian lepas</h2><div class="chips">${HIST.slice(0, 6).map(h => `<button class="chip" onclick="go('#/cari/${encodeURIComponent(h)}')"><span>↺</span>${esc(h)}</button>`).join("")}</div>` : ""}
  <p class="muted small" style="margin-top:22px">SAKU ialah pusat rujukan, bukan sumber fatwa. Persoalan hukum yang rumit, rujuk kepada ahli ilmu yang berkelayakan.</p>`;
  if (SET.zon) waktuHariIni(SET.zon).then(w => {
    const el = document.getElementById("homeSolat"); if (!el || !w) return;
    const nx = seterusnya(w);
    el.innerHTML = nx ? `<div class="small">Solat seterusnya · ${esc(SET.zon)}</div><div class="big">${NAMA_SOLAT.find(n => n[0] === nx.k)[1]} · ${jam(nx.t)}</div><div class="small">dalam ${baki(nx.t - Date.now() / 1000)}</div>` : `<div class="small">Waktu solat · ${esc(SET.zon)}</div><div class="big">Isyak ${jam(w.isha)}</div>`;
  }).catch(() => { const el = document.getElementById("homeSolat"); if (el) el.style.display = "none"; });
}

async function viewTopik(id) {
  const t = TOPICS.find(x => x.id === id); if (!t) return go("#/");
  $app.innerHTML = `<button class="back" onclick="history.back()">← Kembali</button>
    <h2 class="sec">${t.emoji} ${esc(t.nama)}</h2>
    <div class="card gold"><p style="margin:0 0 8px">${esc(t.nota)}</p>${lencana(t.status)}</div>
    ${t.perubatan ? `<div class="notice">🩺 Doa dan ayat ini adalah ikhtiar rohani. Ia <b>tidak menggantikan rawatan perubatan</b> — sila dapatkan nasihat doktor.</div>` : ""}
    ${t.amaran ? `<div class="notice">⚠️ Al-Quran dan doa <b>bukan alat untuk memaksa atau mengawal kehendak orang lain</b>. Amalan "penunduk" atau "pengasih" secara mistik tiada sandaran yang sahih. Doakan kebaikan, dan perbaiki akhlak serta tutur kata.</div>` : ""}
    ${fontCtl()}<div id="senarai">${loading()}</div>`;
  try { const list = await ambilBanyak(t.ayat); daftar(list); document.getElementById("senarai").innerHTML = list.map(a => kadAyat(a)).join(""); }
  catch (e) { document.getElementById("senarai").innerHTML = ralat(); }
}

async function viewQuran() {
  const akhir = ambil("saku_akhir", null);
  $app.innerHTML = `<h2 class="sec">Al-Quran</h2>
    ${akhir ? `<a class="card gold" style="display:block;text-decoration:none" href="#/surah/${akhir.s}/${akhir.a}">📖 Sambung bacaan: <b>${esc(akhir.nama)} ${akhir.s}:${akhir.a}</b></a>` : ""}
    <input class="filter" placeholder="Cari surah (nama atau nombor)…" oninput="tapisSurah(this.value)">
    <div id="ls" class="list">${loading()}</div>`;
  try { await senaraiSurah(); tapisSurah(""); } catch (e) { document.getElementById("ls").innerHTML = ralat(); }
}
function tapisSurah(v) {
  const n = nSurah(v); const el = document.getElementById("ls"); if (!el || !SURAH) return;
  el.innerHTML = SURAH.filter(s => !v || String(s.number) === v.trim() || nSurah(s.englishName).includes(n) || norm(s.englishNameTranslation).includes(norm(v))).map(barisSurah).join("");
}

async function viewSurah(n, ke) {
  $app.innerHTML = `<button class="back" onclick="go('#/quran')">← Senarai surah</button><div id="sr">${loading()}</div>`;
  try {
    const d = await api(`/surah/${n}/editions/${ED}`);
    const [ar, tr, ms] = d;
    const list = ar.ayahs.map((x, i) => ({ ref: `${n}:${x.numberInSurah}`, ar: x.text, tr: tr.ayahs[i].text, ms: ms.ayahs[i].text, surah: ar.englishName }));
    daftar(list);
    document.getElementById("sr").innerHTML = `
      <div class="card gold" style="text-align:center">
        <div class="arab" style="text-align:center;font-size:34px;margin:0">${esc(ar.name)}</div>
        <b>${esc(ar.englishName)}</b> <span class="muted">· ${esc(ar.englishNameTranslation)} · ${ar.numberOfAyahs} ayat · ${ar.revelationType === "Meccan" ? "Makkiyyah" : "Madaniyyah"}</span>
      </div>${fontCtl()}${list.map(a => kadAyat(a)).join("")}`;
    document.querySelectorAll("#sr .acts [data-act=buka]").forEach(b => b.remove());
    if (ke) { const el = document.querySelector(`[data-ref="${n}:${ke}"]`); if (el) { el.scrollIntoView({ block: "start" }); el.classList.add("gold"); } }
    simpan("saku_akhir", { s: n, a: ke || 1, nama: ar.englishName });
  } catch (e) { document.getElementById("sr").innerHTML = ralat(); }
}

/* ---------- Doa (al-Quran + hadis) ---------- */
const slug = t => "d:" + norm(t).replace(/ /g, "-");
const KAT_DOA = ["Harian", "Masjid & Solat", "Zikir Pagi & Petang", "Keampunan", "Kebaikan", "Rezeki & Hutang", "Ilmu & Urusan", "Ibu Bapa", "Pasangan & Zuriat", "Keluarga & Sosial", "Syukur", "Sakit & Ujian", "Perlindungan", "Persaudaraan", "Ramadan", "Cuaca & Alam"];
const IKON_KAT = { "Harian": "🏠", "Masjid & Solat": "🕌", "Zikir Pagi & Petang": "🌅", "Keampunan": "🕊️", "Kebaikan": "✨", "Rezeki & Hutang": "💰", "Ilmu & Urusan": "🗝️", "Ibu Bapa": "👵", "Pasangan & Zuriat": "💍", "Keluarga & Sosial": "🤝", "Syukur": "🌿", "Sakit & Ujian": "🤲", "Perlindungan": "🛡️", "Persaudaraan": "🫂", "Ramadan": "🌙", "Cuaca & Alam": "🌧️" };
const katQ = k => k === "Rezeki" ? "Rezeki & Hutang" : k;
const DOA_Q = [...DOA, ...DOA_Q_TAMBAH].map(d => ({ ...d, kat: katQ(d.kat), s: d.s || DOA_Q_SUMBER[d.ref] || [] }));
DOA_H.forEach(d => (d.id = slug(d.t)));
const kiraKat = k => DOA_Q.filter(d => d.kat === k).length + DOA_H.filter(d => d.k === k).length;
const kreditSumber = s => s && s.length ? `<p class="small muted" style="margin:8px 0 0">Dihimpun daripada: ${s.map(x => SUMBER_DOA[x]?.u ? `<a href="${SUMBER_DOA[x].u}" target="_blank" rel="noopener">${esc(SUMBER_DOA[x].n.split(" — ")[0])}</a>` : esc(SUMBER_DOA[x]?.n.split(" (")[0] || x)).join(", ")}</p>` : "";
const lencanaSt = st => st === "tiada" ? `<span class="badge">Sumber tidak dinyatakan</span>` : st === "athar" ? `<span class="badge">Athar / amalan salaf</span>` : `<span class="badge ok">Ada riwayat hadis</span>`;

function kadDoaH(d) {
  terakhir[d.id] = { ar: d.a, ms: d.m, surah: d.t, ref: d.d, jenis: "h" };
  return `<article class="card ayat" data-ref="${d.id}">
    <div class="ref"><b>${esc(d.t)}</b></div>
    <p class="arab">${esc(d.a)}</p>
    <p class="terj"><span class="muted small">Maksud: </span>${esc(d.m)}</p>
    <p class="small" style="margin:8px 0 6px">📚 ${esc(d.d)}${d.h ? ` · <a href="#/hadis/${d.h[0]}/no/${d.h[1]}">Lihat hadis ${esc(KITAB[d.h[0]].nama)} No. ${d.h[1]} →</a>` : ""}</p>
    <div>${lencanaSt(d.st)} <span class="badge">Belum disemak</span></div>
    ${kreditSumber(d.s)}
    <div class="acts">
      <button class="${isBM(d.id) ? "on" : ""}" data-act="bm">${isBM(d.id) ? "★ Disimpan" : "☆ Simpan"}</button>
      <button data-act="salin">⧉ Salin</button>
      <button data-act="kongsi">↗ Kongsi</button>
    </div></article>`;
}
async function kadDoaQ(d) {
  const list = await ambilBanyak([d.ref]); daftar(list);
  const a = list.length === 1 ? list[0] : { ref: d.ref, surah: list[0].surah, ar: list.map(x => x.ar).join(" ۝ "), tr: list.map(x => x.tr).join(" "), ms: list.map(x => x.ms).join(" ") };
  a.ref = d.ref; terakhir[d.ref] = a;
  return kadAyat(a, `<span class="small muted">${esc(d.tajuk)}</span>`).replace("</article>", kreditSumber(d.s) + "</article>");
}
async function lukisDoa(box, qs, hs) {
  const html = hs.map(kadDoaH);
  box.innerHTML = html.join("") + (qs.length ? loading("Memuatkan doa al-Quran…") : "");
  try {
    for (const d of qs) html.push(await kadDoaQ(d));
    box.innerHTML = html.join("") || `<p class="muted small">Tiada doa.</p>`;
  } catch (e) { box.innerHTML = html.join("") + ralat(); }
}

function viewDoa() {
  $app.innerHTML = `<h2 class="sec">Doa &amp; Zikir</h2>
    <form class="searchbox" style="margin-bottom:12px" onsubmit="event.preventDefault();const v=this.q.value.trim();if(v)go('#/doa/cari/'+encodeURIComponent(v))">
      <input name="q" placeholder="Cari doa: cth tidur, hutang, hujan, pengantin" autocomplete="off" enterkeyhint="search">
      <button>Cari</button>
    </form>
    <p class="muted small">${DOA_Q.length + DOA_H.length} doa &amp; zikir — daripada al-Quran (teks dari pangkalan data al-Quran) dan hadis (dihimpun daripada 6 sumber, lihat ⓘ Info).</p>
    <div class="chips">${KAT_DOA.filter(kiraKat).map(k => `<button class="chip" onclick="go('#/doa/kat/${encodeURIComponent(k)}')"><span>${IKON_KAT[k] || "🤲"}</span><div>${esc(k)}<div class="small muted" style="font-weight:400">${kiraKat(k)} doa</div></div></button>`).join("")}</div>`;
}
async function viewDoaKat(k) {
  $app.innerHTML = `<button class="back" onclick="go('#/doa')">← Semua kategori</button><h2 class="sec">${IKON_KAT[k] || ""} ${esc(k)}</h2>${fontCtl()}<div id="dk">${loading()}</div>`;
  lukisDoa(document.getElementById("dk"), DOA_Q.filter(d => d.kat === k), DOA_H.filter(d => d.k === k));
}
async function viewDoaCari(q) {
  catatSejarah(q);
  const nq = norm(q);
  const kataQ = nq.split(" ").filter(w => w.length > 2 && !["doa", "saya", "untuk", "yang", "ketika", "dan"].includes(w));
  const cocok = t => { t = norm(t); return t.includes(nq) || kataQ.some(w => t.includes(w)); };
  const qs = DOA_Q.filter(d => cocok(d.tajuk + " " + d.kat));
  const hs = DOA_H.filter(d => cocok(d.t + " " + d.k + " " + d.m));
  const topik = padanTopik(q);
  $app.innerHTML = `<button class="back" onclick="go('#/doa')">← Semua doa</button><h2 class="sec">Cari doa: “${esc(q)}”</h2>
    ${topik.length ? `<p class="muted small">Topik berkaitan:</p><div class="chips">${topik.map(chipTopik).join("")}</div>` : ""}
    <h2 class="sec">Doa dalam SAKU (${qs.length + hs.length})</h2>${fontCtl()}<div id="dh">${qs.length + hs.length ? loading() : `<p class="muted small">Tiada doa dalam senarai SAKU yang sepadan.</p>`}</div>
    <h2 class="sec">Ayat lain dalam al-Quran</h2><div id="terj">${loading("Mencari dalam terjemahan…")}</div>`;
  cariTerj(q, document.getElementById("terj"));
  if (qs.length + hs.length) lukisDoa(document.getElementById("dh"), qs, hs);
}

async function viewSimpanan() {
  $app.innerHTML = `<h2 class="sec">Simpanan</h2>${BM.length ? `${fontCtl()}<div id="bm">${loading()}</div>` : `<div class="card muted">Belum ada ayat disimpan. Tekan <b>☆ Simpan</b> pada mana-mana ayat.</div>`}
    ${HIST.length ? `<h2 class="sec">Sejarah carian</h2><div class="chips">${HIST.map(h => `<button class="chip" onclick="go('#/cari/${encodeURIComponent(h)}')"><span>↺</span>${esc(h)}</button>`).join("")}</div>
      <p><button class="back" onclick="HIST=[];simpan('saku_hist',[]);viewSimpanan()">Padam sejarah carian</button></p>` : ""}`;
  if (!BM.length) return;
  try {
    const hs = BM.filter(r => r.startsWith("d:")).map(r => DOA_H.find(d => d.id === r)).filter(Boolean);
    const list = await ambilBanyak(BM.filter(r => /^\d+:\d+(-\d+)?$/.test(r))); daftar(list);
    document.getElementById("bm").innerHTML = hs.map(kadDoaH).join("") + list.map(a => kadAyat(a)).join("");
  }
  catch (e) { document.getElementById("bm").innerHTML = ralat(); }
}

function viewKredit() {
  $app.innerHTML = `<button class="back" onclick="history.back()">← Kembali</button><h2 class="sec">Sumber &amp; Kredit</h2>
  <div class="card"><b>Teks al-Quran & terjemahan</b><p class="small">Teks Arab (Uthmani), transliterasi dan terjemahan Bahasa Melayu oleh <b>Abdullah Muhammad Basmeih</b> diambil melalui <b>Al-Quran Cloud API</b> (alquran.cloud). Digunakan untuk kegunaan peribadi, percuma dan bukan komersial.</p></div>
  <div class="card"><b>Hadis</b><p class="small">Teks Arab, terjemahan (Bahasa Indonesia / Inggeris) dan penilaian status hadis diambil melalui <b>Free Hadith API</b> oleh fawazahmed0 (The Unlicense). Penomboran mengikut sumber tersebut. Hadis Sahih al-Bukhari dan Sahih Muslim diterima sebagai sahih oleh jumhur ulama; status kitab lain dipaparkan mengikut penilai yang dinyatakan.</p></div>
  <div class="card"><b>Himpunan doa &amp; zikir</b><p class="small">Doa daripada hadis dihimpun daripada: ${Object.values(SUMBER_DOA).map(x => x.u ? `<a href="${x.u}" target="_blank" rel="noopener">${esc(x.n)}</a>` : esc(x.n)).join("; ")}. Teks Arab diambil daripada sumber tersebut; maksud ditulis semula secara ringkas oleh SAKU. Semua entri berlabel <i>Belum disemak</i> sehingga disemak oleh ahli ilmu.</p></div>
  <div class="card"><b>Waktu solat</b><p class="small">Waktu solat dan zon berdasarkan data e-Solat <b>JAKIM</b>, melalui API waktusolat.app. Arah kiblat dikira daripada lokasi peranti ke Kaabah (21.4225°U, 39.8262°T).</p></div>
  <div class="card"><b>Font</b><p class="small">Amiri (SIL Open Font License) melalui Google Fonts.</p></div>
  <div class="card"><b>Indeks topik</b><p class="small">Pemilihan ayat untuk setiap topik disusun sebagai rujukan awal dan berlabel <i>Belum disemak</i> sehingga disemak oleh ahli ilmu. Ia bukan tafsir atau fatwa.</p></div>
  <div class="card"><b>Peringatan</b><p class="small">SAKU tidak mengeluarkan fatwa, tidak menjanjikan kesembuhan dan tidak menggantikan rawatan perubatan. Rujuk Pejabat Mufti atau ahli ilmu yang berkelayakan untuk persoalan hukum.</p></div>
  <p class="muted small">SAKU V1.1 · PWA</p>
  <p style="text-align:center;margin:28px 0 8px;font-weight:600">Create By Abang Mie <span style="color:#e0245e" aria-label="love">❤</span></p>`;
}


/* ---------- Hadis & Sunnah ---------- */
const HAPI = "https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions";
async function getJSON(url) {
  if (mem[url]) return mem[url];
  const r = await fetch(url); if (!r.ok) throw new Error(r.status);
  return (mem[url] = await r.json());
}
const bhs = () => SET.bhsHadis === "eng" ? "eng" : "ind";
const labelBhs = () => bhs() === "eng" ? "Terjemahan Inggeris" : "Terjemahan Bahasa Indonesia";
function statusHadis(kitab, grades) {
  if (grades && grades.length) return grades.map(g => `<span class="badge ${/sahih|hasan/i.test(g.grade) && !/da.?if/i.test(g.grade) ? "ok" : ""}">${esc(g.grade)} — ${esc(g.name)}</span>`).join(" ");
  if (KITAB[kitab]?.sahih) return `<span class="badge ok">Sahih — terkandung dalam ${esc(KITAB[kitab].nama)}</span>`;
  return `<span class="badge">Status tidak dinyatakan dalam sumber</span>`;
}
function kadHadis(k, h, ar) {
  const id = `h:${k}:${h.hadithnumber}`;
  return `<article class="card ayat" data-ref="${id}">
    <div class="ref"><b>${esc(KITAB[k].nama)} · No. ${h.hadithnumber}</b></div>
    ${ar ? `<p class="arab" style="font-size:calc(var(--arabsize) * .8)">${esc(ar)}</p>` : ""}
    <p class="terj">${esc(h.text)}</p>
    <p class="small muted" style="margin:8px 0 6px">${labelBhs()}</p>
    <div>${statusHadis(k, h.grades)}</div>
    <div class="acts">
      <button data-act="salinH">⧉ Salin</button>
      <a class="pill" href="https://sunnah.com/${k}:${h.hadithnumber}" target="_blank" rel="noopener">Semak di sunnah.com ↗</a>
    </div></article>`;
}
$app.addEventListener("click", async e => {
  const b = e.target.closest("[data-act=salinH]"); if (!b) return;
  const c = b.closest("article"); const t = [...c.querySelectorAll(".arab,.terj")].map(x => x.textContent).join("\n\n") + "\n\n— " + c.querySelector(".ref b").textContent + "\nDikongsi dari SAKU";
  try { await navigator.clipboard.writeText(t); toast("Disalin"); } catch (x) { toast("Tidak dapat menyalin"); }
});
async function ambilHadis(k, n) {
  const [t, a] = await Promise.all([getJSON(`${HAPI}/${bhs()}-${k}/${n}.min.json`), getJSON(`${HAPI}/ara-${k}/${n}.min.json`).catch(() => null)]);
  return { h: t.hadiths[0], ar: a?.hadiths?.[0]?.text, bab: Object.values(t.metadata.section || {})[0] };
}
const segHadis = aktif => `<div class="seg"><a href="#/hadis" class="${aktif === "sunnah" ? "on" : ""}">Sunnah</a><a href="#/hadis/kitab" class="${aktif === "kitab" ? "on" : ""}">Kitab Hadis</a></div>`;

function viewHadis() {
  $app.innerHTML = `<h2 class="sec">Hadis &amp; Sunnah</h2>${segHadis("sunnah")}
    <input class="filter" placeholder="Cari sunnah: cth makan, marah, tidur, anak…" oninput="tapisSunnah(this.value)">
    <div id="ls" class="list"></div>
    <p class="muted small">Setiap sunnah disertakan hadis yang boleh disemak. Teks hadis dipaparkan terus dari sumber.</p>`;
  tapisSunnah("");
}
function tapisSunnah(v) {
  const n = norm(v); const el = document.getElementById("ls"); if (!el) return;
  const L = SUNNAH.filter(x => !n || norm(x.nama).includes(n) || x.kata.some(k => norm(k).includes(n) || n.includes(norm(k))));
  el.innerHTML = L.length ? L.map(x => `<a href="#/sunnah/${x.id}"><div class="num"><i>${x.emoji}</i></div><div class="grow"><b>${esc(x.nama)}</b><div class="small muted">${x.hadis.length} hadis</div></div></a>`).join("") : `<p class="muted small">Tiada sunnah sepadan. Cuba perkataan lain, atau buka <a href="#/hadis/kitab">Kitab Hadis</a>.</p>`;
}
async function viewSunnah(id) {
  const x = SUNNAH.find(s => s.id === id); if (!x) return go("#/hadis");
  $app.innerHTML = `<button class="back" onclick="go('#/hadis')">← Semua sunnah</button><h2 class="sec">${x.emoji} ${esc(x.nama)}</h2>${fontCtl()}<div id="hs">${loading()}</div>`;
  try {
    const L = await Promise.all(x.hadis.map(([k, n]) => ambilHadis(k, n).then(r => ({ k, ...r }))));
    document.getElementById("hs").innerHTML = L.map(r => kadHadis(r.k, r.h, r.ar)).join("");
  } catch (e) { document.getElementById("hs").innerHTML = ralat(); }
}
function viewHadisKitabList() {
  $app.innerHTML = `<h2 class="sec">Hadis &amp; Sunnah</h2>${segHadis("kitab")}
    <form class="searchbox" style="margin-bottom:14px" onsubmit="event.preventDefault();go('#/hadis/'+this.k.value+'/no/'+this.n.value)">
      <select name="k" class="selbox">${Object.entries(KITAB).map(([k, v]) => `<option value="${k}">${esc(v.nama)}</option>`).join("")}</select>
      <input name="n" type="number" min="1" placeholder="No. hadis" required inputmode="numeric" style="max-width:110px">
      <button>Buka</button>
    </form>
    <div class="list">${Object.entries(KITAB).map(([k, v]) => `<a href="#/hadis/${k}"><div class="num"><i>${{ bukhari: "B", muslim: "M", abudawud: "AD", tirmidhi: "T", nasai: "N", ibnmajah: "IM" }[k]}</i></div><div class="grow"><b>${esc(v.nama)}</b><div class="small muted">${v.bab.length} kitab/bab</div></div></a>`).join("")}</div>`;
}
function viewKitab(k) {
  if (k === "kitab") return viewHadisKitabList();
  const K = KITAB[k]; if (!K) return go("#/hadis/kitab");
  $app.innerHTML = `<button class="back" onclick="go('#/hadis/kitab')">← Senarai kitab</button><h2 class="sec">${esc(K.nama)}</h2>
    <input class="filter" placeholder="Cari bab…" oninput="tapisBab('${k}',this.value)"><div id="ls" class="list"></div>`;
  tapisBab(k, "");
}
function tapisBab(k, v) {
  const n = norm(v); const el = document.getElementById("ls"); if (!el) return;
  el.innerHTML = KITAB[k].bab.map((b, i) => [b, i + 1]).filter(([b]) => !n || norm(b).includes(n)).map(([b, i]) => `<a href="#/hadis/${k}/bab/${i}"><div class="num"><i>${i}</i></div><div class="grow"><b>${esc(b)}</b></div></a>`).join("");
}
async function viewBab(k, i) {
  const K = KITAB[k]; if (!K) return go("#/hadis/kitab");
  $app.innerHTML = `<button class="back" onclick="go('#/hadis/${k}')">← ${esc(K.nama)}</button><h2 class="sec">${esc(K.bab[i - 1] || "Bab " + i)}</h2>${fontCtl()}<div id="hs">${loading("Memuatkan hadis bab ini…")}</div>`;
  try {
    const [t, a] = await Promise.all([getJSON(`${HAPI}/${bhs()}-${k}/sections/${i}.min.json`), getJSON(`${HAPI}/ara-${k}/sections/${i}.min.json`).catch(() => null)]);
    const arMap = {}; (a?.hadiths || []).forEach(h => (arMap[h.hadithnumber] = h.text));
    const L = t.hadiths.filter(h => h.text && h.text.trim());
    let n = 0; const box = document.getElementById("hs");
    const lagi = () => {
      const part = L.slice(n, n + 15); n += part.length;
      box.querySelector(".more")?.remove();
      box.insertAdjacentHTML("beforeend", part.map(h => kadHadis(k, h, arMap[h.hadithnumber])).join("") + (n < L.length ? `<button class="more back" style="display:block;margin:10px auto">Muat lagi (${L.length - n} lagi)</button>` : ""));
      box.querySelector(".more")?.addEventListener("click", lagi);
    };
    box.innerHTML = `<p class="muted small">${L.length} hadis dalam bab ini.</p>`; lagi();
  } catch (e) { document.getElementById("hs").innerHTML = ralat(); }
}
async function viewHadisNo(k, n) {
  const K = KITAB[k]; if (!K || !n) return go("#/hadis/kitab");
  $app.innerHTML = `<button class="back" onclick="history.back()">← Kembali</button><h2 class="sec">${esc(K.nama)} · No. ${n}</h2>${fontCtl()}<div id="hs">${loading()}</div>`;
  try { const r = await ambilHadis(k, n); document.getElementById("hs").innerHTML = (r.bab ? `<p class="muted small">Bab: ${esc(r.bab)}</p>` : "") + kadHadis(k, r.h, r.ar); }
  catch (e) { document.getElementById("hs").innerHTML = `<div class="notice">Hadis No. ${n} tidak ditemui dalam ${esc(K.nama)}${K.akhir ? ` (julat 1–${K.akhir})` : ""}.</div>`; }
}

/* ---------- Waktu solat ---------- */
const WAPI = "https://api.waktusolat.app";
const NAMA_SOLAT = [["imsak", "Imsak"], ["fajr", "Subuh"], ["syuruk", "Syuruk"], ["dhuha", "Dhuha"], ["dhuhr", "Zohor"], ["asr", "Asar"], ["maghrib", "Maghrib"], ["isha", "Isyak"]];
const WAJIB = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
const jam = t => new Date(t * 1000).toLocaleTimeString("ms-MY", { hour: "numeric", minute: "2-digit", hour12: true });
function lokasi() {
  return new Promise((ok, no) => {
    if (!navigator.geolocation) return no(new Error("tiada"));
    navigator.geolocation.getCurrentPosition(p => ok(p.coords), no, { enableHighAccuracy: true, timeout: 15000, maximumAge: 600000 });
  });
}
async function kesanZon() {
  const c = await lokasi();
  SET.lat = c.latitude; SET.lon = c.longitude;
  const z = await getJSON(`${WAPI}/zones/${c.latitude.toFixed(4)}/${c.longitude.toFixed(4)}`);
  SET.zon = z.zone; SET.zonNama = z.district; simpanSet(); return z;
}
async function waktuHariIni(zon) {
  const d = await getJSON(`${WAPI}/v2/solat/${zon}`);
  const hari = new Date().getDate();
  return d.prayers.find(p => p.day === hari);
}
function seterusnya(w) {
  const now = Date.now() / 1000;
  const k = WAJIB.find(x => w[x] > now);
  return k ? { k, t: w[k] } : null;
}
const baki = s => { const m = Math.max(0, Math.round(s / 60)); return m >= 60 ? `${Math.floor(m / 60)} jam ${m % 60} min` : `${m} min`; };

async function viewSolat() {
  $app.innerHTML = `<h2 class="sec">Waktu Solat</h2>
    <div class="card gold"><div class="small muted">Zon</div><b id="zn">${SET.zon ? `${esc(SET.zon)} · ${esc(SET.zonNama)}` : "Belum dipilih"}</b>
      <div class="acts"><button onclick="autoZon()">📍 Kesan lokasi saya</button><button onclick="go('#/tetapan')">Pilih zon manual</button><button onclick="go('#/kiblat')">🧭 Arah kiblat</button></div></div>
    <div id="ws">${SET.zon ? loading() : `<div class="card muted">Tekan <b>📍 Kesan lokasi saya</b> atau pilih zon di Tetapan.</div>`}</div>
    <p class="muted small">Data waktu solat: e-Solat JAKIM.</p>`;
  if (!SET.zon) return;
  try {
    const w = await waktuHariIni(SET.zon); const el = document.getElementById("ws"); if (!el) return;
    if (!w) { el.innerHTML = ralat(); return; }
    const lukis = () => {
      const nx = seterusnya(w); const now = Date.now() / 1000;
      el.innerHTML = `<div class="card next">${nx ? `<div class="small">Solat seterusnya</div><div class="big">${NAMA_SOLAT.find(n => n[0] === nx.k)[1]} · ${jam(nx.t)}</div><div class="small">dalam ${baki(nx.t - now)}</div>` : `<div class="big">Semua waktu hari ini telah masuk</div>`}
        <div class="small" style="margin-top:6px">${new Date().toLocaleDateString("ms-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${esc(w.hijri)} H</div></div>
        <div class="card"><div class="waktu">${NAMA_SOLAT.map(([k, n]) => `<div class="${nx && nx.k === k ? "on" : ""} ${WAJIB.includes(k) ? "" : "sunat"}"><span>${n}</span><b>${jam(w[k])}</b></div>`).join("")}</div></div>`;
    };
    lukis(); window._tick = setInterval(lukis, 30000);
  } catch (e) { document.getElementById("ws").innerHTML = ralat(); }
}
async function autoZon() {
  toast("Mengesan lokasi…");
  try { await kesanZon(); toast("Zon: " + SET.zon); router(); }
  catch (e) { toast("Lokasi tidak dapat dikesan. Benarkan akses lokasi atau pilih zon manual."); }
}

/* ---------- Kiblat ---------- */
const KAABAH = [21.4225, 39.8262];
function arahKiblat(lat, lon) {
  const r = Math.PI / 180, f1 = lat * r, f2 = KAABAH[0] * r, dl = (KAABAH[1] - lon) * r;
  const y = Math.sin(dl) * Math.cos(f2), x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return (Math.atan2(y, x) / r + 360) % 360;
}
function jarakKaabah(lat, lon) {
  const r = Math.PI / 180, dLat = (KAABAH[0] - lat) * r, dLon = (KAABAH[1] - lon) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * r) * Math.cos(KAABAH[0] * r) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
let _kompas = null;
function hentiKompas() { if (_kompas) { window.removeEventListener("deviceorientationabsolute", _kompas); window.removeEventListener("deviceorientation", _kompas); _kompas = null; } }
async function viewKiblat() {
  $app.innerHTML = `<button class="back" onclick="go('#/solat')">← Waktu solat</button><h2 class="sec">Arah Kiblat</h2><div id="kb">${loading("Mengesan lokasi…")}</div>`;
  let lat = SET.lat, lon = SET.lon;
  try { const c = await lokasi(); lat = c.latitude; lon = c.longitude; SET.lat = lat; SET.lon = lon; simpanSet(); }
  catch (e) { if (lat == null) { document.getElementById("kb").innerHTML = `<div class="notice">Lokasi diperlukan untuk mengira arah kiblat. Benarkan akses lokasi dalam browser, kemudian cuba lagi.</div><button class="back" onclick="viewKiblat()">Cuba lagi</button>`; return; } }
  const q = arahKiblat(lat, lon);
  document.getElementById("kb").innerHTML = `
    <div class="card gold" style="text-align:center">
      <div class="kompas"><div class="dial" id="dial"><span class="u">U</span><span class="t">T</span><span class="s">S</span><span class="b">B</span>
        <div class="jarum" style="transform:rotate(${q}deg)"><i>🕋</i></div></div></div>
      <div class="big" style="margin-top:12px">${q.toFixed(1)}° dari Utara</div>
      <div class="small muted">Jarak ke Kaabah ≈ ${Math.round(jarakKaabah(lat, lon)).toLocaleString("ms-MY")} km</div>
      <div id="kst" class="small muted" style="margin-top:8px">Pegang telefon secara mendatar. Tekan butang di bawah untuk kompas langsung.</div>
      <div class="acts" style="justify-content:center"><button onclick="mulaKompas(${q})">🧭 Mula kompas</button></div>
    </div>
    <div class="notice">Kompas telefon boleh dipengaruhi besi atau magnet berhampiran. Kalibrasi dengan menggerakkan telefon membentuk angka 8. Untuk ketepatan, rujuk juga arah kiblat masjid berhampiran.</div>`;
}
async function mulaKompas(q) {
  try { if (typeof DeviceOrientationEvent !== "undefined" && DeviceOrientationEvent.requestPermission) { const p = await DeviceOrientationEvent.requestPermission(); if (p !== "granted") throw 0; } } catch (e) { toast("Kebenaran kompas ditolak"); return; }
  hentiKompas();
  const st = document.getElementById("kst"); let dapat = false;
  _kompas = e => {
    let h = e.webkitCompassHeading != null ? e.webkitCompassHeading : (e.absolute || e.type === "deviceorientationabsolute") && e.alpha != null ? 360 - e.alpha : null;
    if (h == null) return; dapat = true;
    const d = document.getElementById("dial"); if (!d) return hentiKompas();
    d.style.transform = `rotate(${-h}deg)`;
    const beza = Math.abs(((q - h + 540) % 360) - 180);
    st.innerHTML = beza < 5 ? `<b style="color:var(--emerald-2)">✓ Anda menghadap kiblat</b>` : `Pusing perlahan sehingga 🕋 berada di atas (beza ${Math.round(beza)}°)`;
  };
  window.addEventListener("deviceorientationabsolute", _kompas); window.addEventListener("deviceorientation", _kompas);
  setTimeout(() => { if (!dapat && st) st.textContent = "Kompas tidak dikesan pada peranti ini. Gunakan darjah di atas bersama kompas biasa."; }, 3000);
}

/* ---------- Tetapan ---------- */
async function viewTetapan() {
  const pilih = (k, v, label) => `<button class="${SET[k] === v ? "on" : ""}" onclick="SET['${k}']='${v}';simpanSet();terapTema();viewTetapan()">${label}</button>`;
  $app.innerHTML = `<h2 class="sec">Tetapan</h2>
    <div class="card"><b>Tema</b><div class="acts">${pilih("tema", "cerah", "☀️ Cerah")}${pilih("tema", "gelap", "🌙 Gelap")}${pilih("tema", "auto", "Ikut sistem")}</div></div>
    <div class="card"><b>Saiz tulisan Arab</b>${fontCtl()}<p class="arab" style="margin:0">بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</p></div>
    <div class="card"><b>Transliterasi al-Quran</b><div class="acts"><button class="${SET.translit ? "on" : ""}" onclick="SET.translit=true;simpanSet();viewTetapan()">Papar</button><button class="${!SET.translit ? "on" : ""}" onclick="SET.translit=false;simpanSet();viewTetapan()">Sembunyi</button></div></div>
    <div class="card"><b>Bahasa terjemahan hadis</b><p class="small muted" style="margin:4px 0 0">Terjemahan Bahasa Melayu belum tersedia dalam sumber; Bahasa Indonesia paling hampir.</p><div class="acts">${pilih("bhsHadis", "ind", "Bahasa Indonesia")}${pilih("bhsHadis", "eng", "English")}</div></div>
    <div class="card"><b>Zon waktu solat</b><p class="small" style="margin:4px 0 8px">Semasa: <b>${SET.zon ? `${esc(SET.zon)} · ${esc(SET.zonNama)}` : "Belum dipilih"}</b></p>
      <div class="acts" style="margin-top:0"><button onclick="autoZon()">📍 Kesan lokasi saya</button></div>
      <select id="zsel" class="filter" style="margin:10px 0 0" onchange="pilihZon(this)"><option>Memuatkan senarai zon…</option></select></div>
    <div class="card"><b>Data</b><div class="acts"><button onclick="if(confirmPadam())0">Padam simpanan &amp; sejarah</button></div></div>
    <div class="card"><b>Tentang</b><p class="small" style="margin:4px 0 0">SAKU V1.1 · PWA. <a href="#/kredit">Sumber &amp; Kredit</a></p></div>`;
  try {
    const z = await getJSON(`${WAPI}/zones`); const sel = document.getElementById("zsel"); if (!sel) return;
    const neg = [...new Set(z.map(x => x.negeri))];
    sel.innerHTML = `<option value="">— Pilih zon secara manual —</option>` + neg.map(n => `<optgroup label="${esc(n)}">${z.filter(x => x.negeri === n).map(x => `<option value="${x.jakimCode}" ${x.jakimCode === SET.zon ? "selected" : ""}>${x.jakimCode} · ${esc(x.daerah)}</option>`).join("")}</optgroup>`).join("");
  } catch (e) { const sel = document.getElementById("zsel"); if (sel) sel.innerHTML = `<option>Senarai zon tidak dapat dimuatkan</option>`; }
}
function pilihZon(sel) {
  if (!sel.value) return;
  SET.zon = sel.value; SET.zonNama = sel.options[sel.selectedIndex].text.split(" · ").slice(1).join(" · "); simpanSet(); toast("Zon ditetapkan: " + SET.zon); viewTetapan();
}
function confirmPadam() {
  const b = document.querySelector("[onclick^='if(confirmPadam']");
  if (b && b.dataset.sah !== "1") { b.dataset.sah = "1"; b.textContent = "Tekan sekali lagi untuk sahkan"; return false; }
  BM = []; HIST = []; simpan("saku_bm", []); simpan("saku_hist", []); toast("Simpanan & sejarah dipadam"); viewTetapan(); return true;
}

/* ---------- Penghala ---------- */
async function router() {
  const h = decodeURIComponent(location.hash.slice(1) || "/");
  const p = h.split("/").filter(Boolean);
  const tab = { "": "utama", cari: "utama", topik: "utama", quran: "quran", surah: "quran", hadis: "hadis", sunnah: "hadis", doa: "doa", solat: "solat", kiblat: "solat" }[p[0] || ""];
  clearInterval(window._tick); hentiKompas();
  document.querySelectorAll(".tabbar a").forEach(a => a.classList.toggle("aktif", a.dataset.tab === tab));
  terakhir = {}; window.scrollTo(0, 0);
  if (!p.length) return viewUtama();
  if (p[0] === "cari") return viewCari(p.slice(1).join("/"));
  if (p[0] === "topik") return viewTopik(p[1]);
  if (p[0] === "quran") return viewQuran();
  if (p[0] === "surah") return viewSurah(+p[1], p[2] ? +p[2] : 0);
  if (p[0] === "doa") return p[1] === "cari" ? viewDoaCari(p.slice(2).join("/")) : p[1] === "kat" ? viewDoaKat(p.slice(2).join("/")) : viewDoa();
  if (p[0] === "simpanan") return viewSimpanan();
  if (p[0] === "kredit") return viewKredit();
  if (p[0] === "tetapan") return viewTetapan();
  if (p[0] === "hadis") return p[1] ? (p[2] === "bab" ? viewBab(p[1], +p[3]) : p[2] === "no" ? viewHadisNo(p[1], +p[3]) : viewKitab(p[1])) : viewHadis();
  if (p[0] === "sunnah") return viewSunnah(p[1]);
  if (p[0] === "solat") return viewSolat();
  if (p[0] === "kiblat") return viewKiblat();
  viewUtama();
}

/* ---------- Tema & mula ---------- */
function terapTema() {
  const gelap = SET.tema === "gelap" || (SET.tema === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.tema = gelap ? "gelap" : "cerah";
}
terapTema();
document.documentElement.style.setProperty("--arabsize", ambil("saku_font", 28) + "px");
window.addEventListener("hashchange", router);
router();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
