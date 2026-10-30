// Game Core Engine
class Vector2 {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    static fromAngle(angle, length = 1) {
        return new Vector2(Math.cos(angle) * length, Math.sin(angle) * length);
    }

    clone() { return new Vector2(this.x, this.y); }
    
    add(v) { this.x += v.x; this.y += v.y; return this; }
    sub(v) { this.x -= v.x; this.y -= v.y; return this; }
    mul(s) { this.x *= s; this.y *= s; return this; }
    div(s) { this.x /= s; this.y /= s; return this; }
    
    mag() { return Math.hypot(this.x, this.y); }
    magSq() { return this.x * this.x + this.y * this.y; }
    
    normalize() { const m = this.mag(); if (m > 0) this.div(m); return this; }
    limit(max) { const m = this.mag(); if (m > max) this.mul(max / m); return this; }
    
    angle() { return Math.atan2(this.y, this.x); }
    dist(v) { return Math.hypot(this.x - v.x, this.y - v.y); }
    dot(v) { return this.x * v.x + this.y * v.y; }
    
    static add(a, b) { return new Vector2(a.x + b.x, a.y + b.y); }
    static sub(a, b) { return new Vector2(a.x - b.x, a.y - b.y); }
    static mul(v, s) { return new Vector2(v.x * s, v.y * s); }
    static lerp(a, b, t) { return new Vector2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t); }
    static rotate(v, angle) {
        const c = Math.cos(angle), s = Math.sin(angle);
        return new Vector2(v.x * c - v.y * s, v.x * s + v.y * c);
    }
}

class Entity {
    constructor(x, y, radius, team) {
        this.pos = new Vector2(x, y);
        this.vel = new Vector2(0, 0);
        this.acc = new Vector2(0, 0);
        this.radius = radius;
        this.team = team; // 'red' or 'blue'
        this.active = true;
        this.mass = 1;
        this.friction = 0.95;
        this.maxSpeed = 5;
        this.color = team === 'red' ? '#e94560' : '#4ecdc4';
        this.outlineColor = team === 'red' ? '#ff6b6b' : '#7dfdfd';
        this.id = Math.random().toString(36).substr(2, 9);
    }

    applyForce(force) {
        this.acc.add(Vector2.div(force.clone(), this.mass));
    }

    update(dt) {
        this.vel.add(this.acc);
        this.vel.mul(this.friction);
        this.vel.limit(this.maxSpeed);
        this.pos.add(Vector2.mul(this.vel, dt));
        this.acc.mul(0);
    }

    draw(ctx) {
        // Shadow
        ctx.beginPath();
        ctx.ellipse(this.pos.x, this.pos.y + this.radius * 0.3, this.radius * 0.6, this.radius * 0.2, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fill();

        // Body
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.strokeStyle = this.outlineColor;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Team indicator ring
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, this.radius + 3, 0, Math.PI * 2);
        ctx.strokeStyle = this.team === 'red' ? 'rgba(233, 69, 96, 0.5)' : 'rgba(78, 205, 196, 0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

class Particle {
    constructor(x, y, color, velocity, life, size) {
        this.pos = new Vector2(x, y);
        this.vel = velocity || Vector2.fromAngle(Math.random() * Math.PI * 2, Math.random() * 3);
        this.color = color;
        this.life = life || 1;
        this.maxLife = this.life;
        this.size = size || Math.random() * 4 + 2;
        this.gravity = 0.1;
        this.friction = 0.98;
    }

    update(dt) {
        this.vel.y += this.gravity;
        this.vel.mul(this.friction);
        this.pos.add(Vector2.mul(this.vel, dt));
        this.life -= dt;
    }

    draw(ctx) {
        const alpha = this.life / this.maxLife;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, this.size * alpha, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    isDead() { return this.life <= 0; }
}

class ParticleSystem {
    constructor() {
        this.particles = [];
    }

    emit(x, y, color, count, options = {}) {
        for (let i = 0; i < count; i++) {
            const angle = options.angle || Math.random() * Math.PI * 2;
            const speed = options.speed || (Math.random() * 5 + 2);
            const vel = Vector2.fromAngle(angle, speed);
            const life = options.life || (Math.random() * 0.5 + 0.3);
            const size = options.size || (Math.random() * 3 + 1);
            this.particles.push(new Particle(x, y, color, vel, life, size));
        }
    }

    emitBurst(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const speed = Math.random() * 8 + 4;
            this.particles.push(new Particle(x, y, color, Vector2.fromAngle(angle, speed), 0.8, Math.random() * 4 + 2));
        }
    }

    update(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update(dt);
            if (this.particles[i].isDead()) {
                this.particles.splice(i, 1);
            }
        }
    }

    draw(ctx) {
        this.particles.forEach(p => p.draw(ctx));
    }

    clear() { this.particles = []; }
}

class Camera {
    constructor(canvasWidth, canvasHeight) {
        this.x = 0;
        this.y = 0;
        this.width = canvasWidth;
        this.height = canvasHeight;
        this.zoom = 1;
        this.target = null;
        this.lerp = 0.1;
        this.shakeIntensity = 0;
        this.shakeDuration = 0;
        this.shakeOffset = new Vector2(0, 0);
    }

    follow(entity) { this.target = entity; }

    update(dt) {
        if (this.target) {
            const targetX = this.target.pos.x - this.width / (2 * this.zoom);
            const targetY = this.target.pos.y - this.height / (2 * this.zoom);
            this.x += (targetX - this.x) * this.lerp * 60 * dt;
            this.y += (targetY - this.y) * this.lerp * 60 * dt;
        }

        if (this.shakeDuration > 0) {
            this.shakeDuration -= dt;
            this.shakeOffset = Vector2.fromAngle(Math.random() * Math.PI * 2, this.shakeIntensity * (this.shakeDuration / 0.3));
        } else {
            this.shakeOffset = new Vector2(0, 0);
        }
    }

    shake(intensity, duration) {
        this.shakeIntensity = intensity;
        this.shakeDuration = duration;
    }

    apply(ctx) {
        ctx.save();
        ctx.translate(-this.x + this.shakeOffset.x, -this.y + this.shakeOffset.y);
        ctx.scale(this.zoom, this.zoom);
    }

    reset(ctx) {
        ctx.restore();
    }

    worldToScreen(pos) {
        return new Vector2(
            (pos.x - this.x) * this.zoom,
            (pos.y - this.y) * this.zoom
        );
    }
}

// Audio System
class AudioManager {
    constructor() {
        this.enabled = true;
        this.sounds = {};
        this.context = null;
        this.masterGain = null;
    }

    init() {
        try {
            this.context = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.context.createGain();
            this.masterGain.connect(this.context.destination);
            this.masterGain.gain.value = 0.5;
            this.initCrowd();
        } catch (e) {
            console.warn('Audio not supported');
        }
    }

    // ===== TIẾNG KHÁN ĐÀI =====
    // Tiếng ồn nền của khán giả (nhiễu nâu qua bandpass, lặp vô hạn).
    initCrowd() {
        if (!this.context || this.crowdSource) return;
        if (typeof this.context.createBuffer !== 'function' || typeof this.context.createBufferSource !== 'function') return;
        const sr = this.context.sampleRate;
        const len = Math.floor(sr * 2.5);
        const buf = this.context.createBuffer(1, len, sr);
        const data = buf.getChannelData(0);
        let last = 0;
        for (let i = 0; i < len; i++) {
            const w = Math.random() * 2 - 1;
            last = (last + 0.03 * w) / 1.03;      // nhiễu nâu -> nghe như đám đông
            data[i] = last * 3.2;
        }
        const src = this.context.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const band = this.context.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = 780;
        band.Q.value = 0.6;
        const gain = this.context.createGain();
        gain.gain.value = 0;
        src.connect(band);
        band.connect(gain);
        gain.connect(this.masterGain);
        try { src.start(); } catch (e) { /* ignore */ }
        this.crowdSource = src;
        this.crowdGain = gain;
        this.crowdBand = band;
        this.crowdLevel = 0.4;
        this.setCrowdLevel(this.crowdLevel);
    }

    // 0..1 : độ ồn của khán đài
    setCrowdLevel(level) {
        const v = Math.max(0, Math.min(1, level));
        this.crowdLevel = v;
        // đang có pha dâng lên / hò reo thì để nó chạy, không cắt ngang
        if (this.context && this._crowdRampUntil && this.context.currentTime < this._crowdRampUntil) return;
        if (this.crowdGain && this.context) {
            this.crowdGain.gain.value = this.enabled ? 0.10 + v * 0.22 : 0;
        }
        if (this.crowdBand && this.context) {
            this.crowdBand.frequency.value = 620 + v * 700;
        }
    }

    // Khán đài dâng lên nhẹ (dùng khi BLV đang bình luận / pha bóng hay)
    crowdSwell(power) {
        if (!this.context || !this.crowdGain) return;
        const p = Math.max(0.1, Math.min(1.2, power || 0.5));
        const g = this.crowdGain.gain;
        const t = this.context.currentTime;
        const base = this.enabled ? 0.10 + (this.crowdLevel || 0.35) * 0.22 : 0;
        try {
            g.cancelScheduledValues(t);
            g.setValueAtTime(g.value, t);
            g.linearRampToValueAtTime(base + p * 0.22, t + 0.22);
            g.linearRampToValueAtTime(base + p * 0.10, t + 0.7);
            g.linearRampToValueAtTime(base, t + 1.9);
            this._crowdRampUntil = t + 1.9;
        } catch (e) { /* ignore */ }
    }

    // Hò reo bùng nổ (ghi bàn, tranh cướp hay, hết trận...)
    crowdCheer(power) {
        if (!this.context || !this.crowdGain) return;
        const p = Math.max(0.25, Math.min(1.6, power || 1));
        const g = this.crowdGain.gain;
        const t = this.context.currentTime;
        const base = this.enabled ? 0.10 + this.crowdLevel * 0.22 : 0;
        g.cancelScheduledValues(t);
        g.setValueAtTime(g.value, t);
        g.linearRampToValueAtTime(base + p * 0.55, t + 0.18);
        g.linearRampToValueAtTime(base + p * 0.34, t + 1.1);
        g.linearRampToValueAtTime(base, t + 2.6);
        this._crowdRampUntil = t + 2.6;
        // tiếng huýt sáo/hò reo ngẫu nhiên
        for (let i = 0; i < 3; i++) {
            setTimeout(() => this.playTone(700 + Math.random() * 900, 0.35, 'triangle', 0.05 * p), 60 + i * 180);
        }
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        if (this.masterGain) this.masterGain.gain.value = enabled ? 0.5 : 0;
    }

    playTone(frequency, duration, type = 'sine', volume = 0.1) {
        if (!this.enabled || !this.context) return;
        
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        osc.connect(gain);
        gain.connect(this.masterGain);
        
        osc.type = type;
        osc.frequency.value = frequency;
        gain.gain.value = volume;
        gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);
        
        osc.start();
        osc.stop(this.context.currentTime + duration);
    }

    playKick() { this.playTone(120, 0.1, 'square', 0.15); }

    // Tiếng còi trọng tài (rít, cao)
    blareWhistle(duration, volume) {
        if (!this.enabled || !this.context) return;
        const t = this.context.currentTime;
        const osc = this.context.createOscillator();
        const osc2 = this.context.createOscillator();
        const gain = this.context.createGain();
        const trem = this.context.createOscillator();
        const tremGain = this.context.createGain();
        osc.type = 'triangle';
        osc2.type = 'sine';
        osc.frequency.value = 2350;
        osc2.frequency.value = 4700;
        // rung giọng nhẹ như còi thật
        trem.frequency.value = 32;
        tremGain.gain.value = 60;
        trem.connect(tremGain);
        tremGain.connect(osc.frequency);
        osc.connect(gain);
        osc2.connect(gain);
        gain.connect(this.masterGain);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.linearRampToValueAtTime(volume || 0.16, t + 0.02);
        gain.gain.setValueAtTime(volume || 0.16, t + duration - 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
        osc.start(t); osc2.start(t); trem.start(t);
        osc.stop(t + duration + 0.02);
        osc2.stop(t + duration + 0.02);
        trem.stop(t + duration + 0.02);
    }

    // Còi bắt đầu trận: 2 tiếng ngắn
    playKickoffWhistle() {
        this.blareWhistle(0.22, 0.16);
        setTimeout(() => this.blareWhistle(0.5, 0.17), 330);
    }

    // Còi kết thúc trận: 3 tiếng (2 ngắn + 1 dài)
    playFinalWhistle() {
        this.blareWhistle(0.28, 0.17);
        setTimeout(() => this.blareWhistle(0.28, 0.17), 380);
        setTimeout(() => this.blareWhistle(0.95, 0.18), 800);
    }

    // Tiếng tuýt còi ngắn khi bắt lỗi / thổi phạt
    playShortWhistle() { this.blareWhistle(0.18, 0.13); }
    playGoal() { 
        this.playTone(440, 0.2, 'triangle', 0.2);
        setTimeout(() => this.playTone(554, 0.2, 'triangle', 0.2), 100);
        setTimeout(() => this.playTone(659, 0.3, 'triangle', 0.2), 200);
    }
    playWhistle() { this.playTone(800, 0.3, 'sine', 0.15); }
    playSkill() { this.playTone(300, 0.15, 'sawtooth', 0.1); }
    playHit() { this.playTone(200, 0.05, 'noise', 0.1); }
}

// Default key bindings (có thể tùy chỉnh trong Settings)
const DEFAULT_KEY_BINDINGS = {
    moveUp: 'KeyW',
    moveDown: 'KeyS',
    moveLeft: 'KeyA',
    moveRight: 'KeyD',
    sprint: 'ShiftLeft',
    pass: 'Space',          // Chuyền ngắn — và TRANH BÓNG khi không có bóng
    throughPass: 'KeyR',    // Chọc khe
    loftPass: 'KeyT',       // Chuyền bóng bổng
    shoot: 'KeyF',
    skill: 'KeyE',
    switchPlayer: 'KeyQ',
    toggleCamera: 'KeyC'
};

const KEY_BINDING_LABELS = {
    moveUp: 'Di chuyển lên',
    moveDown: 'Di chuyển xuống',
    moveLeft: 'Di chuyển trái',
    moveRight: 'Di chuyển phải',
    sprint: 'Chạy nhanh',
    pass: 'Chuyền ngắn / Tranh bóng',
    throughPass: 'Chọc khe',
    loftPass: 'Chuyền bóng bổng',
    shoot: 'Sút bóng',
    skill: 'Kỹ năng',
    switchPlayer: 'Đổi cầu thủ',
    toggleCamera: 'Đổi góc nhìn'
};

// Tên hiển thị thân thiện cho phím
function keyDisplayName(code) {
    if (!code) return '(Trống)';
    const special = {
        'Space': 'SPACE',
        'ShiftLeft': 'SHIFT (L)',
        'ShiftRight': 'SHIFT (R)',
        'ControlLeft': 'CTRL (L)',
        'ControlRight': 'CTRL (R)',
        'AltLeft': 'ALT (L)',
        'AltRight': 'ALT (R)',
        'ArrowUp': '↑', 'ArrowDown': '↓', 'ArrowLeft': '←', 'ArrowRight': '→',
        'Tab': 'TAB', 'Enter': 'ENTER', 'Backspace': 'BACKSPACE', 'Delete': 'DELETE',
        'CapsLock': 'CAPS', 'Escape': 'ESC', 'MetaLeft': 'META', 'MetaRight': 'META'
    };
    if (special[code]) return special[code];
    if (code.startsWith('Key')) return code.slice(3).toUpperCase();
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return 'NUM ' + code.slice(6);
    if (/^F\d{1,2}$/.test(code)) return code;
    return code.toUpperCase();
}

// ===== Gamepad (PS5 DualSense) support =====
// Standard mapping cho DualSense trên trình duyệt:
// 0=✕ Cross, 1=○ Circle, 2=□ Square, 3=△ Triangle, 4=L1, 5=R1, 6=L2, 7=R2,
// 8=Create, 9=Options, 10=L3, 11=R3, 12=D-pad Up, 13=D-pad Down, 14=D-pad Left, 15=D-pad Right, 16=PS, 17=Touchpad
const DEFAULT_GAMEPAD_BINDINGS = {
    pass: 0,          // ✕  = chuyền ngắn + tranh bóng
    shoot: 2,         // □
    skill: 1,         // ○
    switchPlayer: 3,  // △
    throughPass: 4,   // L1 = chọc khe
    loftPass: 5,      // R1 = chuyền bóng bổng
    sprint: 7         // R2
};

const GAMEPAD_BUTTON_LABELS = {
    0: '✕ Cross', 1: '○ Circle', 2: '□ Square', 3: '△ Triangle',
    4: 'L1', 5: 'R1', 6: 'L2', 7: 'R2',
    8: 'Create', 9: 'Options', 10: 'L3', 11: 'R3',
    12: 'D-pad ↑', 13: 'D-pad ↓', 14: 'D-pad ←', 15: 'D-pad →',
    16: 'PS', 17: 'Touchpad'
};

const GAMEPAD_DPAD = { up: 12, down: 13, left: 14, right: 15 };

function gamepadButtonName(index) {
    if (index === null || index === undefined) return '(Trống)';
    return GAMEPAD_BUTTON_LABELS[index] || ('Nút ' + index);
}

// Input Manager
class InputManager {
    constructor() {
        this.keys = {};
        this.keysPressed = {};
        this.keysReleased = {};
        this.mouse = { x: 0, y: 0, down: false };

        // Key bindings (loaded from localStorage)
        this.bindings = { ...DEFAULT_KEY_BINDINGS };
        this.rebinding = null;       // action đang chờ gán phím
        this.rebindCallback = null;  // callback khi gán xong
        this.loadBindings();

        // ===== Gamepad (PS5) state =====
        this.gamepadEnabled = true;
        this.gpBindings = { ...DEFAULT_GAMEPAD_BINDINGS };
        this.gpButtons = {};          // trạng thái nút hiện tại
        this.gpButtonsPressed = {};   // nút vừa nhấn trong frame
        this.gpAxes = [0, 0, 0, 0];   // trục cần điều khiển
        this.gpConnected = false;
        this.gpId = '';
        this.gpIndex = -1;
        this.gpRebinding = null;      // action gamepad đang chờ gán
        this.gpRebindCallback = null;
        this.gpPrevButtons = {};      // để phát hiện nút mới nhấn

        // Chế độ điều khiển: 'keyboard' hoặc 'gamepad'
        this.controlMode = 'keyboard';

        this.loadGamepadSettings();
        this.loadControlMode();
        this.setupGamepadEvents();

        window.addEventListener('keydown', e => this.onKeyDown(e));
        window.addEventListener('keyup', e => this.onKeyUp(e));
        window.addEventListener('mousemove', e => this.onMouseMove(e));
        window.addEventListener('mousedown', e => this.onMouseDown(e));
        window.addEventListener('mouseup', e => this.onMouseUp(e));
        window.addEventListener('blur', () => this.clear());
    }

    onKeyDown(e) {
        // Nếu đang chờ gán phím mới → bắt phím này
        if (this.rebinding) {
            e.preventDefault();
            e.stopPropagation();
            const action = this.rebinding;
            const cb = this.rebindCallback;
            this.rebinding = null;
            this.rebindCallback = null;
            // Không cho phím ESC làm phím hành động (dành cho pause)
            if (e.code !== 'Escape' && cb) cb(action, e.code);
            return;
        }

        if (!this.keys[e.code]) {
            this.keysPressed[e.code] = true;
        }
        this.keys[e.code] = true;

        // Chặn mặc định cho các phím đang được gán
        const bound = Object.values(this.bindings).filter(Boolean);
        if (bound.includes(e.code) || ['Space', 'ShiftLeft', 'ShiftRight', 'Escape'].includes(e.code)) {
            e.preventDefault();
        }
    }

    onKeyUp(e) {
        this.keysReleased[e.code] = true;
        this.keys[e.code] = false;
    }

    onMouseMove(e) {
        this.mouse.x = e.clientX;
        this.mouse.y = e.clientY;
    }

    onMouseDown(e) { this.mouse.down = true; }
    onMouseUp(e) { this.mouse.down = false; }

    isDown(code) { return !!this.keys[code]; }
    isPressed(code) { return !!this.keysPressed[code]; }
    isReleased(code) { return !!this.keysReleased[code]; }

    // ===== Key binding API =====
    getBinding(action) { return this.bindings[action]; }

    isActionDown(action) {
        if (this.controlMode === 'gamepad') {
            if (this.gpConnected && this.gamepadEnabled) return this.isActionGpDown(action);
            // fallback: chưa kết nối tay cầm -> tạm dùng bàn phím
        }
        const code = this.bindings[action];
        return code ? !!this.keys[code] : false;
    }

    isActionPressed(action) {
        if (this.controlMode === 'gamepad') {
            if (this.gpConnected && this.gamepadEnabled) return this.isActionGpPressed(action);
            // fallback: chưa kết nối tay cầm -> tạm dùng bàn phím
        }
        const code = this.bindings[action];
        return code ? !!this.keysPressed[code] : false;
    }

    // ===== Chế độ điều khiển =====
    setControlMode(mode) {
        this.controlMode = (mode === 'gamepad') ? 'gamepad' : 'keyboard';
        this.saveControlMode();
    }

    saveControlMode() {
        try { localStorage.setItem('sf_control_mode', this.controlMode); } catch (e) { /* ignore */ }
    }

    loadControlMode() {
        try {
            const v = localStorage.getItem('sf_control_mode');
            if (v === 'gamepad' || v === 'keyboard') this.controlMode = v;
        } catch (e) { /* ignore */ }
    }

    // true nếu đang ở chế độ gamepad nhưng chưa kết nối (để hiện cảnh báo)
    isGamepadModeMissing() {
        return this.controlMode === 'gamepad' && !this.gpConnected;
    }

    // Bắt đầu chờ phím mới cho action
    startRebind(action, callback) {
        this.rebinding = action;
        this.rebindCallback = callback || null;
    }

    cancelRebind() {
        this.rebinding = null;
        this.rebindCallback = null;
    }

    // Gán phím (xóa phím trùng ở action khác)
    setBinding(action, code) {
        if (!action || !code) return;
        for (const a in this.bindings) {
            if (a !== action && this.bindings[a] === code) {
                this.bindings[a] = null; // bỏ gán trùng
            }
        }
        this.bindings[action] = code;
        this.saveBindings();
    }

    resetBindings() {
        this.bindings = { ...DEFAULT_KEY_BINDINGS };
        this.saveBindings();
    }

    saveBindings() {
        try {
            localStorage.setItem('sf_key_bindings', JSON.stringify(this.bindings));
        } catch (e) { /* localStorage có thể bị chặn */ }
    }

    loadBindings() {
        try {
            const raw = localStorage.getItem('sf_key_bindings');
            if (raw) {
                const parsed = JSON.parse(raw);
                for (const k in DEFAULT_KEY_BINDINGS) {
                    if (parsed && parsed[k] !== undefined) this.bindings[k] = parsed[k];
                }
            }
        } catch (e) { /* bỏ qua nếu lỗi */ }
    }

    // ===== Gamepad API (PS5 DualSense) =====
    setupGamepadEvents() {
        window.addEventListener('gamepadconnected', (e) => {
            this.gpConnected = true;
            this.gpId = e.gamepad.id || '';
            this.gpIndex = e.gamepad.index;
            if (typeof this.onGamepadChange === 'function') this.onGamepadChange(true, this.gpId);
        });
        window.addEventListener('gamepaddisconnected', (e) => {
            // nếu còn tay cầm khác thì vẫn connected
            const pads = navigator.getGamepads ? navigator.getGamepads() : [];
            let any = false;
            for (const gp of pads) { if (gp && gp.connected) { any = true; this.gpId = gp.id; this.gpIndex = gp.index; break; } }
            this.gpConnected = any;
            if (!any) { this.gpId = ''; this.gpIndex = -1; }
            if (typeof this.onGamepadChange === 'function') this.onGamepadChange(any, this.gpId);
        });
    }

    // Đọc trạng thái tay cầm mỗi frame
    pollGamepad() {
        if (!this.gamepadEnabled) { this.gpConnected = false; return; }
        const pads = (navigator.getGamepads && navigator.getGamepads()) || [];
        let gp = null;
        for (const p of pads) {
            if (p && p.connected) { gp = p; break; }
        }
        if (!gp) {
            if (this.gpConnected) {
                this.gpConnected = false;
                if (typeof this.onGamepadChange === 'function') this.onGamepadChange(false, '');
            }
            this.gpPrevButtons = {};
            return;
        }
        if (!this.gpConnected) {
            this.gpConnected = true;
            this.gpId = gp.id || '';
            this.gpIndex = gp.index;
            if (typeof this.onGamepadChange === 'function') this.onGamepadChange(true, this.gpId);
        }

        // Cập nhật trạng thái nút + phát hiện nút mới nhấn
        const prev = this.gpPrevButtons || {};
        const cur = {};
        for (let i = 0; i < gp.buttons.length; i++) {
            const pressed = gp.buttons[i] && gp.buttons[i].pressed;
            cur[i] = !!pressed;
            if (pressed && !prev[i]) this.gpButtonsPressed[i] = true;
        }
        this.gpPrevButtons = cur;
        this.gpButtons = cur;

        // Trục cần trái (deadzone)
        const dz = 0.2;
        let ax = gp.axes[0] || 0;
        let ay = gp.axes[1] || 0;
        if (Math.abs(ax) < dz) ax = 0;
        if (Math.abs(ay) < dz) ay = 0;
        this.gpAxes = [ax, ay, gp.axes[2] || 0, gp.axes[3] || 0];

        // Đang chờ gán nút tay cầm? Nút đầu tiên được nhấn sẽ được gán
        if (this.gpRebinding) {
            for (let i = 0; i < gp.buttons.length; i++) {
                if (gp.buttons[i] && gp.buttons[i].pressed) {
                    const action = this.gpRebinding;
                    const cb = this.gpRebindCallback;
                    this.gpRebinding = null;
                    this.gpRebindCallback = null;
                    if (cb) cb(action, i);
                    break;
                }
            }
        }
    }

    gamepadDown(buttonIndex) {
        if (!this.gamepadEnabled || !this.gpConnected) return false;
        return !!this.gpButtons[buttonIndex];
    }

    gamepadPressed(buttonIndex) {
        if (!this.gamepadEnabled || !this.gpConnected) return false;
        return !!this.gpButtonsPressed[buttonIndex];
    }

    // API gamepad binding
    getGpBinding(action) { return this.gpBindings[action]; }

    isActionGpDown(action) {
        const btn = this.gpBindings[action];
        return (btn === null || btn === undefined) ? false : this.gamepadDown(btn);
    }

    isActionGpPressed(action) {
        const btn = this.gpBindings[action];
        return (btn === null || btn === undefined) ? false : this.gamepadPressed(btn);
    }

    startGpRebind(action, callback) {
        this.gpRebinding = action;
        this.gpRebindCallback = callback || null;
    }

    cancelGpRebind() { this.gpRebinding = null; this.gpRebindCallback = null; }

    setGpBinding(action, buttonIndex) {
        if (!action || buttonIndex === null || buttonIndex === undefined) return;
        for (const a in this.gpBindings) {
            if (a !== action && this.gpBindings[a] === buttonIndex) this.gpBindings[a] = null;
        }
        this.gpBindings[action] = buttonIndex;
        this.saveGamepadSettings();
    }

    resetGpBindings() {
        this.gpBindings = { ...DEFAULT_GAMEPAD_BINDINGS };
        this.saveGamepadSettings();
    }

    setGamepadEnabled(enabled) {
        this.gamepadEnabled = !!enabled;
        this.saveGamepadSettings();
    }

    saveGamepadSettings() {
        try {
            localStorage.setItem('sf_gamepad_bindings', JSON.stringify(this.gpBindings));
            localStorage.setItem('sf_gamepad_enabled', this.gamepadEnabled ? '1' : '0');
        } catch (e) { /* ignore */ }
    }

    loadGamepadSettings() {
        try {
            const raw = localStorage.getItem('sf_gamepad_bindings');
            if (raw) {
                const parsed = JSON.parse(raw);
                for (const k in DEFAULT_GAMEPAD_BINDINGS) {
                    if (parsed && parsed[k] !== undefined) this.gpBindings[k] = parsed[k];
                }
            }
            const en = localStorage.getItem('sf_gamepad_enabled');
            if (en !== null) this.gamepadEnabled = en === '1';
        } catch (e) { /* ignore */ }
    }

    // Di chuyển bằng cần trái / D-pad
    getGamepadMove() {
        if (!this.gamepadEnabled || !this.gpConnected) return { x: 0, y: 0 };
        let x = this.gpAxes[0] || 0;
        let y = this.gpAxes[1] || 0;
        // D-pad
        if (this.gamepadDown(GAMEPAD_DPAD.left)) x -= 1;
        if (this.gamepadDown(GAMEPAD_DPAD.right)) x += 1;
        if (this.gamepadDown(GAMEPAD_DPAD.up)) y -= 1;
        if (this.gamepadDown(GAMEPAD_DPAD.down)) y += 1;
        // giới hạn
        x = Math.max(-1, Math.min(1, x));
        y = Math.max(-1, Math.min(1, y));
        return { x, y };
    }

    clear() {
        this.keysPressed = {};
        this.keysReleased = {};
        this.gpButtonsPressed = {};
    }

    update() {
        this.keysPressed = {};
        this.keysReleased = {};
        this.gpButtonsPressed = {};
    }
}

// Game State Enum
const GameState = {
    MENU: 'menu',
    PRE_MATCH: 'pre_match',      // trọng tài dắt đội ra sân + thổi còi bắt đầu
    PLAYING: 'playing',
    PAUSED: 'paused',
    GOAL_CELEBRATION: 'goal_celebration',
    MATCH_END: 'match_end',
    POST_MATCH: 'post_match'     // trọng tài thổi còi kết thúc, hiện bảng kết quả
};

// Team Enum
const Team = {
    RED: 'red',
    BLUE: 'blue'
};

// Player Roles
const Role = {
    GK: 'goalkeeper',
    DEF: 'defender',
    MID: 'midfielder',
    FWD: 'forward'
};