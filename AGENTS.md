# Repository Guidelines

## Project Overview

XAUUSD Decision Desk — web app pendukung keputusan entry trading emas (XAUUSD):
chart candle TradingView, mesin analisis konfluensi multi-timeframe (entry/SL/TP
berbasis ATR), kalkulator risiko, dan kalender ekonomi dengan analisis dampak ke emas.
UI berbahasa Indonesia; zona waktu tampilan WIB (`Asia/Jakarta`).

## Architecture & Data Flow

```
client/  (Vite + React + TS + Tailwind v4 + lightweight-charts)
   │  fetch /api/* + SSE /api/stream  (polling hooks + push realtime)
server/  (Express + mesin analisis)
   │  MCP JSON-RPC + notifikasi (quote stream) via stdio
mcp-bridge/  (MCP server "tradingview-lite", di-spawn sebagai child process)
   ├── @mathieuc/tradingview → candle/quote/rating (websocket internal TradingView)
   └── ForexFactory JSON    → kalender ekonomi
```

Aliran data: `client/src/lib/api.ts` → REST `server/index.ts` (dan push SSE
`/api/stream`: quote per tick, analisis saat berubah, trade saat status berubah)
→ `server/mcp.ts` (MCP client + cache TTL + listener notifikasi) →
`mcp-bridge/index.ts` (tool `get_ohlcv`, `get_quote`, `subscribe_quote`,
`search_symbol`, `get_technical_analysis`, `get_economic_calendar`) → sumber data.
Nama tool bridge sengaja kompatibel dengan MCP resmi TradingView
(`https://mcp.tradingview.com/mcp`) agar backend bisa dialihkan tanpa mengubah engine.

Mesin analisis (`server/analysis/signal.ts`) menggabungkan: snapshot tren per TF
(EMA20/50/200, RSI14, MACD, ATR14, struktur swing), bias berbobot
D1:H4:H1:M15:M5 = 3:3:2:1:1, skor konfluensi (tren, momentum, pullback vs EMA20 H1,
pola candle, rating TradingView, level struktur), dan gate berita (event high-impact
dari −5 menit sampai +1 jam → verdict dipaksa `WAIT`).

## Key Directories

|Path|Purpose|
|---|---|
|`shared/`|Tipe domain (`types.ts`) + indikator murni (`indicators.ts`) — dipakai server & client|
|`server/`|Express REST API, MCP client, engine analisis, riwayat trade (`trades.ts`), enrichment berita|
|`server/analysis/`|`indicators` (re-export dari shared), `structure`, `patterns`, `signal`|
|`server/news/enrich.ts`|Mapping judul event → dampak ke XAUUSD (bahasa Indonesia)|
|`mcp-bridge/`|MCP server stdio; `forexfactory.ts` = fetch feed kalender|
|`client/src/components/`|`Chart`, `SignalPanel`, `MtfTable`, `RiskCalculator`, `NewsPanel`, `TradeHistory`|
|`client/src/lib/`|`api.ts` (hooks polling), `format.ts` (WIB, angka, countdown)|
|`client/src/App.tsx`|Layout utama: chart (kiri) + sidebar kanan `w-1/5` berisi tab `SINYAL` (default) / `RIWAYAT`; detail lain lewat modal toolbar|

## Development Commands

```bash
npm install
npm run dev        # concurrently: API :3001 (tsx, tanpa watch) + Vite :5173 (proxy /api → :3001)
npm run build      # vite build → client/dist
npm start          # production: Express serve API + client/dist di :3001
npm run typecheck  # tsc --noEmit untuk project server DAN client
```

Konfigurasi: salin `.env.example` → `.env` (gitignored). Variabel: `PORT`
(default `3001`, bind `127.0.0.1` saja), `XAUUSD_SYMBOL` (default
`OANDA:XAUUSD`), `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`/`PGDATABASE`,
`NODE_ENV=production` mengaktifkan serve `client/dist`.

## Code Conventions & Common Patterns

- **Module system**: ESM (`"type": "module"`). Import relatif di `server/`, `shared/`,
  `mcp-bridge/` memakai akhiran `.js` merujuk file `.ts` (konvensi tsc/tsx):
  `import { callTool } from './mcp.js'`. Import lintas batas ke `shared/` di client
  tanpa ekstensi: `import type { Candle } from '../../../shared/types'`.
- **Type-only imports**: selalu `import type { … }` untuk tipe; jangan inline
  `import("pkg").Type` di anotasi.
- **Shared contract**: semua tipe domain (`Candle`, `Quote`, `TfSnapshot`,
  `TradePlan`, `TradeRecord`, `Analysis`, `NewsEvent`, …) hidup di `shared/types.ts` — jangan
  menduplikasi di client/server.
- **Pure core**: `shared/indicators.ts` dan `server/analysis/{structure,patterns,signal}.ts`
  bebas I/O — inilah test seam utama. Semua I/O (MCP, fetch) terkonsentrasi di
  `server/mcp.ts`, `server/index.ts`, `mcp-bridge/`.
- **Caching**: `server/mcp.ts` — `Map` cache TTL per tool (`get_quote` 3 dtk,
  `get_ohlcv` 10 dtk, TA 1 menit, kalender 5 menit); cache hanya dedupe — kesegaran
  diatur lapisan stream. Cache analisis di `server/index.ts` maksimal 20 dtk
  (single-flight), dihitung ulang lebih awal bila harga bergeser ≥ 0.2×ATR H1
  (interval minimum 8 dtk).
- **Trade history**: `server/trades.ts` — sinyal BUY/SELL otomatis jadi
  `TradeRecord` (persist **PostgreSQL**, `pg` Pool, `DATABASE_URL` env dengan
  default `postgresql://postgres:postgres@127.0.0.1:5432/tradingvapp`);
  `resolveTrade` murni = test seam utama riwayat. Status:
  `WAITING` (order limit/stop, entry belum tersentuh) → `RUNNING` (entry
  terisi) → `TP_HIT`/`SL_HIT`; `action.kind === 'MARKET'` langsung `RUNNING`.
  Order yang entry-nya tak tersentuh dalam `WAITING_TTL_SEC` (1 jam) jadi
  `EXPIRED` — tanpa itu limit menggantung memblokir semua sinyal searah
  selamanya. Cek expiry berjalan sebelum guard harga, jadi feed mati pun
  tetap mengedaluwarsakan order. Sinyal searah yang masih `WAITING`/`RUNNING`
  memblokir record baru. Harga wire tidak sah (≤ 0 / `NaN`, mis. `lp` absen)
  WAJIB diabaikan — jangan pernah menutup trade dengan harga busuk
  (regresi nyata: TP_HIT palsu).
- **Error handling**: handler tool bridge membungkus hasil dengan `errorResult`
  (`isError: true`, JSON `{error}`); `callTool` melempar `Error` bila `isError`/`error`
  ada; Express memakai error middleware → `500 {error}`; hooks client menyimpan
  pesan error di state dan menampilkan banner + tombol retry.
- **Async**: `Promise.all`/`Promise.allSettled` untuk fetch paralel (feed ForexFactory
  toleran per-URL gagal via `allSettled`); tool bridge bersifat `async` dan selalu
  menangkap exception menjadi hasil error, tidak crash proses.
- **State management**: hooks sederhana di `client/src/lib/api.ts`, tanpa Redux/
  React Query; SSE `/api/stream` untuk quote (per tick dari stream bridge),
  analisis, dan daftar trade realtime; polling untuk candles/berita/health
  (dan fallback snapshot `/api/trades`).
- **Naming**: file komponen PascalCase (`SignalPanel.tsx`), modul logika camelCase
  (`forexfactory.ts`), konstanta domain UPPER_SNAKE (`TF_WEIGHT`, `CALENDAR_CURRENCIES`),
  tipe domain PascalCase. `TF` = `'M5'|'M15'|'H1'|'H4'|'D1'`; interval bridge memakai
  gaya TradingView (`5m`, `15m`, `1h`, `4h`, `1D`). Tipe bentuk data kawat yang belum
  terpetakan diberi awalan `Raw` (`RawBar`, `RawQuote`, `RawEvent`) lalu dipetakan
  ke tipe domain `shared/types.ts`.
- **Logging**: `console.error` dengan prefix `[api]`/`[mcp]` — **stdout direserve
  untuk protokol MCP stdio**, jangan `console.log` di server/bridge.
- **UI/teks**: string user-facing berbahasa Indonesia (alasan, peringatan, label);
  harga diformat 2 desimal (`fmtPrice`), waktu WIB via `Intl.DateTimeFormat`
  dengan `timeZone: 'Asia/Jakarta'`.
- **Prinsip produk**: setiap keputusan WAJIB disertai daftar `reasons` dan
  `warnings` yang bisa dibaca manusia — jangan menghasilkan verdict tanpa
  penjelasan (lihat `computeAnalysis`).
- **Angka & keuangan**: kontrak XAUUSD diasumsikan 100 oz/lot (`OZ_PER_LOT` di
  `RiskCalculator.tsx`); harga dibulatkan `round2` untuk level entry/SL/TP.

## Important Files

- `server/index.ts` — entry REST API; route `/api/health`, `/api/quote`,
  `/api/candles`, `/api/analysis`, `/api/news`, `/api/trades`, serta SSE
  `/api/stream` (push `quote` tiap tick, `analysis` saat berubah, `trades`
  saat status trade berubah; ticker berhenti saat tak ada subscriber);
  serve `client/dist` saat produksi. Trade dicatat otomatis di
  `computeAnalysisFull`; SL/TP diresolusi di tiap tick quote.
- `server/mcp.ts` — MCP client singleton (spawn bridge via
  `StdioClientTransport`, `node --import tsx mcp-bridge/index.ts`) + cache TTL;
  `onQuotePush`/`startQuoteStream` — listener notifikasi `notifications/quote`
  dari bridge (stream harga per tick).
- `server/analysis/signal.ts` — `computeAnalysis()`: keputusan entry, ambang skor
  (≥3 → BUY/SELL, =2 → trade kecil, <2 → WAIT), `confidence = 50 + 6.5×skor`
  (diklamp [10, 95]), gate berita (high-impact −5 mnt…+1 jam → verdict dipaksa WAIT).
  Tiap plan memuat `action` — instruksi order (Buy/Sell Limit/Stop, Market, Tunggu) +
  keterangan eksekusi bahasa Indonesia (`describeAction`, override HOLD saat verdict WAIT).
- `mcp-bridge/index.ts` — registrasi 6 tool MCP (`subscribe_quote` = stream
  quote via `watchQuotes` → notifikasi `notifications/quote`); konversi interval
  → timeframe `@mathieuc/tradingview` (`INTERVAL_MAP`). **Semua panggilan WS
  WAJIB lewat `getTvClient()`** (client bersama) — tanpa itu tiap call buka
  koneksi sendiri dan kena rate-limit 429.
- `shared/indicators.ts` — SMA/EMA/RSI/MACD/ATR/Bollinger murni (null-padded).
- `server/trades.ts` — riwayat trading: `recordSignal`, `resolveTrade` (murni),
  `resolveTrades`, `listTrades`; **semua async** (persist PostgreSQL).
- **DB**: tabel `trades` (kolom snake_case: `created_at`/`closed_at` BIGINT detik,
  `filled` BOOLEAN, `exit_price`, `setup_type`, `action`/`reasons` = JSON string)
  + index `trades_status_dir`; skema dibuat sekali per proses (`ensureSchema`).
  `resolveTrade` tetap murni sehingga self-check jalan tanpa DB.
- **Env**: `.env` di root repo (gitignored, template `.env.example`) dibaca oleh
  `server/env.ts` (`process.loadEnvFile`) yang WAJIB di-import pertama di
  `server/index.ts` — modul lain membaca `process.env` saat load. Koneksi DB
  memakai variabel standar `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`/`PGDATABASE`.
- `server/trades.test.ts` — self-check assert (`npx tsx server/trades.test.ts`)
  untuk `resolveTrade`: fill limit, gap SL, mirror BUY/SELL, harga tidak sah.
- `client/src/components/Chart.tsx` — lightweight-charts v5
  (`addSeries(CandlestickSeries)`, `createSeriesMarkers`, price line ENTRY/SL/TP).
- `vite.config.ts` — root `client/`, plugin react + tailwindcss, proxy `/api`.
- `client/src/index.css` — token tema Tailwind v4 (`@theme`: `ink-*`, `gold`, `up`,
  `down`, `warn`; font heading `Poppins`, body `IBM Plex Sans`, angka `IBM Plex Mono`).

## Runtime & Tooling Preferences

- **Node.js ≥ 20** (dikembangkan di Node 25), **npm** sebagai package manager
  (tidak ada bun/pnpm lockfile — jangan tukar manager).
- TypeScript dieksekusi via **tsx** (`tsx` di dev; `node --import tsx` untuk
  spawn bridge) — tidak perlu build step terpisah untuk server/bridge.
  **Jangan pakai `tsx watch` di `dev:api`**: di-spawn lewat `concurrently`,
  prosesnya menggantung tanpa pernah listen (direproduksi & diverifikasi);
  perubahan server butuh restart manual `npm run dev`.
- `tsc` dipakai hanya untuk typecheck (`--noEmit`), bukan kompilasi.
- Windows-friendly: spawn bridge memakai `process.execPath` (node), bukan `npx`.
- Dependensi runtime inti: `express`, `@modelcontextprotocol/sdk` (1.x, pasangan
  `zod` 3.x), `@mathieuc/tradingview`, `pg` (pool Postgres), `react` 18,
  `lightweight-charts` 5.
- Data candle memakai endpoint internal TradingView yang **tidak resmi** —
  antisipasi perubahan API; semua aksesnya terisolasi di `mcp-bridge/`.

## Testing & QA

- **Belum ada test framework** (tidak ada vitest/jest/playwright maupun script
  `npm test`) — ini kesenjangan yang diketahui. Saat menambahkan, `vitest` adalah
  pilihan wajar (Vite 6 sudah ada); targetkan dulu modul murni:
  `shared/indicators.ts`, `server/analysis/structure.ts`,
  `server/analysis/patterns.ts`, `server/analysis/signal.ts`, serta
  `enrichEvent`/`assessNewsRisk` di `server/news/enrich.ts` (keduanya murni).
- Catatan test seam: `computeAnalysis` membaca `Date.now()` sekali di awal
  (`generatedAt`) — pakai fake timer atau injeksi `nowSec` bila determinisme
  penuh dibutuhkan; `RawEvent` di `enrich.ts` belum diekspor (uji via structural
  typing atau ekspor dulu).
- QA yang ada saat ini: `npm run typecheck` (wajib hijau sebelum selesai),
  self-check `npx tsx server/trades.test.ts` (wajib hijau), smoke manual via
  curl `/api/analysis` + `/api/trades` dan verifikasi UI di browser.
- Smoke test pola yang terbukti: `callTool` dari `server/mcp.ts` dalam skrip
  `tsx` sementara, cek bentuk respons tool bridge, lalu hapus skripnya.

## Data-Source Caveats

- `OANDA:XAUUSD` adalah simbol TradingView default; ganti via env `XAUUSD_SYMBOL`.
- Feed ForexFactory: `ff_calendar_thisweek.json` + `ff_calendar_nextweek.json`;
  file `nextweek` kadang 404 — fetch sudah toleran (`Promise.allSettled`), jangan
  "perbaiki" dengan menggagalkan seluruh kalender.
- Rating TradingView (`get_technical_analysis`) bentuknya `{ tf: { All, MA, Other } }`
  dengan `All` berupa angka [-2..2]; `extractRating` di `server/index.ts` sudah
  toleran terhadap variasi bentuk.
- TradingView membatasi laju koneksi WS — pakai `TradingViewClient` bersama
  (`getTvClient()` di `mcp-bridge/`); koneksi per-panggilan → error `429`
  (`Unexpected server response: 429`).
- Quote stream kadang mengirim tanpa `lp` (awal langganan / market tutup) →
  fallback `toQuote` memakai `rtc`; `resolveTrade` mengabaikan harga ≤ 0/`NaN`.
