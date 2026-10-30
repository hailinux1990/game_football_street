// Test: chế độ 2 NGƯỜI CHƠI với 2 tay cầm PS5
// - P1 điều khiển đội Đỏ, P2 điều khiển đội Xanh (đối kháng) hoặc cùng đội Đỏ (đồng đội)
// - Mỗi người có input riêng (tay cầm riêng), không giẫm chân nhau
const { createSandbox } = require('./harness.js');
const sandbox = createSandbox();

const code = `
const canvas = { width: 1000, height: 650, getContext: () => new Proxy({}, { get: () => () => {} }) };

// ===== Mock 2 tay cầm PS5 =====
function makePad(index) {
    const pad = {
        id: 'DualSense Wireless Controller #' + (index + 1),
        index, connected: true, mapping: 'standard',
        axes: [0, 0, 0, 0], buttons: []
    };
    for (let i = 0; i < 18; i++) pad.buttons.push({ pressed: false, value: 0 });
    return pad;
}
const pad1 = makePad(0);
const pad2 = makePad(1);
let padsConnected = [pad1, pad2];
navigator.getGamepads = function () { return padsConnected; };

const results = [];
function check(name, ok, detail) {
    results.push({ name, ok });
    console.log((ok ? 'PASS' : 'FAIL') + ' · ' + name + (detail ? '  → ' + detail : ''));
}

function mkGame(mode) {
    const g = new Game(canvas);
    g.startMatch();
    g.input.pollGamepad();        // nhận tay cầm trước
    if (mode) g.setPlayMode(mode);
    g.input.pollGamepad();
    g._autoSwitchCd = 0; g._possessSwitchCd = 0;
    return g;
}
function press(pad, i) { pad.buttons[i].pressed = true; }
function release(pad, i) { pad.buttons[i].pressed = false; }
function tick(g, n) { for (let i = 0; i < n; i++) { g.input.pollGamepad(); g.update(0.016); g.input.update(); } }

console.log('=== 1) NHẬN DIỆN 2 TAY CẦM ===');
{
    const g = new Game(canvas);
    g.startMatch();
    g.input.pollGamepad();
    check('Đếm được 2 tay cầm', g.input.padCount === 2, 'padCount=' + g.input.padCount);
    check('Tay cầm chính là #1 (P1)', g.input.padIndexes()[0] === 0, 'pads=' + JSON.stringify(g.input.padIndexes()));
    check('Nhận đúng tay cầm thứ 2 cho P2', g.input.secondPadIndex() === 1, 'secondPad=' + g.input.secondPadIndex());
    check('Mặc định là chế độ 1 người', g.playMode === '1p', 'mode=' + g.playMode);
}

console.log('\\n=== 2) CHẾ ĐỘ ĐỐI KHÁNG: P1 Đỏ vs P2 Xanh ===');
{
    const g = mkGame('2p_vs');
    check('Bật chế độ 2 người đối kháng', g.playMode === '2p_vs', g.playMode);
    check('Có 2 nguồn điều khiển', g.controls.length === 2, 'controls=' + g.controls.length);
    const c1 = g.controls[0], c2 = g.controls[1];
    check('P1 điều khiển cầu thủ đội ĐỎ', c1.player && c1.player.team === 'red', c1.player ? c1.player.team + '/' + c1.player.role : 'none');
    check('P2 điều khiển cầu thủ đội XANH', c2.player && c2.player.team === 'blue', c2.player ? c2.player.team + '/' + c2.player.role : 'none');
    check('P2 dùng tay cầm thứ 2', c2.getPadIndex() === 1, 'padIndex=' + c2.getPadIndex());
    check('P2 đã sẵn sàng (có tay cầm)', g.isPlayer2Ready(), 'ready=' + g.isPlayer2Ready());
    check('P2 là tiền đạo đội Xanh', c2.player.role === 'forward', c2.player.role);
    check('Cả 2 cầu thủ không do AI điều khiển',
        c1.player.aiControlled === false && c2.player.aiControlled === false,
        'ai1=' + c1.player.aiControlled + ' ai2=' + c2.player.aiControlled);
}

console.log('\\n=== 3) INPUT RIÊNG: P2 bấm nút thì chỉ P2 chạy ===');
{
    const g = mkGame('2p_vs');
    g.input.pollGamepad();
    const p1 = g.controls[0].player, p2 = g.controls[1].player;
    // P2 đẩy cần trái sang phải
    pad2.axes[0] = 1.0;
    const p1x = p1.pos.x, p2x = p2.pos.x;
    tick(g, 20);
    pad2.axes[0] = 0;
    check('P2 di chuyển khi đẩy cần tay cầm #2', Math.abs(p2.pos.x - p2x) > 20,
        'P2 x: ' + p2x.toFixed(0) + ' → ' + p2.pos.x.toFixed(0));
    check('P1 KHÔNG bị ảnh hưởng bởi tay cầm của P2', Math.abs(p1.pos.x - p1x) < 3,
        'P1 x: ' + p1x.toFixed(0) + ' → ' + p1.pos.x.toFixed(0));

    // P1 dùng bàn phím vẫn chạy được
    const p1x2 = p1.pos.x;
    g.input.keys['KeyD'] = true;
    for (let i = 0; i < 20; i++) { g.input.pollGamepad(); g.update(0.016); g.input.update(); }
    g.input.keys['KeyD'] = false;
    check('P1 vẫn điều khiển bằng bàn phím', Math.abs(p1.pos.x - p1x2) > 20,
        'P1 x: ' + p1x2.toFixed(0) + ' → ' + p1.pos.x.toFixed(0));
}

console.log('\\n=== 4) P2 SÚT / CHUYỀN BẰNG TAY CẦM #2 ===');
{
    const g = mkGame('2p_vs');
    g.input.pollGamepad();
    const p2 = g.controls[1].player;
    // cho P2 bóng
    p2.hasBall = true; g.ball.owner = p2; g.ball.pos = p2.pos.clone(); p2.passCooldown = 0;
    press(pad2, 2);                 // □ Square = sút
    g.input.pollGamepad();
    g.update(0.016);
    release(pad2, 2);
    check('P2 sút bóng bằng nút □ trên tay cầm #2', !p2.hasBall && g.ball.vel.mag() > 10,
        'hasBall=' + p2.hasBall + ' vel=' + g.ball.vel.mag().toFixed(1));
    check('Pha sút của P2 ghi nhận người sút', g._lastShooter === p2,
        g._lastShooter ? (g._lastShooter.team + '/' + g._lastShooter.role) : 'none');
}

console.log('\\n=== 5) CHẾ ĐỘ ĐỒNG ĐỘI: 2 người cùng đội Đỏ ===');
{
    const g = mkGame('2p_coop');
    check('Bật chế độ đồng đội', g.playMode === '2p_coop', g.playMode);
    const c1 = g.controls[0], c2 = g.controls[1];
    check('Cả 2 cùng đội ĐỎ', c1.player.team === 'red' && c2.player.team === 'red',
        c1.player.role + ' + ' + c2.player.role);
    check('2 người điều khiển 2 cầu thủ khác nhau', c1.player !== c2.player,
        c1.player === c2.player ? 'TRÙNG' : 'ok');
    check('P2 không phải thủ môn', c2.player.role !== 'goalkeeper', c2.player.role);
}

console.log('\\n=== 6) TỰ ĐỘNG ĐỔI NGƯỜI KHÔNG CƯỚP CẦU THỦ CỦA NHAU ===');
{
    const g = mkGame('2p_coop');
    const c1 = g.controls[0], c2 = g.controls[1];
    const gk = g.teamPlayers.red[0];
    // Đồng đội (GK) giữ bóng -> auto-switch
    gk.hasBall = true; g.ball.owner = gk; g.ball.pos = gk.pos.clone();
    gk.pos = new Vector2(g.field.x + 40, g.field.y + g.field.height / 2);
    for (let i = 0; i < 30; i++) g.update(0.016);
    check('Không auto-switch sang thủ môn', c1.player.role !== 'goalkeeper' && c2.player.role !== 'goalkeeper',
        'P1=' + c1.player.role + ' P2=' + c2.player.role);
    check('Hai người chơi vẫn điều khiển 2 cầu thủ khác nhau', c1.player !== c2.player,
        c1.player.role + ' / ' + c2.player.role);
}

console.log('\\n=== 7) ĐỔI CẦU THỦ RIÊNG (Q cho P1, △ cho P2) ===');
{
    const g = mkGame('2p_vs');
    g.input.pollGamepad();
    const c1 = g.controls[0], c2 = g.controls[1];
    const before1 = c1.player, before2 = c2.player;
    g.input.keysPressed = { KeyQ: true };      // P1 đổi người (bàn phím)
    g.update(0.016);
    check('P1 đổi cầu thủ bằng Q', c1.player !== before1, before1.role + ' → ' + c1.player.role);
    check('Đổi người của P1 không ảnh hưởng P2', c2.player === before2, 'P2 vẫn là ' + c2.player.role);

    press(pad2, 3);                            // △ Triangle = đổi người của P2
    g.input.pollGamepad();
    g.update(0.016);
    release(pad2, 3);
    check('P2 đổi cầu thủ bằng nút △ tay cầm #2', c2.player !== before2, before2.role + ' → ' + c2.player.role);
    check('P2 luôn điều khiển cầu thủ đội Xanh', c2.player.team === 'blue', c2.player.team);
}

console.log('\\n=== 8) THIẾU TAY CẦM THỨ 2 ===');
{
    padsConnected = [pad1];                     // chỉ còn 1 tay cầm
    const g = mkGame('2p_vs');
    g.input.pollGamepad();
    check('Nhận biết chỉ có 1 tay cầm', g.input.padCount === 1, 'padCount=' + g.input.padCount);
    check('P2 chưa sẵn sàng (thiếu tay cầm)', g.isPlayer2Ready() === false, 'ready=' + g.isPlayer2Ready());
    // game vẫn chạy bình thường, P1 vẫn điều khiển được
    const p1 = g.controls[0].player;
    const x0 = p1.pos.x;
    g.input.keys['KeyD'] = true;
    for (let i = 0; i < 20; i++) { g.input.pollGamepad(); g.update(0.016); g.input.update(); }
    g.input.keys['KeyD'] = false;
    check('Vẫn chơi được khi thiếu tay cầm #2', Math.abs(p1.pos.x - x0) > 20 && g.state === 'playing',
        'P1 di chuyển ' + Math.abs(p1.pos.x - x0).toFixed(0) + 'px, state=' + g.state);
    check('Cầu thủ của P2 do AI điều khiển khi thiếu tay cầm',
        g.controls[1].player.aiControlled === true, 'ai=' + g.controls[1].player.aiControlled);
    padsConnected = [pad1, pad2];               // trả lại 2 tay cầm
}

console.log('\\n=== 9) LƯU CÀI ĐẶT CHẾ ĐỘ CHƠI ===');
{
    const g = mkGame('2p_coop');
    check('Lưu chế độ chơi vào localStorage', localStorage.getItem('sf_play_mode') === '2p_coop',
        'saved=' + localStorage.getItem('sf_play_mode'));
    const g2 = new Game(canvas);
    g2.startMatch();
    check('Trận mới giữ nguyên chế độ 2 người', g2.playMode === '2p_coop' && g2.controls.length === 2,
        'mode=' + g2.playMode + ' controls=' + g2.controls.length);
    check('Trận mới: P1 + P2 vẫn ở 2 cầu thủ khác nhau',
        g2.controls[0].player !== g2.controls[1].player,
        g2.controls[0].player.role + ' / ' + g2.controls[1].player.role);
}

console.log('\\n=== 10) VỀ CHẾ ĐỘ 1 NGƯỜI ===');
{
    const g = new Game(canvas);
    g.startMatch();
    g.setPlayMode('1p');
    check('Chuyển về 1 người chơi', g.playMode === '1p' && g.controls.length === 1,
        'mode=' + g.playMode + ' controls=' + g.controls.length);
    check('Không còn P2', g.player2 === null, 'player2=' + g.player2);
    const p1 = g.controls[0].player;
    const x0 = p1.pos.x;
    g.input.keys['KeyD'] = true;
    for (let i = 0; i < 20; i++) { g.input.pollGamepad(); g.update(0.016); g.input.update(); }
    g.input.keys['KeyD'] = false;
    check('Chế độ 1 người vẫn chơi bình thường', Math.abs(p1.pos.x - x0) > 20,
        'di chuyển ' + Math.abs(p1.pos.x - x0).toFixed(0) + 'px');
}

const failed = results.filter(r => !r.ok).length;
console.log('\\n--- Tổng: ' + results.length + ' kiểm tra, ' + failed + ' thất bại ---');
`;

require('vm').runInContext(code, sandbox, { filename: '2players' });
