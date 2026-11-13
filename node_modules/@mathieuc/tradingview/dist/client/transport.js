import WebSocket from 'ws';
function toText(data) {
    if (typeof data === 'string')
        return data;
    if (Array.isArray(data))
        return Buffer.concat(data).toString('utf8');
    if (data instanceof ArrayBuffer)
        return Buffer.from(data).toString('utf8');
    return data.toString('utf8');
}
/** Creates a transport based on the `ws` package. */
export function createWsTransport(options = {}) {
    return wsTransportWith((url) => {
        const agent = typeof options.agent === 'function' ? options.agent(url) : options.agent;
        return agent ? { agent } : {};
    });
}
/** @internal */
export function wsTransportWith(extra) {
    // Extra `ws` client options; Bun's built-in `ws` also reads `proxy` and `tls`.
    return (request, handlers) => {
        // Bun's `ws` implementation ignores the `origin` option: also send it as a header.
        const socket = new WebSocket(request.url, {
            ...extra(request.url),
            origin: request.origin,
            headers: { Origin: request.origin, ...request.headers },
        });
        socket.on('open', () => handlers.onOpen());
        socket.on('message', (data) => handlers.onMessage(toText(data)));
        socket.on('close', (code, reason) => handlers.onClose(code, reason.toString()));
        socket.on('error', (error) => handlers.onError(error));
        return {
            get isOpen() {
                return socket.readyState === WebSocket.OPEN;
            },
            send(data) {
                socket.send(data);
            },
            close() {
                if (socket.readyState === WebSocket.CLOSED)
                    return;
                if (socket.readyState === WebSocket.CONNECTING)
                    socket.terminate();
                else
                    socket.close();
            },
            terminate() {
                if (socket.readyState !== WebSocket.CLOSED)
                    socket.terminate();
            },
        };
    };
}
/** Default transport based on the `ws` package. */
export const wsTransport = wsTransportWith(() => ({}));
