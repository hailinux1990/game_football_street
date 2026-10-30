// Test: âm thanh bóng đập (chân cầu thủ / cột dọc / xà ngang / lưới)
// và khung thành chuẩn FIFA (kích thước + va chạm cột, xà).
const { createSandbox } = require('./harness.js');
const sandbox = createSandbox();

const code = `
const canvas = { width: 1000, height: 650, getContext: () => new Proxy({}, { get: (t, prop) => {
    if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop: () => {} });
    return () => {};
}})};
function mkGame() { const g = new Game(canvas); g.startMatch(); return g; }
const results = [];
function check(name, ok, detail) {
    results.push({ name, ok });
    console.log((ok ? 'PASS' : 'FAIL') + ' · ' + name + (detail ? '  → ' + detail : ''));
}

console.log('=== 1) KÍCH THƯỚC KHUNG THÀNH CHUẨN FIFA ===');
{
    const g = mkGame();
    const ratio = g.goalBarHeight / g.goalHeight;
    check('Khẩu độ khung thành giữ nguyên 80', g.goalHeight === 80, 'khẩu độ=' + g.goalHeight);
    check('Xà ngang có chiều cao hợp lý (35–48% khẩu độ)', ratio > 0.33 && ratio < 0.5,
        'xà=' + g.goalBarHeight + ' (tỉ lệ ' + ratio.toFixed(2) + ')');
    check('Có độ sâu khung thành + bán kính cột', g.goalDepth > 20 && g.goalPostRadius > 1,
        'sâu=' + g.goalDepth + ', cột r=' + g.goalPostRadius);
}

console.log('\\n=== 2) ÂM THANH VA CHẠM BÓNG THEO TỪNG HÀNH ĐỘNG ===');
{
    const g = mkGame();
    g.audio.init();                       // bật AudioContext mock để chạy thật phần tổng hợp âm
    const calls = [];
    const origImpact = g.audio.ballImpact.bind(g.audio);
    g.audio.ballImpact = (kind, power) => { calls.push(kind); return origImpact(kind, power); };
    const p = g.currentControlledPlayer;
    g._autoSwitchCd = 9999; g._possessSwitchCd = 9999;

    const give = () => { p.pos = new Vector2(400, 330); p.hasBall = true; g.ball.owner = p; g.ball.pos = p.pos.clone(); p.passCooldown = 0; g.ball.height = 0; g.ball.heightVel = 0; };

    give(); g.input.keysPressed = { Space: true }; g.update(0.016);       // chuyền ngắn
    give(); g.input.keysPressed = { KeyR: true }; g.update(0.016);        // chọc khe
    give(); g.input.keysPressed = { KeyT: true }; g.update(0.016);        // chuyền bổng
    give(); g.input.keysPressed = { KeyF: true }; g.update(0.016);        // sút
    check('Chuyền ngắn có tiếng chạm bóng', calls.indexOf('pass') !== -1);
    check('Chọc khe có tiếng chạm bóng', calls.indexOf('through') !== -1);
    check('Chuyền bổng có tiếng chạm bóng', calls.indexOf('loft') !== -1);
    check('Sút có tiếng chạm bóng mạnh', calls.indexOf('shoot') !== -1);

    // Tranh bóng thành công
    const opp = g.teamPlayers.blue[2];
    let tackled = false;
    for (let i = 0; i < 20 && !tackled; i++) {
        opp.pos = new Vector2(420, 330); opp.hasBall = true; opp.ballProtectTimer = 0;
        g.ball.owner = opp; g.ball.pos = opp.pos.clone(); g.ball.vel = new Vector2(0, 0);
        p.pos = new Vector2(404, 330); p.hasBall = false; p.tacklePressCd = 0;
        g.input.keysPressed = { Space: true };
        g.update(0.016);
        if (g.ball.owner === p) tackled = true;
    }
    check('Tranh bóng có tiếng va chạm', tackled && calls.indexOf('tackle') !== -1,
        'tackled=' + tackled + ', kinds=' + calls.join(','));

    // Nhặt bóng tự do -> tiếng chạm nhẹ
    const before = calls.length;
    g.ball.owner = null; p.hasBall = false; p.passCooldown = 0;
    g.ball.pos = p.pos.clone(); g.ball.vel = new Vector2(0, 0); g.ball.height = 0;
    g.updateBall(0.016);
    check('Nhặt bóng tự do có tiếng chạm nhẹ', calls.slice(before).indexOf('touch') !== -1,
        'mới: ' + calls.slice(before).join(','));

    // Không ném lỗi với mọi loại âm thanh
    let err = null;
    try {
        ['touch','pass','through','loft','shoot','tackle','gk','head'].forEach(k => origImpact(k, 1));
        g.audio.playPost();
        g.audio.playCrossbar();
        g.audio.playNet();
        g.audio.playKick();
        g.audio.playHit();
    } catch (e) { err = e.message; }
    check('Tổng hợp âm thanh không lỗi', !err, err || 'ok');
}

console.log('\\n=== 3) BÓNG ĐẬP CỘT DỌC ===');
{
    const g = mkGame();
    g.audio.init();
    let postHits = 0, bars = 0, nets = 0;
    g.audio.playPost = () => { postHits++; };
    g.audio.playCrossbar = () => { bars++; };
    g.audio.playNet = () => { nets++; };

    const f = g.field;
    const cz = f.y + f.height / 2;
    const goalHalf = g.goalHeight / 2;
    // Bóng bay vào đúng cột phải (góc trên khẩu độ)
    g.ball.owner = null;
    g.ball.height = 0; g.ball.heightVel = 0;
    g.ball.pos = new Vector2(f.x + f.width - 10, cz - goalHalf);
    g.ball.vel = new Vector2(18, 0);
    g.state = 'playing';
    for (let i = 0; i < 6; i++) g.updateBall(0.016);
    check('Bóng đập cột dọc → kêu "keng"', postHits > 0, 'post=' + postHits + ', ball=(' + g.ball.pos.x.toFixed(0) + ',' + g.ball.pos.y.toFixed(0) + ')');
    check('Bóng dội lại, không vào lưới', nets === 0 && g.ball.vel.x < 0, 'vel.x=' + g.ball.vel.x.toFixed(1));
    check('Bóng không bị bắn ra ngoài sân',
        g.ball.pos.x > f.x && g.ball.pos.x < f.x + f.width &&
        g.ball.pos.y > f.y && g.ball.pos.y < f.y + f.height,
        'x=' + g.ball.pos.x.toFixed(0) + ' y=' + g.ball.pos.y.toFixed(0));
}

console.log('\\n=== 4) BÓNG ĐẬP XÀ NGANG (không tính bàn) ===');
{
    const g = mkGame();
    g.audio.init();
    let bars = 0, nets = 0;
    g.audio.playCrossbar = () => { bars++; };
    g.audio.playNet = () => { nets++; };

    const f = g.field;
    const cz = f.y + f.height / 2;
    const barH = g.goalBarHeight;
    g.ball.owner = null;
    // bay tới vạch khung thành ở đúng tầm xà
    g.ball.height = (barH - g.ball.radius) / 0.8;   // tâm bóng ~ ngang xà
    g.ball.heightVel = 0;
    g.ball.pos = new Vector2(f.x + f.width - 6, cz);
    g.ball.vel = new Vector2(20, 0);
    g.state = 'playing';
    for (let i = 0; i < 5; i++) { g.updateBall(0.016); g.checkGoal(); }
    check('Bóng đập xà ngang → kêu tiếng kim loại', bars > 0, 'bar=' + bars);
    check('Đập xà không tính bàn thắng', nets === 0 && g.redScore === 0, 'score=' + g.redScore);
}

console.log('\\n=== 5) BÓNG VƯỢT XÀ KHÔNG TÍNH BÀN ===');
{
    const g = mkGame();
    g.audio.init();
    let nets = 0;
    g.audio.playNet = () => { nets++; };
    const f = g.field;
    const cz = f.y + f.height / 2;
    g.ball.owner = null;
    g.ball.pos = new Vector2(f.x + f.width - 20, cz);
    g.ball.vel = new Vector2(30, 0);
    g.ball.height = 90;          // bay rất cao, qua đầu xà
    g.ball.heightVel = 0;
    g.state = 'playing';
    for (let i = 0; i < 8; i++) { g.updateBall(0.016); g.checkGoal(); }
    check('Bóng bay cao vượt xà không tính bàn', g.redScore === 0 && nets === 0, 'score=' + g.redScore);
}

console.log('\\n=== 6) BÓNG VÀO ĐÚNG KHUNG THÀNH VẪN TÍNH BÀN + TIẾNG LƯỚI ===');
{
    const g = mkGame();
    g.audio.init();
    let nets = 0;
    g.audio.playNet = () => { nets++; };
    const f = g.field;
    const cz = f.y + f.height / 2;
    g.ball.owner = null;
    g.ball.pos = new Vector2(f.x + f.width - 6, cz + 10);
    g.ball.vel = new Vector2(22, 0);
    g.ball.height = 0; g.ball.heightVel = 0;
    g.state = 'playing';
    for (let i = 0; i < 6; i++) { g.updateBall(0.016); g.checkGoal(); }
    check('Bóng vào giữa khung thành → tính bàn', g.redScore === 1, 'score=' + g.redScore);
    check('Có tiếng lưới rung khi vào bàn', nets > 0, 'nets=' + nets);
}

const failed = results.filter(r => !r.ok).length;
console.log('\\n--- Tổng: ' + results.length + ' kiểm tra, ' + failed + ' thất bại ---');
`;

require('vm').runInContext(code, sandbox, { filename: 'ball-sounds' });
