# XAUUSD Decision Desk

Web app pendukung keputusan entry trading XAUUSD (Gold/USD): chart candle dari TradingView,
mesin analisis konfluensi multi-timeframe, rencana entry/SL/TP berbasis ATR, kalkulator risiko,
dan kalender ekonomi lengkap dengan analisis dampaknya terhadap emas.

## Stack

| Lapisan | Teknologi |
| --- | --- |
| Bahasa | TypeScript (ESM), dieksekusi `tsx` — tanpa build step server |
| Client | React 18, Vite 6, Tailwind CSS v4, `lightweight-charts` 5 |
| Server | Node.js ≥ 20, Express 4, SSE (`/api/stream`) |
| Data market | MCP stdio → `mcp-bridge` → `@mathieuc/tradingview` + feed ForexFactory |
| Persistensi | PostgreSQL 18 via `pg` (tabel `trades`) |

```
client/  (Vite + React + TS + Tailwind + lightweight-charts)
   │  fetch /api/* + SSE /api/stream
server/  (Express + mesin analisis + PostgreSQL)
   │  MCP protocol (stdio)
mcp-bridge/  (MCP server "tradingview-lite")
   │
   ├── @mathieuc/tradingview  → candle/quote/rating via websocket TradingView (gratis, tanpa akun)
   └── ForexFactory JSON feed → kalender ekonomi (gratis, tanpa akun)
```

Semua data market masuk lewat **layer MCP** (`server/mcp.ts` → `mcp-bridge`). Tool yang diekspos
bridge memakai nama kompatibel dengan MCP resmi TradingView (`get_ohlcv`, `get_quote`,
`search_symbol`, `get_technical_analysis`, `get_economic_calendar`), sehingga ketika Anda punya
akun TradingView berbayar, backend bisa diarahkan ke `https://mcp.tradingview.com/mcp` tanpa
mengubah mesin analisis.

## Menjalankan

```bash
npm install
npm run dev        # API :3001 + web :5173
```

Buka http://localhost:5173. Untuk mode produksi:

```bash
npm run build      # build client ke client/dist
npm start          # Express menyajikan API + client di :3001
```

Konfigurasi dibaca dari `.env` di root (template: `.env.example`):

| Variabel | Default | Fungsi |
| --- | --- | --- |
| `PORT` | `3001` | Port REST API (bind `127.0.0.1`) |
| `XAUUSD_SYMBOL` | `OANDA:XAUUSD` | Simbol TradingView yang dianalisis |
| `PGHOST` | `127.0.0.1` | Host PostgreSQL |
| `PGPORT` | `5432` | Port PostgreSQL |
| `PGUSER` | `postgres` | User PostgreSQL |
| `PGPASSWORD` | `postgres` | Password PostgreSQL |
| `PGDATABASE` | `tradingvapp` | Nama database (skema dibuat otomatis) |

## Penyimpanan riwayat

Sinyal BUY/SELL dicatat otomatis ke tabel `trades` di PostgreSQL (skema dibuat saat
startup). Status: `WAITING` (order limit/stop, entry belum tersentuh) → `RUNNING` →
`TP_HIT`/`SL_HIT`; order yang tidak tersentuh dalam 1 jam jadi `EXPIRED`. Trade terakhir
juga didorong realtime ke UI lewat event SSE `trades`.

## Cara kerja mesin analisis

1. Candle M5/M15/H1/H4/D1 (300 bar) diambil via MCP.
2. Per timeframe: EMA20/50/200, RSI14, MACD, ATR14, klasifikasi tren (skor [-1..1] dari
   keselarasan EMA, posisi harga vs EMA50, dan struktur swing HH/HL vs LH/LL).
3. Bias gabungan = rata-rata berbobot D1:H4:H1:M15:M5 = 3:3:2:1:1.
4. Skor konfluensi (arah bias) dari: keselarasan tren H4+H1, konteks D1, RSI & MACD H1,
   kualitas pullback terhadap EMA20 H1, pola candle pemicu, rating teknikal TradingView,
   dan level struktur terdekat.
   - Skor ≥ 3 → verdict BUY/SELL (confidence = 50 + 6.5×skor)
   - Skor = 2 → verdict dengan catatan risiko kecil
   - Skor < 2 → **WAIT**
   - News high-impact dalam ±1 jam → verdict dipaksa **WAIT** (jendela news)
5. Rencana trade (BUY sebagai contoh): entry di EMA20 H1 (pullback) / harga pasar / breakout
   swing 30 bar; SL di bawah swing terdekat dengan jarak diklamp [0.8×, 2.6×] ATR H1;
   TP1 = 1.5R, TP2 = 2.5R.

### Gaya entry (`ENTRY_STYLE` / `?style=`)

Satu mesin, dua grid stop/target. Default `swing`; `scalp` memakai basis ATR lebih rendah.

| Aspek | `swing` | `scalp` |
|---|---|---|
| Basis ATR | H1 | M5 |
| Bobot bias | D1:H4:H1:M15:M5 = 3:3:2:1:1 | D1:H4:H1:M15:M5:M1 = 1:1:2:2:3:1 |
| Jarak SL | 0.8–2.6× ATR H1 | 0.6–1.5× ATR M5 |
| RR | 1.5 / 2.5 | 1.0 / 1.6 |
| Jendela news | ±60 menit | ±15 menit |
| Level struktur | H4/H1/D1 | H1/M15/H4 |

`GET /api/analysis?style=scalp` menghitung gaya scalp tanpa mengubah env; SSE tetap memakai
`ENTRY_STYLE`. `TradePlan.spread` (ask − bid) dihitung sebagai biaya — kalkulator risiko memakai
`stopDistance + spread` sebagai risiko per ounce, dan SL scalp yang lebih kecil dari 4× spread
memunculkan peringatan eksplisit.

Semua keputusan disertai **alasan dan peringatan** yang bisa dibaca di panel — tidak ada
keputusan hitam-putih tanpa penjelasan.

## Kalender ekonomi & dampak ke XAUUSD

Setiap event ditampilkan dengan waktu WIB, mata uang, tingkat dampak, forecast/previous/actual,
hitung mundur, serta:

- **Relevansi**: `langsung` (USD) atau `tidak langsung` (mata uang mayor lain via DXY/risk sentiment).
- **Mengapa penting** dan **proyeksi dampak** (mis. "inflasi panas → XAUUSD tertekan").

Sumber: feed JSON ForexFactory (gratis). Cakupan default: USD + EUR, GBP, JPY, CHF, CAD, AUD, CNY.

## Kalibrasi dari data MT5

Sumber validasi utama: **`XAUUSD.txt`** — riwayat M1 tunggal 2003–2026 (8 juta
bar, satu feed `XAUUSD`, tanpa kolom spread sehingga biaya diperkirakan konstan
0,30 USD). Semua timeframe engine (M5/M15/H1/H4/D1) diagregasi dari feed yang
sama, dan setiap sinyal diselesaikan **per menit** (resolusi M1).

| Gaya | Jendela | Sinyal tertutup | Win | Gross | Biaya | **Net R/trade** |
|---|---|---|---|---|---|---|
| `swing` | 2015–2026 | 9.132 | 51.1% | +0.24 | 0.01 | **+0.224** |
| `scalp` | 2015–2026 | 47.380 | 53.8% | +0.08 | 0.20 | **−0.126** |

Swing per tahun (net R/trade) — **12 dari 12 tahun positif**:

| 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| +0.26 | +0.08 | +0.16 | +0.18 | +0.14 | +0.17 | +0.17 | +0.39 | +0.36 | +0.19 | +0.39 | +0.21 |

Temuan penting dari dua iterasi backtest sebelumnya yang **dikoreksi** oleh
resolusi M1: klaim lama "2015–2018 negatif" ternyata artefak — era lama
diselesaikan dengan bar kasar (M5/M15 dari folder `ticks/` yang baru mulai
2024/2018) sehingga fill dan urutan SL/TP salah ukur. Dengan feed tunggal +
resolusi M1, semua tahun positif.

Scalp: sinyalnya **tipis-positif secara gross** (+0.08 R/trade, win 53.8%) tapi
spread 0,30 USD ≈ 0,20 R/trade pada stop M5 yang sempit — biaya memakannya
seluruhnya. Ambiguitas SL/TP satu-menit hanya 0,04% (swing) / 0,10% (scalp),
jadi resolusi bukan lagi masalahnya.

Ablasi pada 12 tahun (walk-forward: kesimpulan sama di kedua paruh 2015–2020
dan 2021–2026):

- **Ambang konfluensi 6 poin** terkonfirmasi: minPts 4 = +0.127 (2016 negatif)
  vs minPts 6 = +0.224 (12/12 tahun positif).
- **TP1 1.5R vs 2R tipis-tipisan**: 2R = +0.242, 1.5R = +0.224. Engine mempertahankan
  1.5R karena tahun terburuknya lebih baik (+0.08 vs +0.05) dan kurva ekuitas
  lebih halus (win 51% vs 43%); 2R alternatif sah bila target ekspektasi maksimal.
- Konfluensi memakai TF entry sendiri (ATR/RSI/MACD/EMA20/rating), bukan H1 untuk
  semua gaya — versi lama menilai scalp dengan ATR yang ~4× terlalu besar.
- Grid scalp final (tervalidasi di sweep 2024–2026): clamp [2, 4]× ATR M5,
  `minStop` 1.2, TP1 1.5R — plus **gate biaya**: trade dilewati bila spread
  > 8% jarak SL (mengubah scalp 2024–2026 dari ±0.00 jadi **+0.034** R/trade,
  tiga-tiganya tahun positif). Filter sesi jam likuid (07–20 UTC) menaikkan
  rata-rata ke +0.059 tapi membuat 2026 negatif → tidak diadopsi.
  Ambang 7 poin untuk scalp ditolak: −0.079 R/trade dan 2024–2026 justru
  negatif — edge ada di sinyal 6-poin, bukan di kualitas tertinggi.

Validasi 12 tahun config C (2015–2026, resolusi M1, net R/trade):

| 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| −0.28 | −0.22 | +0.27 | −0.05 | −0.50 | −0.13 | +0.01 | −0.04 | −0.19 | +0.03 | +0.05 | +0.02 |

**Scalp bergantung regime**: positif konsisten hanya 2024–2026 (harga >2000,
ATR M5 besar → stop lebih murah relatif spread, tren lebih jelas); 2015–2023
negatif bahkan setelah gate biaya. Swing tidak punya masalah ini (12/12
positif). Scalp layak uang sungguhan **hanya** dengan pemahaman bahwa edge-nya
hidup di regime volatilitas tinggi seperti sekarang.

**Batas kejujuran hasil ini:**

- Validasi scalp 2024–2026 = 3 tahun; di luar itu historisnya merugi. Risiko
  utama bukan parameter, tapi **regime pasar berubah**.
- **Ukuran posisi (dari statistik drawdown 12 tahun)**: streak kalah terpanjang
  **35 trade**, max drawdown 492 R. Pada risiko 0,5%/trade itu −17% beruntun —
  scalp hanya untuk modal yang tahan itu; risiko 1%/trade tidak disarankan.
- Biaya diasumsikan **konstan 0,30 USD** (feed M1 tidak punya kolom spread).
  Spread realistis melebar saat news dan rollover — angka net bisa lebih buruk.
- Resolusi M1 masih bar, bukan tick: urutan SL/TP dalam satu menit dihitung
  konservatif (SL dulu). Dampaknya kecil (≤0,1% trade) tapi bukan nol.
- Backtest tidak memasukkan slippage/requote broker, gap weekend, dan gate
  berita (arsip kalender historis tidak tersedia) — hasil live bisa lebih rendah.
- Pemilihan parameter diuji walk-forward pada dua paruh periode, bukan hanya
  satu jendela; angka tetap berlaku untuk regime serupa 2015–2026.

## Catatan

- Sumber candle memakai endpoint internal TradingView yang **tidak resmi** — bisa berubah
  sewaktu-waktu; disclaimer juga tampil di footer aplikasi.
- Output analisis bersifat edukasi, bukan sinyal otomatis. Manajemen risiko tetap di tangan Anda.
