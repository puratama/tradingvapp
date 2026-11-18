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

Grid dan ambang konfluensi diukur, bukan ditebak. Backtest memakai ekspor MT5
`XAUUSD.vx` (H1/H4/M15/M5/M1, Jan 2025 – Nov 2026), sinyal dihitung ulang dari
bar seperti engine, lalu diselesaikan bar-per-bar dengan **spread historis** dari
kolom MT5 dibebankan ke setiap trade.

| Gaya | Jendela | Sinyal | Win | Net R/trade |
|---|---|---|---|---|
| `swing` | in-sample (Agu–Nov 2026) | 368 | 53.3% | **+0.319** |
| `swing` | out-of-sample (Jul 2025 – Agu 2026) | 935 | 51.0% | **+0.264** |
| `scalp` | in-sample, resolusi M1 | 1251 | 53.7% | +0.029 |
| `scalp` | out-of-sample, resolusi M5 | 5353 | 46.0% | **−0.115** |

Yang berubah karena pengukuran ini:

- TP1 swing 1.5R mengalahkan 2.5R (varian 2.5R kehilangan ~0.45R/trade); clamp
  stop swing dipersempit ke [1, 2.5]× ATR H1.
- Konfluensi kini memakai TF entry sendiri (ATR/RSI/MACD/EMA20/rating), bukan
  H1 untuk semua gaya — versi lama menilai scalp dengan ATR yang ~4× terlalu besar.
- Ambang verdict naik ke **6 poin** (dari 3): 63% sinyal lama ada di skor 2–5 dan
  agregatnya negatif.
- Grid scalp: clamp [1.5, 4]× ATR M5, `minStop` 1.2.

**Batas kejujuran hasil ini:** scalp hanya positif bila trade diselesaikan dengan
resolusi **M1 atau lebih halus**. Pada M1 hasilnya +0.03 R/trade (tipis), dan pada
M5 turun ke −0.12 R/trade karena SL dan TP jatuh di bar yang sama (ambigu hanya
0.5%, jadi bukan artefak). Artinya parameter scalp yang ada **belum terbukti**
di luar jendela Agustus–November 2026; perlakukan sebagai eksperimen yang
diukur, bukan strategi tervalidasi.

## Catatan

- Sumber candle memakai endpoint internal TradingView yang **tidak resmi** — bisa berubah
  sewaktu-waktu; disclaimer juga tampil di footer aplikasi.
- Output analisis bersifat edukasi, bukan sinyal otomatis. Manajemen risiko tetap di tangan Anda.
