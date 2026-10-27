const { createSandbox } = require('./harness.js');

const sandbox = createSandbox();
const code = `
const canvas = { width: 1000, height: 650, getContext: () => new Proxy({}, { get: () => (prop) => {
    if (prop === 'createLinearGradient') return () => ({ addColorStop: () => {} });
    return () => {};
}})};

// Test each difficulty with a simple bot
function testDifficulty(diff, frames) {
    const g = new Game({ ...canvas });
    g.startMatch();
    g.difficulty = diff;
    
    for (let i = 0; i < frames; i++) {
        if (g.state === GameState.PLAYING) {
            const h = g.currentControlledPlayer;
            if (h && h.active) {
                const b = g.ball;
                let tx, ty;
                if (h.hasBall) { tx = g.field.x + g.field.width - 30; ty = g.field.y + g.field.height/2; }
                else if (b.owner && b.owner.team === 'red') { tx = g.field.x + g.field.width - 150; ty = b.pos.y; }
                else { tx = b.pos.x; ty = b.pos.y; }
                const dx = tx-h.pos.x, dy = ty-h.pos.y, d = Math.hypot(dx,dy);
                if (d > 10) {
                    h.pos.x += (dx/d) * h.maxSpeed * 1.25;
                    h.pos.y += (dy/d) * h.maxSpeed * 1.25;
                    const f = g.field;
                    h.pos.x = Math.max(f.x+15, Math.min(f.x+f.width-15, h.pos.x));
                    h.pos.y = Math.max(f.y+15, Math.min(f.y+f.height-15, h.pos.y));
                }
            }
        }
        g.update(0.016);
    }
    return { red: g.redScore, blue: g.blueScore };
}

const frameCount = 9000;  // 2.5 min
console.log('Difficulty | RED score | BLUE score');
console.log('-----------|-----------|----------');
for (const diff of ['easy', 'normal', 'hard', 'legend']) {
    const r = testDifficulty(diff, frameCount);
    console.log(diff.padEnd(10) + ' | ' + String(r.red).padStart(9) + ' | ' + String(r.blue).padStart(10));
}
`;

require('vm').runInContext(code, sandbox, { filename: 'difficulty' });
