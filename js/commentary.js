// ============================================================
// BÌNH LUẬN VIÊN (tiếng Việt) - Commentary
// - Hiện phụ đề bình luận trên HUD
// - Đọc bằng giọng tiếng Việt qua Web Speech API (nếu máy có)
// - Tự chọn câu theo tình huống: giao bóng, chuyền, chọc khe, bóng bổng,
//   sút, cứu thua, tranh bóng, nguy hiểm, bàn thắng, hết giờ...
// ============================================================
(function () {
    'use strict';

    const PHRASES = {
        kickoff: [
            'Trọng tài thổi còi! Trận đấu chính thức bắt đầu!',
            'Bóng đã lăn! Một trận cầu hứa hẹn hấp dẫn.',
            'Và trận đấu bắt đầu! Hai đội nhập cuộc đầy quyết tâm.'
        ],
        pass: [
            'Chuyền bóng gọn gàng.',
            'Phối hợp đẹp mắt!',
            'Bóng được luân chuyển sang cánh.',
            'Đường chuyền chính xác tới chân đồng đội.'
        ],
        through: [
            'Chọc khe cực hiểm!',
            'Đường chuyền xé toang hàng phòng ngự!',
            'Bóng xuyên tuyến, cơ hội đang mở ra!'
        ],
        loft: [
            'Bóng bổng lên cao!',
            'Đường bóng dài vượt tuyến phòng ngự!',
            'Tạt bóng bổng vào vòng cấm!'
        ],
        shot: [
            'SÚT!!!',
            'Dứt điểm!',
            'Cú sút rất căng!',
            'Tung cú đại bác về phía khung thành!'
        ],
        save: [
            'Cứu thua xuất sắc!',
            'Thủ môn bay người cản phá!',
            'Pha cứu thua không tưởng của thủ môn!',
            'Thủ môn đã đọc được tình huống!'
        ],
        miss: [
            'Bóng đi chệch khung thành!',
            'Đáng tiếc, bóng đã ra ngoài!',
            'Cơ hội trôi qua trước mũi giày!'
        ],
        tackle: [
            'Tranh bóng thành công!',
            'Cướp bóng quyết đoán!',
            'Một pha vào bóng dứt khoát, bóng đã đổi chủ!',
            'Đoạt bóng ngay trước chân đối phương!'
        ],
        steal: [
            'Đối phương vừa cướp được bóng!',
            'Mất bóng rồi! Cần tranh lại ngay.',
            'Bóng đã bị đoạt trong chân!'
        ],
        danger: [
            'Nguy hiểm! Bóng đã vào vùng nóng.',
            'Khu vực cực kỳ nguy hiểm trước khung thành!',
            'Hàng thủ phải hết sức cảnh giác!'
        ],
        buildup: [
            'Bóng đang được triển khai bên phần sân đối phương.',
            'Đội bóng đang kiểm soát thế trận.',
            'Nhịp độ trận đấu đang được đẩy cao.'
        ],
        end: [
            'Hết giờ! Trọng tài nổi còi kết thúc trận đấu!',
            'Tiếng còi mãn cuộc đã vang lên!'
        ],
        menu: [
            'Chào mừng tới với Street Football! Chọn CHƠI NGAY để vào sân.',
            'Sẵn sàng chưa? Bấm CHƠI NGAY để bắt đầu trận đấu!'
        ]
    };

    const TEAM_VI = { red: 'ĐỎ', blue: 'XANH' };

    function pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    class Commentary {
        constructor(game) {
            this.game = game;
            this.enabled = true;        // bật/tắt bình luận
            this.voiceEnabled = true;   // đọc thành tiếng hay chỉ phụ đề
            this.volume = 0.9;
            this.rate = 1.12;
            this.minGap = 1.0;          // giây tối thiểu giữa 2 câu (câu quan trọng được ưu tiên)
            this._lastAt = -99;
            this._lastKind = null;
            this._lastText = null;
            this.history = [];
            this._voice = null;
            this._voicesReady = false;
            this._utter = null;
            this.lastText = '';
            this.textTimer = 0;

            this.loadSettings();
            this.initVoices();
        }

        // ---------- Cài đặt ----------
        loadSettings() {
            try {
                const e = localStorage.getItem('sf_commentary_enabled');
                if (e !== null) this.enabled = e === '1';
                const v = localStorage.getItem('sf_commentary_voice');
                if (v !== null) this.voiceEnabled = v === '1';
            } catch (e) { /* ignore */ }
        }

        saveSettings() {
            try {
                localStorage.setItem('sf_commentary_enabled', this.enabled ? '1' : '0');
                localStorage.setItem('sf_commentary_voice', this.voiceEnabled ? '1' : '0');
            } catch (e) { /* ignore */ }
        }

        setEnabled(on) {
            this.enabled = !!on;
            if (!this.enabled) this.shutUp();
            this.saveSettings();
            return this.enabled;
        }

        setVoiceEnabled(on) {
            this.voiceEnabled = !!on;
            if (!this.voiceEnabled) this.shutUp();
            this.saveSettings();
            return this.voiceEnabled;
        }

        // ---------- Giọng nói ----------
        get synth() {
            return (typeof window !== 'undefined' && window.speechSynthesis) ? window.speechSynthesis : null;
        }

        initVoices() {
            const syn = this.synth;
            if (!syn) return;
            const load = () => {
                let list = [];
                try { list = syn.getVoices() || []; } catch (e) { list = []; }
                if (!list.length) return;
                // Ưu tiên giọng tiếng Việt (vi-VN, vi_VN, vi)
                this._voice = list.find(v => /^vi[-_]?/i.test(v.lang || ''))
                    || list.find(v => /vietnam/i.test(v.name || ''))
                    || null;
                this._voicesReady = true;
                if (typeof this.onVoicesReady === 'function') this.onVoicesReady(this._voice, list);
            };
            load();
            try {
                syn.onvoiceschanged = load;
            } catch (e) { /* ignore */ }
        }

        // Có giọng tiếng Việt trên máy không?
        hasVietnameseVoice() {
            if (!this._voicesReady) this.initVoices();
            return !!this._voice;
        }

        voiceName() {
            if (!this._voice) return '';
            return (this._voice.name || '') + ' (' + (this._voice.lang || '') + ')';
        }

        shutUp() {
            const syn = this.synth;
            if (syn && syn.speaking) {
                try { syn.cancel(); } catch (e) { /* ignore */ }
            }
        }

        speak(text) {
            const syn = this.synth;
            if (!syn || !text) return false;
            try {
                if (syn.speaking || syn.pending) {
                    // câu mới át câu cũ (bình luận trực tiếp cần cập nhật tức thì)
                    syn.cancel();
                }
                const u = new SpeechSynthesisUtterance(text);
                u.lang = this._voice ? (this._voice.lang || 'vi-VN') : 'vi-VN';
                if (this._voice) u.voice = this._voice;
                u.volume = Math.max(0, Math.min(1, this.volume));
                u.rate = this.rate;
                u.pitch = 1.02;
                this._utter = u;      // giữ tham chiếu để tránh bị GC
                syn.speak(u);
                return true;
            } catch (e) {
                return false;
            }
        }

        // Đọc thử (nút trong phần Cài đặt)
        testVoice() {
            const text = 'Xin chào! Đây là bình luận viên tiếng Việt của Street Football.';
            this.showText(text);
            if (!this.voiceEnabled) return false;
            return this.speak(text);
        }

        // ---------- Phụ đề ----------
        showText(text) {
            this.lastText = text;
            if (typeof document === 'undefined' || !document.getElementById) return;
            const box = document.getElementById('commentary-box');
            if (!box) return;
            const line = document.getElementById('commentary-line');
            const prev = document.getElementById('commentary-prev');
            if (prev && line && line.textContent) prev.textContent = line.textContent;
            if (line) line.textContent = text;
            box.classList.add('show');
            this.textTimer = 5.0;
        }

        update(dt) {
            if (this.textTimer > 0) {
                this.textTimer -= dt;
                if (this.textTimer <= 0 && typeof document !== 'undefined' && document.getElementById) {
                    const box = document.getElementById('commentary-box');
                    if (box) box.classList.remove('show');
                }
            }
        }

        // ---------- API chính ----------
        // kind: 'kickoff' | 'pass' | 'through' | 'loft' | 'shot' | 'save' | 'miss'
        //       | 'tackle' | 'steal' | 'danger' | 'buildup' | 'end' | 'goal' | 'info'
        say(kind, text, opts) {
            opts = opts || {};
            if (!this.enabled) return false;

            // khoảng nghỉ giữa các câu (câu quan trọng được bỏ qua giới hạn)
            const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() / 1000 : Date.now() / 1000;
            const priority = opts.priority || (kind === 'goal' || kind === 'end' || kind === 'kickoff' ? 2 : 0);
            if (priority < 2 && now - this._lastAt < this.minGap) return false;
            if (text && text === this._lastText && kind === this._lastKind) return false;

            const line = text || (PHRASES[kind] ? pick(PHRASES[kind]) : '');
            if (!line) return false;

            this._lastAt = now;
            this._lastKind = kind;
            this._lastText = line;
            this.history.push({ kind, text: line });
            if (this.history.length > 40) this.history.shift();

            this.showText((opts.tag ? opts.tag + ' ' : '') + line);
            if (this.voiceEnabled) this.speak(line);
            return true;
        }

        // ===== Các tình huống cụ thể của trận đấu =====
        sayKickoff() {
            return this.say('kickoff', '', { priority: 2 });
        }

        sayGoal(team, scorer, minute, redScore, blueScore) {
            const t = TEAM_VI[team] || 'ĐỎ';
            const who = scorer
                ? ('số ' + (scorer.playerNum || 0) + (scorer.role ? ' (' + this.roleVi(scorer.role) + ')' : ''))
                : 'một cầu thủ';
            const variants = [
                'VÀO!!! Bàn thắng cho đội ' + t + '! ' + who + ' dứt điểm chuẩn xác ở phút thứ ' + minute + '!',
                'VÀO LƯỚI!!! ' + who + ' ghi bàn cho đội ' + t + '! Tỷ số giờ là ' + redScore + ' đều ' + blueScore + '!',
                'BÀN THẮNG!!! Đội ' + t + ' vừa mở tỷ số ở phút ' + minute + '! Khán đài như nổ tung!'
            ];
            return this.say('goal', pick(variants), { priority: 2 });
        }

        sayShot(isHuman) {
            if (isHuman) return this.say('shot', '', { priority: 1 });
            return this.say('shot', '', { priority: 0 });
        }

        saySave() {
            return this.say('save', '', { priority: 1 });
        }

        sayMiss() {
            return this.say('miss', '', { priority: 0 });
        }

        sayTackle(won) {
            return this.say(won ? 'tackle' : 'steal', '', { priority: 1 });
        }

        sayPass(kind) {
            return this.say(kind, '', { priority: 0 });
        }

        sayDanger() {
            return this.say('danger', '', { priority: 1 });
        }

        sayEnd(redScore, blueScore) {
            const result = redScore > blueScore ? 'Đội ĐỎ giành chiến thắng!'
                : (redScore < blueScore ? 'Đội XANH giành chiến thắng!' : 'Hai đội hòa nhau!');
            const text = pick(PHRASES.end) + ' Tỷ số chung cuộc ' + redScore + ' - ' + blueScore + '. ' + result;
            return this.say('end', text, { priority: 2 });
        }

        sayMenu() {
            return this.say('menu', '', { priority: 2 });
        }

        roleVi(role) {
            return ({ goalkeeper: 'thủ môn', defender: 'hậu vệ', midfielder: 'tiền vệ', forward: 'tiền đạo' })[role] || 'cầu thủ';
        }
    }

    window.Commentary = Commentary;
})();
