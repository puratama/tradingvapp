import { TradingViewError } from '../errors.js';
import { request } from './request.js';
/** Manages who can use an invite-only Pine script you own. */
export class PinePermissionManager {
    pineId;
    #credentials;
    #options;
    constructor(pineId, options) {
        if (!pineId)
            throw new TradingViewError('INVALID_ARGUMENT', 'A Pine ID is required');
        if (!options?.credentials?.session)
            throw new TradingViewError('INVALID_ARGUMENT', 'A session cookie is required');
        if (!options.credentials.signature)
            throw new TradingViewError('INVALID_ARGUMENT', 'A session signature is required');
        this.pineId = pineId;
        this.#credentials = options.credentials;
        this.#options = { fetch: options.fetch, signal: options.signal, headers: options.headers };
    }
    async #post(path, form, query) {
        const { status, data } = await request(`https://www.tradingview.com/pine_perm/${path}`, {
            method: 'POST',
            query,
            form: { pine_id: this.pineId, ...form },
            credentials: this.#credentials,
            headers: { origin: 'https://www.tradingview.com' },
        }, this.#options);
        if (status >= 400) {
            throw new TradingViewError(status === 404 ? 'NOT_FOUND' : 'HTTP_ERROR', data?.detail ?? 'Wrong credentials or pineId', {
                details: data,
            });
        }
        return data;
    }
    /** Lists authorized users. */
    async getUsers(limit = 10, order = '-created') {
        const data = await this.#post('list_users/', {}, { limit, order_by: order });
        return data?.results ?? [];
    }
    /** Authorizes a user, optionally until a date. */
    async addUser(username, expiration) {
        const data = await this.#post('add/', { username_recip: username, expiration: expiration?.toISOString() });
        return data?.status;
    }
    /** Changes (or removes, without date) the expiration of a user's access. */
    async modifyExpiration(username, expiration) {
        const data = await this.#post('modify_user_expiration/', {
            username_recip: username, expiration: expiration?.toISOString(),
        });
        return data?.status;
    }
    /** Revokes a user's access. */
    async removeUser(username) {
        const data = await this.#post('remove/', { username_recip: username });
        return data?.status;
    }
}
