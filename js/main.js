// ============================================
// STREET FOOTBALL - FULL GAME LOGIC
// ============================================

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

        // Ball
        this.ball = new Entity(460, 330, 8, 'white');
        this.ball.hasPhysics = true;
        this.ball.isBall = true;
        this.ball.owner = null;

        this.players = [];
        this.teamPlayers = { red: [], blue: [] };
        this.currentControlledPlayer = null;

        // Match vars
        this.matchTimer = 300;
        this.redScore = 0;
        this.blueScore = 0;
        this.possessionTeam = 'red';
        this.goalCelebrationTimer = 0;
        this.difficulty = 'normal';

        this.createPlayers();
        this.setupUI();
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
    }

    setupUI() {
        // UI is handled by inline script
    }

    resetPositions() {
        const f = this.field;
        const cy = f.y + f.height / 2;

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

        // Reset timers
        for (const p of this.players) {
            p.hasBall = false;
            p.ballProtectTimer = 0;
            p.tackleCooldown = 0;
            p.stamina = p.maxStamina;
        }
    }

    startMatch() {
        this.state = GameState.PLAYING;
        this.matchTimer = 300;
        this.redScore = 0;
        this.blueScore = 0;
        this.possessionTeam = 'red';
        this.goalCelebrationTimer = 0;

        this.createPlayers();
        this.resetPositions();
    }

    // ============= GAME UPDATE =============
    update(dt) {
        if (this.state === GameState.PLAYING) {
            this.updatePlaying(dt);
        } else if (this.state === GameState.GOAL_CELEBRATION) {
            this.goalCelebrationTimer -= dt;
            if (this.goalCelebrationTimer <= 0) {
                document.getElementById('goal-celebration').classList.add('hidden');
                this.resetPositions();
                this.state = GameState.PLAYING;
            }
        }
    }

    updatePlaying(dt) {
        this.deltaTime = dt;
        this.matchTimer -= dt;

        if (this.matchTimer <= 0) {
            this.matchTimer = 0;
            this.state = GameState.MATCH_END;
            this.showMatchEnd();
            return;
        }

        // --- Handle input for controlled player ---
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
                this.ball.owner = null;
                for (const p of this.players) { p.hasBall = false; p.passCooldown = 0.5; }
                this._stallTimer = 0;
                this._lastBallPos = this.ball.pos.clone();
            }
        }

        // --- Particles ---
        this.particles.update(dt);

        // Camera fixed - whole field visible
    }

    handleHumanInput(dt) {
        const p = this.currentControlledPlayer;
        if (!p) return;

        let dx = 0, dy = 0;
        const mode = this.input.controlMode;
        const gpReady = this.input.gpConnected && this.input.gamepadEnabled;

        if (mode === 'gamepad' && gpReady) {
            // Chế độ tay cầm PS5: cần trái / D-pad analog
            const gpMove = this.input.getGamepadMove();
            dx = gpMove.x;
            dy = gpMove.y;
        } else {
            // Chế độ bàn phím (hoặc fallback khi tay cầm chưa kết nối)
            if (this.input.isActionDown('moveLeft') || this.input.isDown('ArrowLeft')) dx -= 1;
            if (this.input.isActionDown('moveRight') || this.input.isDown('ArrowRight')) dx += 1;
            if (this.input.isActionDown('moveUp') || this.input.isDown('ArrowUp')) dy -= 1;
            if (this.input.isActionDown('moveDown') || this.input.isDown('ArrowDown')) dy += 1;
        }

        if (dx !== 0 || dy !== 0) {
            const len = Math.hypot(dx, dy);
            dx /= len; dy /= len;

            const sprint = this.input.isActionDown('sprint') && p.stamina > 10;
            const speed = p.maxSpeed * (sprint ? 1.5 : 1);

            p.pos.x += dx * speed * dt * 60;
            p.pos.y += dy * speed * dt * 60;

            if (sprint) p.stamina = Math.max(0, p.stamina - dt * 55);
            p.animTime += dt;
        }

        // If player has ball, keep ball in front
        if (p.hasBall) {
            const frontX = p.pos.x + dx * 18;
            const frontY = p.pos.y + dy * 18;
            this.ball.pos.x = frontX;
            this.ball.pos.y = frontY;
            this.ball.owner = p;
            this.ball.vel = new Vector2(0, 0);
        }

        // --- Actions (theo key binding) ---
        if (this.input.isActionPressed('pass')) {
            this.tryPass();
        }
        if (this.input.isActionPressed('shoot')) {
            this.tryShoot();
        }
        if (this.input.isActionPressed('skill')) {
            this.trySkill();
        }
        if (this.input.isActionPressed('switchPlayer')) {
            this.switchPlayer();
        }
    }

    tryPass() {
        const p = this.currentControlledPlayer;
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
        p.hasBall = false;
        p.passCooldown = 0.35;
        this.ball.owner = null;
        this.audio.playTone(400, 0.08, 'sine', 0.1);
        this.particles.emit(this.ball.pos.x, this.ball.pos.y, '#fff', 5, { speed: 3 });
    }

    tryShoot() {
        const p = this.currentControlledPlayer;
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
        p.hasBall = false;
        p.passCooldown = 0.35;
        this.ball.owner = null;
        this.audio.playTone(150, 0.15, 'square', 0.15);
        this.particles.emit(this.ball.pos.x, this.ball.pos.y, '#ffdd00', 8, { speed: 5 });
        this.camera.shake(5, 0.2);
    }

    trySkill() {
        const p = this.currentControlledPlayer;
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
    }

    switchPlayer() {
        const team = this.currentControlledPlayer.team;
        const list = this.teamPlayers[team];
        const idx = list.indexOf(this.currentControlledPlayer);
        const next = list[(idx + 1) % list.length];
        this.currentControlledPlayer.isControlled = false;
        this.currentControlledPlayer.aiControlled = true;   // người cũ chuyển sang AI
        this.currentControlledPlayer = next;
        next.isControlled = true;
        next.aiControlled = false;
    }

    // ===== Auto control switching =====
    switchControlTo(player) {
        const cp = this.currentControlledPlayer;
        if (!cp || cp === player || !player || !player.active) return;
        cp.isControlled = false;
        cp.aiControlled = true;
        player.isControlled = true;
        player.aiControlled = false;
        this.currentControlledPlayer = player;
        this.particles.emit(player.pos.x, player.pos.y, '#ffd700', 5, { speed: 3 });
    }

    updateControl(dt) {
        const cp = this.currentControlledPlayer;
        if (!cp) return;
        const owner = this.ball.owner;
        this._autoSwitchCd = Math.max(0, (this._autoSwitchCd || 0) - dt);
        this._possessSwitchCd = Math.max(0, (this._possessSwitchCd || 0) - dt);

        // A) Đồng đội (cùng đội người chơi) đang giữ bóng → chuyển quyền điều khiển
        //    cho người nhận bóng / người vừa tranh được bóng
        if (owner && owner.active && owner.team === cp.team && owner !== cp) {
            if (this._possessSwitchCd <= 0) {
                this.switchControlTo(owner);
                this._possessSwitchCd = 0.45;
            }
            return;
        }

        // B) Đối phương giữ bóng → tự chuyển sang cầu thủ gần bóng nhất để tranh
        if (owner && owner.active && owner.team !== cp.team) {
            if (this._autoSwitchCd > 0) return;

            let nearest = null, nearestDist = Infinity;
            for (const p of this.teamPlayers[cp.team]) {
                if (!p.active || p === cp) continue;
                if (p.role === Role.GK) continue;   // không auto-switch sang thủ môn
                const d = p.pos.dist(owner.pos);
                if (d < nearestDist) { nearestDist = d; nearest = p; }
            }
            if (!nearest) return;

            const curDist = cp.pos.dist(owner.pos);
            // Chỉ switch khi cầu thủ kia gần hơn đáng kể (tránh nhảy liên tục)
            if (nearestDist < curDist - 45) {
                this.switchControlTo(nearest);
                this._autoSwitchCd = 0.9;
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
                    this.ball.owner = null;
                    p.hasBall = false;
                    p.passCooldown = 0.4;
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
                this.ball.owner = null;
                p.hasBall = false;
                p.passCooldown = 0.35;
                return;
            }

            // Pass if under heavy pressure and far from goal
            if (nearestDist < 30 && distToGoal > 380) {
                const mates = p.teamMates.filter(m => m.active && m.role !== Role.GK);
                if (mates.length > 0) {
                    let bestMate = mates[0], bestScore = -Infinity;
                    for (const m of mates) {
                        const mGoalDist = Math.hypot(m.pos.x - goalX, m.pos.y - goalY);
                        const mOppDist = Math.min(...p.opponents.filter(o => o.active).map(o => m.pos.dist(o.pos)));
                        const score = -mGoalDist + mOppDist * 2;
                        if (score > bestScore) { bestScore = score; bestMate = m; }
                    }
                    const passAngle = Math.atan2(bestMate.pos.y - p.pos.y, bestMate.pos.x - p.pos.x);
                    this.ball.vel = Vector2.fromAngle(passAngle, 18);
                    this.ball.owner = null;
                    p.hasBall = false;
                    p.passCooldown = 0.35;
                    return;
                }
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

    // ----- Đồng đội có bóng: chạy chỗ tạo khoảng trống để nhận chuyền -----
    aiSupportRun(p, owner, oppGoalX, midY) {
        const f = this.field;
        const attackDir = p.team === 'red' ? 1 : -1;
        const wing = p.wing || (p.pos.y < midY ? -1 : 1);

        // Vị trí hỗ trợ: phía trước người giữ bóng, dạt cánh theo wing
        let ahead = p.role === Role.FWD ? 190 : (p.role === Role.MID ? 130 : 85);
        let spread = p.role === Role.FWD ? 130 : (p.role === Role.MID ? 95 : 70);

        let tx = owner.pos.x + attackDir * ahead;
        let ty = midY + wing * spread;

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

        const ang = Math.atan2(ty - p.pos.y, tx - p.pos.x);
        const spd = p.maxSpeed * 0.88;
        p.pos.x += Math.cos(ang) * spd;
        p.pos.y += Math.sin(ang) * spd;
    }

    // ----- Đối phương có bóng: người gần nhất áp sát, còn lại lùi về phòng thủ -----
    aiDefend(p, owner, ownGoalX, midY) {
        const f = this.field;
        const chaseFactor = this.aiChaseFactor();
        const controlled = this.currentControlledPlayer;
        // Chỉ coi là "human đang áp sát" khi người chơi THUỘC ĐỘI ĐANG PHÒNG THỦ (cùng đội với p)
        // và đang ở gần người giữ bóng. Nếu human đang giữ bóng thì AI đối phương phải PRESS.
        const controlledOnDefense = controlled && controlled.team === p.team;
        const controlledDist = controlledOnDefense ? controlled.pos.dist(owner.pos) : Infinity;

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
            if (ball.owner === this.currentControlledPlayer) {
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

            // Move
            ball.pos.x += ball.vel.x * dt * 60;
            ball.pos.y += ball.vel.y * dt * 60;

            // Stop very slow balls
            if (ball.vel.mag() < 0.1) {
                ball.vel = new Vector2(0, 0);
            }

            // Wall collisions
            const f = this.field;
            const margin = 6;
            const leftGoalY = f.y + f.height / 2;
            const goalHalf = this.goalHeight / 2;

            // Check if within goal vertical range
            const inGoalY = Math.abs(ball.pos.y - leftGoalY) < goalHalf;

            // Left/Right walls (bounce unless in goal area)
            if (ball.pos.x < f.x + margin) {
                if (!inGoalY) {
                    ball.pos.x = f.x + margin;
                    ball.vel.x *= -0.7;
                }
            }
            if (ball.pos.x > f.x + f.width - margin) {
                if (!inGoalY) {
                    ball.pos.x = f.x + f.width - margin;
                    ball.vel.x *= -0.7;
                }
            }
            // Top/Bottom walls
            if (ball.pos.y < f.y + margin) {
                ball.pos.y = f.y + margin;
                ball.vel.y *= -0.7;
            }
            if (ball.pos.y > f.y + f.height - margin) {
                ball.pos.y = f.y + f.height - margin;
                ball.vel.y *= -0.7;
            }

            // Player-ball collision (no owner)
            if (!ball.owner) {
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
                            p.hasBall = true;
                        }
                        break;
                    }
                }
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
            
            if (p === this.currentControlledPlayer) chance += 0.06;

            if (Math.random() < chance) {
                owner.hasBall = false;
                owner.ballProtectTimer = 0;
                p.hasBall = true;
                p.ballProtectTimer = 0.4;
                this.ball.owner = p;
                this.ball.vel = new Vector2(0, 0);
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
        const f = this.field;
        const b = this.ball.pos;
        const centerY = f.y + f.height / 2;
        const goalHalf = this.goalHeight / 2;
        const goalDepth = 30;

        const inGoalY = Math.abs(b.y - centerY) < goalHalf;

        if (!inGoalY) return;

        // Right goal → RED scores (Red attacks right)
        if (b.x > f.x + f.width - goalDepth) {
            this.redScore++;
            this.celebration('red', 'ĐỎ GHI BÀN!');
            this.audio.playGoal();
        }
        // Left goal → BLUE scores
        else if (b.x < f.x + goalDepth) {
            this.blueScore++;
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
        this.ball.owner = null;
        for (const p of this.players) p.hasBall = false;

        this.particles.emitBurst(
            this.field.x + this.field.width / 2,
            this.field.y + this.field.height / 2,
            team === 'red' ? '#e94560' : '#4ecdc4',
            40
        );
        this.camera.shake(10, 0.4);

        const el = document.getElementById('goal-celebration');
        if (el) {
            const goalText = document.getElementById('goal-text');
            const scorerText = document.getElementById('scorer-text');
            if (goalText) goalText.textContent = text;
            if (scorerText) scorerText.textContent = '';
            el.classList.remove('hidden');
            el.classList.add('active');
        }
        this.updateHUD();
    }

    showMatchEnd() {
        document.getElementById('match-end').classList.remove('hidden');
        const redWin = this.redScore > this.blueScore;
        const draw = this.redScore === this.blueScore;
        document.getElementById('final-result').textContent = draw ? 'HÒA!' : (redWin ? 'ĐỘI ĐỎ THẮNG!' : 'ĐỘI XANH THẮNG!');
        document.getElementById('final-score').textContent = `${this.redScore} - ${this.blueScore}`;
        const winner = redWin ? 'ĐỎ' : (draw ? 'Cả hai' : 'XANH');
        document.getElementById('match-stats').textContent = `Kết thúc trận đấu • ${winner} giành chiến thắng`;
        this.audio.playWhistle();
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
    }

    // ============= RENDERING =============
    draw() {
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

        // Draw ball
        this.drawBall(ctx);

        // Particles
        this.particles.draw(ctx);

        // Reset camera
        this.camera.reset(ctx);
    }

    drawGoal(ctx, x, y, side) {
        const w = 40;
        const h = this.goalHeight;
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 3;

        if (side === 'right') {
            ctx.strokeRect(x - w, y, w, h);
            // Net lines
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.lineWidth = 1;
            for (let i = 0; i <= w; i += 10) {
                ctx.beginPath(); ctx.moveTo(x - i, y); ctx.lineTo(x - i, y + h); ctx.stroke();
            }
            for (let i = 0; i <= h; i += 10) {
                ctx.beginPath(); ctx.moveTo(x - w, y + i); ctx.lineTo(x, y + i); ctx.stroke();
            }
        } else {
            ctx.strokeRect(x, y, w, h);
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.lineWidth = 1;
            for (let i = 0; i <= w; i += 10) {
                ctx.beginPath(); ctx.moveTo(x + i, y); ctx.lineTo(x + i, y + h); ctx.stroke();
            }
            for (let i = 0; i <= h; i += 10) {
                ctx.beginPath(); ctx.moveTo(x, y + i); ctx.lineTo(x + w, y + i); ctx.stroke();
            }
        }
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

        // Colors - Nekketsu palette (limited, vivid)
        const jersey = isRed ? '#e94560' : '#4ecdc4';
        const jerseyDark = isRed ? '#8f1f3a' : '#1f6f6b';
        const jerseyLight = isRed ? '#ff8fa3' : '#a0ffff';
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
        // Controlled indicator
        if (p === this.currentControlledPlayer) {
            const pulse = 1 + Math.sin(Date.now() * 0.008) * 0.1;
            ctx.beginPath();
            ctx.arc(cx, cy + r * 0.15, (r + 13) * pulse, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 215, 0, 0.85)';
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
            ctx.fillStyle = '#ffd700';
            ctx.fill();
            ctx.strokeStyle = '#b8860b';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // Stamina ring
        if (p === this.currentControlledPlayer && p.stamina < 100) {
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

        // Ball trail when moving fast
        if (speed > 8) {
            for (let i = 1; i <= 4; i++) {
                const t = i / 5;
                const tx = b.pos.x - b.vel.x * t * 1.5;
                const ty = b.pos.y - b.vel.y * t * 1.5;
                ctx.beginPath();
                ctx.arc(tx, ty, b.radius * (1 - t * 0.5), 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255,255,255,${0.3 * (1 - t)})`;
                ctx.fill();
            }
        }

        // Shadow
        ctx.beginPath();
        ctx.ellipse(b.pos.x, b.pos.y + 7, 7, 3.5, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fill();

        // Ball glow if owned
        if (b.owner) {
            ctx.beginPath();
            ctx.arc(b.pos.x, b.pos.y, b.radius + 6, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 150, 0.15)';
            ctx.fill();
        }

        // Ball body
        const ballGrad = ctx.createRadialGradient(b.pos.x - 3, b.pos.y - 3, 0, b.pos.x, b.pos.y, b.radius);
        ballGrad.addColorStop(0, '#ffffff');
        ballGrad.addColorStop(1, '#d0d0d0');
        ctx.beginPath();
        ctx.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI * 2);
        ctx.fillStyle = ballGrad;
        ctx.fill();
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Ball pattern
        ctx.beginPath();
        ctx.arc(b.pos.x, b.pos.y, b.radius * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = '#222';
        ctx.fill();
        for (let i = 0; i < 5; i++) {
            const angle = (i / 5) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(
                b.pos.x + Math.cos(angle) * b.radius * 0.65,
                b.pos.y + Math.sin(angle) * b.radius * 0.65,
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

    // --- UI Wiring ---
    const show = (id) => document.getElementById(id).classList.add('active');
    const hide = (id) => document.getElementById(id).classList.remove('active');

    document.getElementById('btn-play').onclick = () => {
        hide('main-menu');
        show('game-hud');
        game.startMatch();
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
        hide('match-end');
        game.startMatch();
    };
    document.getElementById('btn-quit-menu').onclick = () => {
        hide('pause-menu');
        hide('game-hud');
        hide('match-end');
        show('main-menu');
        game.state = GameState.MENU;
    };
    document.getElementById('btn-rematch').onclick = () => {
        hide('match-end');
        game.startMatch();
    };
    document.getElementById('btn-main-menu').onclick = () => {
        hide('match-end');
        hide('game-hud');
        show('main-menu');
        game.state = GameState.MENU;
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

    function updateControlModeHint() {
        const hintEl = document.getElementById('control-mode-warning');
        if (!hintEl) return;
        const missing = game.input.isGamepadModeMissing();
        hintEl.style.display = missing ? 'block' : 'none';
    }

    // ===== Key binding UI =====
    const ACTION_ORDER = ['moveUp','moveDown','moveLeft','moveRight','sprint','pass','shoot','skill','switchPlayer'];
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
            '<span>' + k('pass') + '</span> Chuyền | ' +
            '<span>' + k('shoot') + '</span> Sút | ' +
            '<span>' + k('skill') + '</span> Kỹ năng | ' +
            '<span>' + k('sprint') + '</span> Chạy nhanh | ' +
            '<span>' + k('switchPlayer') + '</span> Đổi người' +
            '<br><span>🎮 PS5</span> Cần trái di chuyển · ✕ Chuyền · □ Sút · ○ Kỹ năng · △ Đổi người · R2 Chạy';
    }

    // Khởi tạo UI keybindings ngay
    renderKeybindings();
    updateControlsHint();

    // ===== Gamepad (PS5) UI =====
    const GP_ACTION_ORDER = ['pass', 'shoot', 'skill', 'switchPlayer', 'sprint'];
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
    game.input.onGamepadChange = () => updateGamepadStatus();

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

        if (game.state === GameState.PLAYING || game.state === GameState.GOAL_CELEBRATION) {
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
