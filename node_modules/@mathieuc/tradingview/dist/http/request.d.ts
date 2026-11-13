/** TradingView account cookies. Keep them secret. */
export interface Credentials {
    /** Value of the `sessionid` cookie. */
    session: string;
    /** Value of the `sessionid_sign` cookie. */
    signature?: string;
}
/** Options accepted by every HTTP function. */
export interface HttpOptions {
    /** Custom `fetch` implementation (tests, proxies). Defaults to the global `fetch`. */
    fetch?: typeof fetch;
    /** Cancels the request. */
    signal?: AbortSignal;
    /** Extra request headers. */
    headers?: Record<string, string>;
}
/** HTTP options for endpoints that can use an account. */
export interface AuthHttpOptions extends HttpOptions {
    credentials?: Credentials;
}
export declare const DEFAULT_USER_AGENT: string;
/** Builds the `cookie` header value for credentials. */
export declare function authCookies(credentials?: Credentials | null): string;
export interface RequestInit {
    method?: 'GET' | 'POST';
    query?: Record<string, string | number | boolean | undefined | null>;
    form?: Record<string, string | number | undefined | null>;
    json?: unknown;
    credentials?: Credentials | null;
    headers?: Record<string, string>;
    redirect?: 'follow' | 'manual';
}
export interface HttpResponse {
    status: number;
    headers: Headers;
    url: string;
    text: string;
    /** Parsed JSON body, or `undefined` when the body is not JSON. */
    data: any;
}
/** Performs a request. Like the historical client, 5xx statuses throw. */
export declare function request(url: string, init: RequestInit, options?: HttpOptions): Promise<HttpResponse>;
/** Reads every `set-cookie` header, across runtimes. */
export declare function getSetCookies(headers: Headers): string[];
