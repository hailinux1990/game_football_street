// Test harness for game logic
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const GAME_DIR = path.join(__dirname, '..', 'js');

const elementMock = () => ({
    classList: { add: () => {}, remove: () => {} },
    style: {},
    textContent: '', value: '', onclick: null, onchange: null, width: 0, height: 0,
    getContext: () => new Proxy({}, { get: () => (prop) => {
        if (prop === 'createLinearGradient') return () => ({ addColorStop: () => {} });
        if (prop === 'getContext') return () => ({});
        return () => {};
    }})
});

function makeSpeechMock() {
    const voices = [
        { name: 'Google Tiếng Việt', lang: 'vi-VN', default: true },
        { name: 'Microsoft David', lang: 'en-US', default: false }
    ];
    const spoken = [];
    const synth = {
        spoken,
        speaking: false,
        pending: false,
        getVoices: () => voices,
        speak(u) { spoken.push(u); this.speaking = true; },
        cancel() { this.speaking = false; },
        onvoiceschanged: null
    };
    const Utt = function (text) {
        this.text = text; this.lang = ''; this.voice = null;
        this.volume = 1; this.rate = 1; this.pitch = 1;
    };
    return { synth, Utt };
}

function createSandbox() {
    const speech = makeSpeechMock();
    const sandbox = {
        window: { addEventListener: () => {}, speechSynthesis: speech.synth, SpeechSynthesisUtterance: speech.Utt,
            AudioContext: function() {
            const param = () => ({
                value: 0,
                exponentialRampToValueAtTime: () => {},
                linearRampToValueAtTime: () => {},
                setValueAtTime: () => {},
                cancelScheduledValues: () => {}
            });
            const node = () => ({ connect: () => {}, disconnect: () => {}, gain: param(),
                frequency: param(), Q: param(), type: '', buffer: null,
                start: () => {}, stop: () => {}, loop: false, loopStart: 0, loopEnd: 0 });
            this.sampleRate = 44100;
            this.createGain = node;
            this.createBiquadFilter = node;
            this.createBufferSource = node;
            this.createBuffer = (ch, len) => ({ getChannelData: () => new Float32Array(len), length: len, numberOfChannels: ch });
            this.createOscillator = node;
            this.destination = {};
            this.currentTime = 0;
        }},
        document: { readyState: 'loading', addEventListener: () => {}, getElementById: elementMock, createElement: () => ({}) },
        requestAnimationFrame: () => {}, addEventListener: () => {},
        navigator: { getGamepads: () => [] },
        localStorage: (() => {
            let store = {};
            return {
                getItem: (k) => store[k] !== undefined ? store[k] : null,
                setItem: (k, v) => { store[k] = String(v); },
                removeItem: (k) => { delete store[k]; },
                clear: () => { store = {}; }
            };
        })(),
        console, Math, JSON, Date, setTimeout, clearTimeout, setInterval, clearInterval,
        performance: { now: () => Date.now() },
        // Mock Web Speech API (giọng tiếng Việt) để test phần bình luận
        SpeechSynthesisUtterance: speech.Utt,
        speechSynthesis: speech.synth
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    for (const s of ['game.js', 'entities.js', 'field.js', 'ai.js', 'ui.js', 'commentary.js', 'main.js']) {
        vm.runInContext(fs.readFileSync(path.join(GAME_DIR, s), 'utf8'), sandbox, { filename: s });
    }
    return sandbox;
}

function createCanvas() {
    return {
        width: 1000, height: 650,
        getContext: () => new Proxy({}, { get: () => (prop) => {
            if (prop === 'createLinearGradient') return () => ({ addColorStop: () => {} });
            return () => {};
        }})
    };
}

module.exports = { createSandbox, createCanvas };
