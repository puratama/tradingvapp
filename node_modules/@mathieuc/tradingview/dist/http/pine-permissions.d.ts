import { type Credentials, type HttpOptions } from './request.js';
/** A user allowed to use an invite-only script. */
export interface AuthorizedUser {
    id: number;
    username: string;
    userpic: string;
    /** ISO date, or null when the access does not expire. */
    expiration: string | null;
    created: string;
    [key: string]: unknown;
}
export type AuthorizedUserOrder = 'user__username' | '-user__username' | 'created' | '-created' | 'expiration,user__username' | '-expiration,user__username';
export interface PinePermissionOptions extends HttpOptions {
    credentials: Credentials;
}
/** Manages who can use an invite-only Pine script you own. */
export declare class PinePermissionManager {
    #private;
    readonly pineId: string;
    constructor(pineId: string, options: PinePermissionOptions);
    /** Lists authorized users. */
    getUsers(limit?: number, order?: AuthorizedUserOrder): Promise<AuthorizedUser[]>;
    /** Authorizes a user, optionally until a date. */
    addUser(username: string, expiration?: Date): Promise<'ok' | 'exists' | (string & {})>;
    /** Changes (or removes, without date) the expiration of a user's access. */
    modifyExpiration(username: string, expiration?: Date): Promise<'ok' | (string & {})>;
    /** Revokes a user's access. */
    removeUser(username: string): Promise<'ok' | (string & {})>;
}
