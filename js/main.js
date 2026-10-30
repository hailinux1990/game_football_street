// ============================================
// STREET FOOTBALL - FULL GAME LOGIC
// ============================================

// Khoảng cách nhỏ nhất từ điểm p tới đoạn thẳng a-b (dùng để kiểm tra đường chuyền bị chặn)
function pointToSegmentDist(p, a, b) {
    const abx = b.x - a.x, aby = b.y - a.y;
    const apx = p.x - a.x, apy = p.y - a.y;
    const len2 = abx * abx + aby * aby;
    let t = len2 > 0 ? (apx * abx + apy * aby) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = a.x + abx * t;
    const cy = a.y + aby * t;
    return Math.hypot(p.x - cx, p.y - cy);
}

// ============================================================
// PlayerControl: nguồn điều khiển của MỘT người chơi
// - P1: bàn phím hoặc tay cầm chính (theo "Chế độ điều khiển" trong Cài đặt)
// - P2: tay cầm thứ hai (PS5) khi bật chế độ 2 người chơi
// ============================================================
class PlayerControl {
    constructor(game, opts) {
        opts = opts || {};
        this.game = game;
        this.label = opts.label || 'P1';
        // padSlot: 'second' = dùng tay cầm thứ 2 (tự nhận khi cắm/rút)
        //          null     = dùng bàn phím hoặc tay cầm chính (theo Chế độ điều khiển)
        this.padSlot = opts.padSlot || null;
        this.team = opts.team || 'red';
        this.color = opts.color || '#ffd24a';
        this.player = null;
        this.enabled = opts.enabled !== false;
    }

    // Chỉ số tay cầm đang dùng (null = không dùng tay cầm riêng)
    getPadIndex() {
        if (this.padSlot === 'second') {
            const idx = this.game.input.secondPadIndex();
            return idx >= 0 ? idx : null;
        }
        return null;
    }

    isPad() {
        return this.getPadIndex() !== null;
    }

    // Có nguồn điều khiển sẵn sàng không?
    padReady() {
        if (this.padSlot === 'second') return this.getPadIndex() !== null;
        return true;
    }

    isDown(action) {
        const inp = this.game.input;
        const pad = this.getPadIndex();
        if (pad !== null) return inp.isActionGpDownFor(pad, action);
        return inp.isActionDown(action);
    }

    isPressed(action) {
        const inp = this.game.input;
        const pad = this.getPadIndex();
        if (pad !== null) return inp.isActionGpPressedFor(pad, action);
        return inp.isActionPressed(action);
    }

    move() {
        const inp = this.game.input;
        const pad = this.getPadIndex();
        if (pad !== null) return inp.getGamepadMoveFor(pad);
        const gpReady = inp.gpConnected && inp.gamepadEnabled;
        if (inp.controlMode === 'gamepad' && gpReady) {
            return inp.getGamepadMove();
        }
        let x = 0, y = 0;
        if (inp.isActionDown('moveLeft') || inp.isDown('ArrowLeft')) x -= 1;
        if (inp.isActionDown('moveRight') || inp.isDown('ArrowRight')) x += 1;
        if (inp.isActionDown('moveUp') || inp.isDown('ArrowUp')) y -= 1;
        if (inp.isActionDown('moveDown') || inp.isDown('ArrowDown')) y += 1;
        return { x, y };
    }
}

class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = canvas.width;
        this.height = canvas.height;
        this.camera = new Camera(this.width, this.height);
        this.particles = new ParticleSystem();
        this.audio = new AudioManager();
        this.input = new InputManager();
        this.state = GameState.MENU;
        this.lastTime = 0;
        this.deltaTime = 0.016;

        // Field setup
        this.field = new Field(60, 80, 800, 500);
        this.goalWidth = 80;
        this.goalHeight = 80;
        // Khung thành: khẩu độ 80 (theo trục dọc sân), xà ngang cao ~0.45 khẩu độ (tỉ lệ gần chuẩn FIFA)
        this.goalBarHeight = Math.round(this.goalHeight * 0.45);
        this.goalDepth = 34;
        this.goalPostRadius = 2.1;
        this._barHitCd = 0;
        this._goalBlockTimer = 0;   // chặn tính bàn ngay sau khi bóng đập cột/xà

        // Ball
        this.ball = new Entity(460, 330, 8, 'white');
        this.ball.hasPhysics = true;
        this.ball.isBall = true;
        this.ball.owner = null;
        // Độ cao bóng (dùng cho chuyền bóng bổng): 0 = trên mặt sân
        this.ball.height = 0;
        this.ball.heightVel = 0;

        this.players = [];
        this.teamPlayers = { red: [], blue: [] };
        this.currentControlledPlayer = null;

        // Match vars
        this.matchTimer = 300;
        this.matchTotalSeconds = 300;
        this.redScore = 0;
        this.blueScore = 0;
        this.possessionTeam = 'red';
        this.goalCelebrationTimer = 0;
        this.difficulty = 'normal';

        // ===== Chế độ chơi: 1 người / 2 người =====
        // '1p'      : 1 người chơi (điều khiển đội Đỏ)
        // '2p_vs'   : 2 người đối kháng (P1 đội Đỏ, P2 đội Xanh)
        // '2p_coop' : 2 người đồng đội (cùng đội Đỏ)
        this.playMode = '1p';
        this.controls = [];
        this.player2 = null;
        this.loadPlayMode();

        // ===== Trọng tài & diễn biến trận =====
        this.referee = null;              // NPC trọng tài (không tính vào đội hình)
        this.preMatchTimer = 0;           // đồng hồ đếm của màn dắt đội ra sân
        this.refWhistleDone = false;
        this.postMatchTimer = 0;          // đồng hồ của màn kết thúc trận
        this.refFinalWhistle = false;
        this.menuReturnTimer = 0;         // tự động về menu chính sau khi hết trận
        this.menuReturnDelay = 8;         // giây
        this.bannerTimer = 0;

        // ===== Khán đài / khán giả =====
        this.crowdIntensity = 0.35;       // 0..1 — càng gay cấn càng ồn
        this.crowdCheerTimer = 0;
        this._crowdTick = 0;

        // ===== 3D =====
        // 'third'  = góc nhìn người thứ ba (camera sau lưng cầu thủ)
        // 'wide'   = toàn cảnh sân bóng nhỏ
        // 'tv'     = kiểu FIFA 99: camera cao bám bóng từ khán đài bên sân
        this.cameraMode = 'third';
        this.renderer3d = null;
        this.lastScorer = null;
        this._lastShooter = null;
        this.loadCameraMode();

        this.createPlayers();
        this.setupUI();
    }

    // ===== Chế độ camera (lưu localStorage) =====
    // ===== Chế độ chơi (1 người / 2 người) =====
    loadPlayMode() {
        try {
            const v = localStorage.getItem('sf_play_mode');
            if (v === '1p' || v === '2p_vs' || v === '2p_coop') this.playMode = v;
        } catch (e) { /* ignore */ }
    }

    savePlayMode() {
        try { localStorage.setItem('sf_play_mode', this.playMode); } catch (e) { /* ignore */ }
    }

    isTwoPlayer() {
        return this.playMode === '2p_vs' || this.playMode === '2p_coop';
    }

    setPlayMode(mode) {
        this.playMode = (mode === '2p_vs' || mode === '2p_coop') ? mode : '1p';
        this.savePlayMode();
        if (this.players && this.players.length) {
            this.setupControls();
            this.resetPositions();
        }
        if (typeof this.onPlayModeChange === 'function') this.onPlayModeChange(this.playMode);
        return this.playMode;
    }

    // Danh sách cầu thủ đang do NGƯỜI chơi điều khiển
    humanPlayers() {
        const list = [];
        for (const c of this.controls) {
            if (!c.padReady()) continue;                 // P2 chưa có tay cầm -> AI điều khiển
            if (c.player && c.player.active && list.indexOf(c.player) === -1) list.push(c.player);
        }
        return list;
    }

    // Cập nhật cờ điều khiển mỗi frame (khi cắm/rút tay cầm giữa trận)
    refreshControlFlags() {
        for (const c of this.controls) {
            if (!c.player) continue;
            const ready = c.padReady();
            const human = this.humanPlayers().indexOf(c.player) !== -1;
            if (ready && c.player.aiControlled) c.player.aiControlled = false;
            if (!ready && !c.player.aiControlled) c.player.aiControlled = true;
            c.player.isControlled = human;
        }
    }

    isHumanControlled(p) {
        return this.humanPlayers().indexOf(p) !== -1;
    }

    controlOf(p) {
        for (const c of this.controls) if (c.player === p) return c;
        return null;
    }

    // Dựng nguồn điều khiển theo chế độ chơi hiện tại
    setupControls() {
        const input = this.input;
        const red = this.teamPlayers.red;
        const blue = this.teamPlayers.blue;
        const prev = this.controls || [];
        this.controls = [];

        // Reset cờ điều khiển của mọi cầu thủ
        for (const p of this.players) {
            p.isControlled = false;
            p.aiControlled = true;
        }

        // ---- Người chơi 1: bàn phím hoặc tay cầm chính ----
        const c1 = new PlayerControl(this, { label: 'P1', team: 'red', color: '#ffd24a' });
        c1.player = red[2];                       // tiền đạo đội Đỏ
        if (prev[0] && prev[0].player && prev[0].player.team === 'red' && this.players.indexOf(prev[0].player) !== -1) {
            c1.player = prev[0].player;
        }
        this.controls.push(c1);

        // ---- Người chơi 2: tay cầm thứ hai ----
        if (this.isTwoPlayer()) {
            const c2 = new PlayerControl(this, {
                label: 'P2',
                padSlot: 'second',                     // luôn dùng tay cầm thứ 2
                team: this.playMode === '2p_vs' ? 'blue' : 'red',
                color: '#5ad1ff'
            });
            if (this.playMode === '2p_vs') {
                c2.player = blue[2];              // tiền đạo đội Xanh
                if (prev[1] && prev[1].player && prev[1].player.team === 'blue' && this.players.indexOf(prev[1].player) !== -1) {
                    c2.player = prev[1].player;
                }
            } else {
                c2.player = red[1];               // hậu vệ đội Đỏ (chơi đồng đội)
                if (prev[1] && prev[1].player && prev[1].player.team === 'red' && this.players.indexOf(prev[1].player) !== -1) {
                    c2.player = prev[1].player;
                }
            }
            // tránh 2 người điều khiển cùng 1 cầu thủ
            if (c2.player && c2.player === c1.player) {
                const alt = this.teamPlayers[c2.team].filter(p => p.role !== Role.GK && p !== c1.player);
                if (alt.length) c2.player = alt[0];
            }
            this.controls.push(c2);
            this.player2 = c2.player;
        } else {
            this.player2 = null;
        }

        // Áp cờ điều khiển (P2 chưa cắm tay cầm thì cầu thủ đó do AI điều khiển)
        for (const c of this.controls) {
            if (!c.player) continue;
            const ready = c.padReady();
            c.player.aiControlled = !ready;
            c.player.isControlled = ready;
        }

        this.currentControlledPlayer = c1.player;
        this._autoSwitchCd = 0;
        this._possessSwitchCd = 0;
        return this.controls;
    }

    // Tay cầm của P2 đã sẵn sàng chưa
    isPlayer2Ready() {
        if (!this.isTwoPlayer()) return false;
        const c2 = this.controls[1];
        if (!c2) return false;
        return c2.padReady();
    }

    loadCameraMode() {
        try {
            const v = localStorage.getItem('sf_camera_mode');
            if (v === 'third' || v === 'wide' || v === 'tv') this.cameraMode = v;
        } catch (e) { /* ignore */ }
    }

    saveCameraMode() {
        try { localStorage.setItem('sf_camera_mode', this.cameraMode); } catch (e) { /* ignore */ }
    }

    setCameraMode(mode) {
        this.cameraMode = (mode === 'wide' || mode === 'tv') ? mode : 'third';
        if (this.renderer3d) this.renderer3d.setCameraMode(this.cameraMode);
        this.saveCameraMode();
        if (typeof this.onCameraModeChange === 'function') this.onCameraModeChange(this.cameraMode);
        return this.cameraMode;
    }

    // C: Người thứ ba → Toàn cảnh → FIFA 99 (góc cao bám bóng) → Người thứ ba
    toggleCameraMode() {
        const order = ['third', 'wide', 'tv'];
        const i = order.indexOf(this.cameraMode);
        return this.setCameraMode(order[(i + 1) % order.length]);
    }

    createPlayers() {
        const f = this.field;

        // ===== RED TEAM (left side) =====
        const redGK = createGoalkeeper(f.x + 25, f.y + f.height / 2, 'red');
        const redDEF = createPlayer(f.x + 180, f.y + f.height / 2 - 80, 'red', false, Role.DEF);
        const redFWD = createPlayer(f.x + 320, f.y + f.height / 2, 'red', true, Role.FWD);

        // ===== BLUE TEAM (right side) =====
        const blueGK = createGoalkeeper(f.x + f.width - 25, f.y + f.height / 2, 'blue');
        const blueDEF = createPlayer(f.x + f.width - 180, f.y + f.height / 2 + 80, 'blue', false, Role.DEF);
        const blueFWD = createPlayer(f.x + f.width - 320, f.y + f.height / 2, 'blue', false, Role.FWD);

        this.teamPlayers.red = [redGK, redDEF, redFWD];
        this.teamPlayers.blue = [blueGK, blueDEF, blueFWD];
        this.players = [...this.teamPlayers.red, ...this.teamPlayers.blue];

        // Team references
        for (const p of this.teamPlayers.red) {
            p.teamMates = this.teamPlayers.red.filter(m => m !== p);
            p.opponents = [...this.teamPlayers.blue];
        }
        for (const p of this.teamPlayers.blue) {
            p.teamMates = this.teamPlayers.blue.filter(m => m !== p);
            p.opponents = [...this.teamPlayers.red];
        }

        // Player is human on Red FWD
        this.currentControlledPlayer = redFWD;
        redFWD.isControlled = true;
        redFWD.aiControlled = false;
        redFWD.isHuman = true;

        // ===== Trọng tài (NPC, không thuộc đội nào) =====
        if (!this.referee) this.referee = createReferee(f.x + f.width / 2, f.y + f.height + 40);

        // ===== Người chơi (1 hoặc 2 người) =====
        this.setupControls();
    }

    setupUI() {
        // UI is handled by inline script
    }

    resetPositions() {
        const f = this.field;
        const cy = f.y + f.height / 2;

        // Trọng tài bắt đầu từ ngoài đường biên dọc, đi vào vòng tròn giữa sân
        if (this.referee) {
            this.referee.pos = new Vector2(f.x + f.width / 2, f.y + f.height + 30);
            this.referee.action = null;
            this.referee.actionT = 0;
        }

        // Red team (attacks right, defends left)
        this.teamPlayers.red[0].pos = new Vector2(f.x + 25, cy);
        this.teamPlayers.red[1].pos = new Vector2(f.x + 180, cy - 80);
        this.teamPlayers.red[2].pos = new Vector2(f.x + 320, cy);

        // Blue team (attacks left, defends right)
        this.teamPlayers.blue[0].pos = new Vector2(f.x + f.width - 25, cy);
        this.teamPlayers.blue[1].pos = new Vector2(f.x + f.width - 180, cy + 80);
        this.teamPlayers.blue[2].pos = new Vector2(f.x + f.width - 320, cy);

        // Reset ball
        this.ball.pos = new Vector2(f.x + f.width / 2, cy);
        this.ball.vel = new Vector2(0, 0);
        this.ball.owner = null;
        this.ball.hasPhysics = true;
        this.ball.height = 0;
        this.ball.heightVel = 0;

        // Reset timers
        for (const p of this.players) {
            p.hasBall = false;
            p.ballProtectTimer = 0;
            p.tackleCooldown = 0;
            p.tacklePressCd = 0;
            p.stamina = p.maxStamina;
        }
    }

    // Bắt đầu trận ngay (dùng cho test / chế độ nhanh)
    startMatch() {
        this.state = GameState.PLAYING;
        this.matchTimer = 300;
        this.matchTotalSeconds = 300;
        this.redScore = 0;
        this.blueScore = 0;
        this.possessionTeam = 'red';
        this.goalCelebrationTimer = 0;

        this.createPlayers();
        this.resetPositions();

        this.preMatchTimer = 0;
        this.postMatchTimer = 0;
        this.menuReturnTimer = 0;
        this.refWhistleDone = false;
        this.refFinalWhistle = false;
        this.crowdIntensity = 0.4;
        this.hideBanner();
        this.hideMatchEndScreen();
        this.updateCrowdAudio();
    }

    // Bắt đầu trận có nghi thức: trọng tài dắt đội ra sân rồi thổi còi
    beginMatch() {
        this.startMatch();
        this.state = GameState.PRE_MATCH;
        this.preMatchTimer = 0;
        this.refWhistleDone = false;
        this.showBanner('⚽ TRẬN ĐẤU SẮP BẮT ĐẦU', 0);
        this.updateCrowdAudio();
        return this.state;
    }

    // ============= GAME UPDATE =============
    update(dt) {
        if (this.state === GameState.PLAYING) {
            this.updatePlaying(dt);
        } else if (this.state === GameState.PRE_MATCH) {
            this.updatePreMatch(dt);
        } else if (this.state === GameState.GOAL_CELEBRATION) {
            this.goalCelebrationTimer -= dt;
            // Vẫn cập nhật animation ăn mừng của cầu thủ
            for (const p of this.players) p.tickAction(dt);
            if (this.referee) this.referee.update(dt);
            this.updateCrowd(dt);
            if (this.goalCelebrationTimer <= 0) {
                document.getElementById('goal-celebration').classList.add('hidden');
                this.resetPositions();
                this.state = GameState.PLAYING;
            }
        } else if (this.state === GameState.POST_MATCH) {
            this.updatePostMatch(dt);
        } else if (this.state === GameState.MATCH_END) {
            this.updateMatchEndScreen(dt);
        }
        this.updateBanner(dt);
    }

    // ===== NGHI THỨC TRƯỚC TRẬN: trọng tài đi vào sân + thổi còi bắt đầu =====
    updatePreMatch(dt) {
        this.deltaTime = dt;
        this.preMatchTimer += dt;
        const f = this.field;
        const cx = f.x + f.width / 2;
        const cy = f.y + f.height / 2;

        // Cầu thủ đứng đúng vị trí xuất phát, hướng về giữa sân
        for (const p of this.players) {
            p.animTime += dt;
            p.tickAction(dt);
        }

        // Trọng tài tiến vào vòng tròn giữa sân
        if (this.referee) {
            const ref = this.referee;
            const targetY = cy + 26;                     // hơi lệch xuống để không trùng bóng
            const dx = cx - ref.pos.x;
            const dy = targetY - ref.pos.y;
            const dist = Math.hypot(dx, dy);
            const step = Math.min(dist, ref.maxSpeed * 0.85 * dt * 60);
            if (dist > 1) {
                ref.pos.x += (dx / dist) * step;
                ref.pos.y += (dy / dist) * step;
                ref.lastDirX = dx / dist;
                ref.lastDirY = dy / dist;
            }
            ref.update(dt);
        }

        // Thổi còi khi đã vào vị trí
        if (!this.refWhistleDone && this.preMatchTimer >= 1.15) {
            this.refWhistleDone = true;
            this.audio.playKickoffWhistle();
            this.showBanner('🔔 TRỌNG TÀI THỔI CÒI — BẮT ĐẦU!', 1.6);
            this.crowdCheer(0.9);
            if (this.referee) this.referee.setAction('celebrate', 0.9);   // giơ tay
            this.particles.emitBurst(cx, cy, '#ffd24a', 18);
        }

        // Bóng vào cuộc
        if (this.preMatchTimer >= 1.95) {
            this.state = GameState.PLAYING;
            this.matchTimer = this.matchTimer > 0 ? this.matchTimer : 300;
            this.showBanner('⚽ BẮT ĐẦU!', 1.4);
        }
        this.updateCrowd(dt);
    }

    // ===== KẾT THÚC TRẬN: trọng tài thổi còi kết thúc =====
    finishMatch() {
        this.matchTimer = 0;
        this.state = GameState.POST_MATCH;
        this.postMatchTimer = 0;
        this.refFinalWhistle = false;
        this.hideBanner();
        this.audio.setCrowdLevel(0.5);
        return this.state;
    }

    updatePostMatch(dt) {
        this.deltaTime = dt;
        this.postMatchTimer += dt;
        const f = this.field;
        const cx = f.x + f.width / 2;
        const cy = f.y + f.height / 2;

        // Trọng tài chạy về giữa sân
        if (this.referee) {
            const ref = this.referee;
            const dx = cx - ref.pos.x;
            const dy = (cy + 26) - ref.pos.y;
            const dist = Math.hypot(dx, dy);
            const step = Math.min(dist, ref.maxSpeed * dt * 60);
            if (dist > 1 && this.postMatchTimer < 1.0) {
                ref.pos.x += (dx / dist) * step;
                ref.pos.y += (dy / dist) * step;
            }
            ref.update(dt);
        }

        // Thổi còi kết thúc trận
        if (!this.refFinalWhistle && this.postMatchTimer >= 0.45) {
            this.refFinalWhistle = true;
            this.audio.playFinalWhistle();
            this.crowdCheer(1.4);
            if (this.referee) this.referee.setAction('celebrate', 1.4);
            this.particles.emitBurst(cx, cy, '#ffffff', 26);
        }

        // Hiện bảng kết quả
        if (this.postMatchTimer >= 1.5) {
            this.state = GameState.MATCH_END;
            this.showMatchEnd();
        }
        this.updateCrowd(dt);
    }

    // Bảng kết quả → sau vài giây tự về menu chính
    updateMatchEndScreen(dt) {
        this.deltaTime = dt;
        if (this.referee) this.referee.update(dt);
        this.updateCrowd(dt);
        if (this.menuReturnTimer > 0) {
            this.menuReturnTimer -= dt;
            const el = document.getElementById('menu-return-timer');
            if (el) el.textContent = Math.max(0, Math.ceil(this.menuReturnTimer)) + 's';
            if (this.menuReturnTimer <= 0) this.returnToMainMenu();
        }
    }

    hideMatchEndScreen() {
        const endEl = document.getElementById('match-end');
        if (endEl) {
            endEl.classList.add('hidden');
            endEl.classList.remove('active');
        }
    }

    // ===== VỀ MENU CHÍNH =====
    returnToMainMenu() {
        this.state = GameState.MENU;
        this.menuReturnTimer = 0;
        this.hideBanner();
        this.audio.setCrowdLevel(0.35);
        if (typeof this.onReturnToMenu === 'function') this.onReturnToMenu();
        return this.state;
    }

    // ===== BANNER THÔNG BÁO (kickoff / kết thúc / bàn thắng) =====
    showBanner(text, duration) {
        const el = document.getElementById('match-banner');
        if (!el) return;
        el.textContent = text;
        el.classList.add('show');
        this.bannerTimer = duration || 0;
    }

    hideBanner() {
        const el = document.getElementById('match-banner');
        if (el) el.classList.remove('show');
        this.bannerTimer = 0;
    }

    updateBanner(dt) {
        if (this.bannerTimer > 0) {
            this.bannerTimer -= dt;
            if (this.bannerTimer <= 0) this.hideBanner();
        }
    }

    // ===== ĐỘ ỒN KHÁN ĐÀI THEO DIỄN BIẾN =====
    crowdCheer(power) {
        this.crowdCheerTimer = Math.max(this.crowdCheerTimer || 0, 1.6);
        this.crowdIntensity = Math.min(1, (this.crowdIntensity || 0) + 0.35);
        this.audio.crowdCheer(power || 1);
        if (this.renderer3d && this.renderer3d.crowdJump) this.renderer3d.crowdJump(power || 1);
    }

    updateCrowd(dt) {
        // Nền: càng gần khung thành / bóng càng gần khung thành càng ồn
        const f = this.field;
        const b = this.ball.pos;
        const distGoal = Math.min(
            Math.abs(b.x - f.x), Math.abs(b.x - (f.x + f.width))
        );
        const tension = Math.max(0, 1 - distGoal / (f.width * 0.55));
        this.crowdCheerTimer = Math.max(0, (this.crowdCheerTimer || 0) - dt);
        const target = this.state === GameState.MENU ? 0.3
            : Math.min(1, 0.38 + tension * 0.42 + (this.crowdCheerTimer > 0 ? 0.3 : 0));
        this.crowdIntensity = this.crowdIntensity + (target - this.crowdIntensity) * Math.min(1, dt * 2.2);

        // Cập nhật âm thanh ~4 lần/giây cho nhẹ
        this._crowdTick = (this._crowdTick || 0) + dt;
        if (this._crowdTick > 0.25) {
            this._crowdTick = 0;
            this.updateCrowdAudio();
        }
    }

    updateCrowdAudio() {
        if (typeof this.audio.setCrowdLevel === 'function' && this.audio.context) {
            this.audio.setCrowdLevel(this.crowdIntensity || 0.35);
        }
    }

    updatePlaying(dt) {
        this.deltaTime = dt;
        this.matchTimer -= dt;

        if (this.matchTimer <= 0) {
            // Hết giờ → trọng tài thổi còi kết thúc (POST_MATCH) rồi mới hiện bảng kết quả
            this.finishMatch();
            return;
        }

        // --- Cập nhật nguồn điều khiển (P1/P2, cắm/rút tay cầm) ---
        this.refreshControlFlags();

        // --- Handle input for controlled players (P1 & P2) ---
        this.handleHumanInput(dt);

        // --- Update AI ---
        this.updateAI(dt);

        // --- Update ball physics ---
        this.updateBall(dt);

        // --- Check possession ---
        this.checkPossession(dt);

        // --- Check stealing ---
        this.checkSteal();

        // --- Auto control switching (nearest to contest / receiver) ---
        this.updateControl(dt);

        // --- Update all players ---
        for (const player of this.players) {
            player.update(dt);
            this.clampPlayerToField(player);
        }

        // --- Separate players to prevent stacking ---
        this.separatePlayers();

        // --- Check goals ---
        this.checkGoal();

        // --- Anti-stall: reset ball if stuck too long ---
        if (!this._stallTimer) this._stallTimer = 0;
        if (!this._lastBallPos) this._lastBallPos = this.ball.pos.clone();
        if (this.ball.pos.dist(this._lastBallPos) > 15) {
            this._lastBallPos = this.ball.pos.clone();
            this._stallTimer = 0;
        } else {
            this._stallTimer += dt;
            if (this._stallTimer > 4) {
                // Ball stuck for 4 seconds - reset to center
                this.ball.pos = new Vector2(this.field.x + this.field.width / 2, this.field.y + this.field.height / 2);
                this.ball.vel = new Vector2(0, 0);
                this.ball.height = 0;
                this.ball.heightVel = 0;
                this.ball.owner = null;
                for (const p of this.players) { p.hasBall = false; p.passCooldown = 0.5; }
                this._stallTimer = 0;
                this._lastBallPos = this.ball.pos.clone();
            }
        }

        // --- Trọng tài chạy theo diễn biến ---
        this.updateReferee(dt);

        // --- Khán đài ---
        this.updateCrowd(dt);

        // --- Particles ---
        this.particles.update(dt);

        // Camera fixed - whole field visible
    }

    // ===== Trọng tài bám theo diễn biến (không va chạm với cầu thủ) =====
    updateReferee(dt) {
        const ref = this.referee;
        if (!ref) return;
        const f = this.field;
        const b = this.ball.pos;
        const owner = this.ball.owner;

        // Đứng chếch về phía bóng, tránh đường bóng đi
        const offX = -60;
        const offY = (b.y < f.y + f.height / 2) ? 58 : -58;
        let tx = b.x + offX;
        let ty = b.y + offY;
        tx = Math.max(f.x + 24, Math.min(f.x + f.width - 24, tx));
        ty = Math.max(f.y + 24, Math.min(f.y + f.height - 24, ty));

        const dx = tx - ref.pos.x;
        const dy = ty - ref.pos.y;
        const dist = Math.hypot(dx, dy);
        const speed = owner && dist < 220 ? ref.maxSpeed : ref.maxSpeed * 0.72;
        if (dist > 6) {
            const step = Math.min(dist, speed * dt * 60);
            ref.pos.x += (dx / dist) * step;
            ref.pos.y += (dy / dist) * step;
            ref.lastDirX = dx / dist;
            ref.lastDirY = dy / dist;
        }

        // Tránh chen vào cầu thủ
        for (const p of this.players) {
            const d = ref.pos.dist(p.pos);
            const minD = ref.radius + p.radius + 8;
            if (d > 0.01 && d < minD) {
                const nx = (ref.pos.x - p.pos.x) / d;
                const ny = (ref.pos.y - p.pos.y) / d;
                ref.pos.x = p.pos.x + nx * minD;
                ref.pos.y = p.pos.y + ny * minD;
            }
        }
        this.clampPlayerToField(ref);
        ref.update(dt);
    }

    // Nhận input cho TẤT CẢ người chơi (1 hoặc 2 người)
    handleHumanInput(dt) {
        const list = (this.controls && this.controls.length) ? this.controls : null;
        if (!list) {
            // fallback an toàn nếu chưa có controls
            if (this.currentControlledPlayer) {
                this.handleControlInput(dt, { player: this.currentControlledPlayer, isDown: a => this.input.isActionDown(a),
                    isPressed: a => this.input.isActionPressed(a), move: () => this._legacyMove(), label: 'P1' });
            }
            return;
        }
        for (const ctl of list) {
            if (!ctl || !ctl.player || !ctl.player.active) continue;
            if (!ctl.padReady()) continue;               // P2 chưa có tay cầm -> AI đá
            this.handleControlInput(dt, ctl);
        }
    }

    // Input cũ (bàn phím/tay cầm chính) - dùng khi chưa có controls
    _legacyMove() {
        const inp = this.input;
        if (inp.controlMode === 'gamepad' && inp.gpConnected && inp.gamepadEnabled) return inp.getGamepadMove();
        let x = 0, y = 0;
        if (inp.isActionDown('moveLeft') || inp.isDown('ArrowLeft')) x -= 1;
        if (inp.isActionDown('moveRight') || inp.isDown('ArrowRight')) x += 1;
        if (inp.isActionDown('moveUp') || inp.isDown('ArrowUp')) y -= 1;
        if (inp.isActionDown('moveDown') || inp.isDown('ArrowDown')) y += 1;
        return { x, y };
    }

    // Xử lý input cho 1 người chơi (ctl: PlayerControl)
    handleControlInput(dt, ctl) {
        const p = ctl.player;
        if (!p || !p.active) return;

        const mv = ctl.move ? ctl.move() : { x: 0, y: 0 };
        let dx = mv.x || 0, dy = mv.y || 0;

        if (dx !== 0 || dy !== 0) {
            const len = Math.hypot(dx, dy);
            dx /= len; dy /= len;

            // ===== Góc nhìn người thứ ba: di chuyển theo hướng camera =====
            // W = đi xa camera (hướng nhìn), S = về phía camera, A/D = sang trái/phải
            if (this.renderer3d && this.cameraMode === 'third') {
                const yaw = this.renderer3d.getYaw();
                const fwdX = Math.cos(yaw), fwdY = Math.sin(yaw);   // hướng camera nhìn
                const rightX = -fwdY, rightY = fwdX;                // phía bên phải màn hình
                const wx = dx * rightX + (-dy) * fwdX;
                const wy = dx * rightY + (-dy) * fwdY;
                dx = wx; dy = wy;
            }

            const sprint = ctl.isDown('sprint') && p.stamina > 10;
            const speed = p.maxSpeed * (sprint ? 1.5 : 1);

            p.pos.x += dx * speed * dt * 60;
            p.pos.y += dy * speed * dt * 60;

            if (sprint) p.stamina = Math.max(0, p.stamina - dt * 55);
            p.animTime += dt;
        }

        // If player has ball, keep ball in front (theo hướng đang di chuyển / hướng nhìn)
        if (p.hasBall) {
            let fx = dx, fy = dy;
            if (dx === 0 && dy === 0) {
                // Đứng yên: giữ bóng ở phía trước theo hướng gần nhất
                fx = (p.lastDirX !== undefined ? p.lastDirX : 1);
                fy = (p.lastDirY !== undefined ? p.lastDirY : 0);
            } else {
                p.lastDirX = fx;
                p.lastDirY = fy;
            }
            const f = this.field;
            const bx = p.pos.x + fx * 18;
            const by = p.pos.y + fy * 18;
            this.ball.pos.x = Math.max(f.x + 10, Math.min(f.x + f.width - 10, bx));
            this.ball.pos.y = Math.max(f.y + 10, Math.min(f.y + f.height - 10, by));
            this.ball.owner = p;
            this.ball.vel = new Vector2(0, 0);
        }

        // --- Actions (theo key binding của từng người chơi) ---
        // Nút chuyền ngắn: CÓ bóng → chuyền bóng | KHÔNG có bóng → tranh bóng (áp sát, xoạc bóng)
        if (ctl.isPressed('pass')) {
            if (p.hasBall) this.tryPass(p);
            else this.tryTackle(p);
        }
        // Chọc khe: đường chuyền sệt vào khoảng trống phía trước đồng đội đang chạy
        if (ctl.isPressed('throughPass')) {
            if (p.hasBall) this.tryThroughPass(p);
            else this.tryTackle(p);
        }
        // Chuyền bóng bổng: bóng bay cao qua đầu đối phương
        if (ctl.isPressed('loftPass')) {
            if (p.hasBall) this.tryLoftPass(p);
        }
        if (ctl.isPressed('shoot')) {
            this.tryShoot(p);
        }
        if (ctl.isPressed('skill')) {
            this.trySkill(p);
        }
        if (ctl.isPressed('switchPlayer')) {
            this.switchPlayer(ctl);
        }
        // Đổi góc nhìn chỉ dành cho người chơi 1 (dùng chung camera)
        if (!ctl.isPad() && ctl.isPressed('toggleCamera')) {
            this.toggleCameraMode();
        }
    }

    tryPass(who) {
        const p = who || this.currentControlledPlayer;
        if (!p || !p.hasBall) return;
        const mates = p.teamMates.filter(m => m.active);
        if (mates.length === 0) return;

        // Chọn đồng đội tốt nhất: ưu tiên người phía trước, thoáng, đang chạy chỗ
        const oppGoalX = p.team === 'red' ? this.field.x + this.field.width : this.field.x;
        const dir = p.team === 'red' ? 1 : -1;
        let best = mates[0];
        let bestScore = -Infinity;
        for (const m of mates) {
            if (m.role === Role.GK) continue;
            const d = p.pos.dist(m.pos);
            if (d < 20) continue; // quá gần
            // "Phía trước" = tiến về khung thành đối phương
            const ahead = (m.pos.x - p.pos.x) * dir;
            // Độ thoáng: khoảng cách tới đối thủ gần nhất
            let openDist = Infinity;
            for (const o of p.opponents) {
                if (!o.active) continue;
                const od = m.pos.dist(o.pos);
                if (od < openDist) openDist = od;
            }
            // Điểm: gần vừa phải + phía trước + thoáng
            const score = -d * 0.25 + ahead * 0.5 + Math.min(openDist, 220) * 0.8;
            if (score > bestScore) { bestScore = score; best = m; }
        }

        const angle = Math.atan2(best.pos.y - p.pos.y, best.pos.x - p.pos.x);
        this.ball.vel = Vector2.fromAngle(angle, 16);
        this.ball.hasPhysics = true;
        this.ball.height = 0;
        this.ball.heightVel = 0;
        p.hasBall = false;
        p.passCooldown = 0.35;
        p.setAction('pass', 0.32);
        this.ball.owner = null;
        this.audio.ballImpact('pass', 0.85);
        this.particles.emit(this.ball.pos.x, this.ball.pos.y, '#fff', 5, { speed: 3 });
    }

    // ===== CHỌC KHE: đường chuyền sệt vào khoảng trống phía trước đồng đội =====
    tryThroughPass(who) {
        const p = who || this.currentControlledPlayer;
        if (!p || !p.hasBall) return;
        const mates = p.teamMates.filter(m => m.active && m.role !== Role.GK);
        if (mates.length === 0) { this.tryPass(); return; }

        const f = this.field;
        const dir = p.team === 'red' ? 1 : -1;

        let best = null, bestScore = -Infinity;
        for (const m of mates) {
            const d = p.pos.dist(m.pos);
            if (d < 40) continue;
            const ahead = (m.pos.x - p.pos.x) * dir;           // người nhận đang ở phía trước
            const laneX = m.pos.x + dir * 95;                  // điểm bóng sẽ được đẩy tới
            let space = Infinity;
            for (const o of p.opponents) {
                if (!o.active) continue;
                const od = Math.hypot(o.pos.x - laneX, o.pos.y - m.pos.y);
                if (od < space) space = od;
            }
            const score = ahead * 0.9 + Math.min(space, 200) * 1.15 - d * 0.35
                + (m.role === Role.FWD ? 40 : 0);
            if (score > bestScore) { bestScore = score; best = m; }
        }
        if (!best) { this.tryPass(); return; }

        // Điểm rơi: khoảng trống phía trước người nhận (lead pass) để họ chạy tới nhận
        const midY = f.y + f.height / 2;
        let tx = best.pos.x + dir * 95;
        let ty = best.pos.y + (best.pos.y - midY) * 0.12;
        tx = Math.max(f.x + 20, Math.min(f.x + f.width - 20, tx));
        ty = Math.max(f.y + 20, Math.min(f.y + f.height - 20, ty));

        const angle = Math.atan2(ty - p.pos.y, tx - p.pos.x);
        this.ball.vel = Vector2.fromAngle(angle, 20);
        this.ball.hasPhysics = true;
        this.ball.height = 0;
        this.ball.heightVel = 0;
        p.hasBall = false;
        p.passCooldown = 0.32;
        p.setAction('pass', 0.3);
        this.ball.owner = null;
        this.audio.ballImpact('through', 0.95);
        this.particles.emit(this.ball.pos.x, this.ball.pos.y, '#7cf3ff', 6, { speed: 4 });
    }

    // ===== CHUYỀN BÓNG BỔNG: bóng bay cao qua đầu hàng phòng ngự =====
    tryLoftPass(who) {
        const p = who || this.currentControlledPlayer;
        if (!p || !p.hasBall) return;
        const mates = p.teamMates.filter(m => m.active && m.role !== Role.GK);
        if (mates.length === 0) { this.tryPass(); return; }

        const dir = p.team === 'red' ? 1 : -1;
        let best = mates[0], bestScore = -Infinity;
        for (const m of mates) {
            const d = p.pos.dist(m.pos);
            if (d < 45) continue;
            const ahead = (m.pos.x - p.pos.x) * dir;
            let space = Infinity;
            for (const o of p.opponents) {
                if (!o.active) continue;
                const od = m.pos.dist(o.pos);
                if (od < space) space = od;
            }
            const score = ahead * 0.8 + Math.min(space, 220) * 1.0 + d * 0.15;
            if (score > bestScore) { bestScore = score; best = m; }
        }

        const angle = Math.atan2(best.pos.y - p.pos.y, best.pos.x - p.pos.x);
        this.ball.vel = Vector2.fromAngle(angle, 14);
        this.ball.hasPhysics = true;
        this.ball.height = Math.max(2, this.ball.height || 0);
        this.ball.heightVel = 9.2;      // độ cao ban đầu của quỹ đạo bóng bay
        p.hasBall = false;
        p.passCooldown = 0.38;
        p.setAction('pass', 0.4);
        this.ball.owner = null;
        this.audio.ballImpact('loft', 1.0);
        this.particles.emit(this.ball.pos.x, this.ball.pos.y, '#a8ffce', 8, { speed: 4 });
    }

    // ===== TRANH BÓNG (dùng chung nút với chuyền ngắn) =====
    // Có bóng → chuyền. Không có bóng → lao tới áp sát / xoạc bóng để đoạt lại bóng.
    tryTackle(who) {
        const p = who || this.currentControlledPlayer;
        if (!p || !p.active || p.hasBall) return;
        if ((p.tacklePressCd || 0) > 0) return;

        p.tacklePressCd = 0.4;
        p.setAction('tackle', 0.42);
        if (p.stamina > 8) p.stamina = Math.max(0, p.stamina - 6);

        const ball = this.ball;
        const oppOwner = (ball.owner && ball.owner.active && ball.owner.team !== p.team) ? ball.owner : null;

        // Hướng lao tới: ưu tiên người đang giữ bóng, nếu bóng tự do thì lao về phía bóng
        const targetX = oppOwner ? oppOwner.pos.x : ball.pos.x;
        const targetY = oppOwner ? oppOwner.pos.y : ball.pos.y;
        const ang = Math.atan2(targetY - p.pos.y, targetX - p.pos.x);
        const lunge = p.stamina > 25 ? 26 : 18;
        p.pos.x += Math.cos(ang) * lunge;
        p.pos.y += Math.sin(ang) * lunge;
        this.clampPlayerToField(p);
        this.particles.emit(p.pos.x, p.pos.y, '#ffd700', 6, { speed: 4 });

        // A) Bóng tự do (vừa bị cướp / bật ra khỏi chân) → ôm bóng nếu tới được
        if (!ball.owner) {
            const near = p.pos.dist(ball.pos) < p.radius + ball.radius + 22;
            if (near && (ball.height || 0) <= 24) {
                p.hasBall = true;
                p.ballProtectTimer = 0.25;
                ball.owner = p;
                ball.pos = p.pos.clone();
                ball.vel = new Vector2(0, 0);
                ball.height = 0;
                ball.heightVel = 0;
                this.audio.ballImpact('touch', 0.8);
            }
            return;
        }

        if (!oppOwner) return;                      // đồng đội đang giữ bóng → không tranh
        if (oppOwner.ballProtectTimer > 0) return;  // đối thủ đang che bóng

        // B) Đối thủ đang giữ bóng → xoạc bóng nếu vào tầm
        const d = p.pos.dist(oppOwner.pos);
        if (d > p.radius + oppOwner.radius + 24) return;

        let chance = p.role === Role.DEF ? 0.85 : (p.role === Role.MID ? 0.72 : 0.6);
        if (this.isHumanControlled(p)) chance += 0.1;
        if (Math.random() > chance) {
            // Xoạc hụt → đối thủ vẫn giữ bóng, phải chờ hồi chiêu
            p.tacklePressCd = 0.55;
            this.audio.ballImpact('touch', 0.55);
            return;
        }

        oppOwner.hasBall = false;
        oppOwner.ballProtectTimer = 0;
        oppOwner.ballStolenCooldown = 0.8;
        p.hasBall = true;
        p.ballProtectTimer = 0.45;
        ball.owner = p;
        ball.pos = p.pos.clone();
        ball.vel = new Vector2(0, 0);
        ball.height = 0;
        ball.heightVel = 0;
        this.particles.emitBurst(p.pos.x, p.pos.y, '#ffd700', 10);
        this.audio.ballImpact('tackle', 1.05);
        this.camera.shake(3, 0.15);
    }

    tryShoot(who) {
        const p = who || this.currentControlledPlayer;
        if (!p || !p.hasBall) return;

        // Shoot toward opponent goal - smart aim away from GK
        const goalX = p.team === 'red' ? this.field.x + this.field.width : this.field.x;
        const goalY = this.field.y + this.field.height / 2;
        let oppGK = null;
        for (const opp of p.opponents) {
            if (opp.active && opp.role === Role.GK) { oppGK = opp; break; }
        }
        let aimY;
        if (oppGK) {
            aimY = oppGK.pos.y < goalY ? goalY + this.goalHeight * 0.42 : goalY - this.goalHeight * 0.42;
            aimY += (Math.random() - 0.5) * 12;
        } else {
            aimY = goalY + (Math.random() - 0.5) * this.goalHeight * 0.9;
        }
        const angle = Math.atan2(aimY - p.pos.y, goalX - p.pos.x);

        this.ball.vel = Vector2.fromAngle(angle, 26);
        this.ball.hasPhysics = true;
        this.ball.height = 0;
        this.ball.heightVel = 0;
        p.hasBall = false;
        p.passCooldown = 0.35;
        p.setAction('kick', 0.5);
        this._lastShooter = p;
        this.ball.owner = null;
        this.audio.ballImpact('shoot', 1.25);
        this.particles.emit(this.ball.pos.x, this.ball.pos.y, '#ffdd00', 8, { speed: 5 });
        this.camera.shake(5, 0.2);
    }

    trySkill(who) {
        const p = who || this.currentControlledPlayer;
        if (!p || !p.hasBall) return;
        if (p.stamina < 25) return;
        if (p.skillCooldown > 0) return;

        p.stamina -= 25;
        p.skillCooldown = 2.5;  // 2.5 second cooldown

        // Dash toward opponent goal (beats defenders)
        const goalX = p.team === 'red' ? this.field.x + this.field.width : this.field.x;
        const goalY = this.field.y + this.field.height / 2;
        const angle = Math.atan2(goalY - p.pos.y, goalX - p.pos.x);
        const dashDist = 45;

        // Trail particles
        for (let i = 0; i < 8; i++) {
            const t = i / 8;
            this.particles.particles.push(new Particle(
                p.pos.x + Math.cos(angle) * dashDist * t,
                p.pos.y + Math.sin(angle) * dashDist * t,
                '#ffd700', Vector2.fromAngle(angle + Math.PI, 2), 0.4, 4
            ));
        }

        // Move player
        p.pos.x += Math.cos(angle) * dashDist;
        p.pos.y += Math.sin(angle) * dashDist;
        const f = this.field;
        p.pos.x = Math.max(f.x + 15, Math.min(f.x + f.width - 15, p.pos.x));
        p.pos.y = Math.max(f.y + 15, Math.min(f.y + f.height - 15, p.pos.y));

        // Ball follows
        this.ball.pos = p.pos.clone();
        this.ball.owner = p;
        p.hasBall = true;
        p.ballProtectTimer = 0.5;

        this.particles.emitBurst(p.pos.x, p.pos.y, '#ffd700', 20);
        this.audio.playTone(800, 0.15, 'sawtooth', 0.15);
        this.camera.shake(4, 0.15);
        p.setAction('skill', 0.6);
    }

    // Đổi cầu thủ điều khiển (Q / △) — áp dụng cho người chơi tương ứng
    switchPlayer(ctl) {
        const c = ctl || (this.controls && this.controls[0]);
        if (!c || !c.player) return;
        const team = c.player.team;
        const list = this.teamPlayers[team];
        const others = list.filter(p => p.role !== Role.GK);
        // bỏ qua cầu thủ đang do người chơi khác điều khiển
        const pool = others.filter(p => {
            const other = this.controlOf(p);
            return !other || other === c;
        });
        if (!pool.length) return;
        const idx = pool.indexOf(c.player);
        const next = pool[(idx + 1) % pool.length];
        if (!next || next === c.player) return;

        c.player.isControlled = false;
        c.player.aiControlled = true;
        c.player = next;
        next.isControlled = true;
        next.aiControlled = false;

        if (this.controls.indexOf(c) === 0) this.currentControlledPlayer = next;
        if (this.controls.indexOf(c) === 1) this.player2 = next;
        // giữ cầu thủ vừa chọn một lúc, tránh tự động đổi lại ngay
        this._autoSwitchCd = Math.max(this._autoSwitchCd || 0, 1.2);
        this.particles.emit(next.pos.x, next.pos.y, c.color || '#ffd700', 6, { speed: 4 });
    }

    // ===== Auto control switching =====
    switchControlTo(player) {
        const cp = this.currentControlledPlayer;
        if (!cp || cp === player || !player || !player.active) return;
        cp.isControlled = false;
        cp.aiControlled = true;
        player.isControlled = true;
        player.aiControlled = false;
        const c = this.controlOf(cp);
        if (c) c.player = player;
        this.currentControlledPlayer = player;
        // Hiệu ứng vàng đánh dấu mũi tên vừa nhảy sang cầu thủ mới
        this.particles.emit(player.pos.x, player.pos.y, '#ffd700', 5, { speed: 3 });
        this.particles.emit(player.pos.x, player.pos.y, '#ffd700', 6, { speed: 6, angle: -Math.PI / 2 });
    }

    updateControl(dt) {
        if (!this.controls || !this.controls.length) return;
        for (const ctl of this.controls) {
            if (!ctl.player) continue;
            if (!ctl.padReady()) continue;
            this.updateControlFor(dt, ctl);
        }
    }

    // Tự động đổi cầu thủ cho MỘT người chơi (không cướp cầu thủ của người kia)
    updateControlFor(dt, ctl) {
        const cp = ctl.player;
        if (!cp || !cp.active) return;
        const owner = this.ball.owner;
        const canTake = (pl) => {
            const other = this.controlOf(pl);
            return !other || other === ctl;
        };
        this._autoSwitchCd = Math.max(0, (this._autoSwitchCd || 0) - dt);
        this._possessSwitchCd = Math.max(0, (this._possessSwitchCd || 0) - dt);

        const applySwitch = (target) => {
            if (!target || target === ctl.player || !canTake(target)) return false;
            ctl.player.isControlled = false;
            ctl.player.aiControlled = true;
            ctl.player = target;
            target.isControlled = true;
            target.aiControlled = false;
            if (this.controls.indexOf(ctl) === 0) this.currentControlledPlayer = target;
            if (this.controls.indexOf(ctl) === 1) this.player2 = target;
            this.particles.emit(target.pos.x, target.pos.y, ctl.color || '#ffd700', 5, { speed: 3 });
            return true;
        };

        // A) Đồng đội đang giữ bóng -> chuyển sang người đó
        if (owner && owner.active && owner.team === cp.team && owner !== cp) {
            if (this._possessSwitchCd <= 0 && canTake(owner)) {
                if (applySwitch(owner)) this._possessSwitchCd = 0.45;
            }
            return;
        }

        // B) Đối phương cướp bóng -> mũi tên nhảy sang cầu thủ gần bóng nhất
        if (owner && owner.active && owner.team !== cp.team) {
            if (this._autoSwitchCd > 0) return;
            let nearest = null, nearestDist = cp.pos.dist(owner.pos);
            for (const p of this.teamPlayers[cp.team]) {
                if (!p.active || p.role === Role.GK) continue;
                if (!canTake(p)) continue;
                const d = p.pos.dist(owner.pos);
                if (d < nearestDist - 10) { nearestDist = d; nearest = p; }
            }
            if (nearest && nearest !== cp) {
                if (applySwitch(nearest)) this._autoSwitchCd = 0.55;
            }
            return;
        }

        // C) Bóng tự do -> sang người gần bóng nhất (nếu gần hơn hẳn)
        if (!owner && this.ball.hasPhysics) {
            if (this._autoSwitchCd > 0) return;
            let nearest = null, nearestDist = Infinity;
            for (const p of this.teamPlayers[cp.team]) {
                if (!p.active || p.role === Role.GK) continue;
                if (!canTake(p)) continue;
                const d = p.pos.dist(this.ball.pos);
                if (d < nearestDist) { nearestDist = d; nearest = p; }
            }
            if (nearest && nearest !== cp && nearestDist < cp.pos.dist(this.ball.pos) - 80) {
                if (applySwitch(nearest)) this._autoSwitchCd = 1.0;
            }
        }
    }

    aiChaseFactor() {
        return this.difficulty === 'easy' ? 0.7
            : this.difficulty === 'hard' ? 1.0
            : this.difficulty === 'legend' ? 1.1
            : 0.9;
    }

    // ============= AI =============
    updateAI(dt) {
        for (const p of this.players) {
            if (!p.aiControlled || !p.active) continue;
            if (p === this.currentControlledPlayer) continue;
            if (this.isHumanControlled(p)) continue;   // P1 hoặc P2 đang điều khiển
            this.updatePlayerAI(p, dt);
        }
    }

    updatePlayerAI(p, dt) {
        const ball = this.ball;
        const bPos = ball.pos;

        // ---------- GOALKEEPER AI ----------
        if (p.role === Role.GK) {
            const isRed = p.team === 'red';
            const goalLineX = isRed ? this.field.x + 40 : this.field.x + this.field.width - 40;
            const gkX = isRed ? goalLineX + 25 : goalLineX - 25;
            const goalY = this.field.y + this.field.height / 2;
            const maxMove = 65;

            // Track ball Y (slowly, beatable by corner shots)
            let targetY = goalY + (bPos.y - goalY) * 0.4;
            targetY = Math.max(goalY - maxMove, Math.min(goalY + maxMove, targetY));
            targetY = Math.max(this.field.y + 25, Math.min(this.field.y + this.field.height - 25, targetY));

            p.pos.y += (targetY - p.pos.y) * 0.07;  // Moderate tracking - beatable by corners
            p.pos.x += (gkX - p.pos.x) * 0.06;

            // If GK has the ball, kick it away
            if (p.hasBall) {
                p.gkKickCd = (p.gkKickCd || 0) - 1;
                if (p.gkKickCd <= 0) {
                    const dir = isRed ? 0 : Math.PI;
                    this.ball.vel = Vector2.fromAngle(dir + (Math.random() - 0.5) * 0.5, 20);
                    this.audio.ballImpact('gk', 0.95);
                    this.ball.owner = null;
                    p.hasBall = false;
                    p.passCooldown = 0.4;
                    p.setAction('kick', 0.5);
                    for (const pp of this.players) pp.hasBall = false;
                    p.gkKickCd = 20;  // 20 frames cooldown
                }
            }
            return;
        }

        // ---------- OUTFIELD AI ----------
        const goalX = p.team === 'red' ? this.field.x + this.field.width : this.field.x;
        const goalY = this.field.y + this.field.height / 2;
        const distToGoal = Math.hypot(p.pos.x - goalX, p.pos.y - goalY);
        const hasBall = p.hasBall;

        if (hasBall) {
            // Find nearest opponent
            let nearestOpp = null, nearestDist = Infinity;
            for (const opp of p.opponents) {
                if (!opp.active) continue;
                const d = p.pos.dist(opp.pos);
                if (d < nearestDist) { nearestDist = d; nearestOpp = opp; }
            }

            // Nhịp ra quyết định nhanh kiểu FIFA 99: bóng luân chuyển liên tục
            p.aiDecisionCd = Math.max(0, (p.aiDecisionCd || 0) - dt);
            if (p.aiDecisionCd <= 0) {
                p.aiDecisionCd = 0.14 + Math.random() * 0.12;
                p.aiPassOption = this.bestPassOption(p, goalX, goalY);
            }

            // Shoot when in range (increased range)
            if (distToGoal < 380 && (nearestDist < 65 || Math.random() < 0.10)) {
                let oppGK = null;
                for (const opp of p.opponents) {
                    if (opp.active && opp.role === Role.GK) { oppGK = opp; break; }
                }
                let aimY;
                if (oppGK) {
                    aimY = oppGK.pos.y < goalY ? goalY + this.goalHeight * 0.42 : goalY - this.goalHeight * 0.42;
                    aimY += (Math.random() - 0.5) * 12;
                } else {
                    aimY = goalY + (Math.random() - 0.5) * this.goalHeight * 0.9;
                }
                const angle = Math.atan2(aimY - p.pos.y, goalX - p.pos.x);
                this.ball.vel = Vector2.fromAngle(angle, 24);
                this.audio.ballImpact('shoot', 1.0);
                this.ball.owner = null;
                p.hasBall = false;
                p.passCooldown = 0.35;
                p.setAction('kick', 0.5);
                this._lastShooter = p;
                return;
            }

            // ===== CHUYỀN BÓNG: ưu tiên phối hợp nhanh, luân chuyển bóng liên tục =====
            const opt = p.aiPassOption;
            if (opt && opt.mate) {
                // Bị áp sát thì buộc phải chuyền; có phương án tốt thì chuyền sớm
                const forced = nearestDist < 46;
                const wantsPass = forced
                    || opt.score > 46
                    || (opt.score > 22 && Math.random() < 0.5)
                    || (nearestDist < 105 && opt.score > 8);
                if (wantsPass) {
                    this.aiPass(p, opt.mate, opt.loft);
                    return;
                }
            }

            // Bí bóng ở sân nhà → phá bóng dài lên phía trên
            const ownGoalX = p.team === 'red' ? this.field.x : this.field.x + this.field.width;
            if (nearestDist < 55 && Math.abs(p.pos.x - ownGoalX) < 190) {
                const dir = p.team === 'red' ? 0 : Math.PI;
                const ang = dir + (Math.random() - 0.5) * 0.7;
                this.ball.vel = Vector2.fromAngle(ang, 22);
                this.audio.ballImpact('loft', 0.8);
                this.ball.hasPhysics = true;
                this.ball.height = 0; this.ball.heightVel = 0;
                this.ball.owner = null;
                p.hasBall = false;
                p.passCooldown = 0.35;
                p.setAction('kick', 0.4);
                return;
            }

            // Dribble toward goal, sidestepping defenders
            let moveAngle = Math.atan2(goalY - p.pos.y, goalX - p.pos.x);
            // Find blocking opponent in front
            let blockOpp = null, blockDist = Infinity;
            for (const opp of p.opponents) {
                if (!opp.active) continue;
                const d = p.pos.dist(opp.pos);
                if (d >= 75) continue;
                const angToOpp = Math.atan2(opp.pos.y - p.pos.y, opp.pos.x - p.pos.x);
                let diff = angToOpp - moveAngle;
                while (diff > Math.PI) diff -= 2 * Math.PI;
                while (diff < -Math.PI) diff += 2 * Math.PI;
                if (Math.abs(diff) < 0.9 && d < blockDist) {
                    blockDist = d;
                    blockOpp = opp;
                }
            }
            // Sidestep around blocker
            if (blockOpp) {
                const side = p.pos.y < blockOpp.pos.y ? 1 : -1;
                moveAngle += side * 0.9;
            }
            p.pos.x += Math.cos(moveAngle) * p.maxSpeed * 0.85;
            p.pos.y += Math.sin(moveAngle) * p.maxSpeed * 0.85;
            return;
        }

        // ---------- NO BALL: SUPPORT / DEFEND ----------
        const fld = this.field;
        const midY = fld.y + fld.height / 2;
        const ownGoalX = p.team === 'red' ? fld.x : fld.x + fld.width;
        const oppGoalX = p.team === 'red' ? fld.x + fld.width : fld.x;

        // A) ĐỒNG ĐỘI đang giữ bóng --> chạy chỗ để nhận đường chuyền
        if (ball.owner && ball.owner.active && ball.owner.team === p.team && ball.owner !== p) {
            this.aiSupportRun(p, ball.owner, oppGoalX, midY);
            p.aiRole = 'support';
            return;
        }

        // B) Bóng tự do --> đua tranh bóng
        if (!ball.owner && bPos.dist(p.pos) < 320) {
            const angle = Math.atan2(bPos.y - p.pos.y, bPos.x - p.pos.x);
            const chaseSpeed = p.maxSpeed * this.aiChaseFactor();
            p.pos.x += Math.cos(angle) * chaseSpeed;
            p.pos.y += Math.sin(angle) * chaseSpeed;
            p.aiRole = 'chase';
            return;
        }

        // C) ĐỐI PHƯƠNG giữ bóng --> 1 người áp sát tranh bóng, những người còn lại LÙI VỀ phòng thủ
        if (ball.owner && ball.owner.active && ball.owner.team !== p.team) {
            this.aiDefend(p, ball.owner, ownGoalX, midY);
            return;
        }

        // D) Giữ đội hình phòng thủ dự phòng
        this.aiHoldShape(p, ownGoalX, midY, bPos);
    }

    // ===== Chọn phương án chuyền tốt nhất (kiểu FIFA 99: chuyền nhanh, ít rê bóng) =====
    bestPassOption(p, goalX, goalY) {
        const dir = p.team === 'red' ? 1 : -1;
        const mates = p.teamMates.filter(m => m.active && m.role !== Role.GK);
        let best = null;
        for (const m of mates) {
            const d = p.pos.dist(m.pos);
            if (d < 32 || d > 470) continue;

            // độ thoáng của người nhận
            let open = 999;
            for (const o of p.opponents) {
                if (!o.active) continue;
                const od = m.pos.dist(o.pos);
                if (od < open) open = od;
            }
            // bị chặn đường chuyền?
            let lane = 999;
            for (const o of p.opponents) {
                if (!o.active) continue;
                const d2 = pointToSegmentDist(o.pos, p.pos, m.pos);
                if (d2 < lane) lane = d2;
            }
            const ahead = (m.pos.x - p.pos.x) * dir;
            const mGoalDist = Math.hypot(m.pos.x - goalX, m.pos.y - goalY);

            let score = Math.min(open, 190) * 0.55
                + ahead * 0.32
                - d * 0.16
                - (lane < 26 ? (26 - lane) * 2.2 : 0)
                + (200 - Math.min(mGoalDist, 200)) * 0.12;
            if (m.role === Role.FWD) score += 8;

            // Bóng bổng khi bị chặn hẳn ở cự ly xa
            const loft = lane < 26 && d > 170 && open > 70;

            if (!best || score > best.score) best = { mate: m, score, loft, dist: d, lane };
        }
        return best;
    }

    // AI thực hiện đường chuyền
    aiPass(p, mate, loft) {
        const angle = Math.atan2(mate.pos.y - p.pos.y, mate.pos.x - p.pos.x);
        if (loft) {
            this.ball.vel = Vector2.fromAngle(angle, 14);
            this.ball.height = 2;
            this.ball.heightVel = 9.0;
        } else {
            this.ball.vel = Vector2.fromAngle(angle, 19);
            this.ball.height = 0;
            this.ball.heightVel = 0;
        }
        this.ball.hasPhysics = true;
        this.ball.owner = null;
        p.hasBall = false;
        p.passCooldown = 0.3;
        p.setAction('pass', 0.3);
        p.aiDecisionCd = 0.25;
        this.audio.ballImpact(loft ? 'loft' : 'pass', 0.7);
    }

    // ----- Đồng đội có bóng: chạy chỗ tạo khoảng trống để nhận chuyền -----
    aiSupportRun(p, owner, oppGoalX, midY) {
        const f = this.field;
        const attackDir = p.team === 'red' ? 1 : -1;
        const wing = p.wing || (p.pos.y < midY ? -1 : 1);

        // Vị trí hỗ trợ: phía trước người giữ bóng, dạt cánh theo wing
        let ahead = p.role === Role.FWD ? 190 : (p.role === Role.MID ? 130 : 110);
        let spread = p.role === Role.FWD ? 130 : (p.role === Role.MID ? 95 : 70);

        // Người giữ bóng đang ở sát khung thành đối phương → tiền đạo lao vào vòng cấm
        const ownerToGoal = Math.abs(oppGoalX - owner.pos.x);
        if (p.role === Role.FWD && ownerToGoal < 260) {
            ahead = 95;
            spread = 55 + Math.random() * 25;
        }
        // Tiền vệ dâng lên hỗ trợ khi đội đang tấn công
        if (p.role === Role.MID) ahead += Math.max(0, 1 - ownerToGoal / 620) * 70;

        // Chạy chỗ: tiến lên theo trục dọc sân trước, rồi mới dạt cánh dần
        // (giúp đội luôn có người phía trên bóng như FIFA 99)
        let tx = owner.pos.x + attackDir * ahead;
        const desiredY = midY + wing * spread;
        let ty = p.pos.y + (desiredY - p.pos.y) * 0.55;

        // Tránh đối thủ: nếu điểm đến gần đối thủ thì lùi/trượt ra vùng trống
        for (const opp of p.opponents) {
            if (!opp.active) continue;
            const d = Math.hypot(tx - opp.pos.x, ty - opp.pos.y);
            if (d < 75) {
                const ang = Math.atan2(ty - opp.pos.y, tx - opp.pos.x);
                const push = 75 - d;
                tx += Math.cos(ang) * push;
                ty += Math.sin(ang) * push;
            }
        }

        // Không dồn vào người giữ bóng
        const dOwner = Math.hypot(tx - owner.pos.x, ty - owner.pos.y);
        if (dOwner < 65) {
            const ang = Math.atan2(ty - owner.pos.y, tx - owner.pos.x);
            tx = owner.pos.x + Math.cos(ang) * 65;
            ty = owner.pos.y + Math.sin(ang) * 65;
        }

        // Giới hạn sân
        const m = 28;
        tx = Math.max(f.x + m, Math.min(f.x + f.width - m, tx));
        ty = Math.max(f.y + m, Math.min(f.y + f.height - m, ty));

        let ang = Math.atan2(ty - p.pos.y, tx - p.pos.x);

        // Không chạy xuyên qua người đang giữ bóng (tránh va chạm / mất bóng oan)
        const dOwnerNow = p.pos.dist(owner.pos);
        if (dOwnerNow < 120) {
            const toOwner = Math.atan2(owner.pos.y - p.pos.y, owner.pos.x - p.pos.x);
            let diff = ang - toOwner;
            while (diff > Math.PI) diff -= 2 * Math.PI;
            while (diff < -Math.PI) diff += 2 * Math.PI;
            if (Math.abs(diff) < 0.6) {
                ang = toOwner + (diff >= 0 ? 0.9 : -0.9);
            }
        }

        const spd = p.maxSpeed * 0.95;
        p.pos.x += Math.cos(ang) * spd;
        p.pos.y += Math.sin(ang) * spd;
    }

    // ----- Đối phương có bóng: người gần nhất áp sát, còn lại lùi về phòng thủ -----
    aiDefend(p, owner, ownGoalX, midY) {
        const f = this.field;
        const chaseFactor = this.aiChaseFactor();
        // Người chơi (P1/P2) đang ở gần bóng và thuộc đội đang phòng thủ hay không
        let controlled = null, controlledDist = Infinity;
        for (const hp of this.humanPlayers()) {
            if (hp.team !== p.team) continue;
            const d = hp.pos.dist(owner.pos);
            if (d < controlledDist) { controlledDist = d; controlled = hp; }
        }
        const controlledOnDefense = !!controlled;

        const myDist = p.pos.dist(owner.pos);

        // Tôi có phải AI gần bóng nhất không?
        let isNearestAI = true;
        for (const mate of p.teamMates) {
            if (!mate.active || mate === controlled) continue;
            if (mate.pos.dist(owner.pos) < myDist - 10) { isNearestAI = false; break; }
        }

        // Nếu người chơi (controlled) đang ở gần bóng -> người đó áp sát, AI lùi về.
        // Nếu người chơi ở xa -> AI gần nhất áp sát thay.
        const humanPressing = controlledOnDefense && controlledDist < 150;

        if (isNearestAI && !humanPressing) {
            // ÁP SÁT trực tiếp người giữ bóng để tranh
            const ang = Math.atan2(owner.pos.y - p.pos.y, owner.pos.x - p.pos.x);
            const spd = p.maxSpeed * chaseFactor;
            p.pos.x += Math.cos(ang) * spd;
            p.pos.y += Math.sin(ang) * spd;
            p.aiRole = 'press';
            return;
        }

        // LÙI VỀ đội hình phòng thủ giữa bóng và khung thành nhà
        const wing = p.wing || (p.pos.y < midY ? -1 : 1);
        const ratio = p.role === Role.DEF ? 0.35 : 0.55;
        let tx = ownGoalX + (owner.pos.x - ownGoalX) * ratio;
        let ty = midY + wing * (p.role === Role.DEF ? 105 : 70);

        const m = 28;
        tx = Math.max(f.x + m, Math.min(f.x + f.width - m, tx));
        ty = Math.max(f.y + m, Math.min(f.y + f.height - m, ty));

        const ang = Math.atan2(ty - p.pos.y, tx - p.pos.x);
        const spd = p.maxSpeed * 0.82;
        p.pos.x += Math.cos(ang) * spd;
        p.pos.y += Math.sin(ang) * spd;
        p.aiRole = 'fallback';
    }

    // ----- Giữ đội hình phòng thủ dự phòng -----
    aiHoldShape(p, ownGoalX, midY, bPos) {
        const f = this.field;
        const wing = p.wing || (p.pos.y < midY ? -1 : 1);
        let homeX = ownGoalX + (bPos.x - ownGoalX) * (p.role === Role.DEF ? 0.4 : 0.62);
        let homeY = midY + wing * (p.role === Role.DEF ? 100 : 65);
        const m = 28;
        homeX = Math.max(f.x + m, Math.min(f.x + f.width - m, homeX));
        homeY = Math.max(f.y + m, Math.min(f.y + f.height - m, homeY));
        p.pos.x += (homeX - p.pos.x) * 0.035;
        p.pos.y += (homeY - p.pos.y) * 0.035;
        p.aiRole = 'hold';
    }

    // ============= BALL =============
    updateBall(dt) {
        const ball = this.ball;

        // Ball follows its owner
        if (ball.owner && ball.owner.active && ball.owner.hasBall) {
            ball.height = 0;
            ball.heightVel = 0;
            if (this.isHumanControlled(ball.owner)) {
                return; // Human control handled in handleHumanInput
            }
            // AI owner: ball in front of player, toward opponent goal
            const oppGoalX = ball.owner.team === 'red' ? this.field.x + this.field.width : this.field.x;
            const oppGoalY = this.field.y + this.field.height / 2;
            const angle = Math.atan2(oppGoalY - ball.owner.pos.y, oppGoalX - ball.owner.pos.x);
            ball.pos.x = ball.owner.pos.x + Math.cos(angle) * 14;
            ball.pos.y = ball.owner.pos.y + Math.sin(angle) * 14;
            ball.vel = new Vector2(0, 0);
            return;
        }

        // Physics
        if (ball.hasPhysics) {
            // Friction
            ball.vel.mul(0.985);
            // Gravity-ish wobble
            ball.vel.mul(0.99);

            // --- Độ cao bóng (chuyền bóng bổng): bay theo quỹ đạo parabol rồi rơi xuống ---
            if (ball.height > 0 || ball.heightVel > 0) {
                ball.height += ball.heightVel * dt * 60;
                ball.heightVel -= 0.42 * dt * 60;          // trọng lực
                if (ball.height <= 0) {
                    ball.height = 0;
                    // nảy nhẹ khi chạm đất rồi lăn tiếp
                    if (ball.heightVel < -2.5) ball.heightVel = -ball.heightVel * 0.35;
                    else ball.heightVel = 0;
                    ball.vel.mul(0.92);
                }
                if (ball.height > 130) { ball.height = 130; ball.heightVel = 0; }
            }

            // Move
            ball.pos.x += ball.vel.x * dt * 60;
            ball.pos.y += ball.vel.y * dt * 60;

            // Stop very slow balls
            if (ball.vel.mag() < 0.1) {
                ball.vel = new Vector2(0, 0);
            }

            // ===== CỘT DỌC & XÀ NGANG (khung thành) =====
            this.checkGoalFrame(dt);

            // Wall collisions
            const f = this.field;
            const margin = 6;
            const leftGoalY = f.y + f.height / 2;
            const goalHalf = this.goalHeight / 2;

            // Check if within goal vertical range
            const inGoalY = Math.abs(ball.pos.y - leftGoalY) < goalHalf;
            // Bóng bay cao hơn xà ngang thì coi như đập vào tường phía trên khung thành
            // (vẫn bật lại, không bay ra ngoài sân)
            const barHH = this.goalBarHeight || Math.round(this.goalHeight * 0.45);
            const overBar = (ball.height || 0) * 0.8 > barHH - ball.radius * 0.5;

            // Left/Right walls (bounce unless in goal area)
            this._wallSoundCd = Math.max(0, (this._wallSoundCd || 0) - dt);
            if (ball.pos.x < f.x + margin) {
                if (!inGoalY || overBar) {
                    ball.pos.x = f.x + margin;
                    this.bounceWallSound(ball, 'x');
                    ball.vel.x *= -0.7;
                }
            }
            if (ball.pos.x > f.x + f.width - margin) {
                if (!inGoalY || overBar) {
                    ball.pos.x = f.x + f.width - margin;
                    this.bounceWallSound(ball, 'x');
                    ball.vel.x *= -0.7;
                }
            }
            // Top/Bottom walls
            if (ball.pos.y < f.y + margin) {
                ball.pos.y = f.y + margin;
                this.bounceWallSound(ball, 'y');
                ball.vel.y *= -0.7;
            }
            if (ball.pos.y > f.y + f.height - margin) {
                ball.pos.y = f.y + f.height - margin;
                this.bounceWallSound(ball, 'y');
                ball.vel.y *= -0.7;
            }

            // ===== Chốt an toàn: bóng không bao giờ vượt hẳn ra ngoài đường biên =====
            // (bàn thắng đã được nhận ở vạch goalDepth trước đó nên không bị ảnh hưởng)
            if (ball.pos.x < f.x) { ball.pos.x = f.x; if (ball.vel.x < 0) ball.vel.x *= -0.6; }
            if (ball.pos.x > f.x + f.width) { ball.pos.x = f.x + f.width; if (ball.vel.x > 0) ball.vel.x *= -0.6; }
            if (ball.pos.y < f.y) { ball.pos.y = f.y; if (ball.vel.y < 0) ball.vel.y *= -0.6; }
            if (ball.pos.y > f.y + f.height) { ball.pos.y = f.y + f.height; if (ball.vel.y > 0) ball.vel.y *= -0.6; }

            // Player-ball collision (no owner)
            // Bóng đang bay cao (chuyền bổng) thì không ai chạm được
            if (!ball.owner && ball.height < 24) {
                for (const p of this.players) {
                    if (!p.active) continue;
                    if (p.passCooldown > 0) continue;
                    const d = p.pos.dist(ball.pos);
                    if (d < p.radius + ball.radius + 4) {
                        // Player touches ball - can steal
                        if (!p.hasBall) {
                            p.hasBall = true;
                            ball.owner = p;
                            ball.vel = new Vector2(0, 0);
                            ball.height = 0;
                            ball.heightVel = 0;
                            this.audio.ballImpact('touch', 0.65);
                            p.hasBall = true;
                        }
                        break;
                    }
                }
            }
        }
    }

    // Bóng đập tường bao -> tiếng "thịch" (chỉ khi bóng bay đủ nhanh)
    bounceWallSound(ball, axis) {
        if ((this._wallSoundCd || 0) > 0) return;
        const speed = Math.abs(axis === 'x' ? ball.vel.x : ball.vel.y);
        if (speed < 3) return;
        this._wallSoundCd = 0.12;
        this.audio.playWall();
        if (speed > 14) this.camera.shake(1.5, 0.08);
    }

    // ===== Va chạm CỘT DỌC và XÀ NGANG =====
    // Bóng đập cột/xà sẽ dội ra kèm tiếng "keng" kim loại thay vì vào lưới.
    checkGoalFrame(dt) {
        const ball = this.ball;
        const f = this.field;
        const cz = f.y + f.height / 2;
        const goalHalf = this.goalHeight / 2;
        const postR = this.goalPostRadius || 2.1;
        const barH = this.goalBarHeight || Math.round(this.goalHeight * 0.45);
        const bR = ball.radius;
        this._barHitCd = Math.max(0, (this._barHitCd || 0) - dt);
        this._goalBlockTimer = Math.max(0, (this._goalBlockTimer || 0) - dt);
        if (this._barHitCd > 0) return;

        const centerY3 = bR + (ball.height || 0) * 0.8;      // độ cao tâm bóng trong không gian 3D
        const nearGoalLineL = Math.abs(ball.pos.x - f.x) < bR + postR + 4;
        const nearGoalLineR = Math.abs(ball.pos.x - (f.x + f.width)) < bR + postR + 4;

        for (const gx of [f.x, f.x + f.width]) {
            // --- Cột dọc: hai bên mép khẩu độ ---
            for (const sgn of [-1, 1]) {
                const py = cz + sgn * goalHalf;
                const dx = ball.pos.x - gx;
                const dy = ball.pos.y - py;
                const d = Math.hypot(dx, dy);
                // chỉ tính cột ở phần dưới xà
                if (d < bR + postR && centerY3 - bR < barH) {
                    let nx = d > 0.001 ? dx / d : (gx < f.x + 1 ? 1 : -1);
                    const ny = d > 0.001 ? dy / d : 0;
                    // luôn dội bóng TRỞ LẠI trong sân (tránh bắn ra ngoài biên)
                    if (gx < f.x + 1) nx = Math.abs(nx) || 1;
                    else nx = -Math.abs(nx) || -1;
                    ball.pos.x = gx + nx * (bR + postR + 0.6);
                    ball.pos.y = py + ny * (bR + postR + 0.6);
                    ball.pos.x = Math.max(f.x + 2, Math.min(f.x + f.width - 2, ball.pos.x));
                    ball.pos.y = Math.max(f.y + 2, Math.min(f.y + f.height - 2, ball.pos.y));
                    const vn = ball.vel.x * nx + ball.vel.y * ny;
                    ball.vel.x = (ball.vel.x - 2 * vn * nx) * 0.68;
                    ball.vel.y = (ball.vel.y - 2 * vn * ny) * 0.68;
                    this.audio.playPost();
                    this.particles.emit(ball.pos.x, ball.pos.y, '#ffffff', 7, { speed: 6 });
                    this.camera.shake(3.5, 0.14);
                    this._barHitCd = 0.22;
                    this._goalBlockTimer = 0.3;
                    this._frameHit = 'post';
                    return;
                }
            }

            // --- Xà ngang: bóng bay tới vạch với độ cao đúng tầm xà ---
            const nearLine = gx < f.x + 1 ? nearGoalLineL : nearGoalLineR;
            if (nearLine && Math.abs(ball.pos.y - cz) < goalHalf + bR &&
                Math.abs(centerY3 - barH) < bR + postR * 0.8) {
                const outDir = gx < f.x + 1 ? 1 : -1;      // đẩy bóng ra khỏi khung thành
                ball.pos.x = gx + outDir * (bR + 10);
                ball.vel.x = -ball.vel.x * 0.55;
                ball.vel.y *= 0.7;
                ball.height = Math.max(1.5, (ball.height || 0) * 0.55);
                ball.heightVel = -Math.max(2.2, Math.abs(ball.heightVel || 0) * 0.5);
                this.audio.playCrossbar();
                this.particles.emit(ball.pos.x, ball.pos.y, '#ffffff', 9, { speed: 7 });
                this.camera.shake(4.5, 0.18);
                this._barHitCd = 0.25;
                this._goalBlockTimer = 0.35;
                this._frameHit = 'bar';
                return;
            }
        }
    }

    // ============= POSSESSION =============
    separatePlayers() {
        const players = this.players;
        for (let i = 0; i < players.length; i++) {
            for (let j = i + 1; j < players.length; j++) {
                const a = players[i], b = players[j];
                if (!a.active || !b.active) continue;
                const dx = b.pos.x - a.pos.x;
                const dy = b.pos.y - a.pos.y;
                const d = Math.hypot(dx, dy);
                const minDist = a.radius + b.radius;
                if (d < minDist && d > 0.01) {
                    const overlap = (minDist - d) / 2;
                    const nx = dx / d, ny = dy / d;
                    a.pos.x -= nx * overlap;
                    a.pos.y -= ny * overlap;
                    b.pos.x += nx * overlap;
                    b.pos.y += ny * overlap;
                    // Keep human player grounded to their desired position
                    const f = this.field;
                    const m = 15;
                    a.pos.x = Math.max(f.x + m, Math.min(f.x + f.width - m, a.pos.x));
                    a.pos.y = Math.max(f.y + m, Math.min(f.y + f.height - m, a.pos.y));
                    b.pos.x = Math.max(f.x + m, Math.min(f.x + f.width - m, b.pos.x));
                    b.pos.y = Math.max(f.y + m, Math.min(f.y + f.height - m, b.pos.y));
                }
            }
        }
    }

    checkPossession(dt) {
        // Update possession team based on ball ownership
        for (const p of this.players) {
            if (!p.hasBall) continue;
            if (p.pos.dist(this.ball.pos) > 30) {
                p.hasBall = false;
                this.ball.owner = null;
            } else {
                this.possessionTeam = p.team;
            }
        }
    }

    checkSteal() {
        const owner = this.ball.owner;
        if (!owner || !owner.active) return;
        if (owner.ballProtectTimer > 0) return;

        for (const p of this.players) {
            if (p === owner || !p.active) continue;
            if (p.hasBall) continue;
            if (p.tackleCooldown > 0) continue;

            const d = p.pos.dist(owner.pos);
            if (d > p.radius + owner.radius + 3) continue;

            // Attempt tackle, cooldown 0.6s
            p.tackleCooldown = 0.6;

            let chance = 0.08;
            if (p.role === Role.DEF) chance = 0.18;
            else if (p.role === Role.MID) chance = 0.12;
            else if (p.role === Role.FWD) chance = 0.06;
            
            if (this.isHumanControlled(p)) chance += 0.06;

            if (Math.random() < chance) {
                owner.hasBall = false;
                owner.ballProtectTimer = 0;
                p.hasBall = true;
                p.ballProtectTimer = 0.4;
                this.ball.owner = p;
                this.ball.vel = new Vector2(0, 0);
                p.setAction('tackle', 0.5);
                this.audio.ballImpact('tackle', 1.0);
                this.particles.emit(p.pos.x, p.pos.y, '#ffd700', 8, { speed: 5 });
                return;
            }
        }
    }

    clampPlayerToField(p) {
        const f = this.field;
        const m = p.radius + 4;
        p.pos.x = Math.max(f.x + m, Math.min(f.x + f.width - m, p.pos.x));
        p.pos.y = Math.max(f.y + m, Math.min(f.y + f.height - m, p.pos.y));
    }

    // ============= GOAL DETECTION =============
    checkGoal() {
        if (this.state !== GameState.PLAYING) return;
        if ((this._goalBlockTimer || 0) > 0) return;
        const f = this.field;
        const b = this.ball.pos;
        const centerY = f.y + f.height / 2;
        const goalHalf = this.goalHeight / 2;
        const goalDepth = 30;

        const inGoalY = Math.abs(b.y - centerY) < goalHalf;

        if (!inGoalY) return;
        // Bóng bay quá cao (vượt xà ngang) thì không tính bàn
        const barH = this.goalBarHeight || Math.round(this.goalHeight * 0.45);
        if ((this.ball.height || 0) * 0.8 > barH - this.ball.radius * 0.5) return;

        // Right goal → RED scores (Red attacks right)
        if (b.x > f.x + f.width - goalDepth) {
            this.redScore++;
            this.audio.playNet();
            this.celebration('red', 'ĐỎ GHI BÀN!');
            this.audio.playGoal();
        }
        // Left goal → BLUE scores
        else if (b.x < f.x + goalDepth) {
            this.blueScore++;
            this.audio.playNet();
            this.celebration('blue', 'XANH GHI BÀN!');
            this.audio.playGoal();
        }
    }

    celebration(team, text) {
        this.state = GameState.GOAL_CELEBRATION;
        this.goalCelebrationTimer = 1.5;
        this._lastGoalTime = Date.now();
        this._stallTimer = 0;

        // Reset ball immediately to center to prevent multi-scoring
        this.ball.pos = new Vector2(this.field.x + this.field.width / 2, this.field.y + this.field.height / 2);
        this.ball.vel = new Vector2(0, 0);
        this.ball.height = 0;
        this.ball.heightVel = 0;
        this.ball.owner = null;
        for (const p of this.players) p.hasBall = false;

        // Cầu thủ ghi bàn gần nhất (dùng cho camera + animation ăn mừng)
        const scorers = this.teamPlayers[team] || [];
        const shooter = this._lastShooter;
        this.lastScorer = (shooter && shooter.team === team) ? shooter : (scorers[0] || null);
        this._lastShooter = null;
        this._goalTeam = team;
        for (const p of scorers) {
            if (p === this.lastScorer) p.setAction('celebrate', 1.6);
            else p.setAction('celebrate', 1.6);
        }

        this.particles.emitBurst(
            this.field.x + this.field.width / 2,
            this.field.y + this.field.height / 2,
            team === 'red' ? '#e94560' : '#4ecdc4',
            40
        );
        this.camera.shake(10, 0.4);

        // Khán đài bùng nổ + trọng tài thổi còi công nhận bàn thắng
        this.crowdCheer(1.5);
        this.audio.playShortWhistle();
        if (this.referee) {
            const goalSideX = team === 'red' ? this.field.x + this.field.width : this.field.x;
            this.referee.pos = new Vector2(
                goalSideX + (team === 'red' ? -70 : 70),
                this.field.y + this.field.height / 2
            );
            this.referee.setAction('celebrate', 1.2);
        }

        // Banner kiểu FIFA 99: GOAL!!! + số phút + người ghi bàn
        const minute = Math.max(1, Math.ceil((this.matchTotalSeconds - this.matchTimer) / 60));
        const scorerName = (this.lastScorer && this.lastScorer.playerNum) ? ('#' + this.lastScorer.playerNum + ' ') : '';
        this.showBanner('GOAL!!! ' + scorerName + '· ' + minute + "'", 1.9);

        const el = document.getElementById('goal-celebration');
        if (el) {
            const goalText = document.getElementById('goal-text');
            const scorerText = document.getElementById('scorer-text');
            // Kiểu FIFA 99: GOAL!!! + số áo + phút thi đấu
            if (goalText) goalText.textContent = 'GOAL!!!';
            if (scorerText) {
                scorerText.textContent = (scorerName ? scorerName.trim() + '  ·  ' : '') + minute + "'  ·  " + text;
            }
            el.classList.remove('hidden');
            el.classList.add('active');
        }
        this.updateHUD();
    }

    showMatchEnd() {
        const endEl = document.getElementById('match-end');
        if (endEl) {
            endEl.classList.remove('hidden');
            endEl.classList.add('active');
        }
        const redWin = this.redScore > this.blueScore;
        const draw = this.redScore === this.blueScore;
        document.getElementById('final-result').textContent = draw ? 'HÒA!' : (redWin ? 'ĐỘI ĐỎ THẮNG!' : 'ĐỘI XANH THẮNG!');
        document.getElementById('final-score').textContent = `${this.redScore} - ${this.blueScore}`;
        const winner = redWin ? 'ĐỎ' : (draw ? 'Cả hai' : 'XANH');
        document.getElementById('match-stats').textContent =
            `Kết thúc trận đấu • ${winner} giành chiến thắng`;
        // Đếm ngược tự động về menu chính
        this.menuReturnTimer = this.menuReturnDelay || 8;
        const timerEl = document.getElementById('menu-return-timer');
        if (timerEl) timerEl.textContent = Math.ceil(this.menuReturnTimer) + 's';
        this.hideBanner();
        this.crowdCheer(1);
    }

    updateHUD() {
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        set('red-score', this.redScore);
        set('blue-score', this.blueScore);
        const min = Math.floor(this.matchTimer / 60);
        const sec = Math.floor(this.matchTimer % 60);
        set('match-timer', `${min}:${sec.toString().padStart(2, '0')}`);
        set('possession-team', this.possessionTeam === 'red' ? 'ĐỎ' : 'XANH');
        if (this.currentControlledPlayer) {
            const names = { goalkeeper: 'THỦ MÔN', defender: 'HẬU VỆ', midfielder: 'TIỀN VỆ', forward: 'TIỀN ĐẠO' };
            set('controlled-player-name', names[this.currentControlledPlayer.role] || 'CẦU THỦ');
            // Update stamina bar
            const fill = document.getElementById('skill-fill');
            if (fill && fill.style) {
                const pct = Math.max(0, Math.min(100, (this.currentControlledPlayer.stamina / this.currentControlledPlayer.maxStamina) * 100));
                fill.style.width = pct + '%';
            }
        }
        if (typeof this.updateHUD2 === 'function') this.updateHUD2();
    }

    // ============= RENDERING =============
    draw() {
        // Ưu tiên renderer 3D (WebGL). Nếu không có / lỗi -> quay về 2D.
        if (this.renderer3d) {
            try {
                this.renderer3d.frame(this.deltaTime || 0.016);
                return;
            } catch (e) {
                console.error('[3D] Lỗi render, quay về chế độ 2D:', String((e && (e.stack || e.message)) || e));
                this.renderer3d = null;
                if (document.body) document.body.classList.remove('mode-3d');
            }
        }
        this.draw2D();
    }

    draw2D() {
        const ctx = this.ctx;
        const f = this.field;

        // Background
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, this.width, this.height);

        // Sky gradient
        const sky = ctx.createLinearGradient(0, 0, 0, this.height);
        sky.addColorStop(0, '#16213e');
        sky.addColorStop(1, '#0f3460');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, this.width, this.height);

        // Camera transform
        this.camera.apply(ctx);

        // --- KHÁN ĐÀI (2D) ---
        this.drawStands2D(ctx);

        // --- FIELD ---
        // Outer pavement/court
        ctx.fillStyle = '#4a4a5a';
        ctx.fillRect(f.x - 30, f.y - 30, f.width + 60, f.height + 60);

        // Court texture lines
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        for (let i = 0; i < f.width; i += 40) {
            ctx.beginPath(); ctx.moveTo(f.x + i, f.y); ctx.lineTo(f.x + i, f.y + f.height); ctx.stroke();
        }
        for (let i = 0; i < f.height; i += 40) {
            ctx.beginPath(); ctx.moveTo(f.x, f.y + i); ctx.lineTo(f.x + f.width, f.y + i); ctx.stroke();
        }

        // Street walls around the pitch (3D effect)
        const wallH = 12;
        // Top wall
        ctx.fillStyle = '#6a5a4a';
        ctx.fillRect(f.x, f.y - wallH, f.width, wallH);
        // Bottom wall
        ctx.fillRect(f.x, f.y + f.height, f.width, wallH);
        // Left wall
        ctx.fillStyle = '#5a4a3a';
        ctx.fillRect(f.x - wallH, f.y - wallH, wallH, f.height + wallH * 2);
        // Right wall
        ctx.fillRect(f.x + f.width, f.y - wallH, wallH, f.height + wallH * 2);

        // Wall top highlights
        ctx.fillStyle = '#8a7a6a';
        ctx.fillRect(f.x, f.y - wallH, f.width, 3);
        ctx.fillRect(f.x - wallH, f.y - wallH, wallH, 3);
        ctx.fillRect(f.x + f.width, f.y - wallH, wallH, 3);

        // Field surface
        ctx.fillStyle = '#2d5a27';
        ctx.fillRect(f.x, f.y, f.width, f.height);

        // Field markings
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 2;
        ctx.strokeRect(f.x, f.y, f.width, f.height);

        // Center line
        ctx.beginPath();
        ctx.moveTo(f.x + f.width / 2, f.y);
        ctx.lineTo(f.x + f.width / 2, f.y + f.height);
        ctx.stroke();

        // Center circle
        ctx.beginPath();
        ctx.arc(f.x + f.width / 2, f.y + f.height / 2, 60, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(f.x + f.width / 2, f.y + f.height / 2, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fill();

        // Goal areas
        this.drawGoal(ctx, f.x + f.width, f.y + f.height / 2 - this.goalHeight / 2, 'right');
        this.drawGoal(ctx, f.x, f.y + f.height / 2 - this.goalHeight / 2, 'left');

        // Draw players
        for (const p of this.players) {
            this.drawPlayer(ctx, p);
        }

        // Trọng tài
        if (this.referee) this.drawPlayer(ctx, this.referee);

        // Draw ball
        this.drawBall(ctx);

        // Particles
        this.particles.draw(ctx);

        // Reset camera
        this.camera.reset(ctx);
    }

    // ===== KHÁN ĐÀI 2D: các tầng ghế + khán giả nhấp nhô reo hò =====
    drawStands2D(ctx) {
        const f = this.field;
        const depth = 46;
        const tiers = 3;
        const t = Date.now() / 1000;

        if (!this._crowdDots) {
            // Sinh khán giả 1 lần, giữ cố định vị trí
            this._crowdDots = [];
            for (let side = 0; side < 2; side++) {
                const baseY = side === 0 ? f.y - 18 : f.y + f.height + 18;
                for (let tier = 0; tier < tiers; tier++) {
                    for (let i = 0; i < 90; i++) {
                        this._crowdDots.push({
                            side,
                            tier,
                            x: f.x - 40 + (i / 90) * (f.width + 80) + (Math.random() - 0.5) * 6,
                            y: baseY + (side === 0 ? -tier : tier) * 13,
                            c: ['#e94560', '#4ecdc4', '#ffd166', '#a06cd5', '#06d6a0', '#ffffff', '#ff8b3d'][Math.floor(Math.random() * 7)],
                            ph: Math.random() * Math.PI * 2,
                            amp: 1 + Math.random() * 2
                        });
                    }
                }
            }
        }

        // Thân khán đài
        for (let side = 0; side < 2; side++) {
            const y0 = side === 0 ? f.y - 18 - (tiers - 1) * 13 - 8 : f.y + f.height + 18 + 8;
            ctx.fillStyle = side === 0 ? '#232838' : '#1b2030';
            ctx.fillRect(f.x - 48, y0, f.width + 96, tiers * 13 + 16);
            // mái che
            ctx.fillStyle = 'rgba(120,140,180,0.25)';
            ctx.fillRect(f.x - 48, side === 0 ? y0 - 6 : y0 + tiers * 13 + 12, f.width + 96, 6);
        }

        // Khán giả
        const jump = 1.3 + (this.crowdIntensity || 0.35) * 4.5 + (this.crowdCheerTimer > 0 ? 3 : 0);
        for (const d of this._crowdDots) {
            const bob = Math.sin(t * 6 + d.ph) * d.amp * (0.5 + (this.crowdIntensity || 0.3));
            ctx.fillStyle = d.c;
            ctx.globalAlpha = 0.85;
            ctx.fillRect(d.x, d.y + bob - jump * 0.25, 3.4, 4.2);
            ctx.globalAlpha = 1;
        }

        // Biển quảng cáo
        const boardColors = ['#e94560', '#2fb3c9', '#ffd166', '#a06cd5'];
        for (let i = 0; i < 6; i++) {
            ctx.fillStyle = boardColors[i % 4];
            ctx.globalAlpha = 0.85;
            ctx.fillRect(f.x + 20 + i * 130, f.y - 14, 118, 8);
            ctx.fillRect(f.x + 20 + i * 130, f.y + f.height + 6, 118, 8);
            ctx.globalAlpha = 1;
        }
    }

    // ===== Khung thành 2D (kiểu FIFA: cột tròn + xà + lưới có võng) =====
    drawGoal(ctx, x, y, side) {
        const dir = side === 'right' ? -1 : 1;       // hướng lưới ăn vào trong sân
        const depth = this.goalDepth || 34;
        const h = this.goalHeight;
        const postR = this.goalPostRadius || 2.1;
        const backX = x + dir * depth;               // vạch lưới sau

        // --- Lưới (vẽ mờ phía sau) ---
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.16)';
        ctx.lineWidth = 1;
        const step = 8;
        for (let i = 0; i <= depth; i += step) {
            const px = x + dir * i;
            ctx.beginPath();
            ctx.moveTo(px, y);
            ctx.lineTo(px, y + h);
            ctx.stroke();
        }
        for (let i = 0; i <= h; i += step) {
            ctx.beginPath();
            ctx.moveTo(x, y + i);
            ctx.lineTo(backX, y + i);
            ctx.stroke();
        }
        // võng lưới sau
        ctx.strokeStyle = 'rgba(255,255,255,0.30)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(backX, y);
        ctx.lineTo(backX, y + h);
        ctx.stroke();

        // --- Khung: 2 cột + xà ngang + thanh sau ---
        ctx.strokeStyle = 'rgba(250,252,255,0.95)';
        ctx.lineWidth = Math.max(2, postR);
        ctx.lineCap = 'round';
        ctx.beginPath();                       // cột trên
        ctx.moveTo(x, y);
        ctx.lineTo(backX, y);
        ctx.stroke();
        ctx.beginPath();                       // cột dưới
        ctx.moveTo(x, y + h);
        ctx.lineTo(backX, y + h);
        ctx.stroke();
        ctx.beginPath();                       // xà trước (rộng nhất)
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + h);
        ctx.stroke();

        // --- Chấm cột tròn ở 2 góc khẩu độ ---
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        [y, y + h].forEach(py => {
            ctx.beginPath();
            ctx.arc(x, py, Math.max(2, postR), 0, Math.PI * 2);
            ctx.fill();
        });

        ctx.restore();
    }

    drawPlayer(ctx, p) {
        // ===== NEKKETSU SOCCER LEAGUE (GOAL 3) CHIBI STYLE =====
        const isRed = p.team === 'red';
        const r = p.radius;
        const cx = p.pos.x;
        const cy = p.pos.y;
        const running = p.vel.mag() > 0.5;
        const runCycle = Math.sin(p.animTime * 15);
        const breathe = Math.sin(p.animTime * 2.5) * 0.015;

        // Chibi proportions: BIG head, small body
        const headR = r * 0.95 * (1 + breathe);
        const headCX = cx;
        const headCY = cy - r * 0.6;
        const bodyW = r * 0.92;
        const bodyH = r * 0.62;
        const bodyCY = cy + r * 0.28;

        // Colors - Nekketsu palette (limited, vivid). Trọng tài: áo đen, viền vàng.
        const isRef = p.team === 'ref' || p.isReferee;
        const jersey = isRef ? '#141821' : (isRed ? '#e94560' : '#4ecdc4');
        const jerseyDark = isRef ? '#080a0f' : (isRed ? '#8f1f3a' : '#1f6f6b');
        const jerseyLight = isRef ? '#ffd24a' : (isRed ? '#ff8fa3' : '#a0ffff');
        const skin = '#f5cba7';
        const skinDark = '#d9a67a';
        const hair = isRed ? '#2a1508' : '#151515';

        // === SHADOW ===
        ctx.beginPath();
        ctx.ellipse(cx, cy + r * 0.85, r * 1.0, r * 0.4, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fill();

        // === LEGS + SHOES (animated) ===
        const legSwing = running ? runCycle * r * 0.45 : 0;
        // Shorts
        ctx.fillStyle = isRed ? '#f0f0f0' : '#f0f0f0';
        ctx.beginPath();
        ctx.ellipse(cx - bodyW * 0.28, bodyCY + bodyH * 0.42, r * 0.24, r * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx + bodyW * 0.28, bodyCY + bodyH * 0.42, r * 0.24, r * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
        // Legs
        ctx.fillStyle = skin;
        ctx.beginPath();
        ctx.ellipse(cx - bodyW * 0.28 + legSwing * 0.4, cy + r * 0.75 + legSwing, r * 0.14, r * 0.2, 0.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx + bodyW * 0.28 - legSwing * 0.4, cy + r * 0.75 - legSwing, r * 0.14, r * 0.2, -0.15, 0, Math.PI * 2);
        ctx.fill();
        // Shoes
        ctx.fillStyle = '#1a1a2a';
        ctx.beginPath();
        ctx.ellipse(cx - bodyW * 0.28 + legSwing * 0.4, cy + r * 0.88 + legSwing, r * 0.16, r * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx + bodyW * 0.28 - legSwing * 0.4, cy + r * 0.88 - legSwing, r * 0.16, r * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();

        // === BODY (jersey) ===
        const bodyGrad = ctx.createRadialGradient(cx - r * 0.25, bodyCY - r * 0.2, r * 0.05, cx, bodyCY, r * 0.75);
        bodyGrad.addColorStop(0, jerseyLight);
        bodyGrad.addColorStop(0.6, jersey);
        bodyGrad.addColorStop(1, jerseyDark);
        ctx.beginPath();
        ctx.ellipse(cx, bodyCY, bodyW / 2, bodyH / 2, 0, 0, Math.PI * 2);
        ctx.fillStyle = bodyGrad;
        ctx.fill();
        ctx.strokeStyle = jerseyDark;
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Jersey number (small, Nekketsu-style)
        ctx.font = 'bold 7px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(String(p.playerNum || ''), cx, bodyCY + 0.5);

        // === ARMS ===
        const armSwing = running ? runCycle * r * 0.35 : 0;
        ctx.fillStyle = skin;
        ctx.beginPath();
        ctx.ellipse(cx - bodyW * 0.56, bodyCY + armSwing, r * 0.12, r * 0.22, 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx + bodyW * 0.56, bodyCY - armSwing, r * 0.12, r * 0.22, -0.35, 0, Math.PI * 2);
        ctx.fill();

        // === NECK ===
        ctx.fillStyle = skinDark;
        ctx.fillRect(cx - headR * 0.22, headCY + headR * 0.68, headR * 0.44, headR * 0.28);

        // === HEAD (BIG) ===
        const headGrad = ctx.createRadialGradient(
            headCX - headR * 0.3, headCY - headR * 0.3, headR * 0.08,
            headCX, headCY, headR * 1.05
        );
        headGrad.addColorStop(0, '#ffe8d0');
        headGrad.addColorStop(0.7, skin);
        headGrad.addColorStop(1, skinDark);
        ctx.beginPath();
        ctx.arc(headCX, headCY, headR, 0, Math.PI * 2);
        ctx.fillStyle = headGrad;
        ctx.fill();
        ctx.strokeStyle = 'rgba(110,70,40,0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // === BIG EYES (signature Nekketsu feature) ===
        const eyeY = headCY + headR * 0.18;
        const eyeDX = headR * 0.36;
        const eyeRW = headR * 0.22;
        const eyeRH = headR * 0.27;

        // Eye whites (big ovals)
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(headCX - eyeDX, eyeY, eyeRW, eyeRH, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(headCX + eyeDX, eyeY, eyeRW, eyeRH, 0, 0, Math.PI * 2);
        ctx.fill();
        // Eye outlines
        ctx.strokeStyle = 'rgba(40,20,10,0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(headCX - eyeDX, eyeY, eyeRW, eyeRH, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(headCX + eyeDX, eyeY, eyeRW, eyeRH, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Pupils (look toward movement direction - 3D feel)
        const lookX = running ? Math.sign(p.vel.x) * eyeRW * 0.25 : 0;
        const lookY = running ? Math.sign(p.vel.y) * eyeRH * 0.2 : 0;
        ctx.fillStyle = '#1a1a2a';
        ctx.beginPath();
        ctx.arc(headCX - eyeDX + lookX, eyeY + lookY, eyeRW * 0.58, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(headCX + eyeDX + lookX, eyeY + lookY, eyeRW * 0.58, 0, Math.PI * 2);
        ctx.fill();
        // Eye shine
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.arc(headCX - eyeDX + lookX + eyeRW * 0.22, eyeY - eyeRH * 0.3 + lookY, eyeRW * 0.22, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(headCX + eyeDX + lookX + eyeRW * 0.22, eyeY - eyeRH * 0.3 + lookY, eyeRW * 0.22, 0, Math.PI * 2);
        ctx.fill();

        // === EYEBROWS (thick, expressive) ===
        ctx.strokeStyle = hair;
        ctx.lineWidth = Math.max(1.5, headR * 0.09);
        ctx.lineCap = 'round';
        if (running) {
            // Determined eyebrows (angled)
            ctx.beginPath();
            ctx.moveTo(headCX - eyeDX - eyeRW, eyeY - eyeRH - headR * 0.06);
            ctx.lineTo(headCX - eyeDX + eyeRW, eyeY - eyeRH - headR * 0.2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(headCX + eyeDX - eyeRW, eyeY - eyeRH - headR * 0.2);
            ctx.lineTo(headCX + eyeDX + eyeRW, eyeY - eyeRH - headR * 0.06);
            ctx.stroke();
        } else {
            // Relaxed eyebrows
            ctx.beginPath();
            ctx.moveTo(headCX - eyeDX - eyeRW, eyeY - eyeRH - headR * 0.12);
            ctx.lineTo(headCX - eyeDX + eyeRW, eyeY - eyeRH - headR * 0.15);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(headCX + eyeDX - eyeRW, eyeY - eyeRH - headR * 0.15);
            ctx.lineTo(headCX + eyeDX + eyeRW, eyeY - eyeRH - headR * 0.12);
            ctx.stroke();
        }

        // === NOSE (tiny) ===
        ctx.strokeStyle = 'rgba(160,100,70,0.4)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(headCX, eyeY + eyeRH * 0.7);
        ctx.lineTo(headCX, eyeY + eyeRH * 1.1);
        ctx.stroke();

        // === MOUTH ===
        if (running) {
            // Open mouth (shouting)
            ctx.beginPath();
            ctx.ellipse(headCX, eyeY + eyeRH * 1.7, eyeRW * 0.5, eyeRH * 0.42, 0, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(130,45,45,0.85)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(80,25,25,0.6)';
            ctx.lineWidth = 0.8;
            ctx.stroke();
            // Teeth hint
            ctx.fillStyle = '#fff';
            ctx.fillRect(headCX - eyeRW * 0.35, eyeY + eyeRH * 1.3, eyeRW * 0.7, eyeRH * 0.12);
        } else {
            // Big smile (Nekketsu characters smile)
            ctx.beginPath();
            ctx.arc(headCX, eyeY + eyeRH * 1.1, eyeRW * 0.75, 0.25, Math.PI - 0.25);
            ctx.strokeStyle = 'rgba(120,50,40,0.6)';
            ctx.lineWidth = 1.2;
            ctx.stroke();
        }

        // === HAIR (styles vary per player - Nekketsu style) ===
        const hairStyle = p.hairStyle || 0;

        // Base hair covering top of head
        ctx.beginPath();
        ctx.arc(headCX, headCY - headR * 0.02, headR * 0.99, Math.PI * 1.03, Math.PI * 1.97);
        ctx.fillStyle = hair;
        ctx.fill();

        if (hairStyle === 0) {
            // Spiky hair (Kunio-style)
            ctx.beginPath();
            ctx.moveTo(headCX - headR * 0.78, headCY - headR * 0.45);
            ctx.lineTo(headCX - headR * 0.58, headCY - headR * 0.98);
            ctx.lineTo(headCX - headR * 0.38, headCY - headR * 0.55);
            ctx.lineTo(headCX - headR * 0.14, headCY - headR * 1.02);
            ctx.lineTo(headCX + headR * 0.1, headCY - headR * 0.55);
            ctx.lineTo(headCX + headR * 0.34, headCY - headR * 1.0);
            ctx.lineTo(headCX + headR * 0.55, headCY - headR * 0.55);
            ctx.lineTo(headCX + headR * 0.76, headCY - headR * 0.92);
            ctx.lineTo(headCX + headR * 0.84, headCY - headR * 0.4);
            ctx.closePath();
            ctx.fillStyle = hair;
            ctx.fill();
        } else if (hairStyle === 1) {
            // Bowl cut (rounded)
            ctx.beginPath();
            ctx.arc(headCX, headCY - headR * 0.08, headR * 1.0, Math.PI * 1.05, Math.PI * 1.95);
            ctx.fillStyle = hair;
            ctx.fill();
            // Fringe
            ctx.beginPath();
            ctx.ellipse(headCX - headR * 0.35, headCY - headR * 0.55, headR * 0.4, headR * 0.3, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(headCX + headR * 0.35, headCY - headR * 0.55, headR * 0.4, headR * 0.3, 0, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Flat/short hair with side part
            ctx.beginPath();
            ctx.moveTo(headCX - headR * 0.9, headCY - headR * 0.5);
            ctx.lineTo(headCX - headR * 0.7, headCY - headR * 0.85);
            ctx.lineTo(headCX - headR * 0.1, headCY - headR * 0.9);
            ctx.lineTo(headCX + headR * 0.5, headCY - headR * 0.85);
            ctx.lineTo(headCX + headR * 0.85, headCY - headR * 0.55);
            ctx.lineTo(headCX + headR * 0.7, headCY - headR * 0.35);
            ctx.lineTo(headCX - headR * 0.6, headCY - headR * 0.35);
            ctx.closePath();
            ctx.fillStyle = hair;
            ctx.fill();
        }

        // Hair highlight
        ctx.beginPath();
        ctx.arc(headCX - headR * 0.25, headCY - headR * 0.35, headR * 0.4, Math.PI * 1.15, Math.PI * 1.65);
        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // === GAMEPLAY INDICATORS ===
        // Controlled indicator (màu theo người chơi: P1 vàng, P2 xanh)
        const ctlOfP = this.controlOf ? this.controlOf(p) : null;
        if (ctlOfP) {
            const markerColor = ctlOfP.color || '#ffd700';
            const pulse = 1 + Math.sin(Date.now() * 0.008) * 0.1;
            ctx.beginPath();
            ctx.arc(cx, cy + r * 0.15, (r + 13) * pulse, 0, Math.PI * 2);
            ctx.strokeStyle = markerColor;
            ctx.lineWidth = 2.5;
            ctx.setLineDash([5, 5]);
            ctx.lineDashOffset = Date.now() * 0.01;
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.lineDashOffset = 0;

            // Arrow above head
            const arrowY = headCY - headR - 8;
            ctx.beginPath();
            ctx.moveTo(cx - 7, arrowY);
            ctx.lineTo(cx + 7, arrowY);
            ctx.lineTo(cx, arrowY + 8);
            ctx.closePath();
            ctx.fillStyle = markerColor;
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.55)';
            ctx.lineWidth = 1;
            ctx.stroke();
            // nhãn P1 / P2
            if (this.isTwoPlayer && this.isTwoPlayer()) {
                ctx.fillStyle = markerColor;
                ctx.font = 'bold 10px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(ctlOfP.label || '', cx, arrowY - 4);
                ctx.textAlign = 'left';
            }
        }

        // Stamina ring
        if (ctlOfP && p.stamina < 100) {
            ctx.beginPath();
            ctx.arc(cx, cy + r * 0.15, r + 7, -Math.PI / 2, -Math.PI / 2 + (p.stamina / 100) * Math.PI * 2);
            ctx.strokeStyle = p.stamina > 30 ? '#4ecdc4' : '#ff4444';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // Ball possession indicator
        if (p.hasBall) {
            ctx.beginPath();
            ctx.arc(cx + r * 0.95, cy - r * 0.7, 3.5, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }

    drawBall(ctx) {
        const b = this.ball;
        const speed = b.vel.mag();
        // Bóng bổng: nâng bóng lên theo độ cao, bóng to hơn một chút cho dễ thấy
        const h = b.height || 0;
        const lift = h * 0.85;
        const ballCY = b.pos.y - lift;
        const ballR = b.radius * (1 + Math.min(h, 90) / 260);

        // Ball trail when moving fast
        if (speed > 8) {
            for (let i = 1; i <= 4; i++) {
                const t = i / 5;
                const tx = b.pos.x - b.vel.x * t * 1.5;
                const ty = ballCY - b.vel.y * t * 1.5;
                ctx.beginPath();
                ctx.arc(tx, ty, ballR * (1 - t * 0.5), 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255,255,255,${0.3 * (1 - t)})`;
                ctx.fill();
            }
        }

        // Shadow (luôn nằm trên mặt sân, nhỏ & mờ dần khi bóng lên cao)
        const shadowScale = Math.max(0.4, 1 - h / 160);
        ctx.beginPath();
        ctx.ellipse(b.pos.x, b.pos.y + 7, 7 * shadowScale, 3.5 * shadowScale, 0, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,0,0,${0.4 * shadowScale})`;
        ctx.fill();

        // Ball glow if owned
        if (b.owner) {
            ctx.beginPath();
            ctx.arc(b.pos.x, ballCY, ballR + 6, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 150, 0.15)';
            ctx.fill();
        }

        // Ball body
        const ballGrad = ctx.createRadialGradient(b.pos.x - 3, ballCY - 3, 0, b.pos.x, ballCY, ballR);
        ballGrad.addColorStop(0, '#ffffff');
        ballGrad.addColorStop(1, '#d0d0d0');
        ctx.beginPath();
        ctx.arc(b.pos.x, ballCY, ballR, 0, Math.PI * 2);
        ctx.fillStyle = ballGrad;
        ctx.fill();
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Ball pattern
        ctx.beginPath();
        ctx.arc(b.pos.x, ballCY, ballR * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = '#222';
        ctx.fill();
        for (let i = 0; i < 5; i++) {
            const angle = (i / 5) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(
                b.pos.x + Math.cos(angle) * ballR * 0.65,
                ballCY + Math.sin(angle) * ballR * 0.65,
                1.5, 0, Math.PI * 2
            );
            ctx.fillStyle = '#333';
            ctx.fill();
        }
    }
}

// ============================================
// GAME INITIALIZATION
// ============================================
function initGame() {
    const canvas = document.getElementById('game-canvas');
    canvas.width = 1000;
    canvas.height = 650;

    const game = new Game(canvas);
    window.game = game;

    // ===== KHỞI TẠO RENDERER 3D (WebGL) =====
    initRenderer3D();

    function initRenderer3D() {
        const canvas3d = document.getElementById('game-canvas-3d');
        if (!canvas3d) return;
        if (!window.THREE || typeof Renderer3D !== 'function' || typeof PlayerModel !== 'function') {
            console.warn('[3D] Thiếu three.js/PlayerModel -> dùng chế độ 2D');
            return;
        }
        try {
            const params = new URLSearchParams(window.location.search);
            const gfx = params.get('gfx');
            if (gfx === '2d') {
                console.info('[3D] Ép chế độ 2D bằng ?gfx=2d');
                return;
            }
            let savedGfx = null;
            try { savedGfx = localStorage.getItem('sf_gfx_quality'); } catch (e) { /* ignore */ }
            const quality = gfx === 'low' ? 'low'
                : gfx === 'high' ? 'high'
                : (savedGfx === 'low' ? 'low' : 'high');
            game.renderer3d = new Renderer3D(canvas3d, game, { quality });
            game.renderer3d.setCameraMode(game.cameraMode);
            document.body.classList.add('mode-3d');
            window.addEventListener('resize', () => {
                if (game.renderer3d) game.renderer3d.resize();
            });
            updateCameraBadge();
        } catch (e) {
            console.error('[3D] Khởi tạo WebGL thất bại, dùng chế độ 2D:', String((e && (e.stack || e.message)) || e));
            game.renderer3d = null;
            document.body.classList.remove('mode-3d');
        }
    }

    // --- UI Wiring ---
    const show = (id) => document.getElementById(id).classList.add('active');
    const hide = (id) => document.getElementById(id).classList.remove('active');

    document.getElementById('btn-play').onclick = () => {
        hide('main-menu');
        show('game-hud');
        game.hideMatchEndScreen();
        game.beginMatch();          // trọng tài dắt đội ra sân + thổi còi
    };
    document.getElementById('btn-settings').onclick = () => { hide('main-menu'); show('settings-screen'); };
    document.getElementById('btn-credits').onclick = () => { hide('main-menu'); show('credits-screen'); };
    document.getElementById('btn-back-menu').onclick = () => { hide('settings-screen'); show('main-menu'); };
    document.getElementById('btn-back-menu-2').onclick = () => { hide('credits-screen'); show('main-menu'); };

    // Pause
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Escape' && game.state === GameState.PLAYING) {
            game.state = GameState.PAUSED;
            show('pause-menu');
        } else if (e.code === 'Escape' && game.state === GameState.PAUSED) {
            game.state = GameState.PLAYING;
            hide('pause-menu');
        }
    });

    document.getElementById('btn-resume').onclick = () => {
        hide('pause-menu');
        game.state = GameState.PLAYING;
    };
    document.getElementById('btn-restart').onclick = () => {
        hide('pause-menu');
        game.hideMatchEndScreen();
        game.beginMatch();
    };
    document.getElementById('btn-quit-menu').onclick = () => {
        hide('pause-menu');
        hide('game-hud');
        game.hideMatchEndScreen();
        show('main-menu');
        game.returnToMainMenu();
    };
    document.getElementById('btn-rematch').onclick = () => {
        game.hideMatchEndScreen();
        show('game-hud');
        game.beginMatch();
    };
    document.getElementById('btn-main-menu').onclick = () => {
        game.hideMatchEndScreen();
        hide('game-hud');
        show('main-menu');
        game.returnToMainMenu();
    };

    // Hết thời gian chờ ở bảng kết quả -> tự động hiển thị menu chính
    game.onReturnToMenu = () => {
        game.hideMatchEndScreen();
        hide('game-hud');
        hide('pause-menu');
        show('main-menu');
    };

    // Settings
    document.getElementById('ai-difficulty').onchange = (e) => { game.difficulty = e.target.value; };
    document.getElementById('sound-enabled').onchange = (e) => { game.audio.setEnabled(e.target.checked); };


    // Chế độ điều khiển: Bàn phím / Tay cầm PS5
    const controlModeEl = document.getElementById('control-mode');
    if (controlModeEl) {
        controlModeEl.value = game.input.controlMode;
        controlModeEl.onchange = (e) => {
            game.input.setControlMode(e.target.value);
            updateGamepadStatus();
            updateControlModeHint();
        };
    }

    // ===== Chế độ chơi 1 người / 2 người =====
    const playModeEl = document.getElementById('play-mode');
    const playModeStatusEl = document.getElementById('play-mode-status');

    function updatePlayModeStatus() {
        if (!playModeStatusEl) return;
        if (!game.isTwoPlayer()) {
            playModeStatusEl.className = 'controls-hint-text';
            playModeStatusEl.textContent = 'P1: bàn phím / tay cầm chính';
            return;
        }
        const pads = game.input.padCount || 0;
        const rdy = game.isPlayer2Ready();
        if (rdy) {
            const c2 = game.controls[1];
            playModeStatusEl.className = 'controls-hint-text ok';
            playModeStatusEl.textContent = '✅ Đã có 2 tay cầm (P1 = tay cầm #1, P2 = tay cầm #' + (c2.getPadIndex() + 1) + ')'
                + (game.playMode === '2p_vs' ? ' · Đối kháng Đỏ vs Xanh' : ' · Đồng đội cùng đội Đỏ');
        } else {
            playModeStatusEl.className = 'controls-hint-text warn';
            playModeStatusEl.textContent = '⚠️ Cần kết nối tay cầm thứ 2 cho P2 (đang nhận ' + pads + ' tay cầm). '
                + (game.input.padCount ? 'Nhấn nút trên tay cầm thứ hai để nhận diện.' : 'Cắm thêm tay cầm PS5 qua USB/Bluetooth.');
        }
    }

    if (playModeEl) {
        playModeEl.value = game.playMode;
        playModeEl.onchange = (e) => {
            game.setPlayMode(e.target.value);
            updatePlayModeStatus();
            updateHUD2();
        };
    }
    game.onPlayModeChange = () => {
        updatePlayModeStatus();
        updateHUD2();
    };
    updatePlayModeStatus();
    setInterval(updatePlayModeStatus, 900);

    // ===== Góc nhìn camera (3D) & chất lượng đồ họa =====
    const cameraModeEl = document.getElementById('camera-mode');
    if (cameraModeEl) {
        cameraModeEl.value = game.cameraMode;
        cameraModeEl.onchange = (e) => game.setCameraMode(e.target.value);
    }
    game.onCameraModeChange = () => updateCameraBadge();

    const gfxQualityEl = document.getElementById('gfx-quality');
    if (gfxQualityEl) {
        if (game.renderer3d) gfxQualityEl.value = game.renderer3d.quality;
        gfxQualityEl.onchange = (e) => {
            const q = e.target.value === 'low' ? 'low' : 'high';
            if (game.renderer3d) game.renderer3d.setQuality(q);
            try { localStorage.setItem('sf_gfx_quality', q); } catch (err) { /* ignore */ }
        };
    }

    // Chỉ báo P2 trên HUD (chỉ hiện ở chế độ 2 người)
    function updateHUD2() {
        const box = document.getElementById('player2-indicator');
        const nameEl = document.getElementById('player2-name');
        if (!box) return;
        if (!game.isTwoPlayer()) {
            box.style.display = 'none';
            return;
        }
        box.style.display = 'flex';
        if (nameEl) {
            const names = { goalkeeper: 'THỦ MÔN', defender: 'HẬU VỆ', midfielder: 'TIỀN VỆ', forward: 'TIỀN ĐẠO' };
            const p2 = game.player2;
            const ready = game.isPlayer2Ready();
            nameEl.textContent = 'P2: ' + (p2 ? (names[p2.role] || 'CẦU THỦ') : '—') + (ready ? '' : ' (chờ tay cầm)');
        }
    }
    game.updateHUD2 = updateHUD2;
    updateHUD2();

    function updateCameraBadge() {
        const badge = document.getElementById('camera-mode-badge');
        if (badge) {
            badge.textContent = game.cameraMode === 'wide' ? '🎥 TOÀN CẢNH'
                : game.cameraMode === 'tv' ? '📺 FIFA 99'
                : '🎥 NGƯỜI THỨ BA';
        }
        const sel = document.getElementById('camera-mode');
        if (sel) sel.value = game.cameraMode;
    }
    updateCameraBadge();

    function updateControlModeHint() {
        const hintEl = document.getElementById('control-mode-warning');
        if (!hintEl) return;
        const missing = game.input.isGamepadModeMissing();
        hintEl.style.display = missing ? 'block' : 'none';
    }

    // ===== Key binding UI =====
    const ACTION_ORDER = ['moveUp','moveDown','moveLeft','moveRight','sprint','pass','throughPass','loftPass','shoot','skill','switchPlayer','toggleCamera'];
    let listeningRow = null;
    let listeningAction = null;

    function renderKeybindings() {
        const list = document.getElementById('keybindings-list');
        if (!list) return;
        list.innerHTML = '';
        for (const action of ACTION_ORDER) {
            const row = document.createElement('div');
            row.className = 'kb-row';
            row.dataset.action = action;

            const label = document.createElement('span');
            label.className = 'kb-label';
            label.textContent = (typeof KEY_BINDING_LABELS !== 'undefined' && KEY_BINDING_LABELS[action]) || action;

            const keyEl = document.createElement('span');
            keyEl.className = 'kb-key';
            const code = game.input.getBinding(action);
            keyEl.textContent = keyDisplayName(code);
            if (!code) keyEl.classList.add('empty');

            row.appendChild(label);
            row.appendChild(keyEl);

            row.onclick = () => startListening(action, row, keyEl);

            list.appendChild(row);
        }
    }

    function startListening(action, row, keyEl) {
        // Hủy listening cũ
        if (listeningRow) {
            listeningRow.classList.remove('listening');
            const prevKey = listeningRow.querySelector('.kb-key');
            const prevAction = listeningAction;
            if (prevKey && prevAction) prevKey.textContent = keyDisplayName(game.input.getBinding(prevAction));
            game.input.cancelRebind();
        }

        listeningRow = row;
        listeningAction = action;
        row.classList.add('listening');
        keyEl.textContent = 'Nhấn phím...';

        game.input.startRebind(action, (act, code) => {
            game.input.setBinding(act, code);
            row.classList.remove('listening');
            listeningRow = null;
            listeningAction = null;
            renderKeybindings();
            updateControlsHint();
        });
    }

    // Hỗ trợ hủy bằng ESC
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Escape' && listeningRow) {
            game.input.cancelRebind();
            listeningRow.classList.remove('listening');
            const action = listeningRow.dataset.action;
            const keyEl = listeningRow.querySelector('.kb-key');
            if (keyEl) keyEl.textContent = keyDisplayName(game.input.getBinding(action));
            listeningRow = null;
            listeningAction = null;
        }
    });

    document.getElementById('btn-reset-keys').onclick = () => {
        game.input.resetBindings();
        renderKeybindings();
        updateControlsHint();
    };

    function updateControlsHint() {
        const hint = document.querySelector('.controls-hint');
        if (!hint) return;
        const b = game.input.bindings;
        const k = (a) => keyDisplayName(b[a]).replace(/ \(L\)| \(R\)/g, '');
        hint.innerHTML =
            '<span>' + k('moveUp') + k('moveLeft') + k('moveDown') + k('moveRight') + '</span> Di chuyển | ' +
            '<span>' + k('pass') + '</span> Chuyền ngắn / Tranh bóng | ' +
            '<span>' + k('throughPass') + '</span> Chọc khe | ' +
            '<span>' + k('loftPass') + '</span> Chuyền bổng | ' +
            '<span>' + k('shoot') + '</span> Sút | ' +
            '<span>' + k('skill') + '</span> Kỹ năng | ' +
            '<span>' + k('sprint') + '</span> Chạy nhanh | ' +
            '<span>' + k('switchPlayer') + '</span> Đổi người | ' +
            '<span>' + k('toggleCamera') + '</span> Đổi góc nhìn' +
            '<br><span>🎮 PS5</span> Cần trái di chuyển · ✕ Chuyền ngắn/Tranh bóng · L1 Chọc khe · R1 Chuyền bổng · □ Sút · ○ Kỹ năng · △ Đổi người · R2 Chạy';
    }

    // Khởi tạo UI keybindings ngay
    renderKeybindings();
    updateControlsHint();

    // ===== Gamepad (PS5) UI =====
    const GP_ACTION_ORDER = ['pass', 'throughPass', 'loftPass', 'shoot', 'skill', 'switchPlayer', 'sprint'];
    let gpListeningRow = null;

    function renderGamepadBindings() {
        const list = document.getElementById('gamepad-bindings-list');
        if (!list) return;
        list.innerHTML = '';

        // Hàng cố định: di chuyển bằng cần trái / D-pad
        const moveRow = document.createElement('div');
        moveRow.className = 'kb-row';
        moveRow.style.cursor = 'default';
        const moveLabel = document.createElement('span');
        moveLabel.className = 'kb-label';
        moveLabel.textContent = 'Di chuyển';
        const moveKey = document.createElement('span');
        moveKey.className = 'kb-key gp';
        moveKey.textContent = 'Cần trái / D-pad';
        moveRow.appendChild(moveLabel);
        moveRow.appendChild(moveKey);
        list.appendChild(moveRow);

        for (const action of GP_ACTION_ORDER) {
            const row = document.createElement('div');
            row.className = 'kb-row';
            row.dataset.gpAction = action;

            const label = document.createElement('span');
            label.className = 'kb-label';
            label.textContent = (typeof KEY_BINDING_LABELS !== 'undefined' && KEY_BINDING_LABELS[action]) || action;

            const keyEl = document.createElement('span');
            keyEl.className = 'kb-key gp';
            const btn = game.input.getGpBinding(action);
            keyEl.textContent = gamepadButtonName(btn);
            if (btn === null || btn === undefined) keyEl.classList.add('empty');

            row.appendChild(label);
            row.appendChild(keyEl);
            row.onclick = () => startGpListening(action, row, keyEl);
            list.appendChild(row);
        }
    }

    function startGpListening(action, row, keyEl) {
        // Click lại hàng đang chờ -> hủy
        if (gpListeningRow === row) {
            game.input.cancelGpRebind();
            row.classList.remove('listening');
            keyEl.textContent = gamepadButtonName(game.input.getGpBinding(action));
            gpListeningRow = null;
            return;
        }
        // Hủy listening cũ
        if (gpListeningRow) {
            gpListeningRow.classList.remove('listening');
            const prevKey = gpListeningRow.querySelector('.kb-key');
            const prevAction = gpListeningRow.dataset.gpAction;
            if (prevKey && prevAction) prevKey.textContent = gamepadButtonName(game.input.getGpBinding(prevAction));
            game.input.cancelGpRebind();
        }
        gpListeningRow = row;
        row.classList.add('listening');
        keyEl.textContent = game.input.gpConnected ? 'Nhấn nút tay cầm...' : 'Kết nối tay cầm trước!';
        game.input.startGpRebind(action, (act, btnIndex) => {
            game.input.setGpBinding(act, btnIndex);
            row.classList.remove('listening');
            gpListeningRow = null;
            renderGamepadBindings();
            updateGamepadStatus();
        });
    }

    function updateGamepadStatus() {
        const el = document.getElementById('gamepad-status');
        const txt = document.getElementById('gamepad-status-text');
        if (!el || !txt) return;
        const modeLabel = game.input.controlMode === 'gamepad' ? ' [Chế độ: Tay cầm]' : ' [Chế độ: Bàn phím]';
        if (!game.input.gamepadEnabled) {
            el.className = 'gamepad-status disconnected';
            txt.textContent = 'Tay cầm đã tắt' + modeLabel;
        } else if (game.input.gpConnected) {
            el.className = 'gamepad-status connected';
            let id = game.input.gpId || 'PS5 DualSense';
            if (id.length > 38) id = id.slice(0, 38) + '...';
            txt.textContent = 'Đã kết nối: ' + id + modeLabel;
        } else {
            el.className = 'gamepad-status disconnected';
            txt.textContent = 'Chưa kết nối — nhấn nút trên tay cầm để nhận diện' + modeLabel;
        }
        updateControlModeHint();
    }

    // Hook sự kiện thay đổi kết nối
    game.input.onGamepadChange = () => {
        updateGamepadStatus();
        // 2 người chơi: gán lại tay cầm cho P2 khi danh sách tay cầm thay đổi
        if (game.isTwoPlayer()) {
            game.setupControls();
            updatePlayModeStatus();
        }
    };

    const gpEnabledEl = document.getElementById('gamepad-enabled');
    if (gpEnabledEl) {
        gpEnabledEl.checked = game.input.gamepadEnabled;
        gpEnabledEl.onchange = (e) => {
            game.input.setGamepadEnabled(e.target.checked);
            updateGamepadStatus();
        };
    }

    const resetGpBtn = document.getElementById('btn-reset-gamepad');
    if (resetGpBtn) {
        resetGpBtn.onclick = () => {
            game.input.resetGpBindings();
            renderGamepadBindings();
        };
    }

    // ESC cũng hủy gán nút tay cầm
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Escape' && gpListeningRow) {
            game.input.cancelGpRebind();
            gpListeningRow.classList.remove('listening');
            const action = gpListeningRow.dataset.gpAction;
            const keyEl = gpListeningRow.querySelector('.kb-key');
            if (keyEl) keyEl.textContent = gamepadButtonName(game.input.getGpBinding(action));
            gpListeningRow = null;
        }
    });

    renderGamepadBindings();
    updateGamepadStatus();
    // Cập nhật trạng thái định kỳ (khi vào màn hình cài đặt)
    setInterval(updateGamepadStatus, 800);

    // --- GAME LOOP ---
    let last = 0;
    function loop(ts) {
        if (!last) last = ts;
        const dt = Math.min((ts - last) / 1000, 0.05);
        last = ts;

        game.input.pollGamepad();   // đọc tay cầm mỗi frame

        if (game.state !== GameState.MENU && game.state !== GameState.PAUSED) {
            game.update(dt);
            game.updateHUD();
        }

        game.draw();
        game.input.update();

        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    // Initialize audio on first user interaction
    document.addEventListener('click', () => game.audio.init(), { once: true });
    document.addEventListener('keydown', () => game.audio.init(), { once: true });

    // Test mode: #settings opens settings directly
    if (window.location.hash === '#settings') {
        hide('main-menu');
        const st = document.getElementById('settings-screen');
        st.classList.add('active');
        st.style.transition = 'none';
        st.style.opacity = '1';
        st.style.visibility = 'visible';
    }

    // Auto-start for testing (#auto or ?auto or #auto:N)
    const hashMatch = window.location.hash.match(/^#auto(?::(\d+))?$/);
    if (hashMatch || window.location.search.includes('auto')) {
        document.getElementById('btn-play').click();
        const frames = hashMatch && hashMatch[1] ? parseInt(hashMatch[1]) : 0;
        // Simulate frames to capture mid-game state
        for (let i = 0; i < frames; i++) {
            try { game.update(0.016); } catch(e) { console.error(e); break; }
        }
        try { game.updateHUD(); } catch(e) {}
        try { game.draw(); } catch(e) { console.error(e); }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGame);
} else {
    initGame();
}
