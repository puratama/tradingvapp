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

Semua keputusan disertai **alasan dan peringatan** yang bisa dibaca di panel — tidak ada
keputusan hitam-putih tanpa penjelasan.

## Kalender ekonomi & dampak ke XAUUSD

Setiap event ditampilkan dengan waktu WIB, mata uang, tingkat dampak, forecast/previous/actual,
hitung mundur, serta:

- **Relevansi**: `langsung` (USD) atau `tidak langsung` (mata uang mayor lain via DXY/risk sentiment).
- **Mengapa penting** dan **proyeksi dampak** (mis. "inflasi panas → XAUUSD tertekan").

Sumber: feed JSON ForexFactory (gratis). Cakupan default: USD + EUR, GBP, JPY, CHF, CAD, AUD, CNY.

## Catatan

- Sumber candle memakai endpoint internal TradingView yang **tidak resmi** — bisa berubah
  sewaktu-waktu; disclaimer juga tampil di footer aplikasi.
- Output analisis bersifat edukasi, bukan sinyal otomatis. Manajemen risiko tetap di tangan Anda.
