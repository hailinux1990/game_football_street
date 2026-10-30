// Test: trọng tài NPC (còi bắt đầu/kết thúc), khán giả reo hò, tự về menu chính,
// camera FIFA 99 và AI kiểu FIFA 99 (bóng luân chuyển liên tục).
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

console.log('=== 1) NGHI THỨC TRƯỚC TRẬN: trọng tài thổi còi bắt đầu ===');
{
    const g = mkGame();
    g.beginMatch();
    check('beginMatch đưa trận vào màn dắt đội ra sân', g.state === GameState.PRE_MATCH, 'state=' + g.state);
    check('Có NPC trọng tài', !!g.referee && g.referee.team === 'ref', g.referee ? 'referee team=' + g.referee.team : 'thiếu');

    let whistleCalls = 0;
    const origKick = g.audio.playKickoffWhistle.bind(g.audio);
    g.audio.playKickoffWhistle = () => { whistleCalls++; origKick(); };

    const startPos = g.referee.pos.clone();
    for (let i = 0; i < 130; i++) g.update(0.016);
    check('Trọng tài đi vào sân (tiến về vòng tròn giữa sân)',
        g.referee.pos.dist(startPos) > 40, 'di chuyển ' + g.referee.pos.dist(startPos).toFixed(0) + 'px');
    check('Trọng tài thổi còi bắt đầu đúng 1 lần', whistleCalls === 1, 'whistle=' + whistleCalls);
    check('Hết nghi thức → vào trận', g.state === GameState.PLAYING, 'state=' + g.state);
    check('Bóng vẫn ở giữa sân, không ai giữ', !g.ball.owner, 'owner=' + (g.ball.owner ? 'có' : 'none'));
    check('Trọng tài không nằm trong danh sách cầu thủ thi đấu', g.players.indexOf(g.referee) === -1,
        'players=' + g.players.length);
}

console.log('\\n=== 2) KẾT THÚC TRẬN: trọng tài thổi còi + tự về MENU CHÍNH ===');
{
    const g = mkGame();
    let finalCalls = 0;
    const origFinal = g.audio.playFinalWhistle.bind(g.audio);
    g.audio.playFinalWhistle = () => { finalCalls++; origFinal(); };
    let menuShown = 0;
    g.onReturnToMenu = () => { menuShown++; };

    g.matchTimer = 0.1;
    for (let i = 0; i < 20; i++) g.update(0.016);
    check('Hết giờ → trạng thái POST_MATCH (trọng tài kết thúc)', g.state === GameState.POST_MATCH, 'state=' + g.state);

    for (let i = 0; i < 120; i++) g.update(0.016);
    check('Trọng tài thổi còi kết thúc trận', finalCalls >= 1, 'final whistle=' + finalCalls);
    check('Hiện bảng kết quả', g.state === GameState.MATCH_END, 'state=' + g.state);
    check('Bảng kết quả có đếm ngược về menu', g.menuReturnTimer > 0, g.menuReturnTimer.toFixed(1) + 's');

    // tua hết thời gian chờ
    for (let i = 0; i < 60 * 10; i++) g.update(0.016);
    check('Tự động hiển thị menu chính sau khi hết trận', g.state === GameState.MENU, 'state=' + g.state);
    check('Callback bật menu chính được gọi', menuShown === 1, 'calls=' + menuShown);
}

console.log('\\n=== 3) KHÁN GIẢ REO HÒ ===');
{
    const g = mkGame();
    g.crowdIntensity = 0.2;
    g.crowdCheerTimer = 0;
    // bóng ở giữa sân
    for (let i = 0; i < 60; i++) g.update(0.016);
    const calm = g.crowdIntensity;
    // bóng sát khung thành -> căng thẳng -> ồn hơn
    g.ball.pos = new Vector2(g.field.x + 40, g.field.y + 60);
    for (let i = 0; i < 60; i++) g.update(0.016);
    const loud = g.crowdIntensity;
    check('Khán đài ồn hơn khi bóng tới gần khung thành', loud > calm,
        'giữa sân=' + calm.toFixed(2) + ' → sát goal=' + loud.toFixed(2));

    const before = g.crowdIntensity;
    g.crowdCheer(1.5);
    check('Có hàm hò reo bùng nổ (crowdCheer)', g.crowdIntensity >= before && g.crowdCheerTimer > 0,
        'intensity=' + g.crowdIntensity.toFixed(2) + ' timer=' + g.crowdCheerTimer.toFixed(1));
}

console.log('\\n=== 4) CAMERA FIFA 99 ===');
{
    const g = mkGame();
    g.setCameraMode('third');
    const a = g.cameraMode;
    g.toggleCameraMode();
    const b = g.cameraMode;
    g.toggleCameraMode();
    const c = g.cameraMode;
    g.toggleCameraMode();
    const d = g.cameraMode;
    check('C xoay vòng: người thứ ba → toàn cảnh → FIFA 99 → người thứ ba',
        a === 'third' && b === 'wide' && c === 'tv' && d === 'third', a + ' → ' + b + ' → ' + c + ' → ' + d);
    g.setCameraMode('tv');
    check('Đặt được góc nhìn FIFA 99', g.cameraMode === 'tv', 'mode=' + g.cameraMode);
}

console.log('\\n=== 5) NPC KIỂU FIFA 99: bóng luân chuyển liên tục ===');
{
    const g = mkGame();
    g.difficulty = 'normal';
    // Cho AI chơi với nhau: người chơi đứng yên
    let passes = 0, touches = 0, lastOwner = null;
    const origAiPass = g.aiPass.bind(g);
    g.aiPass = (p, m, loft) => { passes++; return origAiPass(p, m, loft); };
    for (let i = 0; i < 60 * 20; i++) {
        g.update(0.016);
        if (g.state === GameState.GOAL_CELEBRATION) { g.state = GameState.PLAYING; g.resetPositions(); }
        if (g.ball.owner && g.ball.owner !== lastOwner) { touches++; lastOwner = g.ball.owner; }
    }
    check('AI chuyền bóng thường xuyên (bóng không bị dậm chân)', passes >= 3, 'đường chuyền=' + passes + '/20s');
    check('Bóng đổi chủ liên tục (diễn biến sôi động)', touches >= 6, 'số lần đổi chủ bóng=' + touches);
}

const failed = results.filter(r => !r.ok).length;
console.log('\\n--- Tổng: ' + results.length + ' kiểm tra, ' + failed + ' thất bại ---');
`;

require('vm').runInContext(code, sandbox, { filename: 'referee-crowd' });
