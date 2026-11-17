# Repository Guidelines

## Project Overview

**XAUUSD Decision Desk** — web app pendukung keputusan entry trading emas:
satu chart candle (candle + EMA + volume + RSI/MACD), mesin konfluensi
multi-timeframe yang mengeluarkan rencana entry/SL/TP berbasis ATR, kalkulator
ukuran posisi, riwayat trade otomatis, dan kalender ekonomi dengan analisis
dampak ke emas.

Dua gaya entry dari satu mesin: `swing` (stop dari ATR H1) dan `scalp` (stop
dari ATR M5). UI berbahasa Indonesia, design system sendiri (light mode saja),
waktu tampil WIB (`Asia/Jakarta`).

## Architecture & Data Flow

```
client/    React 18 + Vite + Tailwind v4 + lightweight-charts v5
   │  fetch /api/*        + EventSource /api/stream
server/    Express (tsx, tanpa build step)
   │  MCP JSON-RPC over stdio (+ notifikasi quote)
mcp-bridge/ MCP server "tradingview-lite" (child process)
   ├── @mathieuc/tradingview  → candle / quote / rating
   └── ForexFactory JSON      → kalender ekonomi
```

Aliran: `client/src/lib/api.ts` → `server/index.ts` (REST + SSE) →
`server/mcp.ts` (`callTool`, cache TTL, listener notifikasi) →
`mcp-bridge/index.ts` → sumber data.

Push SSE `/api/stream`: `quote` (per tick, dedupe `last/bid/ask`), `analysis`
(saat berubah), `trades` (saat status berubah). Heartbeat `: hb` tiap 5 tick
(`QUOTE_TICK_MS = 3000`). Ticker berhenti saat subscriber habis; snapshot
quote+analysis dikirim saat klien connect.

Mesin (`server/analysis/signal.ts` → `computeAnalysis`):

1. Snapshot per TF: EMA20/50/200, RSI14, MACD hist, ATR14, struktur swing.
2. Bias = rata-rata berbobot `trendScore`.
   - `swing`: D1:H4:H1:M15:M5 = 3:3:2:1:1, basis ATR **H1**
   - `scalp`: D1:H4:H1:M15:M5:M1 = 1:1:2:2:3:1, basis ATR **M5**
   - `|bias| < 0.25` → tidak ada arah → `WAIT`
3. Skor konfluensi (maks ~8 poin): keselarasan H4+H1 (±2/±1), konteks D1,
   RSI H1, slope MACD H1, jarak ke EMA20 H1, pola candle, rating TradingView,
   level struktur terdekat.
   - `≥3` → arah; `==2` → arah + peringatan; `<3` → `WAIT`
   - `confidence = clamp(round(50 + 6.5×skor), 10, 95)`
4. Gate berita: event High-impact memaksa `WAIT` + `action.kind = 'HOLD'`
   (jendela `swing` 3600 s, `scalp` 900 s).

## Key Directories

|Path|Purpose|
|---|---|
|`shared/`|`types.ts` (seluruh kontrak domain) + `indicators.ts` (SMA/EMA/RSI/MACD/ATR/Bollinger murni, null-padded). Dikompilasi oleh kedua project TS.
|`server/`|`index.ts` (Express + SSE + cache analisis), `env.ts` (loader `.env`), `mcp.ts` (MCP client + TTL + quote push), `trades.ts` (riwayat + Prisma), `*.test.ts` (self-check)
|`server/analysis/`|`structure.ts` (swing/trend/level), `patterns.ts` (pola candle), `signal.ts` (engine + `GRIDS` + `planPrices`)
|`server/news/`|`enrich.ts` — mapping event → dampak XAUUSD, `fetchCalendar`, `assessNewsRisk`
|`mcp-bridge/`|`index.ts` (6 tool MCP, `getTvClient`, `INTERVAL_MAP`), `forexfactory.ts` (feed kalender, `allSettled`)
|`client/src/lib/`|`api.ts` (hooks SSE/polling), `format.ts` (WIB, angka, countdown)
|`client/src/components/`|`Chart`, `SignalPanel`, `MarketReadings`, `RiskCalculator`, `NewsPanel`, `TradeHistory`, `Modal`, `DecisionModal`
|`client/src/ui/`|Design system: `AppShell`, `Button`/`Segmented`, `Chip`/`Dot`/`Stat`, `Icon` (Lucide), `styles.ts` (`NUM`, `FOCUS`, `buttonClass`)
|`client/src/index.css`|Satu-satunya sumber token Tailwind v4 (`@theme`)
|`prisma/`|`schema.prisma` (model `Trade`); client digenerate ke `prisma/generated` (gitignored)

## Development Commands

```bash
npm install
npx prisma generate   # WAJIB: client digenerate ke prisma/generated (gitignored)
cp .env.example .env  # PORT, HOST, XAUUSD_SYMBOL, ENTRY_STYLE, DATABASE_URL

npm run dev           # concurrently: API :3001 (tsx) + Vite :5173 (proxy /api)
npm run build         # vite build → client/dist (server tidak dikompilasi)
npm start             # produksi: NODE_ENV=production, serve API + client/dist
npm run typecheck     # tsc --noEmit: project server DAN client
```

Cek mandiri (tidak ada `npm test`):

```bash
npx tsx server/trades.test.ts
npx tsx server/analysis/signal.test.ts
```

Smoke: `curl localhost:3001/api/analysis`, `.../api/analysis?style=scalp`,
`.../api/trades`. Skema DB: `npx prisma db push` (config: `prisma7.config.ts`
yang me-load `.env`); tidak ada direktori migrasi.

## Code Conventions & Common Patterns

- **ESM** (`"type": "module"`). Import relatif di `server/`, `shared/`,
  `mcp-bridge/` memakai akhiran `.js` merujuk file `.ts`:
  `import { callTool } from './mcp.js'`. Di client tanpa ekstensi:
  `import type { Candle } from '../../../shared/types'`.
- **`import type`** untuk semua tipe; jangan inline `import("pkg").Type`.
- **Kontrak tunggal**: tipe domain hanya di `shared/types.ts`. `shared/` harus
  bebas `node:` dan DOM (dikompilasi dua project dengan `lib`/`types` berbeda).
- **Pure core**: `shared/indicators.ts`, `server/analysis/{structure,patterns,signal}.ts`,
  `resolveTrade` di `trades.ts`, `enrichEvent`/`assessNewsRisk` — inilah test seam.
  Semua I/O di `server/index.ts`, `server/mcp.ts`, `server/trades.ts`, `mcp-bridge/`.
- **Naming**: komponen PascalCase (`SignalPanel.tsx`), modul camelCase
  (`forexfactory.ts`), konstanta domain UPPER_SNAKE (`GRIDS`, `TF_WEIGHT`,
  `CALENDAR_CURRENCIES`, `WAITING_TTL_SEC`, `OZ_PER_LOT`). Bentuk data kawat
  mentah diberi awalan `Raw` (`RawBar`, `RawQuote`, `RawEvent`).
- **Varian per gaya**: perilaku yang berbeda antara swing dan scalp dikumpulkan
  di tabel (`GRIDS`, `WAITING_TTL_SEC`, `SCALP_WEIGHT`), bukan `if` tersebar.
  Gaya diturunkan dari `TradePlan.basisTf` (`styleOf`), tidak disimpan terpisah.
- **Caching**: `server/mcp.ts` — `Map` berisi *Promise* (dedupe in-flight).
  TTL: `get_quote` 3 s, `get_ohlcv` 10 s (**2 s** bila interval `Nm`),
  TA 60 s, kalender 300 s, default 30 s. Cache hanya dedupe — kesegaran diatur
  lapisan stream.
- **Cache analisis**: per gaya, single-flight (`analysisInFlight` Map), maks 20 s;
  dihitung ulang lebih awal bila harga bergeser ≥ `max(0.2×ATR[basisTf], 0.25)`
  (usia minimum 8 s).
- **Error handling**: bridge membungkus kegagalan jadi `errorResult`
  (`isError: true`, JSON `{error}`); `callTool` melempar `Error`; Express error
  middleware → `500 {error}`; hooks client menyimpan pesan dan menampilkan
  banner + tombol retry. Feed eksternal yang mati **tidak boleh** mematikan
  analisis: `fetchCalendar` mengembalikan `[]` + `console.error`.
- **Async**: `Promise.all` untuk fetch paralel yang wajib sukses,
  `Promise.allSettled` untuk feed yang boleh gagal per-URL.
- **Logging**: hanya `console.error` dengan prefix `[api]`/`[mcp]`/`[news]`.
  **stdout direserve protokol MCP stdio — jangan `console.log` di server/bridge.**
- **State client**: hook biasa di `client/src/lib/api.ts`, tanpa Redux/React Query.
  `usePoll(url, 0)` = pause (tanpa fetch & timer); `useStream(..., enabled)`
  = unsubscribe. Hanya satu sumber analisis aktif per waktu.
- **UI/teks**: semua string user-facing bahasa Indonesia. Harga 2 desimal
  (`fmtPrice`, `round2`), waktu WIB lewat `Intl.DateTimeFormat`.
- **Design system**: token di `client/src/index.css` (`@theme`) —
  `canvas/surface/surface-2/3`, `fg/muted/faint/line/line-strong`,
  `accent(-soft/-strong)`, `bull/bear/neutral/warn/info` (+`-soft`), `chart-*`.
  Tipografi Inter + JetBrains Mono; ukuran terkecil `text-2xs` (11px).
  Jangan menambah warna ad-hoc; resep kelas baru masuk `ui/styles.ts`.
- **Komponen**: pakai `ui/` — jangan tulis ulang `Button`/`Segmented`/`Chip`.
  Icon hanya `lucide-react` lewat `ui/Icon` (stroke 1.75).
- **Aksesibilitas**: toggle wajib `aria-pressed`/`aria-current`, fokus pakai
  `FOCUS` (ring `accent/40`), ikon dekoratif `aria-hidden`.
- **Angka finansial**: selalu `NUM` (`tabular-nums`), rata kanan di tabel,
  positif `text-bull`, negatif `text-bear`.
- **Prinsip produk**: setiap verdict wajib disertai `reasons` dan `warnings`
  yang bisa dibaca manusia — jangan pernah menghasilkan keputusan tanpa alasan.
- **Kontrak XAUUSD**: 100 oz/lot (`OZ_PER_LOT`); risiko per ounce =
  `stopDistance + spread`.

## Important Files

- `server/index.ts` — entry API. Route `/api/health|quote|candles|analysis|news|trades`
  + SSE `/api/stream`. `?style=scalp` menghitung gaya scalp tanpa mengubah env;
  SSE selalu memakai `ENTRY_STYLE`. `import './env.js'` **wajib baris pertama**.
- `server/env.ts` — `process.loadEnvFile('.env')`, toleran `ENOENT`.
- `server/mcp.ts` — MCP client singleton, spawn bridge lewat
  `process.execPath --import tsx` (Windows-safe, bukan `npx`); `callTool`,
  `onQuotePush`, `startQuoteStream`, `mcpHealth`.
- `server/analysis/signal.ts` — `GRIDS`, `planPrices` (murni, diekspor untuk
  self-check), `computeAnalysis`, `describeAction`, `quoteSpread`.
- `server/trades.ts` — status `WAITING → RUNNING → TP_HIT|SL_HIT`, `EXPIRED`
  lewat TTL per gaya (swing 3600 s, scalp 600 s; expiry dicek **sebelum** cek
  harga sehingga feed mati tetap mengedaluwarsakan). TP diuji sebelum SL.
  Sinyal searah + segaya yang masih terbuka memblokir record baru; gaya lain
  independen. Harga ≤ 0/`NaN` diabaikan (regresi nyata: TP_HIT palsu).
- `server/analysis/signal.test.ts` — self-check `planPrices` vs `GRIDS`.
- `server/trades.test.ts` — self-check `resolveTrade`.
- `mcp-bridge/index.ts` — 6 tool MCP; `INTERVAL_MAP` interval TradingView →
  timeframe. **Semua panggilan WS wajib via `getTvClient()`** (client bersama),
  selain itu tiap call membuka koneksi sendiri → `429`.
- `client/src/components/Chart.tsx` — lightweight-charts v5, **satu chart**.
  Indikator memakai price scale overlay tersembunyi
  (`priceScaleId: 'volume'|'rsi'|'macd'`, `scaleMargins` bertumpuk dari bawah).
  Jangan pisahkan RSI/MACD ke chart kedua (rentang cacat balik menyempitkan
  candle), jangan bongkar container secara kondisional (chart dibuat sekali
  dalam effect mount), dan **jangan `fitContent()` di setiap update data**:
  viewport disimpan/dipulihkan via logical range, refit hanya ketika `dataTf`
  berubah (TF milik dataset, bukan TF terpilih). Data live di-`series.update()`
  per tick, bukan `setData`.
- `client/src/components/SignalPanel.tsx` — hierarki tetap: verdict → aksi →
  tangga level (TP2/TP1/Entry/harga/SL) → RR + `basisTf` + spread → gate news
  → alasan. `compact` menukar daftar alasan dengan tombol modal.
- `client/src/components/TradeHistory.tsx` — label status + teks TTL yang
  **harus** menyalin `WAITING_TTL_SEC` (scalp "10 menit", swing "1 jam").
- `prisma/schema.prisma` — model `Trade` → tabel `trades` (snake_case,
  `created_at`/`closed_at` BIGINT detik, `action`/`reasons` JSON string,
  `basis_tf` default `"H1"`), index `trades_status_dir`.
- `prisma7.config.ts` — config CLI Prisma: me-load `.env`, set
  `datasource.url = process.env.DATABASE_URL`.

## Runtime & Tooling Preferences

- **Node.js ≥ 20** (dikembangkan di Node 25). **npm** satu-satunya package
  manager (`package-lock.json`) — jangan tukar ke bun/pnpm.
- TypeScript dijalankan via **tsx** (`tsx` di dev dan produksi). Tidak ada build
  step untuk server/bridge; `npm run build` hanya membangun client.
  **Jangan pakai `tsx watch` di `dev:api`** — di bawah `concurrently` prosesnya
  menggantung tanpa listen; restart manual setelah mengubah server.
- `tsc` hanya untuk typecheck (`--noEmit`), dipisah per project
  (`tsconfig.json` server/bridge/shared, `client/tsconfig.json`).
- `npx prisma generate` wajib setelah mengubah `schema.prisma` atau di clone
  baru; artefak di `prisma/generated` tidak di-commit.
- Dependensi inti: `express`, `@modelcontextprotocol/sdk` (1.x + `zod` 3.x),
  `@mathieuc/tradingview`, `@prisma/client` 7 + `@prisma/adapter-pg`, `react` 18,
  `lightweight-charts` 5, `lucide-react`, `tailwindcss` 4.
- Env (`server/env.ts`): `PORT` (3001), `HOST` (127.0.0.1), `XAUUSD_SYMBOL`
  (`OANDA:XAUUSD`), `ENTRY_STYLE` (`swing`|`scalp`), `DATABASE_URL`,
  `NODE_ENV=production` mengaktifkan serve `client/dist`.
- Docker: `Dockerfile` multi-stage (`prisma generate && npm run build`, lalu
  runtime `npx tsx server/index.ts`); `docker-compose.yml` memakai Postgres
  host + Traefik, service `db-setup` menjalankan `prisma db push`.

## Testing & QA

- **Tidak ada test framework** (tanpa vitest/jest/playwright, tanpa `npm test`).
  QA = dua self-check assert (`node:assert/strict`, gaya `assert.equal`,
  tanpa `describe/it`) + typecheck + smoke manual.
- Self-check hidup di `server/trades.test.ts` (resolveTrade: fill limit, gap SL,
  mirror BUY/SELL, harga tak sah, TTL per gaya) dan
  `server/analysis/signal.test.ts` (grid scalp vs swing: band ATR, RR, arah).
  Keduanya dijalankan terpisah: `npx tsx <file>` — masing-masing proses exit
  sendiri. Sukses mencetak satu baris (trades → stderr, signal → stdout).
- Wajib hijau sebelum selesai: `npx prisma generate` → `npm run typecheck` →
  kedua self-check. Typecheck gagal di clone baru tanpa generate.
- Test seam murni yang belum diuji tapi siap: `shared/indicators.ts`,
  `server/analysis/structure.ts`, `server/analysis/patterns.ts`,
  `enrichEvent`/`assessNewsRisk`. `computeAnalysis` membaca `Date.now()` sekali
  (`nowSec`) — suntikkan waktu bila butuh determinisme; `RawEvent` belum
  diekspor.
- **Verifikasi UI wajib di browser** untuk perubahan yang menyentuh UI: cek
  console error, ukur `getBoundingClientRect()` (chart, panel, rail) di
  1440×900, 1024×768, 390×844, dan pastikan
  `document.documentElement.scrollWidth <= innerWidth`. Toggle tiap kontrol
  (EMA/Vol/RSI/MACD, Swing/Scalp, rail hover & pin) dan pastikan ukuran chart
  tidak berubah.
- Smoke API: `curl /api/analysis`, `/api/analysis?style=scalp`, `/api/trades`;
  probe ad-hoc lewat skrip `tsx` sementara yang memanggil `callTool` — hapus
  setelah dipakai.

## Data-Source Caveats

- `OANDA:XAUUSD` default; ganti lewat `XAUUSD_SYMBOL`. Candle berasal dari
  endpoint internal TradingView yang **tidak resmi** — perubahan API mungkin.
- TradingView membatasi laju koneksi WS: selalu pakai `getTvClient()`; koneksi
  per-panggilan → `Unexpected server response: 429`.
- Feed kalender: `ff_calendar_thisweek.json` + `ff_calendar_nextweek.json`;
  `nextweek` sering 404 dan feed bisa 429. Fetch toleran per-URL
  (`allSettled`), dan kegagalan total hanya menghasilkan daftar kosong —
  jangan "perbaiki" dengan menggagalkan analisis.
- Rating `get_technical_analysis` berbentuk `{ tf: { All, MA, Other } }`
  dengan `All` ∈ [-2..2]; `extractRating` sudah toleran variasi bentuk.
- Quote push kadang tanpa `lp` (awal langganan / market tutup) → `toQuote`
  jatuh ke `rtc`; `resolveTrade` mengabaikan harga ≤ 0/`NaN`.
