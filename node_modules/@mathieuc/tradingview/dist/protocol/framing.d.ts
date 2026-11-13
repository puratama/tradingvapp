/**
 * TradingView websocket framing.
 *
 * Every websocket message contains one or more frames: `~m~<length>~m~<payload>`.
 * The length counts UTF-16 code units (JavaScript string length). Payloads are
 * either JSON packets or heartbeats (`~h~<id>`), which the client must echo.
 */
/** A JSON packet sent by the server: `m` is the method, `p` its parameters. */
export interface ServerPacket {
    m: string;
    p: unknown[];
    /** Server timestamp in seconds. */
    t?: number;
    /** Server timestamp in milliseconds. */
    t_ms?: number;
}
/** Greeting sent by the server right after the websocket opens. */
export interface ServerHello {
    session_id: string;
    timestamp: number;
    timestampMs: number;
    release: string;
    studies_metadata_hash: string;
    auth_scheme_vsn: number;
    protocol: 'json' | string;
    via: string;
    javastudies: string[];
    [key: string]: unknown;
}
export type Frame = 
/** Heartbeat to echo back with `encodeHeartbeat(id)`. */
{
    type: 'heartbeat';
    id: number;
}
/** Method packet (`{ m, p }`). */
 | {
    type: 'packet';
    packet: ServerPacket;
}
/** Any other JSON payload (for example the server greeting). */
 | {
    type: 'data';
    data: unknown;
}
/** A payload that could not be parsed. */
 | {
    type: 'invalid';
    raw: string;
    error: unknown;
};
/** Decodes a raw websocket message into frames. */
export declare function decodeFrames(input: string): Frame[];
/** Encodes one frame. Objects are JSON-encoded. */
export declare function encodeFrame(payload: string | object): string;
/** Encodes a client packet (`{ m: method, p: params }`). */
export declare function encodePacket(method: string, params?: readonly unknown[]): string;
/** Encodes the reply to a server heartbeat. */
export declare function encodeHeartbeat(id: number): string;
