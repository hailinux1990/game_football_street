// Test: auto-switch khi bị cướp bóng, nút tranh bóng = nút chuyền ngắn,
// chọc khe và chuyền bóng bổng.
const { createSandbox } = require('./harness.js');
const sandbox = createSandbox();

const code = `
const canvas = { width: 1000, height: 650, getContext: () => new Proxy({}, { get: (t, prop) => {
    if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop: () => {} });
    return () => {};
}})};

function mkGame() { const g = new Game(canvas); g.startMatch(); return g; }

console.log('=== TEST 1: Bị cướp bóng -> mũi tên vàng tự nhảy sang người gần bóng nhất (không cần Q) ===');
{
    const g = mkGame();
    const rf = g.teamPlayers.red[2];   // người chơi đang điều khiển
    const rd = g.teamPlayers.red[1];
    const bf = g.teamPlayers.blue[2];

    // Người chơi cầm bóng ở xa, hậu vệ đỏ ở gần
    rf.pos = new Vector2(760, 150);
    rd.pos = new Vector2(500, 330);
    rf.hasBall = true;
    g.ball.owner = rf;
    g.ball.pos = rf.pos.clone();
    g.currentControlledPlayer = rf;
    rf.aiControlled = false; rf.isControlled = true;

    // Đối phương cướp bóng -> hậu vệ xanh giữ bóng gần hậu vệ đỏ
    bf.pos = new Vector2(520, 330);
    rf.hasBall = false;
    bf.hasBall = true;
    g.ball.owner = bf;
    g.ball.pos = bf.pos.clone();

    const before = g.currentControlledPlayer === rf;
    for (let i = 0; i < 4; i++) g.update(0.016);
    const after = g.currentControlledPlayer;
    console.log('Trước: điều khiển RF =', before, '| Sau 4 frame: điều khiển =', after.role);
    console.log('RESULT:', after === rd ? 'PASS (tự chuyển, không bấm Q)' : 'FAIL');
}

console.log('\\n=== TEST 2: Không có bóng + bấm nút chuyền ngắn (Space) = tranh bóng ===');
{
    const g = mkGame();
    const rf = g.teamPlayers.red[2];
    const bf = g.teamPlayers.blue[2];
    g.currentControlledPlayer = rf;
    rf.aiControlled = false; rf.isControlled = true;
    // Đối thủ giữ bóng ngay trước mặt, chưa có ai che bóng
    bf.pos = new Vector2(420, 330);
    bf.hasBall = true;
    bf.ballProtectTimer = 0;
    g.ball.owner = bf;
    g.ball.pos = bf.pos.clone();
    rf.pos = new Vector2(400, 330);
    rf.hasBall = false;
    rf.tacklePressCd = 0;
    rf.stamina = 100;

    let won = 0;
    for (let attempt = 0; attempt < 12; attempt++) {
        g.ball.owner = bf; bf.hasBall = true; bf.ballProtectTimer = 0; rf.hasBall = false;
        g.ball.pos = bf.pos.clone();
        rf.pos = new Vector2(400, 330);
        rf.tacklePressCd = 0;
        g.input.keysPressed = { Space: true };
        g.update(0.016);
        if (g.ball.owner === rf) won++;
    }
    console.log('Số lần đoạt bóng bằng nút chuyền ngắn (12 lần bấm):', won, '(0 là FAIL)');
    console.log('RESULT:', won > 0 ? 'PASS' : 'FAIL');
}

console.log('\\n=== TEST 3: Chọc khe (R) ===');
{
    const g = mkGame();
    const rf = g.teamPlayers.red[2];
    const rd = g.teamPlayers.red[1];
    g.currentControlledPlayer = rf;
    rf.aiControlled = false; rf.isControlled = true;
    rf.pos = new Vector2(350, 330);
    rd.pos = new Vector2(520, 300);
    rf.hasBall = true; g.ball.owner = rf; g.ball.pos = rf.pos.clone();
    const beforeX = rd.pos.x;
    g.input.keysPressed = { KeyR: true };
    g.update(0.016);
    const ball = g.ball;
    // điểm bóng sẽ tới sau khi bay hết vận tốc
    const travel = ball.vel.mag() / 0.025;
    const endX = ball.pos.x + (ball.vel.x / ball.vel.mag()) * Math.min(travel, 350);
    console.log('Chọc khe: bóng rời chân =', !rf.hasBall, '| tốc độ =', ball.vel.mag().toFixed(1));
    console.log('Điểm đích ước tính x =', endX.toFixed(0), '| người nhận x =', beforeX, '(bóng phải vượt qua người nhận)');
    console.log('RESULT:', (!rf.hasBall && endX > beforeX + 30) ? 'PASS' : 'FAIL');
}

console.log('\\n=== TEST 4: Chuyền bóng bổng (T) -> bóng bay cao rồi hạ xuống ===');
{
    const g = mkGame();
    const rf = g.teamPlayers.red[2];
    const rd = g.teamPlayers.red[1];
    g.currentControlledPlayer = rf;
    rf.aiControlled = false; rf.isControlled = true;
    rf.pos = new Vector2(200, 330);
    rd.pos = new Vector2(700, 250);
    rf.hasBall = true; g.ball.owner = rf; g.ball.pos = rf.pos.clone();
    g.input.keysPressed = { KeyT: true };
    g.update(0.016);
    let maxH = 0, touchedGround = false;
    for (let i = 0; i < 90; i++) {
        g.update(0.016);
        if (g.ball.height > maxH) maxH = g.ball.height;
        if (maxH > 40 && g.ball.height === 0) touchedGround = true;   // đã rơi xuống mặt sân
    }
    console.log('Bóng rời chân:', !rf.hasBall, '| độ cao cực đại =', maxH.toFixed(1));
    console.log('Đã chạm mặt sân sau khi bay:', touchedGround, '| độ cao hiện tại =', g.ball.height.toFixed(1));
    console.log('RESULT:', (maxH > 40 && touchedGround) ? 'PASS' : 'FAIL');
}

console.log('\\n=== TEST 5: Bóng bổng không bị đối phương chặn giữa đường ===');
{
    const g = mkGame();
    const rf = g.teamPlayers.red[2];
    g.currentControlledPlayer = rf;
    rf.aiControlled = false; rf.isControlled = true;
    rf.pos = new Vector2(200, 330);
    rf.hasBall = true; g.ball.owner = rf; g.ball.pos = rf.pos.clone();
    const bd = g.teamPlayers.blue[1];
    bd.pos = new Vector2(400, 330);          // đứng chặn ngay giữa
    g.input.keysPressed = { KeyT: true };
    g.update(0.016);
    let intercepted = false;
    for (let i = 0; i < 25; i++) {
        g.update(0.016);
        if (g.ball.owner === bd) intercepted = true;
    }
    console.log('Bị chặn bởi hậu vệ đứng giữa:', intercepted, '(kỳ vọng false)');
    console.log('RESULT:', intercepted ? 'FAIL' : 'PASS');
}
`;

require('vm').runInContext(code, sandbox, { filename: 'tackle-passes' });
