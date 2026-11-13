import { type AuthHttpOptions } from './request.js';
export interface LayoutOptions extends AuthHttpOptions {
    /** Account ID (`User.id`), required with credentials for private layouts. */
    userId?: number;
}
/** Gets a chart-storage token for a layout (the ID in `tradingview.com/chart/<ID>/`). */
export declare function getChartToken(layoutId: string, options?: LayoutOptions): Promise<string>;
export interface DrawingPoint {
    time_t: number;
    price: number;
    offset: number;
    [key: string]: unknown;
}
/** A user drawing stored in a layout. State properties are merged at the top level. */
export interface Drawing {
    id: string;
    symbol: string;
    ownerSource: string;
    serverUpdateTime: string;
    currencyId: string;
    unitId: unknown;
    type: string;
    points: DrawingPoint[];
    zorder: number;
    linkKey: string;
    state: Record<string, any>;
    [key: string]: unknown;
}
export interface GetDrawingsOptions extends LayoutOptions {
    /** Only returns drawings for this symbol. */
    symbol?: string;
    /** Chart ID inside the layout. Default: `_shared`. */
    chartId?: string;
}
/** Lists the drawings of a layout. */
export declare function getDrawings(layoutId: string, options?: GetDrawingsOptions): Promise<Drawing[]>;
