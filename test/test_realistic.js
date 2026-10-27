const { createSandbox } = require('./harness.js');
const sandbox = createSandbox();

const code = `
const canvas = { width: 1000, height: 650, getContext: () => new Proxy({}, { get: () => (prop) => {
    if (prop === 'createLinearGradient') return () => ({ addColorStop: () => {} });
    return () => {};
}})};

// Realistic human: base speed, reaction delay, imperfect decisions
function testRealistic(diff, frames) {
    const g = new Game(canvas);
    g.startMatch();
    g.difficulty = diff;

    let reactionTimer = 0;
    let targetGoal = { x: 860, y: 330 };

    for (let i = 0; i < frames; i++) {
        if (g.state === GameState.PLAYING) {
            const h = g.currentControlledPlayer;
            if (h && h.active) {
                reactionTimer--;
                if (reactionTimer <= 0) {
                    reactionTimer = 8;  // ~130ms reaction delay
                    const b = g.ball;
                    if (h.hasBall) {
                        targetGoal = { x: g.field.x + g.field.width - 20, y: g.field.y + g.field.height/2 };
                        const dg = Math.hypot(h.pos.x - targetGoal.x, h.pos.y - targetGoal.y);
                        if (dg < 250 && Math.random() < 0.15) g.tryShoot();
                    } else if (b.owner && b.owner.team === 'red') {
                        targetGoal = { x: b.pos.x + 50, y: b.pos.y };
                    } else {
                        targetGoal = { x: b.pos.x, y: b.pos.y };
                    }
                }
                // Move at base speed (no sprint)
                const dx = targetGoal.x - h.pos.x, dy = targetGoal.y - h.pos.y, d = Math.hypot(dx,dy);
                if (d > 12) {
                    h.pos.x += (dx/d) * h.maxSpeed;
                    h.pos.y += (dy/d) * h.maxSpeed;
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

console.log('=== Realistic human (base speed, reaction delay) ===');
console.log('Difficulty | RED | BLUE');
for (const diff of ['easy', 'normal', 'hard', 'legend']) {
    const r = testRealistic(diff, 9000);
    console.log(diff.padEnd(10) + ' | ' + String(r.red).padStart(3) + ' | ' + String(r.blue).padStart(4));
}
`;

require('vm').runInContext(code, sandbox, { filename: 'realistic' });
