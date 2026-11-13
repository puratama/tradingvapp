/**
 * TradingView websocket framing.
 *
 * Every websocket message contains one or more frames: `~m~<length>~m~<payload>`.
 * The length counts UTF-16 code units (JavaScript string length). Payloads are
 * either JSON packets or heartbeats (`~h~<id>`), which the client must echo.
 */
const HEADER = '~m~';
const HEARTBEAT = '~h~';
function decodePayload(raw) {
    if (raw.startsWith(HEARTBEAT)) {
        const id = Number(raw.slice(HEARTBEAT.length));
        if (Number.isFinite(id))
            return { type: 'heartbeat', id };
        return { type: 'invalid', raw, error: new Error('Invalid heartbeat') };
    }
    let data;
    try {
        data = JSON.parse(raw);
    }
    catch (error) {
        return { type: 'invalid', raw, error };
    }
    if (data && typeof data === 'object' && typeof data.m === 'string') {
        const packet = data;
        return { type: 'packet', packet: { ...packet, p: Array.isArray(packet.p) ? packet.p : [] } };
    }
    return { type: 'data', data };
}
/** Lenient fallback for malformed input: split on frame headers. */
function splitFrames(input) {
    return input.split(/~m~\d+~m~/).filter((part) => part.length > 0);
}
/** Decodes a raw websocket message into frames. */
export function decodeFrames(input) {
    const payloads = [];
    let position = 0;
    while (position < input.length) {
        if (!input.startsWith(HEADER, position)) {
            payloads.push(...splitFrames(input.slice(position)));
            break;
        }
        const lengthStart = position + HEADER.length;
        const lengthEnd = input.indexOf(HEADER, lengthStart);
        const length = Number(input.slice(lengthStart, lengthEnd));
        if (lengthEnd < 0 || !Number.isInteger(length) || length < 0) {
            payloads.push(...splitFrames(input.slice(position)));
            break;
        }
        const start = lengthEnd + HEADER.length;
        payloads.push(input.slice(start, start + length));
        position = start + length;
    }
    return payloads.map(decodePayload);
}
/** Encodes one frame. Objects are JSON-encoded. */
export function encodeFrame(payload) {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return `${HEADER}${body.length}${HEADER}${body}`;
}
/** Encodes a client packet (`{ m: method, p: params }`). */
export function encodePacket(method, params = []) {
    return encodeFrame({ m: method, p: params });
}
/** Encodes the reply to a server heartbeat. */
export function encodeHeartbeat(id) {
    return encodeFrame(`${HEARTBEAT}${id}`);
}
