import type { BacktestReport, ReportRow, ReportWarning, TradeRecord } from './run.js';
/** Unix seconds -> ISO 8601 UTC without milliseconds. */
export declare const isoTime: (seconds: number) => string;
/**
 * Trades as CSV. Times are bar open times (ISO, UTC); prices include slippage. Each signal
 * `refs` name becomes a `<name>_time` column, placed before `signal_time`. A `series` column
 * comes first when trades carry one (`backtestMany`).
 */
export declare function tradesToCsv(trades: readonly TradeRecord[]): string;
/** Compact side-by-side table: one row per exit and split. */
export declare function formatTable(rows: readonly ReportRow[]): string;
/** One warning as an English sentence. */
export declare function formatWarning(w: ReportWarning): string;
/** The whole report as plain text: data, split, signals, costs, results, definitions, warnings. */
export declare function formatReport(report: BacktestReport): string;
