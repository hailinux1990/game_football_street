const { createSandbox } = require('./harness.js');
const sandbox = createSandbox();

const code = `
// Mock gamepad: PS5 DualSense standard mapping
const mockGamepad = {
    id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',
    index: 0,
    connected: true,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: []
};
for (let i = 0; i < 18; i++) mockGamepad.buttons.push({ pressed: false, value: 0 });

navigator.getGamepads = function() { return [mockGamepad]; };

const im = new InputManager();
im.gamepadEnabled = true;
im.setControlMode('gamepad');   // để isAction* dùng tay cầm

function press(btn) { mockGamepad.buttons[btn].pressed = true; }
function release(btn) { mockGamepad.buttons[btn].pressed = false; }

console.log('=== GAMEPAD TESTS ===');

// 1. Poll detects connection
im.pollGamepad();
console.log('1. Connected:', im.gpConnected, '(expect true) | id contains DualSense/Controller:', im.gpId.includes('Controller'));

// 2. Default bindings
console.log('2. Default gp bindings:', JSON.stringify(im.gpBindings));
console.log('   pass=' + im.getGpBinding('pass'), '(expect 0) | shoot=' + im.getGpBinding('shoot'), '(expect 2)');

// 3. Button down -> action down
press(0); // Cross
im.pollGamepad();
console.log('3. Cross pressed -> pass action down:', im.isActionDown('pass'), '(expect true)');

// 4. Press edge detection
const pressedOnce = im.isActionPressed('pass');
im.update(); // clears pressed
im.pollGamepad();
const pressedTwice = im.isActionPressed('pass');
console.log('4. Press edge: first=' + pressedOnce + ' (true), after update+repoll=' + pressedTwice + ' (false - held not re-pressed)');

release(0);
im.pollGamepad();

// 5. Shoot button (Square = 2)
press(2);
im.pollGamepad();
console.log('5. Square -> shoot down:', im.isActionDown('shoot'), '(expect true)');
release(2); im.pollGamepad();

// 6. Movement axes
mockGamepad.axes[0] = 0.8;  // right
mockGamepad.axes[1] = -0.6; // up
im.pollGamepad();
const mv = im.getGamepadMove();
console.log('6. Left stick move:', JSON.stringify(mv), '(expect x~0.8, y~-0.6)');
mockGamepad.axes[0] = 0; mockGamepad.axes[1] = 0;

// 7. D-pad movement
press(14); // D-pad Left
im.pollGamepad();
const mv2 = im.getGamepadMove();
console.log('7. D-pad left move:', JSON.stringify(mv2), '(expect x=-1)');
release(14); im.pollGamepad();

// 8. Deadzone
mockGamepad.axes[0] = 0.1;
im.pollGamepad();
console.log('8. Deadzone 0.1:', JSON.stringify(im.getGamepadMove()), '(expect x=0)');
mockGamepad.axes[0] = 0;

// 9. Rebind flow
let captured = null;
im.startGpRebind('skill', (action, btn) => { captured = { action, btn }; });
press(5); // R1
im.pollGamepad();
release(5); im.pollGamepad();
console.log('9. Rebind skill -> R1:', JSON.stringify(captured), '(expect skill/5)');
console.log('   New bindings:', JSON.stringify(im.gpBindings));

// 10. Duplicate removal
im.setGpBinding('pass', 5); // pass was 0, R1 was skill
im.setGpBinding('skill', 5); // now skill also 5 -> pass should be cleared
 console.log('10. After skill->5 (duplicate of pass): pass=' + im.getGpBinding('pass') + ' (null - duplicate removed), skill=' + im.getGpBinding('skill') + ' (5)');

// 11. Reset
im.resetGpBindings();
console.log('11. After reset: pass=' + im.getGpBinding('pass') + ' (expect 0)');

// 12. Disable gamepad
im.setGamepadEnabled(false);
im.pollGamepad();
console.log('12. Disabled: connected=' + im.gpConnected + ' (false), pass down=' + im.isActionDown('pass') + ' (false)');
im.setGamepadEnabled(true);

// 13. Disconnect
mockGamepad.connected = false;
im.pollGamepad();
console.log('13. Disconnected: connected=' + im.gpConnected + ' (expect false)');
`;

require('vm').runInContext(code, sandbox, { filename: 'gamepad-test' });

// === Integration test: gamepad drives the game ===
const code2 = `
console.log('\\n=== GAMEPAD GAMEPLAY INTEGRATION ===');
const mockGP = {
    id: 'DualSense Wireless Controller', index: 0, connected: true, mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: []
};
for (let i = 0; i < 18; i++) mockGP.buttons.push({ pressed: false, value: 0 });
navigator.getGamepads = function() { return [mockGP]; };

const canvas = { width: 1000, height: 650, getContext: () => new Proxy({}, { get: () => (prop) => {
    if (prop === 'createLinearGradient') return () => ({ addColorStop: () => {} });
    return () => {};
}})};
const g = new Game(canvas);
g.startMatch();
const h = g.currentControlledPlayer;
g.input.setControlMode('gamepad');
g._autoSwitchCd = 9999; g._possessSwitchCd = 9999;

// Poll once to detect gamepad
g.input.pollGamepad();
console.log('Gamepad connected in game:', g.input.gpConnected);

// Move with left stick (right)
const startX = h.pos.x;
mockGP.axes[0] = 1.0;
for (let i = 0; i < 20; i++) { g.input.pollGamepad(); g.update(0.016); g.input.update(); }
mockGP.axes[0] = 0;
console.log('Stick move right: moved', (h.pos.x - startX).toFixed(0), 'px (expect >60)');

// Shoot with Square (move opponents away so shot isn't blocked)
for (const bp of g.teamPlayers.blue) { bp.pos = new Vector2(820, 120); bp.hasBall = false; }
for (const p of g.players) p.hasBall = false;
g.ball.pos = h.pos.clone(); h.hasBall = true; g.ball.owner = h;
h.passCooldown = 0;
const velBeforeShoot = g.ball.vel.mag();
mockGP.buttons[2].pressed = true;  // Square
g.input.pollGamepad();
g.update(0.016);
mockGP.buttons[2].pressed = false;
console.log('Square shoot: human hasBall=' + h.hasBall + ' (false), ball vel=' + g.ball.vel.mag().toFixed(1) + ' (expect >20), owner=' + (g.ball.owner ? g.ball.owner.team : 'none'));

// Pass with Cross
g.ball.pos = h.pos.clone(); h.hasBall = true; g.ball.owner = h; h.passCooldown = 0;
mockGP.buttons[0].pressed = true;  // Cross
g.input.pollGamepad();
g.update(0.016);
mockGP.buttons[0].pressed = false;
console.log('Cross pass: ball owner =', g.ball.owner ? g.ball.owner.team : 'none', '| vel =', g.ball.vel.mag().toFixed(1));

// Sprint with R2
h.stamina = 100;
mockGP.buttons[7].pressed = true;  // R2
mockGP.axes[0] = -1;  // move left
const sx = h.pos.x;
for (let i = 0; i < 15; i++) { g.input.pollGamepad(); g.update(0.016); g.input.update(); }
mockGP.buttons[7].pressed = false; mockGP.axes[0] = 0;
console.log('R2 sprint: moved', (sx - h.pos.x).toFixed(0), 'px | stamina', h.stamina.toFixed(0), '(stamina<100)');
`;
require('vm').runInContext(code2, sandbox, { filename: 'gamepad-integration' });
