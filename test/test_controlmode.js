const { createSandbox } = require('./harness.js');
const sandbox = createSandbox();

const code = `
// Mock gamepad
const mockGP = { id: 'DualSense Wireless Controller', index: 0, connected: true, mapping: 'standard', axes: [0,0,0,0], buttons: [] };
for (let i = 0; i < 18; i++) mockGP.buttons.push({ pressed: false, value: 0 });
navigator.getGamepads = function() { return [mockGP]; };

console.log('=== CONTROL MODE TESTS ===');

// 1. Default mode
const im = new InputManager();
console.log('1. Default controlMode:', im.controlMode, '(expect keyboard)');

// 2. Keyboard mode: keyboard works, gamepad ignored
im.keys['Space'] = true;
mockGP.buttons[0].pressed = true; // Cross
im.pollGamepad();
console.log('2. Keyboard mode - pass via keyboard:', im.isActionDown('pass'), '(expect true)');
// Now test gamepad-only action in keyboard mode
im.keys['Space'] = false;
console.log('   Keyboard mode - pass via gamepad:', im.isActionDown('pass'), '(expect false - gamepad ignored)');
mockGP.buttons[0].pressed = false; im.pollGamepad();

// 3. Switch to gamepad mode
im.setControlMode('gamepad');
console.log('3. Switched to:', im.controlMode, '(expect gamepad)');

// Gamepad works
mockGP.buttons[0].pressed = true; // Cross = pass
im.pollGamepad();
console.log('4. Gamepad mode - pass via gamepad:', im.isActionDown('pass'), '(expect true)');
mockGP.buttons[0].pressed = false; im.pollGamepad();

// Keyboard ignored in gamepad mode
im.keys['Space'] = true;
console.log('5. Gamepad mode - pass via keyboard:', im.isActionDown('pass'), '(expect false - keyboard ignored)');
im.keys['Space'] = false;

// 6. Fallback when gamepad not connected
mockGP.connected = false; im.pollGamepad();
im.keys['Space'] = true;
console.log('6. Gamepad mode + disconnected - pass via keyboard:', im.isActionDown('pass'), '(expect true - fallback)');
im.keys['Space'] = false;
mockGP.connected = true; im.pollGamepad();

// 7. Persistence
const im2 = new InputManager();
console.log('7. New instance controlMode:', im2.controlMode, '(expect gamepad - persisted)');

// 8. Switch back to keyboard + persistence
im2.setControlMode('keyboard');
const im3 = new InputManager();
console.log('8. After switch back, new instance:', im3.controlMode, '(expect keyboard)');

// 9. isGamepadModeMissing
im3.setControlMode('gamepad');
mockGP.connected = false; im3.pollGamepad();
console.log('9. isGamepadModeMissing:', im3.isGamepadModeMissing(), '(expect true)');
mockGP.connected = true; im3.pollGamepad();
console.log('   After connect:', im3.isGamepadModeMissing(), '(expect false)');
`;

require('vm').runInContext(code, sandbox, { filename: 'controlmode-test' });

// === Integration: movement respects control mode ===
const code2 = `
console.log('\\n=== MOVEMENT INTEGRATION ===');
const mockGP2 = { id: 'DualSense', index: 0, connected: true, mapping: 'standard', axes: [0,0,0,0], buttons: [] };
for (let i = 0; i < 18; i++) mockGP2.buttons.push({ pressed: false, value: 0 });
navigator.getGamepads = function() { return [mockGP2]; };

const canvas = { width: 1000, height: 650, getContext: () => new Proxy({}, { get: () => (prop) => {
    if (prop === 'createLinearGradient') return () => ({ addColorStop: () => {} });
    return () => {};
}})};

function makeGame(mode) {
    const g = new Game(canvas);
    g.startMatch();
    g.input.pollGamepad();
    g.input.setControlMode(mode);
    g._autoSwitchCd = 9999; g._possessSwitchCd = 9999;
    return g;
}

// Keyboard mode: WASD moves, stick doesn't
const gk = makeGame('keyboard');
const hk = gk.currentControlledPlayer;
gk.input.keys['KeyD'] = true;
for (let i = 0; i < 20; i++) gk.update(0.016);
gk.input.keys['KeyD'] = false;
console.log('Keyboard mode + D key: moved', (hk.pos.x - 380).toFixed(0), 'px (expect >50)');

// Keyboard mode: stick should NOT move
const gk2 = makeGame('keyboard');
const hk2 = gk2.currentControlledPlayer;
mockGP2.axes[0] = 1.0;
for (let i = 0; i < 20; i++) { gk2.input.pollGamepad(); gk2.update(0.016); }
mockGP2.axes[0] = 0;
console.log('Keyboard mode + stick: moved', (hk2.pos.x - 380).toFixed(0), 'px (expect ~0)');

// Gamepad mode: stick moves
const gg = makeGame('gamepad');
const hg = gg.currentControlledPlayer;
mockGP2.axes[0] = 1.0;
for (let i = 0; i < 20; i++) { gg.input.pollGamepad(); gg.update(0.016); gg.input.update(); }
mockGP2.axes[0] = 0;
console.log('Gamepad mode + stick: moved', (hg.pos.x - 380).toFixed(0), 'px (expect >50)');

// Gamepad mode: WASD should NOT move
const gg2 = makeGame('gamepad');
const hg2 = gg2.currentControlledPlayer;
gg2.input.keys['KeyD'] = true;
for (let i = 0; i < 20; i++) { gg2.input.pollGamepad(); gg2.update(0.016); }
gg2.input.keys['KeyD'] = false;
console.log('Gamepad mode + D key: moved', (hg2.pos.x - 380).toFixed(0), 'px (expect ~0)');
`;
require('vm').runInContext(code2, sandbox, { filename: 'movement-integration' });
