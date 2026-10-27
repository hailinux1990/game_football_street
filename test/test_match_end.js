const { createSandbox } = require('./harness.js');
const sandbox = createSandbox();

const code = `
const canvas = { width: 1000, height: 650, getContext: () => new Proxy({}, { get: () => (prop) => {
    if (prop === 'createLinearGradient') return () => ({ addColorStop: () => {} });
    return () => {};
}})};

const game = new Game(canvas);
game.startMatch();
console.log('Start: state=' + game.state + ' timer=' + game.matchTimer);

// Fast-forward timer
game.matchTimer = 0.5;
let states = [];
for (let i = 0; i < 100; i++) {
    game.update(0.016);
    states.push(game.state);
}
console.log('After timer expiry: state=' + game.state);
console.log('Timer:', game.matchTimer.toFixed(2));
console.log('Scores: RED', game.redScore, '- BLUE', game.blueScore);

// Verify match end presentation was called (no crash)
const endEl = document.getElementById('match-end');
console.log('Match end element hidden class:', endEl.classList ? 'mocked' : 'missing');

// Test restart
game.startMatch();
console.log('After restart: state=' + game.state + ' timer=' + game.matchTimer + ' scores=' + game.redScore + '-' + game.blueScore);

// Test pause state
game.state = GameState.PAUSED;
console.log('Paused state:', game.state);
`;

try {
    require('vm').runInContext(code, sandbox, { filename: 'match-end' });
} catch (e) {
    console.log('ERROR:', e.message);
    console.log(e.stack.split('\n').slice(0, 5).join('\n'));
}
