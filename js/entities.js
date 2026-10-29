// Player Entity - with AI and Controls
class Player extends Entity {
    constructor(x, y, radius, team, isHuman) {
        super(x, y, radius, team);
        this.isHuman = isHuman;
        this.role = Role.FWD;
        this.targetRole = Role.FWD;
        this.isControlled = false;
        this.aiControlled = !isHuman;
        this.score = 0;
        this.hasBall = false;
        this.ballStolenCooldown = 0;
        this.ballProtectTimer = 0;
        this.tackleCooldown = 0;
        this.tacklePressCd = 0;   // hồi chiêu của pha tranh bóng chủ động (nút chuyền ngắn)
        this.aiState = 'idle';
        this.aiTarget = new Vector2(0, 0);
        this.aiStateTime = 0;
        this.reactionTime = 0;
        this.moveTarget = new Vector2(0, 0);
        this.moveSpeed = 0;
        this.hasMoveInput = false;
        this.skillCooldown = 0;
        this.skillActive = false;
        this.skillTime = 0;
        this.stamina = 100;
        this.maxStamina = 100;
        this.staminaRegenRate = 15;
        this.hasPassed = false;
        this.passCooldown = 0;
        this.passDistance = 0;
        this.hasShot = false;
        this.shotCooldown = 0;
        this.shotPower = 0;
        this.defensiveLine = 0;
        this.animTime = 0;
        this.foot = 'left';
        this.teamMates = [];
        this.opponents = [];
        this.playerNum = Math.floor(Math.random() * 9) + 1;
        this.hairStyle = Math.floor(Math.random() * 3); // 0=spiky, 1=bowl, 2=flat
        this.wing = Math.random() < 0.5 ? -1 : 1; // cánh hoạt động: -1 trên, +1 dưới
        this.aiRole = null; // vai trò AI: 'press', 'support', 'fallback', 'defend'

        // ===== Hành động (dùng cho animation 3D) =====
        // 'kick' | 'pass' | 'skill' | 'celebrate' | 'tackle' | 'dive'
        this.action = null;
        this.actionT = 0;
        this.actionDur = 0;
    }

    switchSides(team) {
        this.team = team;
        this.color = team === 'red' ? '#e94560' : '#4ecdc4';
        this.outlineColor = team === 'red' ? '#ff6b6b' : '#7dfdfd';
        this.isControlled = team === 'red';
    }

    getTeam() { return this.team; }
    getIsHuman() { return this.isHuman; }
    getIsAI() { return this.aiControlled; }

    update(dt) {
        super.update(dt);
        this.animTime += dt;
        this.stamina = Math.min(this.maxStamina, this.stamina + this.staminaRegenRate * dt);
        this.skillCooldown = Math.max(0, this.skillCooldown - dt);
        this.passCooldown = Math.max(0, this.passCooldown - dt);
        this.shotCooldown = Math.max(0, this.shotCooldown - dt);
        this.ballStolenCooldown = Math.max(0, (this.ballStolenCooldown || 0) - dt);
        this.ballProtectTimer = Math.max(0, (this.ballProtectTimer || 0) - dt);
        this.tackleCooldown = Math.max(0, (this.tackleCooldown || 0) - dt);
        this.tacklePressCd = Math.max(0, (this.tacklePressCd || 0) - dt);
        this.tickAction(dt);
    }

    // Đặt hành động cho animation (3D)
    setAction(name, duration) {
        this.action = name;
        this.actionDur = duration || 0.5;
        this.actionT = this.actionDur;
    }

    // Đếm ngược thời gian hành động
    tickAction(dt) {
        if (this.actionT > 0) {
            this.actionT -= dt;
            if (this.actionT <= 0) {
                this.actionT = 0;
                this.action = null;
            }
        }
    }

    setRole(role) {
        this.role = role;
        this.targetRole = role;
    }

    getDefensiveStat() {
        switch (this.targetRole) {
            case Role.GK: return 15;
            case Role.DEF: return 90;
            case Role.MID: return 70;
            case Role.FWD: return 50;
        }
    }

    getOffensiveStat() {
        switch (this.targetRole) {
            case Role.GK: return 5;
            case Role.DEF: return 20;
            case Role.MID: return 60;
            case Role.FWD: return 95;
        }
    }

    canPass(ball) {
        if (this.hasBall && ball && ball.active) {
            return this.pos.dist(ball.pos) < 60;
        }
        return false;
    }

    performPass(targetPos, ball) {
        if (this.hasBall && ball) {
            const passAngle = Math.atan2(targetPos.y - this.pos.y, targetPos.x - this.pos.x);
            const passSpeed = 12;
            const passDir = Vector2.fromAngle(passAngle, passSpeed);
            ball.vel = passDir.clone();
            ball.hasPhysics = true;
            this.hasBall = false;
            this.passCooldown = 0.3;
            return true;
        }
        return false;
    }

    performShot(ball) {
        if (this.hasBall && ball && ball.active) {
            const shotAngle = this.pos.angle();
            const shotSpeed = 18;
            ball.vel = Vector2.fromAngle(shotAngle, shotSpeed);
            ball.hasPhysics = true;
            this.hasBall = false;
            this.shotCooldown = 0.5;
            return true;
        }
        return false;
    }

    activateSkill(ball) {
        if (this.skillCooldown <= 0 && this.stamina > 20) {
            this.skillActive = true;
            this.skillTime = 0.8;
            this.skillCooldown = 5;
            this.stamina = 0;
            this.hasBall = false;
            if (ball) ball.hasPhysics = true;
            return true;
        }
        return false;
    }

    updateSkill(dt, ball) {
        if (this.skillActive) {
            this.skillTime -= dt;
            if (this.skillTime <= 0) {
                this.skillActive = false;
                if (ball && ball.active) {
                    ball.pos = this.pos.clone();
                    ball.vel = new Vector2(0, 0);
                }
            }
        }
    }

    getDefensivePosition() {
        return new Vector2(this.pos.x, this.pos.y);
    }
}

class AIPlayer extends Player {
    constructor(x, y, radius, team, isHuman, role) {
        super(x, y, radius, team, isHuman);
        this.isHuman = isHuman;
        this.aiControlled = true;
        this.targetRole = role;
        this.role = role;
    }
}

function createGoalkeeper(x, y, team) {
    const keeper = new Player(x, y, 13, team, false);
    keeper.setRole(Role.GK);
    keeper.maxSpeed = 8;
    keeper.aiControlled = true;
    keeper.aiState = 'idle';
    keeper.hasBall = false;
    return keeper;
}

function createPlayer(x, y, team, isHuman, role) {
    const player = new Player(x, y, 13, team, isHuman);
    player.setRole(role);
    player.maxSpeed = isHuman ? 5.5 : 5.2;
    player.aiControlled = !isHuman;
    player.aiState = 'idle';
    player.hasBall = false;
    return player;
}

window.Player = Player;
window.AIPlayer = AIPlayer;
window.createGoalkeeper = createGoalkeeper;
window.createPlayer = createPlayer;
