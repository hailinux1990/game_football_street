const { createSandbox } = require('./harness.js');
const sandbox = createSandbox();

const code = `
console.log('=== Key Binding Tests ===');

const im = new InputManager();
console.log('Default bindings:');
for (const k in im.bindings) console.log('  ' + k + ' = ' + im.bindings[k]);

// Test isActionDown with default
im.keys['KeyW'] = true;
console.log('\\nKeyW down, moveUp action down:', im.isActionDown('moveUp'), '(expect true)');
im.keys['KeyW'] = false;

// Test rebinding
im.setBinding('shoot', 'KeyJ');
console.log('After rebind shoot->KeyJ:');
console.log('  shoot =', im.getBinding('shoot'), '(expect KeyJ)');
im.keys['KeyJ'] = true;
console.log('  KeyJ down, shoot action down:', im.isActionDown('shoot'), '(expect true)');
im.keys['KeyJ'] = false;
im.keys['KeyF'] = true;
console.log('  KeyF down, shoot action down:', im.isActionDown('shoot'), '(expect false)');
im.keys['KeyF'] = false;

// Test duplicate removal
im.setBinding('pass', 'KeyJ');  // KeyJ was shoot
console.log('\\nAfter pass->KeyJ (duplicate):');
console.log('  pass =', im.getBinding('pass'), '(expect KeyJ)');
console.log('  shoot =', im.getBinding('shoot'), '(expect null/undefined - removed duplicate)');

// Test reset
im.resetBindings();
console.log('\\nAfter reset: shoot =', im.getBinding('shoot'), '(expect KeyF)');

// Test key display names
console.log('\\nKey display names:');
for (const code of ['KeyW','Space','ShiftLeft','ArrowUp','Digit5','Numpad1','F12']) {
    console.log('  ' + code + ' -> ' + keyDisplayName(code));
}

// Test rebind capture flow
console.log('\\nRebind flow test:');
let captured = null;
im.startRebind('skill', (action, code) => { captured = { action, code }; });
console.log('  rebinding active:', im.rebinding, '(expect skill)');
// Simulate keydown while rebinding
const fakeEvent = { code: 'KeyR', preventDefault: () => {}, stopPropagation: () => {} };
im.onKeyDown(fakeEvent);
console.log('  captured:', JSON.stringify(captured), '(expect skill/KeyR)');
console.log('  rebinding cleared:', im.rebinding, '(expect null)');

// ESC not captured as binding
let escCaptured = null;
im.startRebind('skill', (action, code) => { escCaptured = code; });
im.onKeyDown({ code: 'Escape', preventDefault: () => {}, stopPropagation: () => {} });
console.log('  ESC captured:', escCaptured, '(expect null - ESC excluded)');
`;

require('vm').runInContext(code, sandbox, { filename: 'keybinding-test' });

// Additional persistence test
const code2 = `
console.log('=== Persistence Test ===');
const im1 = new InputManager();
im1.setBinding('shoot', 'KeyK');
im1.setBinding('pass', 'KeyL');
console.log('Saved: shoot=', im1.getBinding('shoot'), 'pass=', im1.getBinding('pass'));

// Create new instance - should load saved bindings
const im2 = new InputManager();
console.log('Loaded in new instance: shoot=', im2.getBinding('shoot'), '(expect KeyK)');
console.log('Loaded: pass=', im2.getBinding('pass'), '(expect KeyL)');

// Reset and verify
im2.resetBindings();
const im3 = new InputManager();
console.log('After reset+reload: shoot=', im3.getBinding('shoot'), '(expect KeyF)');
`;
require('vm').runInContext(code2, sandbox, { filename: 'persist-test' });
