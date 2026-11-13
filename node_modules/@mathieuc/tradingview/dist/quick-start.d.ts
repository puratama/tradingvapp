import { type SpawnSyncOptions, type SpawnSyncReturns } from 'node:child_process';
export declare const LANDING_URL = "https://molted.studio/dreams/ai-agent-for-tradingview-data?utm_source=github&utm_medium=cli&utm_campaign=tradingview-api";
export declare const PACKAGE_SPEC = "@mathieuc/tradingview";
export declare const AGENT_PROMPT = "Help me build a project using TradingView-API V4 (@mathieuc/tradingview).\nFirst ask what I want to build and inspect the current project and its instructions before making changes.\nRead https://github.com/Mathieu2301/TradingView-API/blob/main/llms.txt and the data API guide at https://github.com/Mathieu2301/TradingView-API/blob/main/docs/data-api.md; use the docs shipped with the installed package as the version-specific reference.\nUse Node.js 20+ and install @mathieuc/tradingview with the project's package manager. V4 is the default release; use the migration guide before upgrading a V3 project.\nPreserve existing files and project configuration. For a new project, start with a small runnable ESM (.mjs) example using getCandles from '@mathieuc/tradingview/data' and anonymous BINANCE:BTCUSDT data, then adapt it to my goal.\nUse timeouts, handle errors, and stop watchers or close clients on shutdown. Run the example and report observed results honestly, with exact commands to run it again.\nOnly request TradingView credentials if my feature needs them; keep them in local environment variables, out of source control and logs. Explain any account or market-data limitations relevant to my goal.\nThis is an independent community library, not an official TradingView API. Do not assume it provides broker order execution.";
export declare const HELP = "TradingView-API quick-start (Node.js 20+)\n\nUsage: npx @mathieuc/tradingview [--choice 1|2|3|4|5]\n\n1. Autonomous agent (recommended)\n2. Claude Code CLI\n3. Codex CLI\n4. Another local coding agent\n5. Install the library only\n\nRun inside your project directory. Options 2 and 3 require an installed,\nauthenticated CLI and keep its normal permission prompts. Option 5 runs\nnpm install @mathieuc/tradingview in the current directory.\nUse --choice for non-interactive selection; --help shows this message.\n";
type Runner = (command: string, args: string[], options: SpawnSyncOptions) => Pick<SpawnSyncReturns<Buffer>, 'status' | 'signal' | 'error'>;
interface Runtime {
    run?: Runner;
    log?: (text: string) => void;
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
}
export declare function runChoice(choice: string, overrides?: Runtime): number;
export declare function main(args?: string[]): Promise<number>;
export {};
