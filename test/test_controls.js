const { createSandbox } = require('./harness.js');
const sandbox = createSandbox();

const code = `
const canvas = { width: 1000, height: 650, getContext: () => new Proxy({}, { get: () => (prop) => {
    if (prop === 'createLinearGradient') return () => ({ addColorStop: () => {} });
    return () => {};
}})};

const game = new Game(canvas);
game.startMatch();

// Helper: force control to a player and disable auto-switch for isolated control tests
function forceControl(player) {
    if (game.currentControlledPlayer !== player) {
        game.currentControlledPlayer.isControlled = false;
        game.currentControlledPlayer.aiControlled = true;
        player.isControlled = true;
        player.aiControlled = false;
        game.currentControlledPlayer = player;
    }
    game._autoSwitchCd = 9999;
    game._possessSwitchCd = 9999;
}

const human = game.currentControlledPlayer;
forceControl(human);
console.log('=== Control tests ===');
console.log('Human player:', human.team, human.role, 'at', human.pos.x.toFixed(0), human.pos.y.toFixed(0));

// Test 1: Move right (D)
forceControl(human);
const startX = human.pos.x;
game.input.keys['KeyD'] = true;
for (let i = 0; i < 30; i++) game.update(0.016);
game.input.keys['KeyD'] = false;
console.log('Move right (D) 30f: moved', (human.pos.x - startX).toFixed(0), '(expect ~78)');

// Test 2: Move up (W)
forceControl(human);
const startY = human.pos.y;
game.input.keys['KeyW'] = true;
for (let i = 0; i < 30; i++) game.update(0.016);
game.input.keys['KeyW'] = false;
console.log('Move up (W) 30f: moved', (human.pos.y - startY).toFixed(0), '(expect ~-160)');

// Test 3: Sprint
forceControl(human);
human.stamina = 100;
const bSX = human.pos.x;
game.input.keys['ShiftLeft'] = true;
game.input.keys['KeyD'] = true;
for (let i = 0; i < 20; i++) game.update(0.016);
game.input.keys['ShiftLeft'] = false;
game.input.keys['KeyD'] = false;
console.log('Sprint 20f: moved', (human.pos.x - bSX).toFixed(0), '| stamina', human.stamina.toFixed(0), '(moved>120, stamina<100)');

// Test 4: Pass
forceControl(human);
forceControl(human);
game.ball.pos = human.pos.clone();
human.hasBall = true;
game.ball.owner = human;
game.input.keysPressed = { Space: true };
game.update(0.016);
console.log('Pass: owner after =', game.ball.owner ? game.ball.owner.team : 'none', '| vel', game.ball.vel.mag().toFixed(1));

// Test 5: Shoot
forceControl(human);
game.ball.pos = human.pos.clone();
human.hasBall = true;
game.ball.owner = human;
human.passCooldown = 0;
human.ballProtectTimer = 0;
game.input.keysPressed = { KeyF: true };
game.update(0.016);
console.log('Shoot: owner after =', game.ball.owner ? game.ball.owner.team : 'none', '| vel', game.ball.vel.mag().toFixed(1));

// Test 6: Switch player (manual Q)
forceControl(human);
const beforeSwitch = game.currentControlledPlayer.role;
game.input.keysPressed = { KeyQ: true };
game.update(0.016);
const afterSwitch = game.currentControlledPlayer.role;
console.log('Switch: from', beforeSwitch, 'to', afterSwitch, '| old aiControlled =', human.aiControlled, '(expect true)');

// Test 7: Skill
const cur = game.currentControlledPlayer;
forceControl(cur);
game.ball.pos = cur.pos.clone();
cur.hasBall = true;
game.ball.owner = cur;
cur.skillCooldown = 0;
const stamBefore = cur.stamina;
cur.stamina = 100;
game.input.keysPressed = { KeyE: true };
game.update(0.016);
console.log('Skill (E): stamina 100 ->', cur.stamina.toFixed(0), '(expect 75)');
`;

require('vm').runInContext(code, sandbox, { filename: 'controls' });
