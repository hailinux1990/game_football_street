#!/usr/bin/env node
// ============================================================
// TEST KHÁN ĐÀI + TRỌNG TÀI 3D (không cần WebGL)
//
//   node test/test_3d_crowd_referee.js
//
// Yêu cầu: server tĩnh đang chạy (python3 -m http.server 8080)
// Cách làm: thay THREE.WebGLRenderer bằng stub -> toàn bộ scene 3D
// (khán đài, 666 khán giả instanced, mô hình trọng tài, camera FIFA 99)
// vẫn được dựng bằng three.js thật, chỉ bỏ phần vẽ ra GPU.
// ============================================================
const puppeteer = require('puppeteer-core');

const URL = process.env.GAME_URL || 'http://127.0.0.1:8080/';
const CHROME_CANDIDATES = [
    process.env.CHROME_PATH,
    '/root/.cache/puppeteer/chrome/linux-152.0.7977.42/chrome-linux64/chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
];

function findChrome() {
    const fs = require('fs');
    for (const p of CHROME_CANDIDATES) if (p && fs.existsSync(p)) return p;
    const base = require('path').join(process.env.HOME || '/root', '.cache/puppeteer/chrome');
    if (fs.existsSync(base)) {
        for (const dir of fs.readdirSync(base)) {
            const p = require('path').join(base, dir, 'chrome-linux64/chrome');
            if (fs.existsSync(p)) return p;
        }
    }
    return null;
}

const results = [];
function check(name, ok, detail) {
    results.push({ name, ok });
    console.log((ok ? '✅ PASS' : '❌ FAIL') + ' · ' + name + (detail ? '  → ' + detail : ''));
    return ok;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
    const exe = findChrome();
    if (!exe) {
        console.error('❌ Không tìm thấy Chrome');
        process.exit(1);
    }
    const browser = await puppeteer.launch({
        executablePath: exe,
        headless: 'new',
        args: [
            '--no-sandbox', '--disable-dev-shm-usage',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding'
        ]
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 180)); });

    // Stub WebGLRenderer trước khi game khởi tạo (three.js vẫn dựng scene thật)
    await page.evaluateOnNewDocument(() => {
        class StubRenderer {
            constructor() {
                this.domElement = document.createElement('canvas');
                this.shadowMap = { enabled: false, type: 0 };
                this.capabilities = { getMaxAnisotropy: () => 4 };
                this.info = { render: { calls: 0, triangles: 0 } };
                this.outputColorSpace = '';
                this.toneMapping = 0;
                this.toneMappingExposure = 1;
            }
            getContext() { return { stub: true }; }
            setClearColor() {}
            setPixelRatio() {}
            setSize() {}
            render() { this.info.render.calls++; }
            dispose() {}
        }
        let proxy;
        Object.defineProperty(window, 'THREE', {
            configurable: true,
            get() { return proxy; },
            set(v) {
                proxy = new Proxy(v, {
                    get(t, prop, recv) {
                        if (prop === 'WebGLRenderer') return StubRenderer;
                        return Reflect.get(t, prop, recv);
                    }
                });
            }
        });
    });

    await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction('window.game && window.game.renderer3d', { timeout: 20000 });
    await sleep(600);

    // ---------- 1. Khán đài & khán giả ----------
    const stands = await page.evaluate(() => {
        const R = window.game.renderer3d;
        let sceneMeshes = 0, standMeshes = 0;
        R.scene.traverse(o => {
            if (o.isMesh || o.isInstancedMesh) {
                sceneMeshes++;
                if (o.userData.kind === 'stand') standMeshes++;
            }
        });
        return {
            bodyCount: R.crowdBody ? R.crowdBody.count : 0,
            headCount: R.crowdHead ? R.crowdHead.count : 0,
            colored: !!(R.crowdBody && R.crowdBody.instanceColor),
            sceneMeshes, standMeshes,
            visible: R.crowdBody ? R.crowdBody.visible : false
        };
    });
    check('Có khán đài 3D quanh sân', stands.standMeshes >= 8, stands.standMeshes + ' mesh khán đài');
    check('Có đông khán giả 3D (instanced)', stands.bodyCount >= 300 && stands.headCount === stands.bodyCount,
        stands.bodyCount + ' khán giả');
    check('Mỗi khán giả có màu áo riêng', stands.colored, 'instanceColor=' + stands.colored);
    check('Khán giả hiển thị trong scene', stands.visible, 'visible=' + stands.visible);

    // ---------- 2. Nghi thức trọng tài ----------
    await page.evaluate(() => document.getElementById('btn-play').click());
    await sleep(400);
    const pre = await page.evaluate(() => ({
        state: window.game.state,
        banner: document.getElementById('match-banner').textContent,
        bannerShown: document.getElementById('match-banner').classList.contains('show')
    }));
    check('Bấm CHƠI NGAY → nghi thức dắt đội ra sân', pre.state === 'pre_match', 'state=' + pre.state);
    check('Có banner thông báo trước trận', pre.bannerShown && /BẮT ĐẦU/.test(pre.banner), pre.banner);

    // tua nghi thức bằng update() để không phụ thuộc tốc độ rAF
    await page.evaluate(() => {
        const g = window.game;
        for (let i = 0; i < 140 && g.state === 'pre_match'; i++) g.update(0.016);
        g.renderer3d.frame(1 / 60);
    });
    await sleep(300);
    const kick = await page.evaluate(() => {
        const g = window.game, R = g.renderer3d;
        const m = R.refereeModel;
        return {
            state: g.state,
            hasRefModel: !!m,
            refVisible: m ? m.group.visible : false,
            refMatch: m && g.referee
                ? Math.abs(m.group.position.x - g.referee.pos.x) < 0.01 &&
                  Math.abs(m.group.position.z - g.referee.pos.y) < 0.01
                : false,
            refInsidePitch: g.referee.pos.x > g.field.x && g.referee.pos.x < g.field.x + g.field.width,
            players: R.stats().players
        };
    });
    check('Sau còi → vào trận', kick.state === 'playing', 'state=' + kick.state);
    check('Trọng tài có mô hình 3D trong scene', kick.hasRefModel && kick.refVisible, 'visible=' + kick.refVisible);
    check('Mô hình trọng tài bám đúng vị trí gameplay', kick.refMatch, 'refMatch=' + kick.refMatch);
    check('Trọng tài chạy trong sân theo diễn biến', kick.refInsidePitch, 'inside=' + kick.refInsidePitch);
    check('Trọng tài không bị tính vào 6 cầu thủ', kick.players === 6, kick.players + ' cầu thủ');

    // ---------- 3. Khán giả nhấp nhô theo diễn biến ----------
    const crowdAnim = await page.evaluate(() => {
        const g = window.game, R = g.renderer3d;
        const m = new window.THREE.Matrix4();
        g.crowdIntensity = 0.9;
        R.frame(1 / 60);
        R.crowdBody.getMatrixAt(0, m);
        const y1 = m.elements[13];
        const samples = [];
        for (let i = 0; i < 20; i++) { R.frame(1 / 30); R.crowdBody.getMatrixAt(0, m); samples.push(m.elements[13]); }
        const y2 = samples[samples.length - 1];
        const range = Math.max(...samples) - Math.min(...samples);
        return { y1, y2, range, moving: range > 0.01, excite: g.crowdIntensity };
    });
    check('Khán giả nhấp nhô reo hò', crowdAnim.moving,
        'y ' + crowdAnim.y1.toFixed(2) + ' → ' + crowdAnim.y2.toFixed(2) + ' (excite=' + crowdAnim.excite.toFixed(2) + ')');

    // ---------- 4. Ghi bàn: khán đài bùng nổ ----------
    const cheer = await page.evaluate(() => {
        const g = window.game;
        g.state = 'playing';
        g.ball.pos = new Vector2(g.field.x + g.field.width - 12, g.field.y + g.field.height / 2);
        g.checkGoal();
        const jump = g.renderer3d.crowdJumpTimer || 0;
        const banner = document.getElementById('match-banner').textContent;
        g.state = 'playing';
        g.resetPositions();
        return { jump, banner };
    });
    check('Ghi bàn → khán đài nhảy reo', cheer.jump > 0, 'jumpTimer=' + cheer.jump.toFixed(2));
    check('Banner bàn thắng kiểu FIFA 99', /GOAL!!!/.test(cheer.banner), cheer.banner);

    // ---------- 5. Camera FIFA 99 ----------
    const tv = await page.evaluate(async () => {
        const g = window.game, R = g.renderer3d;
        g.setCameraMode('tv');
        for (let i = 0; i < 60; i++) R.frame(1 / 60);
        const c = R.camera.position;
        return {
            mode: g.cameraMode,
            cam: { x: +c.x.toFixed(0), y: +c.y.toFixed(0), z: +c.z.toFixed(0) },
            fov: +R.camera.fov.toFixed(0),
            badge: document.getElementById('camera-mode-badge').textContent
        };
    });
    check('Camera FIFA 99 ở trên cao bám bóng', tv.cam.y > 150 && tv.cam.z < -100,
        'cam=(' + tv.cam.x + ',' + tv.cam.y + ',' + tv.cam.z + ') fov=' + tv.fov);
    check('Badge hiển thị FIFA 99', /FIFA 99/.test(tv.badge), tv.badge);

    // ---------- 6. Kết thúc trận → bảng kết quả → menu chính ----------
    await page.evaluate(() => {
        const g = window.game;
        g.state = 'playing';
        g.matchTimer = 0.05;
        g.redScore = 2; g.blueScore = 1;
        for (let i = 0; i < 20; i++) g.update(0.016);   // -> post_match
    });
    const post = await page.evaluate(() => ({ state: window.game.state }));
    check('Hết giờ → trọng tài thổi còi kết thúc', post.state === 'post_match', 'state=' + post.state);

    await page.evaluate(() => {
        const g = window.game;
        for (let i = 0; i < 140 && g.state === 'post_match'; i++) g.update(0.016);  // -> match_end
        g.renderer3d.frame(1 / 60);
    });
    await sleep(200);
    const end = await page.evaluate(() => ({
        state: window.game.state,
        visible: getComputedStyle(document.getElementById('match-end')).opacity === '1',
        score: document.getElementById('final-score').textContent,
        countdown: document.getElementById('menu-return-timer').textContent
    }));
    check('Hiện bảng kết quả (nhìn thấy được)', end.visible && end.state === 'match_end', 'score=' + end.score);
    check('Có đếm ngược tự về menu', /\d+s/.test(end.countdown), 'còn ' + end.countdown);

    await page.evaluate(() => {
        const g = window.game;
        g.menuReturnTimer = 0.15;
        for (let i = 0; i < 30; i++) g.update(0.016);
    });
    await sleep(300);
    const back = await page.evaluate(() => ({
        state: window.game.state,
        mainMenu: document.getElementById('main-menu').classList.contains('active'),
        hudHidden: !document.getElementById('game-hud').classList.contains('active'),
        endHidden: document.getElementById('match-end').classList.contains('hidden')
    }));
    check('Kết thúc trận → tự hiển thị MENU CHÍNH', back.mainMenu && back.hudHidden && back.endHidden,
        'state=' + back.state);

    check('Không có lỗi JS', errors.length === 0, errors.slice(0, 3).join(' | '));

    const failed = results.filter(r => !r.ok).length;
    console.log('\n──────────────────────────────────────────');
    console.log(failed === 0
        ? '✅ TẤT CẢ ' + results.length + ' KIỂM TRA ĐỀU ĐẠT'
        : '❌ ' + failed + '/' + results.length + ' KIỂM TRA THẤT BẠI');

    await browser.close();
    process.exit(failed === 0 ? 0 : 1);
})().catch(e => {
    console.error('❌ Lỗi test:', e.message);
    process.exit(1);
});
