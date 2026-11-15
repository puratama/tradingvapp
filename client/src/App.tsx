import type { Analysis, Quote, TF } from '../../shared/types';
import { TIMEFRAMES } from '../../shared/types';
import { useAnalysis, useCandles, useHealth, useNews, useNow, useQuote, useTrades } from './lib/api';
import { countdown, fmtDateWib, fmtPrice, fmtTimeWib } from './lib/format';
import Chart from './components/Chart';
import Modal from './components/Modal';
import SignalPanel from './components/SignalPanel';
import RiskCalculator from './components/RiskCalculator';
import NewsPanel from './components/NewsPanel';
import DecisionModal from './components/DecisionModal';
import TradeHistory, { TradeDetail } from './components/TradeHistory';
import { LevelLadder, TfReadings } from './components/MarketReadings';
import { useState } from 'react';
import {
  BarChart3,
  CalendarDays,
  ChartCandlestick,
  History,
  Info,
  Layers,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import AppShell, { PageHeader, type NavGroup } from './ui/AppShell';
import Button, { Segmented } from './ui/Button';
import { Chip, Dot } from './ui/Chip';
import { NUM } from './ui/styles';

type DetailKind = 'signal' | 'risk' | 'news' | null;
type View = 'chart' | 'research' | 'history';

const NAV: NavGroup<View>[] = [
  {
    label: 'Analisis',
    items: [
      { id: 'chart', label: 'Chart & Sinyal', icon: ChartCandlestick },
      { id: 'research', label: 'Level & Indikator', icon: Layers },
      { id: 'history', label: 'Riwayat Trade', icon: History },
    ],
  },
];

const DETAIL_TITLE: Record<Exclude<DetailKind, null>, { title: string; subtitle: string; size: string }> = {
  signal: { title: 'Sinyal entry', subtitle: 'Keputusan entry, level, dan alasan konfluensi', size: 'max-w-2xl' },
  risk: { title: 'Kalkulator risiko', subtitle: 'Ukuran posisi berdasarkan modal dan jarak SL', size: 'max-w-lg' },
  news: { title: 'Kalender ekonomi', subtitle: 'Event berdampak ke emas dalam 7 hari ke depan', size: 'max-w-2xl' },
};

/** Topbar: identity, live price, clock. Everything else lives in the page. */
function Topbar({ quote, healthOk }: { quote: Quote | null; healthOk: boolean }) {
  const now = useNow();
  const up = (quote?.change ?? 0) >= 0;

  return (
    <>
      <div className="flex shrink-0 items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-white" aria-hidden>
          <BarChart3 size={16} strokeWidth={1.75} />
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-fg">XAUUSD</span>
          <span className="hidden text-2xs font-medium uppercase tracking-wide text-muted sm:block">Decision Desk</span>
        </span>
      </div>

      <div className="mx-4 flex items-baseline gap-2">
        <span className={`${NUM} text-xl font-semibold text-fg`}>{fmtPrice(quote?.last)}</span>
        <span className={`${NUM} flex items-center gap-0.5 text-xs font-medium ${up ? 'text-bull' : 'text-bear'}`}>
          {up ? <TrendingUp size={14} strokeWidth={2} aria-hidden /> : <TrendingDown size={14} strokeWidth={2} aria-hidden />}
          {quote ? `${quote.change.toFixed(2)} (${quote.changePct.toFixed(2)}%)` : '—'}
        </span>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-3">
        <span className="hidden items-center gap-1.5 text-2xs text-muted md:flex">
          <Dot tone={healthOk ? 'bull' : 'bear'} pulse={healthOk} />
          {healthOk ? 'Data aktif' : 'Feed terputus'}
        </span>
        <div className="text-right text-2xs">
          <div className={`${NUM} text-xs font-medium text-fg`}>{fmtTimeWib(now)} WIB</div>
          <div className="hidden text-muted sm:block">{fmtDateWib(now)}</div>
        </div>
      </div>
    </>
  );
}

/**
 * Market strip: one line, facts only. Volume is the summed volume of the
 * loaded bars for the selected timeframe.
 */
function MarketStrip({
  analysis,
  quote,
  bars,
  tf,
}: {
  analysis: Analysis | null;
  quote: Quote | null;
  bars: { volume: number }[];
  tf: TF;
}) {
  const trend = analysis?.mtf.find((m) => m.tf === tf) ?? null;
  const volume = bars.length > 0 ? bars.reduce((s, b) => s + b.volume, 0) : null;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 border-b border-line bg-surface px-4 py-1.5 text-2xs">
      <div className="flex items-center gap-1.5">
        <span className="font-medium uppercase tracking-wide text-muted">{tf}</span>
        {trend && (
          <>
            <Chip tone={trend.trend === 'UP' ? 'bull' : trend.trend === 'DOWN' ? 'bear' : 'neutral'}>
              {trend.trend === 'UP' ? 'Naik' : trend.trend === 'DOWN' ? 'Turun' : 'Range'}
            </Chip>
            <span className={`${NUM} ${trend.trendScore > 0 ? 'text-bull' : trend.trendScore < 0 ? 'text-bear' : 'text-muted'}`}>
              {trend.trendScore >= 0 ? '+' : ''}
              {trend.trendScore.toFixed(2)}
            </span>
          </>
        )}
      </div>

      {quote && quote.dayLow !== null && quote.dayHigh !== null && quote.dayHigh > quote.dayLow && (
        <span className="flex items-center gap-1.5">
          <span className="font-medium uppercase tracking-wide text-muted">Hari</span>
          <span className={`${NUM} text-fg/80`}>{fmtPrice(quote.dayLow)}</span>
          <span className="relative h-1 w-12 overflow-hidden rounded-full bg-surface-3" aria-hidden>
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-accent"
              style={{
                width: `${quote.last === null ? 0 : Math.min(100, Math.max(0, ((quote.last - quote.dayLow) / (quote.dayHigh - quote.dayLow)) * 100))}%`,
              }}
            />
          </span>
          <span className={`${NUM} text-fg/80`}>{fmtPrice(quote.dayHigh)}</span>
        </span>
      )}

      {volume !== null && (
        <span className="hidden sm:flex sm:gap-1.5">
          <span className="font-medium uppercase tracking-wide text-muted">Volume</span>
          <span className={`${NUM} text-fg/80`}>{volume.toLocaleString('id-ID')}</span>
        </span>
      )}

      {analysis && (
        <span className="ml-auto flex items-center gap-1.5">
          <span className="font-medium uppercase tracking-wide text-muted">Konfluensi</span>
          <span className={`${NUM} text-fg/80`}>{analysis.plan.confidence}%</span>
          <span className="text-faint">·</span>
          <span className="text-fg/70">{analysis.newsRisk.level === 'high' ? 'news high-impact' : analysis.newsRisk.level === 'caution' ? 'waspada news' : 'jendela aman'}</span>
        </span>
      )}
    </div>
  );
}

export default function App() {
  const [tf, setTf] = useState<TF>('H1');
  const [view, setView] = useState<View>('chart');
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
  const bars = candlesQuery.data?.bars ?? [];
  const selectedTrade = trades.find((t) => t.id === selectedTradeId) ?? null;
  const healthOk = healthQuery.data?.ok ?? true;

  const nav: NavGroup<View>[] = NAV.map((g) => ({
    ...g,
    items: g.items.map((it) =>
      it.id === 'history' && trades.length > 0 ? { ...it, badge: trades.length } : it,
    ),
  }));

  const pageActions =
    view === 'chart' ? (
      <>
        <Segmented options={TIMEFRAMES.map((t) => ({ id: t, label: t }))} value={tf} onChange={setTf} ariaLabel="Timeframe chart" />
        <div className="h-4 w-px shrink-0 bg-line" aria-hidden />
        <Button size="sm" icon={ShieldCheck} onClick={() => setDetail('risk')}>
          Risiko
        </Button>
        <Button size="sm" icon={CalendarDays} onClick={() => setDetail('news')}>
          Berita
        </Button>
        <Button size="sm" icon={Info} label="Cara kerja" onClick={() => setShowDecision(true)} />
      </>
    ) : undefined;

  return (
    <AppShell
      topbar={<Topbar quote={quote} healthOk={healthOk} />}
      groups={nav}
      active={view}
      onNavigate={setView}
      ariaLabel="Navigasi utama"
    >
      <PageHeader
        title={view === 'chart' ? 'Chart & Sinyal' : view === 'research' ? 'Level & Indikator' : 'Riwayat Trade'}
        subtitle={
          view === 'chart'
            ? `${tf} · ${analysis ? `${analysis.plan.verdict} ${analysis.plan.confidence}%` : 'memuat'}`
            : view === 'research'
              ? 'Level kunci, indikator per TF, pola'
              : `${trades.length} sinyal tercatat`
        }
        actions={
          <>
            {analysisQuery.error && (
              <span className="flex items-center gap-2 text-xs text-warn">
                <span className="max-w-[220px] truncate">Gagal memuat analisis</span>
                <Button size="sm" variant="outline" onClick={analysisQuery.refresh}>
                  Coba lagi
                </Button>
              </span>
            )}
            {pageActions}
          </>
        }
      />

      {view === 'chart' && (
        <>
          <MarketStrip analysis={analysis} quote={quote} bars={bars} tf={tf} />
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <main className="relative min-h-0 flex-1">
              {analysis && (
                <div className="absolute inset-0">
                  <Chart
                    candles={bars}
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
                  <p className="text-xs text-muted">Menyiapkan analisis...</p>
                </div>
              )}

              {healthQuery.data && !healthQuery.data.ok && (
                <div className="absolute left-4 top-12 rounded-md border border-bear/20 bg-bear-soft px-3 py-1.5 text-xs text-bear">
                  Koneksi data market (MCP bridge) tidak aktif — harga dan analisis mungkin kedaluwarsa.
                </div>
              )}
            </main>

            {/* The chart absorbs RSI/MACD as in-chart bands, so the decision
                panel stays put whichever indicators are on. */}
            <aside className="h-[42vh] min-h-[240px] shrink-0 overflow-y-auto border-t border-line bg-surface p-3 lg:h-auto lg:min-h-0 lg:w-[320px] lg:border-l lg:border-t-0 xl:w-[var(--spacing-panel)]">
              {analysis ? (
                <SignalPanel analysis={analysis} compact onDetail={() => setDetail('signal')} />
              ) : (
                <p className="py-6 text-center text-xs text-muted">Menunggu analisis...</p>
              )}
            </aside>
          </div>
        </>
      )}

      {view === 'research' && (
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto grid w-full max-w-5xl gap-6 p-4 lg:grid-cols-2">
            {analysis ? (
              <>
                <LevelLadder levels={analysis.levels} quote={quote} plan={analysis.plan} />
                <TfReadings mtf={analysis.mtf} activeTf={tf} />
                <div className="lg:col-span-2">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Pola pada {tf}</h3>
                  <ul className="mt-2 space-y-1">
                    {analysis.patterns.filter((p) => p.tf === tf).length === 0 && (
                      <li className="text-xs text-muted">Tidak ada pola terdeteksi pada timeframe ini.</li>
                    )}
                    {analysis.patterns
                      .filter((p) => p.tf === tf)
                      .map((p) => (
                        <li key={`${p.tf}-${p.name}-${p.time}`} className="rounded-md border border-line px-2.5 py-1.5 text-xs">
                          <span
                            className={
                              p.direction === 'bull' ? 'font-medium text-bull' : p.direction === 'bear' ? 'font-medium text-bear' : 'text-fg/80'
                            }
                          >
                            {p.name}
                          </span>
                          <p className="mt-0.5 text-muted">{p.note}</p>
                        </li>
                      ))}
                  </ul>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted">Menunggu analisis...</p>
            )}
          </div>
        </main>
      )}

      {view === 'history' && (
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl p-4">
            <TradeHistory trades={trades} onSelect={(t) => setSelectedTradeId(t.id)} />
          </div>
        </main>
      )}

      {analysis && detail && (
        <Modal
          open
          onClose={() => setDetail(null)}
          title={DETAIL_TITLE[detail].title}
          subtitle={DETAIL_TITLE[detail].subtitle}
          size={DETAIL_TITLE[detail].size}
        >
          {detail === 'signal' && <SignalPanel analysis={analysis} />}
          {detail === 'risk' && <RiskCalculator plan={analysis.plan} />}
          {detail === 'news' && <NewsPanel events={events} />}
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
    </AppShell>
  );
}
