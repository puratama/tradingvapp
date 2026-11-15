import Modal from './Modal';

const RULES = [
  {
    no: '1',
    title: 'Bias multi-timeframe',
    body: 'Snapshot tren per TF (EMA20/50/200, RSI14, MACD, ATR14, struktur swing) dihitung dari candle. Skor tren per TF dibobot D1:H4:H1:M15:M5 = 3:3:2:1:1, lalu dirata-rata menjadi satu angka bias. Ambang ±0.25 menentukan arah kandidat: BUY, SELL, atau netral (WAIT).',
  },
  {
    no: '2',
    title: 'Skor konfluensi',
    body: 'Tujuh faktor dinilai +1 poin bila sejajar, −1 bila berlawanan: keselarasan tren H4/H1, konteks D1, momentum RSI + histogram MACD H1, kualitas pullback vs EMA20 H1, pola candle pemicu, rating teknikal TradingView, dan level struktur terdekat.',
  },
  {
    no: '3',
    title: 'Ambang verdict',
    body: 'Skor ≥ 3 → verdict BUY/SELL. Skor = 2 → verdict tetap BUY/SELL tapi dengan peringatan risiko lebih kecil. Skor < 2 → verdict WAIT, setup tidak cukup konfirmasi. Confidence = 50 + 6.5 × skor, diklamp [10, 95].',
  },
  {
    no: '4',
    title: 'Level entry/SL/TP berbasis ATR',
    body: 'Jenis setup ditentukan posisi harga vs swing 30 bar H1: breakout (entry di harga pasar), pullback (limit di EMA20 H1), atau pantulan langsung. SL di swing extreme, dibatasi 0.8–2.6× ATR H1. TP1 = 1.5× risiko, TP2 = 2.5× risiko.',
  },
  {
    no: '5',
    title: 'Gate berita',
    body: 'Rilis high-impact dalam ±1 jam memaksa verdict menjadi WAIT dan menurunkan setupType ke "TERTUNDA". Di luar jendela itu level risiko naik ke "caution" dengan saran memperkecil ukuran posisi.',
  },
];

const ANSWERS = [
  {
    q: 'Apakah keputusan entry memerlukan model AI?',
    a: 'Tidak. Seluruh pipeline adalah aturan deterministik — indikator teknikal klasik, bobot skor tetap, dan ambang keputusan eksplisit di server/analysis/signal.ts. Hasil yang sama untuk data yang sama; tidak ada pembelajaran mesin, model bahasa, atau inferensi statistik yang dilatih.',
  },
  {
    q: 'Lalu mengapa hasilnya bisa berubah tiap tick?',
    a: 'Karena input-nya berubah: candle terakhir masih berjalan, quote live memperbarui harga, dan jendela berita bergeser. Mesinnya tetap sama, hanya datanya yang hidup.',
  },
  {
    q: 'Bisa ditambahkan AI?',
    a: 'Bisa, tapi perlu dipisahkan jelas dari aturan saat ini. Machine learning paling masuk akal untuk memperkirakan probabilitas setup atau menyaring false signal, bukan untuk menggantikan aturan risiko. Saat ini tidak ada komponen AI dalam kode.',
  },
];

export default function DecisionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cara kerja keputusan entry"
      subtitle="Mesin analisis konfluensi multi-timeframe — deterministik, bukan AI"
      size="max-w-2xl"
    >
      <ol className="space-y-3">
        {RULES.map((r) => (
          <li key={r.no} className="flex gap-3">
            <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-2xs font-semibold text-accent">
              {r.no}
            </span>
            <div>
              <h4 className="text-xs font-semibold text-fg">{r.title}</h4>
              <p className="mt-1 text-xs leading-relaxed text-muted">{r.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <h3 className="mt-6 border-t border-line pt-4 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
        Tentang AI
      </h3>
      <div className="mt-3 space-y-3">
        {ANSWERS.map((qa) => (
          <div key={qa.q}>
            <h4 className="text-xs font-semibold text-fg">{qa.q}</h4>
            <p className="mt-1 text-xs leading-relaxed text-muted">{qa.a}</p>
          </div>
        ))}
      </div>
    </Modal>
  );
}
