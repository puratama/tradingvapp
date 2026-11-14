import type { Analysis, NewsEvent, Quote, TF } from '../../shared/types';
import { TIMEFRAMES } from '../../shared/types';
import { useAnalysis, useCandles, useHealth, useNews, useNow, useQuote, useTrades } from './lib/api';
import { countdown, fmtDateWib, fmtPrice, fmtTimeWib } from './lib/format';
import Chart from './components/Chart';
import Modal from './components/Modal';
import SignalPanel from './components/SignalPanel';
import MtfTable from './components/MtfTable';
import RiskCalculator from './components/RiskCalculator';
import NewsPanel from './components/NewsPanel';
import DecisionModal from './components/DecisionModal';
import TradeHistory, { TradeDetail } from './components/TradeHistory';
import { useState } from 'react';

type DetailKind = 'signal' | 'mtf' | 'structure' | 'risk' | 'news' | null;
type SideTab = 'signal' | 'history';

const BTN =
  'rounded px-2.5 py-1 text-xs tracking-wider transition-colors text-mute hover:bg-ink-800 hover:text-fg';

/** Compact header strip: symbol, price, quote stats, clock. */
function Header({ analysis, quote }: { analysis: Analysis | null; quote: Quote | null }) {
  const now = useNow();
  const nextEvent = analysis?.newsRisk.nextHighImpact ?? null;
  const up = (quote?.change ?? 0) >= 0;

  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line bg-ink-950/90 px-4 py-2 backdrop-blur">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-lg leading-none tracking-wide text-fg">
          XAUUSD <span className="text-mute">/</span> <span className="text-gold-soft">GOLD</span>
        </span>
        <span className="text-[10px] tracking-[0.35em] text-gold/80">DECISION DESK</span>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="num text-2xl font-semibold text-fg">{fmtPrice(quote?.last)}</span>
        <span className={`num text-sm ${up ? 'text-up' : 'text-down'}`}>
          {up ? '▲' : '▼'} {quote ? `${quote.change.toFixed(2)} (${quote.changePct.toFixed(2)}%)` : '—'}
        </span>
      </div>

      <dl className="flex gap-x-5 gap-y-1 text-[11px]">
        <div>
          <dt className="text-mute">BID / ASK</dt>
          <dd className="num text-fg/80">
            {quote?.bid !== null && quote ? `${fmtPrice(quote.bid)} / ${fmtPrice(quote.ask)}` : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-mute">HIGH / LOW</dt>
          <dd className="num text-fg/80">
            {quote ? `${fmtPrice(quote.dayHigh)} / ${fmtPrice(quote.dayLow)}` : '—'}
          </dd>
        </div>
        {nextEvent && (
          <div>
            <dt className="text-warn">NEWS BERIKUTNYA</dt>
            <dd className="num text-fg/80">
              {countdown(nextEvent.timestamp, now)} · {nextEvent.title} ({nextEvent.currency})
            </dd>
          </div>
        )}
      </dl>

      <div className="ml-auto text-right text-[11px]">
        <div className="num text-fg">{fmtTimeWib(now)} WIB</div>
        <div className="text-mute">{fmtDateWib(now)}</div>
      </div>
    </header>
  );
}

/** Bottom status bar: health, analysis freshness, legend shortcuts. */
function StatusBar({ analysis, healthOk }: { analysis: Analysis | null; healthOk: boolean }) {
  return (
    <footer className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line bg-ink-950/90 px-4 py-1.5 text-[10px] text-mute backdrop-blur">
      <span className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${healthOk ? 'bg-up' : 'bg-down'}`} />
        {healthOk ? 'Data feed aktif' : 'Feed tidak aktif'}
      </span>
      {analysis && (
        <span>
          Analisis {fmtTimeWib(analysis.generatedAt)} WIB · {analysis.plan.verdict} · konfluensi{' '}
          {analysis.plan.confidence}%
        </span>
      )}
      <span className="ml-auto">Edukasi — keputusan trading sepenuhnya tanggung jawab Anda.</span>
    </footer>
  );
}

/** Body for each detail modal; panel components render their own card chrome. */
function DetailContent({ kind, analysis, events }: { kind: Exclude<DetailKind, null>; analysis: Analysis; events: NewsEvent[] }) {
  switch (kind) {
    case 'signal':
      return <SignalPanel analysis={analysis} />;
    case 'mtf':
      return <MtfTable mtf={analysis.mtf} />;
    case 'structure':
      return (
        <div className="space-y-4">
          <div>
            <h3 className="text-[10px] tracking-[0.18em] text-mute">LEVEL DI SEKITAR HARGA</h3>
            <ul className="mt-2 space-y-1">
              {analysis.levels.length === 0 && (
                <li className="text-xs text-mute">Tidak ada level signifikan dalam radius 3× ATR.</li>
              )}
              {analysis.levels.map((lv) => (
                <li
                  key={`${lv.kind}-${lv.price}`}
                  className="flex items-center justify-between rounded border border-line-soft bg-ink-850/50 px-2 py-1 text-xs"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${lv.price < (analysis.quote?.last ?? 0) ? 'bg-up' : 'bg-down'}`}
                    />
                    <span className="text-fg/80">{lv.label}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-[10px] text-mute">{'★'.repeat(lv.strength)}</span>
                    <span className="num text-fg">{fmtPrice(lv.price)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-[10px] tracking-[0.18em] text-mute">POLA TERDETEKSI</h3>
            <ul className="mt-2 space-y-1.5">
              {analysis.patterns.length === 0 && (
                <li className="text-xs text-mute">Tidak ada pola signifikan pada 3 candle terakhir.</li>
              )}
              {analysis.patterns.map((p) => (
                <li key={`${p.tf}-${p.name}-${p.time}`} className="rounded border border-line-soft bg-ink-850/50 px-2 py-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className={p.direction === 'bull' ? 'text-up' : p.direction === 'bear' ? 'text-down' : 'text-fg/80'}>
                      {p.name}
                    </span>
                    <span className="rounded border border-line px-1.5 text-[10px] text-mute">{p.tf}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-mute">{p.note}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      );
    case 'risk':
      return <RiskCalculator plan={analysis.plan} />;
    case 'news':
      return <NewsPanel events={events} />;
  }
}

const DETAIL_TITLE: Record<Exclude<DetailKind, null>, { title: string; subtitle: string; size: string }> = {
  signal: { title: 'SINYAL ENTRY', subtitle: 'Keputusan entry, level, dan alasan konfluensi', size: 'max-w-2xl' },
  mtf: { title: 'KONDISI MULTI-TIMEFRAME', subtitle: 'Snapshot tren, momentum, dan volatilitas per TF', size: 'max-w-2xl' },
  structure: { title: 'LEVEL KUNCI & POLA CANDLE', subtitle: 'Support/resistance sekitar harga dan pola terdeteksi', size: 'max-w-2xl' },
  risk: { title: 'KALKULATOR RISIKO', subtitle: 'Ukuran posisi berdasarkan modal dan jarak SL', size: 'max-w-lg' },
  news: { title: 'KALENDER EKONOMI', subtitle: 'Event berdampak ke emas dalam 7 hari ke depan', size: 'max-w-2xl' },
};

export default function App() {
  const [tf, setTf] = useState<TF>('H1');
  const [sideTab, setSideTab] = useState<SideTab>('signal');
  const [detail, setDetail] = useState<DetailKind>(null);
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const [showDecision, setShowDecision] = useState(false);
  const analysisQuery = useAnalysis();
  const quoteQuery = useQuote();
  const candlesQuery = useCandles(tf);
  const newsQuery = useNews();
  const tradesQuery = useTrades();
  const healthQuery = useHealth();

  const analysis = analysisQuery.data;
  const quote = quoteQuery.data ?? analysis?.quote ?? null;
  const events = newsQuery.data?.events ?? [];
  const trades = tradesQuery.data ?? [];
  // Derived (not stored) so the open modal keeps up with live status changes.
  const selectedTrade = trades.find((t) => t.id === selectedTradeId) ?? null;
  const healthOk = healthQuery.data?.ok ?? true;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header analysis={analysis} quote={quote} />

      {/* Toolbar: timeframe + detail shortcuts (TradingView-style). */}
      <div className="flex flex-wrap items-center gap-1 border-b border-line bg-ink-900/60 px-4 py-1.5">
        <div className="flex gap-1">
          {TIMEFRAMES.map((t) => (
            <button
              key={t}
              onClick={() => setTf(t)}
              className={`rounded px-2.5 py-1 text-xs tracking-wider transition-colors ${
                tf === t ? 'bg-gold/20 text-gold-soft' : 'text-mute hover:bg-ink-800 hover:text-fg'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="mx-3 h-4 w-px bg-line" />

        <div className="flex flex-wrap gap-1">
          <button onClick={() => setDetail('mtf')} className={BTN}>Multi-TF</button>
          <button onClick={() => setDetail('structure')} className={BTN}>Level &amp; Pola</button>
          <button onClick={() => setDetail('risk')} className={BTN}>Risiko</button>
          <button onClick={() => setDetail('news')} className={BTN}>Berita</button>
          <button onClick={() => setShowDecision(true)} className={BTN}>Cara Kerja</button>
        </div>

        {analysisQuery.error && (
          <div className="ml-auto flex items-center gap-2 text-xs text-warn">
            <span>Gagal memuat analisis: {analysisQuery.error}</span>
            <button onClick={analysisQuery.refresh} className="rounded border border-warn/50 px-2 py-0.5 hover:bg-warn/20">
              Coba lagi
            </button>
          </div>
        )}
      </div>

      {/* Chart + fixed-width side panel (signal / history) always visible. */}
      <div className="flex min-h-0 flex-1">
        <main className="relative min-h-0 flex-1">
          {analysis && (
            <div className="absolute inset-0">
              <Chart
                candles={candlesQuery.data?.bars ?? []}
                tf={tf}
                dataTf={candlesQuery.data?.tf ?? null}
                plan={analysis.plan}
                patterns={analysis.patterns}
                livePrice={quote?.last ?? null}
                full
              />
            </div>
          )}

          {!analysis && analysisQuery.loading && (
            <div className="flex h-full items-center justify-center">
              <div className="rounded-lg border border-line bg-ink-900/60 px-10 py-8 text-center">
                <div className="font-display text-lg tracking-[0.25em] text-gold-soft">MENYIAPKAN ANALISIS...</div>
                <p className="mt-2 text-xs text-mute">Mengambil candle multi-timeframe, berita, dan menyusun konfluensi.</p>
              </div>
            </div>
          )}

          {healthQuery.data && !healthQuery.data.ok && (
            <div className="absolute left-4 top-4 rounded border border-down/40 bg-down/10 px-3 py-1.5 text-xs text-down">
              Koneksi data market (MCP bridge) tidak aktif — harga dan analisis mungkin kedaluwarsa.
            </div>
          )}
        </main>

        <aside className="flex w-1/5 min-w-72 max-w-md flex-col border-l border-line bg-ink-950/60">
          <div className="flex shrink-0 gap-1 border-b border-line px-2 py-1.5">
            {(['signal', 'history'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setSideTab(tab)}
                className={`flex-1 rounded px-2 py-1 text-[11px] tracking-wider transition-colors ${
                  sideTab === tab ? 'bg-gold/20 text-gold-soft' : 'text-mute hover:bg-ink-800 hover:text-fg'
                }`}
              >
                {tab === 'signal' ? 'SINYAL' : 'RIWAYAT'}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {!analysis && <p className="py-6 text-center text-xs text-mute">Menunggu analisis...</p>}
            {analysis && sideTab === 'signal' && (
              <SignalPanel analysis={analysis} compact onDetail={() => setDetail('signal')} />
            )}
            {sideTab === 'history' && (
              <TradeHistory trades={trades} onSelect={(t) => setSelectedTradeId(t.id)} />
            )}
          </div>
        </aside>
      </div>

      <StatusBar analysis={analysis} healthOk={healthOk} />

      {analysis && detail && (
        <Modal
          open
          onClose={() => setDetail(null)}
          title={DETAIL_TITLE[detail].title}
          subtitle={DETAIL_TITLE[detail].subtitle}
          size={DETAIL_TITLE[detail].size}
        >
          <DetailContent kind={detail} analysis={analysis} events={events} />
        </Modal>
      )}

      {selectedTrade && (
        <Modal
          open
          onClose={() => setSelectedTradeId(null)}
          title={`${selectedTrade.direction} · ${selectedTrade.action.label}`}
          subtitle={`${fmtDateWib(selectedTrade.createdAt)} · ${fmtTimeWib(selectedTrade.createdAt)} WIB`}
          size="max-w-lg"
        >
          <TradeDetail trade={selectedTrade} />
        </Modal>
      )}

      <DecisionModal open={showDecision} onClose={() => setShowDecision(false)} />
    </div>
  );
}
