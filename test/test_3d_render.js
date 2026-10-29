#!/usr/bin/env node
// ============================================================
// TEST 3D RENDERER - kiểm tra headless (Chrome + WebGL)
//
//   node test/test_3d_render.js
//
// Yêu cầu:
//   - server tĩnh đang chạy: python3 -m http.server 8080
//   - puppeteer-core + Chrome (đã cài trong node_modules / ~/.cache/puppeteer)
//
// Kiểm tra: khởi tạo WebGL, scene 3D, mô hình cầu thủ đầy đủ chân tay,
// animation chạy/sút/ăn mừng, camera người thứ ba đặt sau lưng cầu thủ,
// camera toàn cảnh bao trọn sân, di chuyển theo hướng camera, không lỗi JS.
// ============================================================
const fs = require('fs');
const path = require('path');

let puppeteer;
try {
    puppeteer = require('puppeteer-core');
} catch (e) {
    console.error('❌ Thiếu puppeteer-core. Chạy: npm install puppeteer-core');
    process.exit(1);
}

const URL = process.env.GAME_URL || 'http://127.0.0.1:8080/';
const SHOT_DIR = path.join(__dirname, 'screenshots');
const CHROME_CANDIDATES = [
    process.env.CHROME_PATH,
    '/root/.cache/puppeteer/chrome/linux-152.0.7977.42/chrome-linux64/chrome'
];

function findChrome() {
    for (const p of CHROME_CANDIDATES) {
        if (p && fs.existsSync(p)) return p;
    }
    // tìm bất kỳ bản chrome trong cache puppeteer
    const base = path.join(process.env.HOME || '/root', '.cache/puppeteer/chrome');
    if (fs.existsSync(base)) {
        for (const dir of fs.readdirSync(base)) {
            const p = path.join(base, dir, 'chrome-linux64/chrome');
            if (fs.existsSync(p)) return p;
        }
    }
    return null;
}

const results = [];
function check(name, ok, detail) {
    results.push({ name, ok, detail });
    console.log((ok ? '✅ PASS' : '❌ FAIL') + ' · ' + name + (detail ? '  → ' + detail : ''));
    return ok;
}

(async () => {
    const exe = findChrome();
    if (!exe) {
        console.error('❌ Không tìm thấy Chrome của puppeteer');
        process.exit(1);
    }
    const browser = await puppeteer.launch({
        executablePath: exe,
        headless: true,
        args: [
            '--no-sandbox', '--disable-dev-shm-usage',
            '--enable-unsafe-swiftshader',
            '--use-gl=angle', '--use-angle=gl-egl'
        ]
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });

    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));

    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction('window.game && window.game.renderer3d', { timeout: 30000 });
    await new Promise(r => setTimeout(r, 800));

    // ---------- 1. Khởi tạo 3D ----------
    const init = await page.evaluate(() => {
        const r = window.game.renderer3d;
        return {
            isWebGL: !!r.renderer.getContext(),
            mode: document.body.className,
            stats: r.stats(),
            canvas: { w: r.canvas.width, h: r.canvas.height }
        };
    });
    check('WebGL renderer khởi tạo được', init.isWebGL, 'canvas ' + init.canvas.w + 'x' + init.canvas.h);
    check('Body ở chế độ 3D (mode-3d)', init.mode.includes('mode-3d'), init.mode || '(rỗng)');
    check('Đủ 6 cầu thủ 3D trong scene', init.stats.players === 6, init.stats.players + ' players, ' + init.stats.playerMeshes + ' meshes cầu thủ');
    check('Mỗi cầu thủ có nhiều bộ phận (đầy đủ chân tay)', init.stats.playerMeshes / Math.max(1, init.stats.players) > 25,
        (init.stats.playerMeshes / init.stats.players).toFixed(1) + ' part/cầu thủ');
    check('Scene có nhiều mesh được vẽ', init.stats.meshes > 200, init.stats.meshes + ' meshes, ' + init.stats.drawCalls + ' draw calls');

    // ---------- 2. Mô hình cầu thủ: chiều cao + tay chân ----------
    const model = await page.evaluate(() => {
        const g = window.game, r = g.renderer3d;
        g.startMatch();
        r.frame(1/60);
        const p = g.currentControlledPlayer;
        const m = r.getModel(p);
        const parts = { arms: 0, legs: 0, total: 0 };
        m.group.traverse(o => {
            if (!o.isMesh) return;
            parts.total++;
        });
        const bb = new THREE.Box3().setFromObject(m.group);
        return {
            size: { x: bb.max.x - bb.min.x, y: bb.max.y - bb.min.y, z: bb.max.z - bb.min.z },
            hasArms: !!(m.armL && m.armR && m.armL.userData.elbow && m.armR.userData.elbow),
            hasLegs: !!(m.legL && m.legR && m.legL.userData.knee && m.legL.userData.ankle && m.legR.userData.knee),
            parts
        };
    });
    check('Cầu thủ 3D cao ~30-36 đơn vị (đúng tỉ lệ sân)', model.size.y > 28 && model.size.y < 38, 'cao ' + model.size.y.toFixed(1));
    check('Có 2 tay đầy đủ (vai → khuỷu → bàn tay)', model.hasArms, model.parts.total + ' bộ phận');
    check('Có 2 chân đầy đủ (đùi → gối → cổ chân → giày)', model.hasLegs);

    // ---------- 3. Camera người thứ ba: đặt sau lưng cầu thủ ----------
    const third = await page.evaluate(() => {
        const g = window.game, r = g.renderer3d;
        g.state = 'playing';
        r.setCameraMode('third');
        g.cameraMode = 'third';
        const p = g.currentControlledPlayer;
        p.pos.x = 380; p.pos.y = 330;
        g.ball.owner = null; g.ball.vel = new Vector2(0, 0);
        // chạy đều về +x để camera bám hướng
        for (let i = 0; i < 150; i++) {
            p.pos.x += 0.3; g.ball.pos.x = p.pos.x + 22; g.ball.pos.y = p.pos.y;
            r.frame(1 / 60);
        }
        const camPos = r.camera.position.clone();
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(r.camera.quaternion); // hướng nhìn
        const toPlayer = new THREE.Vector3(p.pos.x, 12, p.pos.y).sub(camPos);
        const dist = toPlayer.length();
        const dot = fwd.normalize().dot(toPlayer.clone().normalize());
        const playerNDC = new THREE.Vector3(p.pos.x, 16, p.pos.y).project(r.camera);
        const ballNDC = new THREE.Vector3(g.ball.pos.x, 4, g.ball.pos.y).project(r.camera);
        return {
            dist, dot, camY: camPos.y, playerY: 0,
            playerNDC: { x: playerNDC.x, y: playerNDC.y },
            ballNDC: { x: ballNDC.x, y: ballNDC.y },
            headingDot: (() => {
                // cầu thủ di chuyển +x; camera phải ở phía -x
                return camPos.x < p.pos.x;
            })()
        };
    });
    check('Camera nằm SAU lưng cầu thủ (nhìn cùng hướng di chuyển)', third.dot > 0.9 && third.headingDot,
        'dot=' + third.dot.toFixed(3) + ', cam.x=' + (third.headingDot ? 'phía sau' : 'phía trước'));
    check('Khoảng cách camera hợp lý (người thứ ba)', third.dist > 45 && third.dist < 140, third.dist.toFixed(0) + ' units');
    check('Camera đặt cao hơn mặt đất', third.camY > 15 && third.camY < 90, 'y=' + third.camY.toFixed(1));
    check('Cầu thủ nằm giữa khung hình', Math.abs(third.playerNDC.x) < 0.35 && Math.abs(third.playerNDC.y) < 0.6,
        'ndc=(' + third.playerNDC.x.toFixed(2) + ',' + third.playerNDC.y.toFixed(2) + ')');
    check('Bóng nằm trong khung hình', Math.abs(third.ballNDC.x) < 1 && Math.abs(third.ballNDC.y) < 1,
        'ndc=(' + third.ballNDC.x.toFixed(2) + ',' + third.ballNDC.y.toFixed(2) + ')');

    // ---------- 4. Di chuyển theo hướng camera ----------
    const move = await page.evaluate(async () => {
        const g = window.game, r = g.renderer3d;
        g.state = 'playing';
        r.setCameraMode('third');
        const p = g.currentControlledPlayer;
        // chạy 60 frame để camera ổn định ngay sau lưng
        for (let i = 0; i < 60; i++) { r.frame(1 / 60); }
        const yaw = r.getYaw();
        const camPos = r.camera.position.clone();
        const start = { x: p.pos.x, y: p.pos.y };
        // mô phỏng nhấn W (đi xa camera)
        const yawF = { x: Math.cos(yaw), y: Math.sin(yaw) };
        const rightX = -yawF.y, rightY = yawF.x;
        const dx = 0 * rightX + 1 * yawF.x;   // W: dy=-1 -> -dy=+1
        const dy = 0 * rightY + 1 * yawF.y;
        p.pos.x += dx * 200; p.pos.y += dy * 200;
        const d0 = Math.hypot(camPos.x - start.x, camPos.z - start.y);
        const d1 = Math.hypot(camPos.x - p.pos.x, camPos.z - p.pos.y);
        return { yaw, forwardX: yawF.x, forwardY: yawF.y, movedAway: d1 > d0, movedDist: Math.hypot(p.pos.x - start.x, p.pos.y - start.y) };
    });
    check('W = đi xa về phía camera đang nhìn', move.movedAway, 'khoảng cách tới camera tăng, di chuyển ' + move.movedDist.toFixed(0));

    // ---------- 5. Camera toàn cảnh bao trọn sân ----------
    const wide = await page.evaluate(() => {
        const g = window.game, r = g.renderer3d;
        r.setCameraMode('wide');
        for (let i = 0; i < 120; i++) r.frame(1 / 60);
        const f = g.field;
        const proj = (x, y, z) => new THREE.Vector3(x, y, z).project(r.camera);
        const corners = [
            proj(f.x, 0, f.y), proj(f.x + f.width, 0, f.y),
            proj(f.x, 0, f.y + f.height), proj(f.x + f.width, 0, f.y + f.height)
        ];
        const inView = corners.every(v => Math.abs(v.x) <= 1.02 && Math.abs(v.y) <= 1.02 && v.z < 1);
        const spanX = Math.max(...corners.map(v => v.x)) - Math.min(...corners.map(v => v.x));
        const spanY = Math.max(...corners.map(v => v.y)) - Math.min(...corners.map(v => v.y));
        return { inView, spanX, spanY, fov: r.camera.fov, mode: r.cameraMode };
    });
    check('Chế độ toàn cảnh: cả 4 góc sân nằm trong hình', wide.inView,
        'spanX=' + wide.spanX.toFixed(2) + ' spanY=' + wide.spanY.toFixed(2) + ' fov=' + wide.fov.toFixed(0));
    check('Chế độ toàn cảnh chiếm phần lớn khung hình', wide.spanX > 0.6 && wide.spanY > 0.4,
        'spanX=' + wide.spanX.toFixed(2) + ' spanY=' + wide.spanY.toFixed(2));

    // ---------- 6. Toggle bằng phím C ----------
    const toggle = await page.evaluate(() => {
        const g = window.game;
        g.renderer3d.setCameraMode('third');
        g.cameraMode = 'third';
        const before = g.cameraMode;
        g.input.keysPressed = { KeyC: true };
        g.handleHumanInput(0.016);
        const after1 = g.cameraMode;
        g.input.keysPressed = { KeyC: true };
        g.handleHumanInput(0.016);
        const after2 = g.cameraMode;
        return { before, after1, after2, rendererMode: g.renderer3d.cameraMode };
    });
    check('Phím C đổi góc nhìn (third → wide → third)',
        toggle.before === 'third' && toggle.after1 === 'wide' && toggle.after2 === 'third',
        toggle.before + ' → ' + toggle.after1 + ' → ' + toggle.after2);

    // ---------- 7. Animation: chân tay chuyển động ----------
    const anim = await page.evaluate(() => {
        const g = window.game, r = g.renderer3d;
        g.state = 'playing';
        r.setCameraMode('third');
        const p = g.currentControlledPlayer;
        const m = r.getModel(p);
        const sample = [];
        p.pos.x = 380; p.pos.y = 330;
        for (let i = 0; i < 90; i++) {
            p.pos.x += 0.5;
            g.ball.pos.x = p.pos.x + 22;
            r.frame(1 / 60);
            sample.push({ legL: m.legL.rotation.x, legR: m.legR.rotation.x, armL: m.armL.rotation.x, armR: m.armR.rotation.x, kneeL: m.legL.userData.knee.rotation.x });
        }
        const range = (arr) => Math.max(...arr) - Math.min(...arr);
        const legs = range(sample.map(s => s.legL)) + range(sample.map(s => s.legR));
        const arms = range(sample.map(s => s.armL)) + range(sample.map(s => s.armR));
        const knees = range(sample.map(s => s.kneeL));

        // Động tác sút
        p.setAction('kick', 0.5);
        const kickSamples = [];
        for (let i = 0; i < 36; i++) {
            p.tickAction(1 / 60);
            m.update(1 / 60);
            kickSamples.push(m.legR.rotation.x);
        }
        const kickRange = Math.max(...kickSamples) - Math.min(...kickSamples);

        // Ăn mừng
        p.setAction('celebrate', 1.5);
        const celebSamples = [];
        for (let i = 0; i < 30; i++) {
            p.tickAction(1 / 60);
            m.update(1 / 60);
            celebSamples.push(m.armL.rotation.x);
        }

        return {
            legRange: legs, armRange: arms, kneeRange: knees, kickRange,
            celebMinArm: Math.min(...celebSamples),
            action: p.action
        };
    });
    check('Chạy: chân vung (biên độ lớn)', anim.legRange > 0.8, 'Δleg=' + anim.legRange.toFixed(2));
    check('Chạy: tay vung ngược pha', anim.armRange > 0.5, 'Δarm=' + anim.armRange.toFixed(2));
    check('Chạy: gối gập duỗi', anim.kneeRange > 0.3, 'Δknee=' + anim.kneeRange.toFixed(2));
    check('Động tác SÚT: chân sút vung mạnh', anim.kickRange > 1.5, 'ΔlegR(kick)=' + anim.kickRange.toFixed(2));
    check('Động tác ĂN MỪNG: giơ tay lên', anim.celebMinArm < -1.5, 'armL min=' + anim.celebMinArm.toFixed(2));

    // ---------- 8. Sút bóng trong gameplay kích hoạt animation ----------
    const gameplay = await page.evaluate(() => {
        const g = window.game, r = g.renderer3d;
        g.startMatch();
        g.state = 'playing';
        const p = g.currentControlledPlayer;
        p.pos.x = 760; p.pos.y = 330;
        p.hasBall = true; g.ball.owner = p; g.ball.pos.x = 780; g.ball.pos.y = 330;
        g.tryShoot();
        const kickAction = p.action;
        const ballSpeed = g.ball.vel.mag();
        // chạy animation vài frame để mô hình cập nhật
        for (let i = 0; i < 10; i++) r.frame(1 / 60);
        const m = r.getModel(p);
        return { kickAction, ballSpeed, modelAction: m.player.action };
    });
    check('Sút bóng kích hoạt động tác đá (gameplay → 3D)', gameplay.kickAction === 'kick' && gameplay.ballSpeed > 20,
        'action=' + gameplay.kickAction + ', ball speed=' + gameplay.ballSpeed.toFixed(0));

    // ---------- 9. Chơi thật: frame update + screenshot ----------
    await page.evaluate(() => {
        const g = window.game;
        g.startMatch();
        g.state = 'playing';
        g.cameraMode = 'third';
        g.renderer3d.setCameraMode('third');
        // quay lại luồng game bình thường
    });
    await page.evaluate(() => { document.getElementById('btn-play').click(); });
    await new Promise(r => setTimeout(r, 2500));

    const live = await page.evaluate(() => {
        const g = window.game;
        return {
            state: g.state,
            timer: g.matchTimer,
            fps: g.renderer3d.fps,
            drawCalls: g.renderer3d.stats().drawCalls,
            players: g.renderer3d.stats().players,
            badge: (document.getElementById('camera-mode-badge') || {}).textContent
        };
    });
    check('Game chạy realtime sau khi bấm CHƠI NGAY', live.state === 'playing' && live.timer < 300,
        'state=' + live.state + ' fps=' + live.fps + ' calls=' + live.drawCalls);
    check('Badge góc nhìn hiển thị đúng', /NGƯỜI THỨ BA|TOÀN CẢNH/.test(live.badge || ''), live.badge);

    // Screenshots
    if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SHOT_DIR, '3d_third_person.png') });
    await page.evaluate(() => { window.game.toggleCameraMode(); });
    await new Promise(r => setTimeout(r, 1200));
    await page.screenshot({ path: path.join(SHOT_DIR, '3d_wide_camera.png') });

    // Kiểm tra khung hình không trống (phân tích pixel)
    const pixels = await page.evaluate(() => {
        const r = window.game.renderer3d;
        const gl = r.renderer.getContext();
        r.renderer.render(r.scene, r.camera);
        const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
        const buf = new Uint8Array(W * H * 4);
        gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        let lum = 0, nonBlack = 0, n = 0, sum = [0, 0, 0];
        for (let i = 0; i < buf.length; i += 4 * 7) {
            const l = 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2];
            lum += l; n++;
            sum[0] += buf[i]; sum[1] += buf[i + 1]; sum[2] += buf[i + 2];
            if (l > 18) nonBlack++;
        }
        return { avgLum: lum / n, nonBlack: nonBlack / n, avg: sum.map(v => Math.round(v / n)) };
    });
    check('Khung hình có nội dung (không trống)', pixels.nonBlack > 0.5 && pixels.avgLum > 25,
        'lum=' + pixels.avgLum.toFixed(1) + ' covered=' + (pixels.nonBlack * 100).toFixed(0) + '% avgRGB=' + pixels.avg.join(','));

    check('Không có lỗi JS trong console', errors.length === 0, errors.slice(0, 3).join(' | ') || 'sạch');

    await browser.close();

    const failed = results.filter(r => !r.ok);
    console.log('\n──────────────────────────────────────────');
    console.log((failed.length === 0 ? '✅ TẤT CẢ ' + results.length + ' KIỂM TRA ĐỀU ĐẠT' :
        '❌ ' + failed.length + '/' + results.length + ' kiểm tra thất bại'));
    console.log('Ảnh chụp: test/screenshots/3d_third_person.png, 3d_wide_camera.png');
    process.exit(failed.length === 0 ? 0 : 1);
})().catch(e => {
    console.error('❌ Lỗi test:', e);
    process.exit(1);
});
