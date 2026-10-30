// Test: bình luận viên tiếng Việt (phụ đề + giọng đọc Web Speech)
const { createSandbox } = require('./harness.js');
const sandbox = createSandbox();

const code = `
const canvas = { width: 1000, height: 650, getContext: () => new Proxy({}, { get: () => () => {} }) };
function mkGame() {
    const g = new Game(canvas);
    g.startMatch();
    return g;
}
const results = [];
function check(name, ok, detail) {
    results.push({ name, ok });
    console.log((ok ? 'PASS' : 'FAIL') + ' · ' + name + (detail ? '  → ' + detail : ''));
}
const synth = window.speechSynthesis;
const spoken = synth.spoken;

console.log('=== 1) KHỞI TẠO BÌNH LUẬN VIÊN ===');
{
    const g = mkGame();
    check('Có bình luận viên', !!g.commentary, g.commentary ? 'ok' : 'thiếu');
    check('Bật sẵn khi vào trận', g.commentary.enabled === true, 'enabled=' + g.commentary.enabled);
    check('Tìm thấy giọng tiếng Việt', g.commentary.hasVietnameseVoice(),
        g.commentary.voiceName());
}

console.log('\\n=== 2) GIAO BÓNG: TRỌNG TÀI THỔI CÒI + BÌNH LUẬN ===');
{
    const g = mkGame();
    spoken.length = 0;
    g.beginMatch();
    for (let i = 0; i < 130; i++) g.update(0.016);
    const has = g.commentary.history.some(h => h.kind === 'kickoff');
    check('Có câu bình luận khi bắt đầu trận', has, g.commentary.history.filter(h => h.kind === 'kickoff').map(h => h.text)[0] || '');
    check('Đã đọc bằng giọng tiếng Việt', spoken.length > 0 && spoken[0].lang === 'vi-VN',
        spoken.length ? ('lang=' + spoken[0].lang) : 'không đọc');
}

console.log('\\n=== 3) BÀN THẮNG: BÌNH LUẬN CÓ ĐỘI + TỶ SỐ ===');
{
    const g = mkGame();
    g.commentary.minGap = 0;
    spoken.length = 0;
    g.ball.pos = new Vector2(g.field.x + g.field.width - 12, g.field.y + g.field.height / 2);
    g.checkGoal();
    const goalLine = g.commentary.history.filter(h => h.kind === 'goal').pop();
    check('Có câu bình luận bàn thắng', !!goalLine, goalLine ? goalLine.text : 'thiếu');
    check('Câu bàn thắng nêu đúng đội ghi bàn', !!goalLine && /ĐỎ/.test(goalLine.text), goalLine ? goalLine.text.slice(0, 40) : '');
    check('Câu bàn thắng có tỷ số', !!goalLine && /\\d+[^\\d]+\\d+/.test(goalLine.text) || !!goalLine && /1|0/.test(goalLine.text), 'ok');
    check('Bàn thắng được đọc ngay (ưu tiên cao)', spoken.some(u => /VÀO|BÀN THẮNG/.test(u.text)),
        spoken.map(u => u.text.slice(0, 24)).join(' | '));
}

console.log('\\n=== 4) CÁC TÌNH HUỐNG TRONG TRẬN ===');
{
    const g = mkGame();
    g.commentary.minGap = 0;
    const p = g.currentControlledPlayer;
    g._autoSwitchCd = 9999; g._possessSwitchCd = 9999;

    // Chọc khe
    g.ball.pos = p.pos.clone(); p.hasBall = true; g.ball.owner = p; p.passCooldown = 0;
    g.input.keysPressed = { KeyR: true };
    g.update(0.016);
    const through = g.commentary.history.filter(h => h.kind === 'through').pop();
    check('Bình luận khi chọc khe', !!through, through ? through.text : 'thiếu');

    // Chuyền bóng bổng
    g.ball.pos = p.pos.clone(); p.hasBall = true; g.ball.owner = p; p.passCooldown = 0; g.ball.height = 0;
    g.input.keysPressed = { KeyT: true };
    g.update(0.016);
    const loft = g.commentary.history.filter(h => h.kind === 'loft').pop();
    check('Bình luận khi chuyền bóng bổng', !!loft, loft ? loft.text : 'thiếu');

    // Sút
    g.ball.pos = p.pos.clone(); p.hasBall = true; g.ball.owner = p; p.passCooldown = 0; g.ball.height = 0;
    g.input.keysPressed = { KeyF: true };
    g.update(0.016);
    const shot = g.commentary.history.filter(h => h.kind === 'shot').pop();
    check('Bình luận khi sút', !!shot, shot ? shot.text : 'thiếu');
    check('Đánh dấu pha bóng đang bay (để nhận diện cứu thua)', !!g._shotInFlight, 'shotInFlight=' + !!g._shotInFlight);

    // Thủ môn cứu thua
    const gk = g.teamPlayers.blue[0];
    gk.hasBall = true; g.ball.owner = gk; g.ball.pos = gk.pos.clone(); gk.gkKickCd = 1;
    g.updatePlayerAI(gk, 0.016);
    const save = g.commentary.history.filter(h => h.kind === 'save').pop();
    check('Bình luận khi thủ môn cứu thua', !!save, save ? save.text : 'thiếu');

    // Tranh bóng thành công
    const opp = g.teamPlayers.blue[2];
    opp.pos = new Vector2(p.pos.x + 20, p.pos.y); opp.hasBall = true; opp.ballProtectTimer = 0;
    g.ball.owner = opp; g.ball.pos = opp.pos.clone(); p.hasBall = false; p.tacklePressCd = 0;
    let tackled = false;
    for (let i = 0; i < 15 && !tackled; i++) {
        p.tacklePressCd = 0; opp.hasBall = true; opp.ballProtectTimer = 0;
        g.ball.owner = opp; g.ball.pos = opp.pos.clone(); p.pos = new Vector2(opp.pos.x - 14, opp.pos.y);
        g.input.keysPressed = { Space: true };
        g.update(0.016);
        if (g.ball.owner === p) tackled = true;
    }
    const tackle = g.commentary.history.filter(h => h.kind === 'tackle').pop();
    check('Bình luận khi tranh bóng thành công', tackled && !!tackle, tackle ? tackle.text : ('tackled=' + tackled));

    // Khu vực nguy hiểm (dùng trận mới để tránh nhiễu trạng thái)
    const g2 = mkGame();
    g2.commentary.minGap = 0;
    g2.ball.pos = new Vector2(g2.field.x + g2.field.width - 60, g2.field.y + g2.field.height / 2);
    for (let i = 0; i < 3; i++) { g2.state = 'playing'; g2.update(0.016); }
    const danger = g2.commentary.history.filter(h => h.kind === 'danger').pop();
    check('Bình luận khi bóng vào vùng nguy hiểm', !!danger, danger ? danger.text : 'thiếu');
}

console.log('\\n=== 5) HẾT TRẬN ===');
{
    const g = mkGame();
    g.commentary.minGap = 0;
    g.redScore = 3; g.blueScore = 1;
    g.matchTimer = 0.02;
    for (let i = 0; i < 10; i++) g.update(0.016);
    const end = g.commentary.history.filter(h => h.kind === 'end').pop();
    check('Bình luận khi hết trận', !!end, end ? end.text : 'thiếu');
    check('Câu kết thúc có tỷ số chung cuộc', !!end && /3/.test(end.text) && /1/.test(end.text), end ? end.text.slice(-60) : '');
    check('Nêu đội thắng', !!end && /ĐỎ giành chiến thắng/.test(end.text), end ? end.text.slice(-40) : '');
}

console.log('\\n=== 6) CÀI ĐẶT: TẮT BÌNH LUẬN / TẮT GIỌNG ĐỌC ===');
{
    const g = mkGame();
    g.commentary.minGap = 0;
    const before = g.commentary.history.length;
    g.commentary.setEnabled(false);
    g.tryShoot();
    g.commentary.sayKickoff();
    check('Tắt bình luận → không thêm câu nào', g.commentary.history.length === before,
        before + ' → ' + g.commentary.history.length);

    g.commentary.setEnabled(true);
    g.commentary.setVoiceEnabled(false);
    spoken.length = 0;
    g.commentary.say('kickoff');
    check('Tắt giọng đọc → vẫn có phụ đề', g.commentary.lastText.length > 0, g.commentary.lastText);
    check('Tắt giọng đọc → không phát âm thanh', spoken.length === 0, 'spoken=' + spoken.length);
    check('Cài đặt được lưu vào localStorage',
        localStorage.getItem('sf_commentary_voice') === '0' && localStorage.getItem('sf_commentary_enabled') === '1',
        'voice=' + localStorage.getItem('sf_commentary_voice'));
}

console.log('\\n=== 7) KHÔNG CÓ WEB SPEECH API (trình duyệt không hỗ trợ) ===');
{
    const g = mkGame();
    const realSynth = window.speechSynthesis;
    window.speechSynthesis = undefined;
    let crashed = false;
    try {
        g.commentary.minGap = 0;
        g.commentary.sayKickoff();
        g.commentary.testVoice();
    } catch (e) { crashed = true; }
    check('Không crash khi trình duyệt không có Web Speech', !crashed, 'crashed=' + crashed);
    check('Vẫn hiện phụ đề bình luận', g.commentary.lastText.length > 0, g.commentary.lastText.slice(0, 40));
    window.speechSynthesis = realSynth;
}

console.log('\\n=== 8) GIỚI HẠN TẦN SUẤT (không nói dồn dập) ===');
{
    const g = mkGame();
    g.commentary.minGap = 1.0;
    g.commentary._lastAt = -99;
    const n0 = g.commentary.history.length;
    g.commentary.say('pass');
    g.commentary.say('pass');
    g.commentary.say('pass');
    const added = g.commentary.history.length - n0;
    check('Các câu thường bị giới hạn tần suất', added <= 1, 'thêm ' + added + ' câu trong 3 lần gọi');
    const n1 = g.commentary.history.length;
    g.commentary.sayGoal('red', { playerNum: 9, role: 'forward' }, 12, 1, 0);
    check('Bàn thắng vẫn được nói ngay (ưu tiên cao)', g.commentary.history.length > n1,
        g.commentary.history[g.commentary.history.length - 1].text.slice(0, 40));
}

const failed = results.filter(r => !r.ok).length;
console.log('\\n--- Tổng: ' + results.length + ' kiểm tra, ' + failed + ' thất bại ---');
`;

require('vm').runInContext(code, sandbox, { filename: 'commentary' });
