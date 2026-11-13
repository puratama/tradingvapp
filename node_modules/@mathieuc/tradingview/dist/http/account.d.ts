import { type Credentials, type HttpOptions } from './request.js';
/** A TradingView account. */
export interface User {
    id: number;
    username: string;
    firstName: string;
    lastName: string;
    reputation: number;
    following: number;
    followers: number;
    notifications: {
        user: number;
        following: number;
    };
    /** `sessionid` cookie. Keep it secret. */
    session: string;
    /** `sessionid_sign` cookie. Keep it secret. */
    signature: string;
    sessionHash: string;
    privateChannel: string;
    /** Websocket auth token. Keep it secret. */
    authToken: string;
    joinDate: Date;
}
export interface LoginOptions extends HttpOptions {
    username: string;
    password: string;
    /** Keep the session alive longer. Default: true. */
    remember?: boolean;
    /** Custom user agent prefix. */
    userAgent?: string;
}
/**
 * Signs in with a username/email and password and returns the account with
 * its session cookies. Accounts with 2FA or captcha challenges are not supported.
 */
export declare function loginUser(options: LoginOptions): Promise<User>;
export interface GetUserOptions extends HttpOptions {
    /** Page used to read the account, for example `https://fr.tradingview.com/`. */
    location?: string;
    /** Maximum number of redirects to follow. Default: 5. */
    maxRedirects?: number;
}
/** Parses the account embedded in a TradingView HTML page. */
export declare function parseUserPage(page: string, credentials: Credentials): User;
/** Loads the account behind `sessionid` (and `sessionid_sign`) cookies. */
export declare function getUser(credentials: Credentials, options?: GetUserOptions): Promise<User>;
