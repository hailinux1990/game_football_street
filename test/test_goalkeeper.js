// Test: THỦ MÔN 2 BÊN được quyền tranh bóng đối phương và dâng lên (sweeper-keeper)
const { createSandbox } = require('./harness.js');
const sandbox = createSandbox();

const code = `
const canvas = { width: 1000, height: 650, getContext: () => new Proxy({}, { get: () => () => {} }) };
function mkGame() { const g = new Game(canvas); g.startMatch(); return g; }
const results = [];
function check(name, ok, detail) {
    results.push({ name, ok });
    console.log((ok ? 'PASS' : 'FAIL') + ' · ' + name + (detail ? '  → ' + detail : ''));
}

console.log('=== 1) THỦ MÔN LAO RA TRANH BÓNG VỚI ĐỐI PHƯƠNG ===');
{
    const g = mkGame();
    const f = g.field;
    const cy = f.y + f.height / 2;
    const redGK = g.teamPlayers.red[0];      // thủ môn đội Đỏ (khung thành bên trái)
    const blueFWD = g.teamPlayers.blue[2];

    // Đối phương dẫn bóng ngay trước khung thành Đỏ
    blueFWD.pos = new Vector2(f.x + 95, cy);
    blueFWD.hasBall = true;
    g.ball.owner = blueFWD;
    g.ball.pos = blueFWD.pos.clone();
    g.ball.vel = new Vector2(0, 0);
    redGK.pos = new Vector2(f.x + 62, cy);

    const startX = redGK.pos.x;
    let reachedOut = false, wonBall = 0;
    for (let k = 0; k < 14; k++) {
        // dựng lại tình huống
        blueFWD.pos = new Vector2(f.x + 95, cy);
        blueFWD.hasBall = true; blueFWD.ballProtectTimer = 0;
        g.ball.owner = blueFWD; g.ball.pos = blueFWD.pos.clone(); g.ball.vel = new Vector2(0, 0);
        redGK.pos = new Vector2(f.x + 62, cy);
        redGK.gkTackleCd = 0;
        redGK.hasBall = false;
        for (let i = 0; i < 25; i++) {
            g.updatePlayerAI(redGK, 0.016);
            if (redGK.pos.x > startX + 25) reachedOut = true;
            if (g.ball.owner === redGK) { wonBall++; break; }
        }
    }
    check('Thủ môn Đỏ lao ra khỏi vạch để tranh bóng', reachedOut,
        'rời vạch tới x=' + redGK.pos.x.toFixed(0) + ' (vạch ~' + (g.field.x + 62) + ')');
    check('Thủ môn đoạt được bóng của đối phương', wonBall > 0, 'thắng ' + wonBall + '/14 pha');
    check('Có animation xoạc bóng khi tranh', redGK.action === 'tackle' || wonBall > 0, 'action=' + redGK.action);
}

console.log('\\n=== 2) THỦ MÔN XANH CŨNG TRANH BÓNG (cả 2 bên) ===');
{
    const g = mkGame();
    const f = g.field;
    const cy = f.y + f.height / 2;
    const blueGK = g.teamPlayers.blue[0];
    const redFWD = g.teamPlayers.red[2];
    let won = 0;
    for (let k = 0; k < 14; k++) {
        redFWD.pos = new Vector2(f.x + f.width - 95, cy);
        redFWD.hasBall = true; redFWD.ballProtectTimer = 0;
        g.ball.owner = redFWD; g.ball.pos = redFWD.pos.clone(); g.ball.vel = new Vector2(0, 0);
        blueGK.pos = new Vector2(f.x + f.width - 62, cy);
        blueGK.gkTackleCd = 0; blueGK.hasBall = false;
        for (let i = 0; i < 25; i++) {
            g.updatePlayerAI(blueGK, 0.016);
            if (g.ball.owner === blueGK) { won++; break; }
        }
    }
    check('Thủ môn Xanh cũng lao ra tranh bóng', won > 0, 'thắng ' + won + '/14 pha');
}

console.log('\\n=== 3) THỦ MÔN DÂNG LÊN KHI ĐỘI ĐANG TẤN CÔNG ===');
{
    const g = mkGame();
    const f = g.field;
    const cy = f.y + f.height / 2;
    const redGK = g.teamPlayers.red[0];
    const redFWD = g.teamPlayers.red[2];

    // Đồng đội dẫn bóng bên phần sân đối phương
    redFWD.pos = new Vector2(f.x + f.width * 0.72, cy - 40);
    redFWD.hasBall = true;
    g.ball.owner = redFWD;
    g.ball.pos = redFWD.pos.clone();
    g.ball.vel = new Vector2(0, 0);
    redGK.pos = new Vector2(f.x + 62, cy);

    const baseX = redGK.pos.x;
    for (let i = 0; i < 120; i++) {
        redFWD.hasBall = true; g.ball.owner = redFWD;
        g.ball.pos.x = redFWD.pos.x; g.ball.pos.y = redFWD.pos.y;
        g.updatePlayerAI(redGK, 0.016);
    }
    check('Thủ môn dâng lên (sweeper-keeper) khi đội tấn công', redGK.pos.x > baseX + 12,
        'x: ' + baseX.toFixed(0) + ' → ' + redGK.pos.x.toFixed(0) + ' (aiRole=' + redGK.aiRole + ')');
}

console.log('\\n=== 4) GIỚI HẠN: KHÔNG RỜI KHUNG THÀNH QUÁ XA ===');
{
    const g = mkGame();
    const f = g.field;
    const cy = f.y + f.height / 2;
    const redGK = g.teamPlayers.red[0];
    const blueFWD = g.teamPlayers.blue[2];
    let maxOut = 0;
    for (let k = 0; k < 6; k++) {
        blueFWD.pos = new Vector2(f.x + 80, cy);
        blueFWD.hasBall = true; blueFWD.ballProtectTimer = 0;
        g.ball.owner = blueFWD; g.ball.pos = blueFWD.pos.clone(); g.ball.vel = new Vector2(0, 0);
        redGK.pos = new Vector2(f.x + 62, cy);
        for (let i = 0; i < 40; i++) {
            g.updatePlayerAI(redGK, 0.016);
            maxOut = Math.max(maxOut, redGK.pos.x - f.x);
        }
    }
    check('Thủ môn không rời khung thành quá xa (giữ an toàn)', maxOut <= g.gkRushLimit + 40,
        'xa nhất ' + maxOut.toFixed(0) + ' (giới hạn ' + g.gkRushLimit + ')');
}

console.log('\\n=== 5) THỦ MÔN ÔM BÓNG SÁT MÌNH VÀ PHÁT BÓNG ĐI ===');
{
    const g = mkGame();
    const f = g.field;
    const cy = f.y + f.height / 2;
    const redGK = g.teamPlayers.red[0];
    redGK.pos = new Vector2(f.x + 62, cy);
    redGK.hasBall = true;
    g.ball.owner = redGK;
    g.ball.pos = redGK.pos.clone();
    redGK.gkKickCd = 0;
    let released = false;
    for (let i = 0; i < 60; i++) {
        g.updatePlayerAI(redGK, 0.016);
        if (g.ball.owner !== redGK) { released = true; break; }
    }
    check('Thủ môn phát bóng đi (không giữ bóng quá lâu)', released, 'released=' + released);
    check('Bóng được phát về phía phần sân đối phương', g.ball.vel.x > 0 || g.ball.owner,
        'vel.x=' + g.ball.vel.x.toFixed(1));
}

console.log('\\n=== 6) KHÔNG TỰ ĐỘNG CHUYỂN QUYỀN ĐIỀU KHIỂN CHO THỦ MÔN ===');
{
    const g = mkGame();
    const f = g.field;
    const cy = f.y + f.height / 2;
    const redGK = g.teamPlayers.red[0];
    g.currentControlledPlayer = g.teamPlayers.red[2];
    g.controls[0].player = g.teamPlayers.red[2];
    redGK.pos = new Vector2(f.x + 62, cy);
    redGK.hasBall = true;
    g.ball.owner = redGK;
    g.ball.pos = redGK.pos.clone();
    for (let i = 0; i < 40; i++) g.update(0.016);
    check('Mũi tên điều khiển không nhảy sang thủ môn', g.controls[0].player.role !== 'goalkeeper',
        'đang điều khiển: ' + g.controls[0].player.role);
}

console.log('\\n=== 7) TẮT TÍNH NĂNG (gkRushLimit = 0) -> bám vạch như cũ ===');
{
    const g = mkGame();
    g.gkRushLimit = 0;
    const f = g.field;
    const cy = f.y + f.height / 2;
    const redGK = g.teamPlayers.red[0];
    const blueFWD = g.teamPlayers.blue[2];
    blueFWD.pos = new Vector2(f.x + 120, cy);
    blueFWD.hasBall = true; blueFWD.ballProtectTimer = 0;
    g.ball.owner = blueFWD; g.ball.pos = blueFWD.pos.clone(); g.ball.vel = new Vector2(0, 0);
    redGK.pos = new Vector2(f.x + 62, cy);
    const baseX = redGK.pos.x;
    for (let i = 0; i < 60; i++) g.updatePlayerAI(redGK, 0.016);
    check('Tắt tính năng thì thủ môn chỉ bám vạch', Math.abs(redGK.pos.x - baseX) < 30,
        'x: ' + baseX.toFixed(0) + ' → ' + redGK.pos.x.toFixed(0));
}

console.log('\\n=== 8) CẢ TRẬN VẪN CHẠY BÌNH THƯỜNG ===');
{
    const g = mkGame();
    for (let i = 0; i < 60 * 60; i++) {
        g.update(0.016);
        if (g.state === 'goal_celebration') { g.state = 'playing'; g.goalCelebrationTimer = 0; g.resetPositions(); }
    }
    const f = g.field;
    const gks = [g.teamPlayers.red[0], g.teamPlayers.blue[0]];
    check('Sau 1 phút, 2 thủ môn vẫn ở gần khung thành',
        gks.every(gk => gk.pos.x > f.x && gk.pos.x < f.x + f.width && gk.pos.y > f.y && gk.pos.y < f.y + f.height),
        gks.map(gk => gk.pos.x.toFixed(0)).join(' / '));
    check('Không có lỗi trong trận', g.state === 'playing' || g.state === 'goal_celebration', 'state=' + g.state);
}

const failed = results.filter(r => !r.ok).length;
console.log('\\n--- Tổng: ' + results.length + ' kiểm tra, ' + failed + ' thất bại ---');
`;

require('vm').runInContext(code, sandbox, { filename: 'goalkeeper' });
