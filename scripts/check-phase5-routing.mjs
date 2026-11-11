import assert from 'node:assert/strict';
import {locationPoint, navigationURL, roadRoute, routingConfig} from '../assets/js/location-routing.js';

const controller = new AbortController();
const config = {base: new URL('https://routing.example.invalid/osrm/'), profile: 'driving'};
const origin = [-6.9234567, 107.6000001];
const destination = [-6.9123456, 107.6198765];
const geometry = {type: 'LineString', coordinates: [[107.60001, -6.92345], [107.61000, -6.92], [107.61987, -6.91234]]};
const good = {code: 'Ok', routes: [{geometry, distance: 2376, duration: 471}]};
assert.deepEqual(locationPoint(0, 0), [0, 0]);
for (const value of [null, '', Infinity, NaN, -91, '0']) assert.equal(locationPoint(value, 0), null);

const realFetch = globalThis.fetch;
const realTimeout = AbortSignal.timeout;
try {
    globalThis.fetch = async (url, options) => {
        assert.equal(url.origin, config.base.origin);
        assert.equal(url.pathname, '/osrm/route/v1/driving/107.6000001,-6.9234567;107.6198765,-6.9123456');
        assert.deepEqual(Object.fromEntries(url.searchParams), {overview: 'full', geometries: 'geojson', steps: 'false'});
        assert.equal(options.credentials, 'omit');
        assert.equal(options.redirect, 'error');
        assert.equal(options.referrerPolicy, 'no-referrer');
        return Response.json(good);
    };
    assert.deepEqual(await roadRoute(config, origin, destination, controller.signal), good.routes[0]);
    for (const coordinates of [[], [[1, 1]], [[-6.92, 107.61], [-6.91, 107.62]], [[0, '0'], [1, 1]], [[181, 0], [1, 1]]]) {
        globalThis.fetch = async () => Response.json({code: 'Ok', routes: [{geometry: {...geometry, coordinates}}]});
        await assert.rejects(roadRoute(config, origin, destination, controller.signal), /geometri/);
    }
    for (const [status, body, message] of [
        [429, {}, /Batas permintaan/], [400, {code: 'NoRoute'}, /tidak ditemukan/],
        [503, {}, /tidak tersedia/], [200, {}, /geometri/]
    ]) {
        globalThis.fetch = async () => Response.json(body, {status});
        await assert.rejects(roadRoute(config, origin, destination, controller.signal), message);
    }
    globalThis.fetch = async () => new Response('invalid JSON');
    await assert.rejects(roadRoute(config, origin, destination, controller.signal), /geometri/);

    globalThis.fetch = async (url, {signal}) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), {once: true});
    });
    const pending = roadRoute(config, origin, destination, controller.signal);
    controller.abort();
    await assert.rejects(pending, {name: 'AbortError'});
    const timeout = new AbortController();
    AbortSignal.timeout = () => timeout.signal;
    const slow = roadRoute(config, origin, destination, new AbortController().signal);
    timeout.abort(new DOMException('Fixture timeout', 'TimeoutError'));
    await assert.rejects(slow, /Waktu tunggu/);

    const nav = new URL(navigationURL([0, 0], 'Alamat cadangan'));
    assert.equal(nav.origin, 'https://www.google.com');
    assert.deepEqual(Object.fromEntries(nav.searchParams), {api: '1', destination: '0,0'});
    assert.equal(new URL(navigationURL(null, 'Jl. A & B')).searchParams.get('destination'), 'Jl. A & B');
    assert.equal(navigationURL(null, ''), null);

    let provider = '';
    globalThis.document = {querySelector(selector) {
        return {content: selector.includes('profile') ? 'driving' : provider};
    }};
    assert.equal(routingConfig(), null);
    for (const url of ['http://example.invalid', 'https://secret@example.invalid', 'https://example.invalid/?key=x']) {
        provider = url;
        assert.equal(routingConfig(), null);
    }
    provider = config.base.href;
    assert.deepEqual(routingConfig(), config);
} finally {
    globalThis.fetch = realFetch;
    AbortSignal.timeout = realTimeout;
    delete globalThis.document;
}
console.log('PASS Phase 5B routing adapter: bounds, OSRM request, GeoJSON, invalid responses, 429, NoRoute, timeout, abort, and external fallback.');
