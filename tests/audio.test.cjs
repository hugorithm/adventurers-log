const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');

function setup(savedMute = null, storageUnavailable = false) {
    const listeners = new Map();
    const intervals = new Map();
    const attributes = new Map();
    const storage = new Map([['hugo-site-muted', savedMute]]);
    const oscillators = [];
    const filters = [];
    const delays = [];
    let audio = null;
    const button = {
        setAttribute: (name, value) => attributes.set(name, value),
        addEventListener: (name, listener) => listeners.set(`button:${name}`, listener),
    };
    const parameter = () => ({
        value: 0,
        setValueAtTime() {},
        linearRampToValueAtTime() {},
        exponentialRampToValueAtTime() {},
    });
    class AudioContext {
        constructor() {
            this.currentTime = 0;
            this.state = 'suspended';
            this.destination = {};
            audio = this;
        }
        createGain() {
            return { gain: parameter(), connect() {}, disconnect() {} };
        }
        createBiquadFilter() {
            const filter = { frequency: parameter(), Q: parameter(), connect() {} };
            filters.push(filter);
            return filter;
        }
        createDelay() {
            const delay = { delayTime: parameter(), connect() {} };
            delays.push(delay);
            return delay;
        }
        createOscillator() {
            const oscillator = {
                frequency: parameter(), connect() {}, disconnect() {},
                start(time) { this.startTime = time; },
                stop(time) { this.stopTime = time; },
            };
            oscillators.push(oscillator);
            return oscillator;
        }
        async resume() { this.state = 'running'; }
        async suspend() { this.state = 'suspended'; }
    }
    const document = {
        hidden: false,
        querySelector: () => button,
        addEventListener: (name, listener) => listeners.set(name, listener),
    };
    const window = { AudioContext };
    vm.runInNewContext(readFileSync('static/audio.js', 'utf8'), {
        window, document,
        localStorage: {
            getItem(key) {
                if (storageUnavailable) throw new Error('Storage blocked');
                return storage.get(key);
            },
            setItem(key, value) {
                if (storageUnavailable) throw new Error('Storage blocked');
                storage.set(key, value);
            },
        },
        setInterval(callback) { intervals.set(callback, callback); return callback; },
        clearInterval: (handle) => intervals.delete(handle),
    });
    return {
        window, document, attributes, storage, intervals, oscillators, filters, delays,
        get audio() { return audio; },
        async fire(name, onButton = false) {
            listeners.get(name)({
                isTrusted: true,
                target: { closest: () => onButton ? button : null },
            });
            await Promise.resolve();
            await Promise.resolve();
        },
    };
}

test('music waits for interaction and schedules a quiet original loop', async () => {
    const site = setup();
    assert.equal(site.audio, null);
    await site.fire('keydown');
    assert.equal(site.audio.state, 'running');
    assert.equal(site.intervals.size, 1);
    assert.equal(site.window.SiteAudio.output.gain.value, 0.65);
    assert.ok(site.oscillators.length > 0);
    assert.ok(site.oscillators.every((tone) => tone.stopTime > tone.startTime));
    await site.fire('pointerdown');
    assert.equal(site.intervals.size, 1);
});

test('terminal score uses filtered chip voices, a soft echo, and deliberate rests', async () => {
    const site = setup();
    await site.fire('keydown');
    assert.equal(site.filters[0].type, 'lowpass');
    assert.equal(site.filters[0].frequency.value, 1400);
    assert.equal(site.delays[0].delayTime.value, 0.5625);
    assert.deepEqual(site.oscillators.map(tone => tone.type), ['square', 'triangle', 'triangle']);
    const firstNotes = site.oscillators.length;
    site.audio.currentTime = 0.375;
    for (const schedule of site.intervals.values()) schedule();
    assert.equal(site.oscillators.length, firstNotes);
    site.audio.currentTime = 0.75;
    for (const schedule of site.intervals.values()) schedule();
    assert.equal(site.oscillators.length, firstNotes + 1);
    assert.ok(site.oscillators.every(tone => Number.isFinite(tone.frequency.value)));
});

test('master mute silences shared output and persists across visits', async () => {
    const site = setup();
    const context = await site.window.SiteAudio.resume();
    await site.fire('button:click');
    assert.equal(site.window.SiteAudio.muted, true);
    assert.equal(site.window.SiteAudio.output.gain.value, 0);
    assert.equal(context.state, 'suspended');
    assert.equal(site.attributes.get('aria-label'), 'Unmute website');
    assert.equal(site.attributes.get('aria-pressed'), 'true');
    assert.equal(site.storage.get('hugo-site-muted'), 'true');
    assert.equal(await site.window.SiteAudio.resume(), context);
    assert.equal(context.state, 'suspended');
    assert.equal(site.intervals.size, 0);
    const nextVisit = setup(site.storage.get('hugo-site-muted'));
    await nextVisit.fire('pointerdown');
    assert.equal(nextVisit.audio, null);
    await nextVisit.fire('button:click');
    assert.equal(nextVisit.audio.state, 'running');
    assert.equal(nextVisit.storage.get('hugo-site-muted'), 'false');
});

test('the mute button can prevent playback before the first interaction', async () => {
    const site = setup();
    await site.fire('pointerdown', true);
    await site.fire('button:click');
    assert.equal(site.audio, null);
    assert.equal(site.window.SiteAudio.muted, true);
});

test('hidden tabs suspend music without creating duplicate schedulers', async () => {
    const site = setup();
    await site.fire('pointerdown');
    site.document.hidden = true;
    await site.fire('visibilitychange');
    assert.equal(site.audio.state, 'suspended');
    assert.equal(site.intervals.size, 0);
    site.document.hidden = false;
    await site.fire('visibilitychange');
    assert.equal(site.audio.state, 'running');
    assert.equal(site.intervals.size, 1);
});

test('blocked local storage does not prevent audio controls working', async () => {
    const site = setup(null, true);
    await site.fire('button:click');
    await site.fire('button:click');
    assert.equal(site.audio.state, 'running');
    assert.equal(site.window.SiteAudio.muted, false);
});