// bootstrap-fetch.js
const { fetch, Request, Response, Headers } = require('undici');
globalThis.fetch ??= fetch;
globalThis.Request ??= Request;
globalThis.Response ??= Response;
globalThis.Headers ??= Headers;
