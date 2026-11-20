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
    <p class="translit">${esc(a.tr)}</p>
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
  const teks = `${a.ar}\n\n${a.ms}\n\n— ${a.surah} ${a.ref} (Terjemahan Abdullah Basmeih)\nDikongsi dari SAKU`;
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

  const kata = norm(q).split(" ").filter(w => w.length > 3 && !["saya","sedang","mahu","ingin","rasa","sangat","untuk","dengan","yang","tidak"].includes(w));
  const el = document.getElementById("terj");
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
  const jam = new Date().getHours();
  const waktu = jam < 12 ? "Selamat pagi" : jam < 15 ? "Selamat tengah hari" : jam < 19 ? "Selamat petang" : "Selamat malam";
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
  <h2 class="sec">Panduan kehidupan</h2>
  <div class="chips">${TOPICS.map(chipTopik).join("")}</div>
  ${HIST.length ? `<h2 class="sec">Carian lepas</h2><div class="chips">${HIST.slice(0, 6).map(h => `<button class="chip" onclick="go('#/cari/${encodeURIComponent(h)}')"><span>↺</span>${esc(h)}</button>`).join("")}</div>` : ""}
  <p class="muted small" style="margin-top:22px">SAKU ialah pusat rujukan, bukan sumber fatwa. Persoalan hukum yang rumit, rujuk kepada ahli ilmu yang berkelayakan.</p>`;
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

async function viewDoa() {
  const kats = [...new Set(DOA.map(d => d.kat))];
  $app.innerHTML = `<h2 class="sec">Doa dari al-Quran</h2>
    <p class="muted small">Teks Arab, transliterasi dan terjemahan dipaparkan terus dari pangkalan data al-Quran. Doa dari hadis akan ditambah dalam versi akan datang.</p>
    ${fontCtl()}
    ${kats.map(k => `<h2 class="sec">${esc(k)}</h2><div data-kat="${esc(k)}">${loading()}</div>`).join("")}`;
  for (const k of kats) {
    const box = $app.querySelector(`[data-kat="${CSS.escape(k)}"]`);
    try {
      const html = [];
      for (const d of DOA.filter(x => x.kat === k)) {
        const list = await ambilBanyak([d.ref]); daftar(list);
        if (list.length === 1) html.push(kadAyat(list[0], `<span class="small muted">${esc(d.tajuk)}</span>`));
        else {
          const gab = { ref: list[0].ref, surah: list[0].surah, ar: list.map(a => a.ar).join(" ۝ "), tr: list.map(a => a.tr).join(" "), ms: list.map(a => a.ms).join(" ") };
          gab.ref = d.ref; terakhir[d.ref] = gab;
          html.push(kadAyat(gab, `<span class="small muted">${esc(d.tajuk)}</span>`));
        }
      }
      if (box) box.innerHTML = html.join("");
    } catch (e) { if (box) box.innerHTML = ralat(); }
  }
}

async function viewSimpanan() {
  $app.innerHTML = `<h2 class="sec">Simpanan</h2>${BM.length ? `${fontCtl()}<div id="bm">${loading()}</div>` : `<div class="card muted">Belum ada ayat disimpan. Tekan <b>☆ Simpan</b> pada mana-mana ayat.</div>`}
    ${HIST.length ? `<h2 class="sec">Sejarah carian</h2><div class="chips">${HIST.map(h => `<button class="chip" onclick="go('#/cari/${encodeURIComponent(h)}')"><span>↺</span>${esc(h)}</button>`).join("")}</div>
      <p><button class="back" onclick="HIST=[];simpan('saku_hist',[]);viewSimpanan()">Padam sejarah carian</button></p>` : ""}`;
  if (!BM.length) return;
  try { const list = await ambilBanyak(BM); daftar(list); document.getElementById("bm").innerHTML = list.map(a => kadAyat(a)).join(""); }
  catch (e) { document.getElementById("bm").innerHTML = ralat(); }
}

function viewKredit() {
  $app.innerHTML = `<button class="back" onclick="history.back()">← Kembali</button><h2 class="sec">Sumber &amp; Kredit</h2>
  <div class="card"><b>Teks al-Quran & terjemahan</b><p class="small">Teks Arab (Uthmani), transliterasi dan terjemahan Bahasa Melayu oleh <b>Abdullah Muhammad Basmeih</b> diambil melalui <b>Al-Quran Cloud API</b> (alquran.cloud). Digunakan untuk kegunaan peribadi, percuma dan bukan komersial.</p></div>
  <div class="card"><b>Font</b><p class="small">Amiri (SIL Open Font License) melalui Google Fonts.</p></div>
  <div class="card"><b>Indeks topik</b><p class="small">Pemilihan ayat untuk setiap topik disusun sebagai rujukan awal dan berlabel <i>Belum disemak</i> sehingga disemak oleh ahli ilmu. Ia bukan tafsir atau fatwa.</p></div>
  <div class="card"><b>Peringatan</b><p class="small">SAKU tidak mengeluarkan fatwa, tidak menjanjikan kesembuhan dan tidak menggantikan rawatan perubatan. Rujuk Pejabat Mufti atau ahli ilmu yang berkelayakan untuk persoalan hukum.</p></div>
  <p class="muted small">SAKU V1 · PWA</p>`;
}

/* ---------- Penghala ---------- */
async function router() {
  const h = decodeURIComponent(location.hash.slice(1) || "/");
  const p = h.split("/").filter(Boolean);
  const tab = { "": "utama", cari: "utama", topik: "utama", quran: "quran", surah: "quran", doa: "doa", simpanan: "simpanan", kredit: "" }[p[0] || ""];
  document.querySelectorAll(".tabbar a").forEach(a => a.classList.toggle("aktif", a.dataset.tab === tab));
  terakhir = {}; window.scrollTo(0, 0);
  if (!p.length) return viewUtama();
  if (p[0] === "cari") return viewCari(p.slice(1).join("/"));
  if (p[0] === "topik") return viewTopik(p[1]);
  if (p[0] === "quran") return viewQuran();
  if (p[0] === "surah") return viewSurah(+p[1], p[2] ? +p[2] : 0);
  if (p[0] === "doa") return viewDoa();
  if (p[0] === "simpanan") return viewSimpanan();
  if (p[0] === "kredit") return viewKredit();
  viewUtama();
}

/* ---------- Tema & mula ---------- */
function setTema(t) { document.documentElement.dataset.tema = t; simpan("saku_tema", t); document.getElementById("btnTema").textContent = t === "gelap" ? "☀️" : "🌙"; }
document.getElementById("btnTema").onclick = () => setTema(document.documentElement.dataset.tema === "gelap" ? "cerah" : "gelap");
setTema(ambil("saku_tema", matchMedia("(prefers-color-scheme: dark)").matches ? "gelap" : "cerah"));
document.documentElement.style.setProperty("--arabsize", ambil("saku_font", 28) + "px");
window.addEventListener("hashchange", router);
router();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
