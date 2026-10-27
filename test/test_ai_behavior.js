const { createSandbox } = require('./harness.js');
const sandbox = createSandbox();

const code = `
const canvas = { width: 1000, height: 650, getContext: () => new Proxy({}, { get: () => (prop) => {
    if (prop === 'createLinearGradient') return () => ({ addColorStop: () => {} });
    return () => {};
}})};

function mkGame() { const g = new Game(canvas); g.startMatch(); return g; }

console.log('=== TEST 1: Support runs when teammate has ball ===');
{
    const g = mkGame();
    const rf = g.teamPlayers.red[2]; // controlled
    const rd = g.teamPlayers.red[1];
    rf.hasBall = true; g.ball.owner = rf; g.ball.pos = rf.pos.clone();
    const rdBefore = rd.pos.clone();
    for (let i = 0; i < 40; i++) g.update(0.016);
    const ahead = (rd.pos.x - rf.pos.x);
    console.log('Defender moved:', rd.pos.dist(rdBefore).toFixed(1), 'px | aiRole:', rd.aiRole, '| ahead:', ahead.toFixed(0));
    console.log('RESULT:', (rd.pos.dist(rdBefore) > 20 && ahead > 0) ? 'PASS' : 'FAIL');
}

console.log('\\n=== TEST 2: NPC returns to defend when opponent has ball ===');
{
    const g = mkGame();
    const rf = g.teamPlayers.red[2];   // controlled - placed close so AI must fall back
    const rd = g.teamPlayers.red[1];
    const bf = g.teamPlayers.blue[2];
    // Blue forward has ball in its own half (won't shoot), human pressing from 100px away
    bf.pos = new Vector2(500, 330); bf.hasBall = true;
    g.ball.owner = bf; g.ball.pos = bf.pos.clone();
    rf.pos = new Vector2(600, 330);   // human within 150 -> AI must fallback
    rd.pos = new Vector2(200, 250);   // defender starts deep
    const ownGoalX = g.field.x;
    const rdBefore = rd.pos.clone();
    for (let i = 0; i < 8; i++) g.update(0.016);
    // defender should now be between ball and own goal and role fallback
    console.log('Defender role:', rd.aiRole, '| pos:', rd.pos.x.toFixed(0), rd.pos.y.toFixed(0));
    console.log('RESULT:', (rd.aiRole === 'fallback' || rd.aiRole === 'defend') ? 'PASS' : 'FAIL(role=' + rd.aiRole + ')');
}

console.log('\\n=== TEST 3: Auto-switch to nearest when opponent holds ball ===');
{
    const g = mkGame();
    const rf = g.teamPlayers.red[2];  // controlled, far
    const rd = g.teamPlayers.red[1];  // nearest
    const bf = g.teamPlayers.blue[2];
    bf.pos = new Vector2(620, 330); bf.hasBall = true;   // far from red goal -> won't shoot right away
    g.ball.owner = bf; g.ball.pos = bf.pos.clone();
    rf.pos = new Vector2(780, 140);   // controlled player far
    rd.pos = new Vector2(500, 330);   // defender much closer
    console.log('dist controlled:', rf.pos.dist(bf.pos).toFixed(0), '| dist defender:', rd.pos.dist(bf.pos).toFixed(0));
    for (let i = 0; i < 6; i++) g.update(0.016);
    console.log('After 6 frames controlled =', g.currentControlledPlayer.role);
    console.log('RESULT:', g.currentControlledPlayer === rd ? 'PASS' : 'FAIL');
}

console.log('\\n=== TEST 4: Control switches when teammate receives a pass ===');
{
    const g = mkGame();
    const rf = g.teamPlayers.red[2]; // controlled
    const rd = g.teamPlayers.red[1];
    rf.hasBall = true; g.ball.owner = rf; g.ball.pos = rf.pos.clone();
    // simulate pass toward defender
    const angle = Math.atan2(rd.pos.y - rf.pos.y, rd.pos.x - rf.pos.x);
    g.ball.vel = Vector2.fromAngle(angle, 16);
    g.ball.hasPhysics = true;
    g.ball.owner = null;
    rf.hasBall = false;
    rf.passCooldown = 0.35;   // as a real pass would set
    let received = false;
    for (let i = 0; i < 80; i++) {
        g.update(0.016);
        if (g.ball.owner === rd) { received = true; break; }
    }
    // allow a couple frames for updateControl
    for (let i = 0; i < 3; i++) g.update(0.016);
    console.log('Received:', received, '| controlled =', g.currentControlledPlayer.role);
    console.log('RESULT:', (received && g.currentControlledPlayer === rd) ? 'PASS' : 'FAIL');
}
`;

require('vm').runInContext(code, sandbox, { filename: 'ai-behavior' });
