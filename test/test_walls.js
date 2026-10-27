const { createSandbox } = require('./harness.js');
const sandbox = createSandbox();

const code = `
const canvas = { width: 1000, height: 650, getContext: () => new Proxy({}, { get: () => (prop) => {
    if (prop === 'createLinearGradient') return () => ({ addColorStop: () => {} });
    return () => {};
}})};

const g = new Game(canvas);
g.startMatch();

// Test ball bouncing off walls
function testBounce(vx, vy, label) {
    g.ball.pos = new Vector2(460, 330);
    g.ball.vel = new Vector2(vx, vy);
    g.ball.hasPhysics = true;
    g.ball.owner = null;
    let escaped = false;
    let bounces = 0;
    let lastVx = vx, lastVy = vy;
    for (let i = 0; i < 300; i++) {
        g.update(0.016);
        if (g.ball.pos.x < 50 || g.ball.pos.x > 870 || g.ball.pos.y < 70 || g.ball.pos.y > 590) {
            escaped = true;
        }
        if ((lastVx > 0 && g.ball.vel.x < 0) || (lastVx < 0 && g.ball.vel.x > 0)) bounces++;
        lastVx = g.ball.vel.x;
        lastVy = g.ball.vel.y;
    }
    console.log(label + ': escaped=' + escaped + ' bounces=' + bounces + ' final=(' + g.ball.pos.x.toFixed(0) + ',' + g.ball.pos.y.toFixed(0) + ')');
}

testBounce(20, 0, 'Right fast');
testBounce(-20, 0, 'Left fast');
testBounce(0, 20, 'Down fast');
testBounce(0, -20, 'Up fast');
testBounce(15, 10, 'Diagonal');
testBounce(25, 25, 'Very fast diagonal');

// Test ball stays in field boundaries
console.log('\\nField bounds: x=' + g.field.x + '-' + (g.field.x + g.field.width) + ', y=' + g.field.y + '-' + (g.field.y + g.field.height));
`;

require('vm').runInContext(code, sandbox, { filename: 'walls' });
