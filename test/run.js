const { createSandbox, createCanvas } = require('./harness.js');
const sandbox = createSandbox();
const canvas = createCanvas();
sandbox.canvas = canvas;

const code = `
const canvas = { width: 1000, height: 650, getContext: () => new Proxy({}, { get: () => (prop) => {
    if (prop === 'createLinearGradient') return () => ({ addColorStop: () => {} });
    return () => {};
}})};

// Test 1: idle human
const game1 = new Game(canvas);
game1.startMatch();
for (let i = 0; i < 9000; i++) { game1.update(0.016); }
console.log('=== Test 1: AI vs idle human (2.5 min) ===');
console.log('RED', game1.redScore, '- BLUE', game1.blueScore);

// Test 2: 5 min with bot
const game2 = new Game(canvas);
game2.startMatch();
let goals = [];
for (let i = 0; i < 18000; i++) {
    const pr = game2.redScore, pb = game2.blueScore;
    if (game2.state === GameState.PLAYING) {
        const h = game2.currentControlledPlayer;
        if (h && h.active) {
            const b = game2.ball;
            let tx, ty;
            if (h.hasBall) { tx = game2.field.x + game2.field.width - 30; ty = game2.field.y + game2.field.height/2;
                const dg = Math.hypot(h.pos.x-tx, h.pos.y-ty);
                if (dg < 280 && Math.random() < 0.1) game2.tryShoot();
            } else if (b.owner && b.owner.team === 'red') { tx = game2.field.x + game2.field.width - 150; ty = b.pos.y; }
            else { tx = b.pos.x; ty = b.pos.y; }
            const dx = tx-h.pos.x, dy = ty-h.pos.y, d = Math.hypot(dx,dy);
            if (d > 10) {
                h.pos.x += (dx/d) * h.maxSpeed * 1.3;
                h.pos.y += (dy/d) * h.maxSpeed * 1.3;
                const f = game2.field;
                h.pos.x = Math.max(f.x+15, Math.min(f.x+f.width-15, h.pos.x));
                h.pos.y = Math.max(f.y+15, Math.min(f.y+f.height-15, h.pos.y));
            }
        }
    }
    game2.update(0.016);
    if (game2.redScore > pr) goals.push('R');
    if (game2.blueScore > pb) goals.push('B');
}
console.log('\\n=== Test 2: 5-min bot match ===');
console.log('RED', game2.redScore, '- BLUE', game2.blueScore);
console.log('Total goals:', goals.length, '| R:', goals.filter(g=>g==='R').length, '| B:', goals.filter(g=>g==='B').length);
`;
try {
    require('vm').runInContext(code, sandbox, { filename: 'test' });
} catch(e) {
    console.error('ERROR:', e.message);
    console.error(e.stack.split('\n').slice(0,5).join('\n'));
}
