import { platform, arch, release } from 'node:os';
import { TradingViewError } from '../errors.js';
import { getSetCookies, request, } from './request.js';
/**
 * Signs in with a username/email and password and returns the account with
 * its session cookies. Accounts with 2FA or captcha challenges are not supported.
 */
export async function loginUser(options) {
    const remember = options.remember ?? true;
    const userAgent = options.userAgent ?? 'TWAPI/4.0';
    const { data, headers } = await request('https://www.tradingview.com/accounts/signin/', {
        method: 'POST',
        form: { username: options.username, password: options.password, remember: remember ? 'on' : undefined },
        headers: {
            referer: 'https://www.tradingview.com',
            'user-agent': `${userAgent} (${release()}; ${platform()}; ${arch()})`,
        },
    }, options);
    if (!data || typeof data !== 'object') {
        throw new TradingViewError('AUTH_ERROR', 'Unexpected sign-in response');
    }
    if (data.error)
        throw new TradingViewError('AUTH_ERROR', String(data.error), { details: data });
    if (!data.user)
        throw new TradingViewError('AUTH_ERROR', 'Sign-in response has no user', { details: data });
    return userFromLogin(data.user, headers);
}
function cookieValue(headers, name) {
    for (const line of getSetCookies(headers)) {
        const found = new RegExp(`(?:^|[;\\s])${name}=([^;]*)`).exec(line);
        if (found)
            return found[1];
    }
    return '';
}
function textOrEmpty(value) {
    return String(value ?? '');
}
function numberOrZero(value) {
    return Number(value ?? 0);
}
function userFromLogin(user, headers) {
    return {
        id: numberOrZero(user.id),
        username: user.username,
        firstName: textOrEmpty(user.first_name),
        lastName: textOrEmpty(user.last_name),
        reputation: numberOrZero(user.reputation),
        following: numberOrZero(user.following),
        followers: numberOrZero(user.followers),
        notifications: {
            user: numberOrZero(user.notification_count?.user),
            following: numberOrZero(user.notification_count?.following),
        },
        session: cookieValue(headers, 'sessionid'),
        signature: cookieValue(headers, 'sessionid_sign'),
        sessionHash: textOrEmpty(user.session_hash),
        privateChannel: textOrEmpty(user.private_channel),
        authToken: textOrEmpty(user.auth_token),
        joinDate: new Date(user.date_joined),
    };
}
function match(page, pattern) {
    return pattern.exec(page)?.[1];
}
function pageNumber(page, pattern) {
    return parseFloat(match(page, pattern) ?? '0') || 0;
}
function pageText(page, pattern) {
    return match(page, pattern) ?? '';
}
function trustedAccountLocation(location) {
    let url;
    try {
        url = new URL(location);
    }
    catch {
        throw new TradingViewError('AUTH_ERROR', 'Invalid account page URL');
    }
    if (url.protocol !== 'https:' || !/(^|\.)tradingview\.com$/i.test(url.hostname)) {
        throw new TradingViewError('AUTH_ERROR', 'Account page redirects outside TradingView');
    }
    return url.toString();
}
/** Parses the account embedded in a TradingView HTML page. */
export function parseUserPage(page, credentials) {
    return {
        id: pageNumber(page, /"id":([0-9]{1,10}),/),
        username: pageText(page, /"username":"(.*?)"/),
        firstName: pageText(page, /"first_name":"(.*?)"/),
        lastName: pageText(page, /"last_name":"(.*?)"/),
        reputation: pageNumber(page, /"reputation":(.*?),/),
        following: pageNumber(page, /,"following":([0-9]*?),/),
        followers: pageNumber(page, /,"followers":([0-9]*?),/),
        notifications: {
            following: pageNumber(page, /"notification_count":\{"following":([0-9]*),/),
            user: pageNumber(page, /"notification_count":\{"following":[0-9]*,"user":([0-9]*)/),
        },
        session: credentials.session,
        signature: credentials.signature ?? '',
        sessionHash: pageText(page, /"session_hash":"(.*?)"/),
        privateChannel: pageText(page, /"private_channel":"(.*?)"/),
        authToken: pageText(page, /"auth_token":"(.*?)"/),
        joinDate: new Date(pageText(page, /"date_joined":"(.*?)"/) || 0),
    };
}
/** Loads the account behind `sessionid` (and `sessionid_sign`) cookies. */
export async function getUser(credentials, options = {}) {
    if (!credentials?.session)
        throw new TradingViewError('INVALID_ARGUMENT', 'A session cookie is required');
    const maxRedirects = options.maxRedirects ?? 5;
    let location = trustedAccountLocation(options.location ?? 'https://www.tradingview.com/chart/');
    for (let redirects = 0;; redirects += 1) {
        const { status, text, headers } = await request(location, { credentials, redirect: 'manual' }, options);
        if (status >= 200 && status < 300 && text.includes('auth_token')) {
            const user = parseUserPage(text, credentials);
            if (user.authToken)
                return user;
        }
        const next = headers.get('location');
        const resolved = status >= 300 && status < 400 && next ? new URL(next, location).toString() : undefined;
        if (!resolved || resolved === location) {
            throw new TradingViewError('AUTH_ERROR', 'Wrong or expired sessionid/signature');
        }
        if (redirects >= maxRedirects) {
            throw new TradingViewError('AUTH_ERROR', 'Too many redirects (possible WAF or geo-restriction)');
        }
        location = trustedAccountLocation(resolved);
    }
}
