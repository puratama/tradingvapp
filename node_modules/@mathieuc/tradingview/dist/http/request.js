import { TradingViewError, toTradingViewError } from '../errors.js';
export const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
/** Builds the `cookie` header value for credentials. */
export function authCookies(credentials) {
    if (!credentials?.session)
        return '';
    if (!credentials.signature)
        return `sessionid=${credentials.session}`;
    return `sessionid=${credentials.session};sessionid_sign=${credentials.signature}`;
}
function requestUrl(url, query) {
    const target = new URL(url);
    for (const [key, value] of Object.entries(query ?? {})) {
        if (value !== undefined && value !== null)
            target.searchParams.set(key, String(value));
    }
    return target;
}
function requestBody(init, headers) {
    if (init.form) {
        const form = new URLSearchParams();
        for (const [key, value] of Object.entries(init.form)) {
            if (value !== undefined && value !== null)
                form.set(key, String(value));
        }
        headers['content-type'] = 'application/x-www-form-urlencoded';
        return form.toString();
    }
    if (init.json !== undefined) {
        headers['content-type'] = 'application/json';
        return JSON.stringify(init.json);
    }
    return undefined;
}
function responseData(text) {
    try {
        return text ? JSON.parse(text) : undefined;
    }
    catch {
        return undefined;
    }
}
/** Performs a request. Like the historical client, 5xx statuses throw. */
export async function request(url, init, options = {}) {
    const target = requestUrl(url, init.query);
    const headers = { ...options.headers, ...init.headers };
    const cookie = authCookies(init.credentials);
    if (cookie)
        headers.cookie = cookie;
    const body = requestBody(init, headers);
    const fetchImpl = options.fetch ?? globalThis.fetch;
    let response;
    let text;
    try {
        response = await fetchImpl(target.toString(), {
            method: init.method ?? (body === undefined ? 'GET' : 'POST'),
            headers,
            body,
            redirect: init.redirect ?? 'follow',
            signal: options.signal,
        });
        text = await response.text();
    }
    catch (error) {
        throw toTradingViewError(error, 'HTTP_ERROR');
    }
    if (response.status >= 500) {
        throw new TradingViewError('HTTP_ERROR', `${target.host} answered HTTP ${response.status}`, {
            details: { status: response.status, body: text.slice(0, 500) },
        });
    }
    return {
        status: response.status, headers: response.headers, url: target.toString(), text, data: responseData(text),
    };
}
/** Reads every `set-cookie` header, across runtimes. */
export function getSetCookies(headers) {
    const withGetter = headers;
    if (typeof withGetter.getSetCookie === 'function')
        return withGetter.getSetCookie();
    const raw = headers.get('set-cookie');
    return raw ? raw.split(/,(?=\s*[^;,=\s]+=)/) : [];
}
