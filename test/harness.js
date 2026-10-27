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

function createSandbox() {
    const sandbox = {
        window: { addEventListener: () => {}, AudioContext: function() {
            this.createGain = () => ({ connect: () => {}, gain: { value: 0, exponentialRampToValueAtTime: () => {} } });
            this.createOscillator = () => ({ connect: () => {}, frequency: { value: 0 }, start: () => {}, stop: () => {}, type: '' });
            this.destination = {}; this.currentTime = 0;
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
        console, Math, JSON, Date, setTimeout, clearTimeout, setInterval, clearInterval
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    for (const s of ['game.js', 'entities.js', 'field.js', 'ai.js', 'ui.js', 'main.js']) {
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
