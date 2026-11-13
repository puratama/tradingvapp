/**
 * TradingView sends large strategy reports as base64 data (`dataCompressed`).
 * The payload is usually a ZIP archive with a single entry, but zlib, raw
 * deflate, gzip and plain JSON have also been observed. Base64 may be URL-safe
 * and unpadded.
 */
/** Normalises URL-safe and unpadded base64. */
export declare function normaliseBase64(data: string): string;
/** Reads the first file of a ZIP archive (stored or deflated). */
export declare function readFirstZipEntry(archive: Uint8Array): Uint8Array;
/** Decodes a TradingView compressed payload into JSON. */
export declare function decodeCompressed(data: string): unknown;
