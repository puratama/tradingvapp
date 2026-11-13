/** Raw graphics as sent by TradingView, indexed by type then drawing ID. */
export type RawGraphics = Record<string, Record<string, any>>;
export type ExtendValue = 'right' | 'left' | 'both' | 'none';
export type YLocValue = 'price' | 'abovebar' | 'belowbar';
export type LabelStyleValue = 'none' | 'xcross' | 'cross' | 'triangleup' | 'triangledown' | 'flag' | 'circle' | 'arrowup' | 'arrowdown' | 'label_up' | 'label_down' | 'label_left' | 'label_right' | 'label_lower_left' | 'label_lower_right' | 'label_upper_left' | 'label_upper_right' | 'label_center' | 'square' | 'diamond';
export type LineStyleValue = 'solid' | 'dotted' | 'dashed' | 'arrow_left' | 'arrow_right' | 'arrow_both';
export type BoxStyleValue = 'solid' | 'dotted' | 'dashed';
export type SizeValue = 'auto' | 'huge' | 'large' | 'normal' | 'small' | 'tiny';
export type VAlignValue = 'top' | 'center' | 'bottom';
export type HAlignValue = 'left' | 'center' | 'right';
export type TextWrapValue = 'none' | 'auto';
export type TablePositionValue = 'top_left' | 'top_center' | 'top_right' | 'middle_left' | 'middle_center' | 'middle_right' | 'bottom_left' | 'bottom_center' | 'bottom_right';
/**
 * X positions are expressed in bars back from the most recent bar loaded on
 * the chart (0 = latest bar). They are `undefined` when the bar is not loaded.
 */
export interface GraphicLabel {
    id: number;
    x: number | undefined;
    y: number;
    yLoc: YLocValue;
    text: string;
    style: LabelStyleValue;
    color: number;
    textColor: number;
    size: SizeValue;
    textAlign: HAlignValue;
    toolTip: string;
}
export interface GraphicLine {
    id: number;
    x1: number | undefined;
    y1: number;
    x2: number | undefined;
    y2: number;
    extend: ExtendValue;
    style: LineStyleValue;
    color: number;
    width: number;
}
export interface GraphicBox {
    id: number;
    x1: number | undefined;
    y1: number;
    x2: number | undefined;
    y2: number;
    color: number;
    bgColor: number;
    extend: ExtendValue;
    style: BoxStyleValue;
    width: number;
    text: string;
    textSize: SizeValue;
    textColor: number;
    textVAlign: VAlignValue;
    textHAlign: HAlignValue;
    textWrap: TextWrapValue;
}
export interface TableCell {
    id: number;
    text: string;
    width: number;
    height: number;
    textColor: number;
    textHAlign: HAlignValue;
    textVAlign: VAlignValue;
    textSize: SizeValue;
    bgColor: number;
}
export interface GraphicTable {
    id: number;
    position: TablePositionValue;
    rows: number;
    columns: number;
    bgColor: number;
    frameColor: number;
    frameWidth: number;
    borderColor: number;
    borderWidth: number;
    /** Cells as a `[row][column]` matrix. */
    cells: TableCell[][];
}
export interface GraphicHorizLine {
    id: number;
    level: number;
    startIndex: number | undefined;
    endIndex: number | undefined;
    extendRight: boolean;
    extendLeft: boolean;
    [key: string]: unknown;
}
export interface GraphicPoint {
    index: number | undefined;
    level: number;
    [key: string]: unknown;
}
export interface GraphicPolygon {
    id: number;
    points: GraphicPoint[];
    [key: string]: unknown;
}
export interface GraphicHorizHist {
    id: number;
    priceLow: number;
    priceHigh: number;
    firstBarTime: number | undefined;
    lastBarTime: number | undefined;
    rate: number[];
    [key: string]: unknown;
}
/** Drawings produced by an indicator, grouped by type. */
export interface GraphicsData {
    labels: GraphicLabel[];
    lines: GraphicLine[];
    boxes: GraphicBox[];
    tables: GraphicTable[];
    polygons: GraphicPolygon[];
    horizLines: GraphicHorizLine[];
    horizHists: GraphicHorizHist[];
    /** Unparsed graphics, including types this parser does not know. */
    raw: RawGraphics;
}
/**
 * Converts raw indicator graphics into readable objects.
 * @param indexes Maps graphic X indexes to "bars back" positions.
 */
export declare function parseGraphics(raw?: RawGraphics, indexes?: ReadonlyArray<number | undefined>): GraphicsData;
/** Applies `graphicsCmds` (erase then create) to raw graphics in place. */
export declare function applyGraphicsCommands(graphics: RawGraphics, commands: any): void;
