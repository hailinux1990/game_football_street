// ============================================================
// BÌNH LUẬN VIÊN (tiếng Việt) - Commentary
// Phong cách BLV Tạ Biên Cương: hào hứng, thốt lên dồn dập
// ("Vào! Vào! Vào!!!", "Hú hồn!", "Ôi trời ơi!", "Đẹp như mơ!"...),
// câu từ bay bổng, đọc nhanh - cao giọng khi cao trào.
// - Hiện phụ đề bình luận trên HUD
// - Đọc bằng giọng tiếng Việt qua Web Speech API (nếu máy có)
// - Báo cho Game biết mỗi khi đang nói để khán đài reo theo
// ============================================================
(function () {
    'use strict';

    // Lời bình luận theo phong cách BLV Tạ Biên Cương
    const PHRASES = {
        kickoff: [
            'Các bạn ơi! Trọng tài thổi còi! Bóng đã lăn rồi! Trận đấu chính thức bắt đầu!',
            'Ôi trời ơi! Tiếng còi vang lên! Bóng đã lăn trên mặt sân, một bữa tiệc bóng đá bắt đầu!',
            'Hú hồn! Trận đấu khởi tranh! Hai đội bước vào với tinh thần rực lửa!'
        ],
        pass: [
            'Chuyền! Gọn gàng và dứt khoát!',
            'Phối hợp như thêu hoa dệt gấm vậy!',
            'Bóng sang cánh, nhịp độ trận đấu được đẩy lên rất cao!',
            'Một đường chuyền đặt đúng tầm chân đồng đội!'
        ],
        through: [
            'Chọc khe! Ối giời ơi, một đường chọc khe xé toang hàng phòng ngự!',
            'Bóng xuyên tuyến! Đẹp như mơ các bạn ạ!',
            'Một pha bóng xứng đáng vào sách giáo khoa!'
        ],
        loft: [
            'Bóng bổng! Trời long đất lở!',
            'Đường bóng dài vượt tuyến, vượt qua cả hàng phòng ngự!',
            'Treo bóng vào vòng cấm! Gay cấn lắm rồi các bạn ơi!'
        ],
        shot: [
            'Sút! Sút! Sút!!!',
            'Dứt điểm! Một cú đại bác!',
            'Tung cú sút như trời giáng!'
        ],
        save: [
            'Cứu thua! Cứu thua! Hú hồn!',
            'Thủ môn bay người như chim cắt! Tuyệt tác!',
            'Pha cứu thua không thể tin nổi! Đỉnh cao!'
        ],
        miss: [
            'Chệch rồi! Ôi tiếc quá các bạn ơi!',
            'Ra ngoài! Hú hồn! Suýt nữa thì vào!',
            'Đáng tiếc! Bóng đi ra ngoài khung thành!'
        ],
        tackle: [
            'Cướp bóng! Dứt khoát lắm!',
            'Một pha vào bóng như chẻ tre!',
            'Bóng đổi chủ! Anh em ơi, hay quá!'
        ],
        steal: [
            'Mất bóng rồi! Chết dở!',
            'Bị cướp bóng ngay trong chân!',
            'Hàng thủ ơi! Tỉnh táo lên nào!'
        ],
        danger: [
            'Nguy hiểm! Nguy hiểm lắm rồi!',
            'Bóng vào vùng nóng! Tim tôi đập thình thịch!',
            'Khu vực này là chảo lửa! Căng như dây đàn!'
        ],
        end: [
            'Hết giờ! Tiếng còi mãn cuộc vang lên! Ôi trời, một trận đấu để đời!',
            'Trọng tài thổi còi! Trận đấu khép lại! Các bạn ơi, tuyệt vời!'
        ],
        menu: [
            'Chào mừng các bạn tới với Street Football!',
            'Các bạn ơi! Bấm CHƠI NGAY để cùng tôi bình luận trận đấu nào!'
        ]
    };

    const TEAM_VI = { red: 'ĐỎ', blue: 'XANH' };

    function pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    // Ước lượng thời lượng đọc (giây) để biết BLV đang "nói" trong bao lâu
    function estimateSeconds(text, rate) {
        const words = (text || '').trim().split(/\s+/).length;
        return Math.max(0.8, (words / (2.6 * (rate || 1.2))) + 0.25);
    }

    class Commentary {
        constructor(game) {
            this.game = game;
            this.enabled = true;        // bật/tắt bình luận
            this.voiceEnabled = true;   // đọc thành tiếng hay chỉ phụ đề
            this.volume = 1.0;
            this.rate = 1.22;           // nói nhanh, dồn dập kiểu BLV trực tiếp
            this.pitch = 1.12;
            this.minGap = 1.0;          // giây tối thiểu giữa 2 câu thường
            this._lastAt = -99;
            this._lastKind = null;
            this._lastText = null;
            this._talkingUntil = 0;     // mốc thời gian BLV còn đang nói
            this._seq = null;
            this._seqIdx = 0;
            this._seqTimer = null;
            this._utter = null;
            this.history = [];
            this._voice = null;
            this._voicesReady = false;
            this.lastText = '';
            this.textTimer = 0;
            this.onLine = null;         // callback(kind, text) — Game dùng để khán đài reo theo
            this.onSpeakState = null;   // callback(booleam) — bắt đầu/kết thúc nói

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

        _now() {
            return (typeof performance !== 'undefined' && performance.now) ? performance.now() / 1000 : Date.now() / 1000;
        }

        // BLV có đang nói không? (dùng cho khán đài reo theo)
        isSpeaking() {
            if (!this.enabled) return false;
            if (this._now() < this._talkingUntil) return true;
            const syn = this.synth;
            return !!(syn && syn.speaking);
        }

        // Mức "năng lượng" hiện tại 0..1 (câu cao trào -> khán đài reo to hơn)
        energy() {
            if (!this.isSpeaking()) return 0;
            const left = Math.max(0, this._talkingUntil - this._now());
            return Math.min(1, 0.55 + left * 0.25);
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

        hasVietnameseVoice() {
            if (!this._voicesReady) this.initVoices();
            return !!this._voice;
        }

        voiceName() {
            if (!this._voice) return '';
            return (this._voice.name || '') + ' (' + (this._voice.lang || '') + ')';
        }

        shutUp() {
            this._seq = null;
            this._seqIdx = 0;
            if (this._seqTimer) { clearTimeout(this._seqTimer); this._seqTimer = null; }
            this._talkingUntil = 0;
            const syn = this.synth;
            if (syn) {
                try { syn.cancel(); } catch (e) { /* ignore */ }
            }
            if (typeof this.onSpeakState === 'function') this.onSpeakState(false);
        }

        _makeUtterance(text, rate, pitch) {
            const u = new SpeechSynthesisUtterance(text);
            u.lang = this._voice ? (this._voice.lang || 'vi-VN') : 'vi-VN';
            if (this._voice) u.voice = this._voice;
            u.volume = Math.max(0, Math.min(1, this.volume));
            u.rate = Math.max(0.5, Math.min(2, rate || this.rate));
            u.pitch = Math.max(0, Math.min(2, pitch || this.pitch));
            return u;
        }

        // Đọc 1 câu
        speak(text) {
            return this.speakSequence([{ text: text }]);
        }

        // Đọc một chuỗi câu (dùng cho pha cao trào: "Vào! Vào! Vào!!! ...")
        speakSequence(parts) {
            const syn = this.synth;
            if (!syn || !parts || !parts.length) return false;
            this.shutUp();
            this._seq = parts;
            this._seqIdx = 0;
            this._speakNext();
            return true;
        }

        _speakNext() {
            const syn = this.synth;
            if (!this._seq || !syn) return;
            if (this._seqIdx >= this._seq.length) {
                this._seq = null;
                if (typeof this.onSpeakState === 'function') this.onSpeakState(false);
                return;
            }
            const part = this._seq[this._seqIdx++];
            const text = typeof part === 'string' ? part : part.text;
            const rate = (typeof part === 'object' && part.rate) || this.rate;
            const pitch = (typeof part === 'object' && part.pitch) || this.pitch;
            if (!text) { this._speakNext(); return; }

            this._talkingUntil = this._now() + estimateSeconds(text, rate) + 0.15;
            if (typeof this.onSpeakState === 'function') this.onSpeakState(true);

            try {
                syn.cancel();
                const u = this._makeUtterance(text, rate, pitch);
                let advanced = false;
                const next = () => {
                    if (advanced) return;
                    advanced = true;
                    if (this._seqTimer) { clearTimeout(this._seqTimer); this._seqTimer = null; }
                    this._speakNext();
                };
                u.onend = next;
                u.onerror = next;
                this._utter = u;          // giữ tham chiếu tránh bị GC
                syn.speak(u);
                // dự phòng khi trình duyệt không bắn onend (máy không có giọng)
                const wait = Math.min(2600, Math.max(700, estimateSeconds(text, rate) * 1000 * 1.35));
                this._seqTimer = setTimeout(next, wait);
                // Node (khi chạy test) không nên giữ process sống vì timer này
                if (this._seqTimer && typeof this._seqTimer.unref === 'function') this._seqTimer.unref();
            } catch (e) {
                this._speakNext();
            }
        }

        // Đọc thử (nút trong phần Cài đặt)
        testVoice() {
            const parts = [
                { text: 'Hú hồn!', rate: 1.3, pitch: 1.35 },
                { text: 'Đây là bình luận viên tiếng Việt của Street Football, các bạn ơi!', rate: 1.15, pitch: 1.15 }
            ];
            this.showText('Hú hồn! Đây là bình luận viên tiếng Việt của Street Football, các bạn ơi!');
            if (!this.voiceEnabled) return false;
            return this.speakSequence(parts);
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
        say(kind, text, opts) {
            opts = opts || {};
            if (!this.enabled) return false;

            const now = this._now();
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

            // Khán đài reo theo từng tình huống bình luận
            if (typeof this.onLine === 'function') this.onLine(kind, line);

            if (this.voiceEnabled) {
                if (opts.sequence && opts.sequence.length) {
                    this.speakSequence(opts.sequence);
                } else {
                    this.speakSequence([{ text: line, rate: opts.rate || this.rate, pitch: opts.pitch || this.pitch }]);
                }
            } else {
                this._talkingUntil = this._now() + estimateSeconds(line, this.rate);
            }
            return true;
        }

        // ===== Các tình huống cụ thể của trận đấu =====
        sayKickoff() {
            return this.say('kickoff', '', { priority: 2, rate: 1.3, pitch: 1.18 });
        }

        // Bàn thắng: chuỗi "Vào! Vào! Vào!!!" rồi mới tới lời bình
        sayGoal(team, scorer, minute, redScore, blueScore) {
            const t = TEAM_VI[team] || 'ĐỎ';
            const who = scorer
                ? ('số ' + (scorer.playerNum || 0) + (scorer.role ? ', ' + this.roleVi(scorer.role) : ''))
                : 'một cầu thủ';
            const variants = [
                'Bàn thắng rồi các bạn ơi! ' + who + ' dứt điểm như trời giáng! Đội ' + t + ' ghi bàn ở phút thứ ' + minute + '!',
                'Vào lưới rồi! Một pha bóng xứng đáng vào sách giáo khoa! ' + who + ' ghi bàn cho đội ' + t + '! Tỷ số là ' + redScore + ' đều ' + blueScore + '!',
                'Ôi trời ơi! Đẹp như mơ! Đội ' + t + ' vừa mở tỷ số ở phút ' + minute + '! Khán đài như nổ tung!'
            ];
            const line = pick(variants);
            return this.say('goal', line, {
                priority: 2,
                rate: 1.3,
                pitch: 1.25,
                sequence: [
                    { text: 'Vào!', rate: 1.15, pitch: 1.1 },
                    { text: 'Vào!', rate: 1.35, pitch: 1.25 },
                    { text: 'Vào!!!', rate: 1.5, pitch: 1.4 },
                    { text: line, rate: 1.22, pitch: 1.2 }
                ]
            });
        }

        sayShot(isHuman) {
            if (isHuman) return this.say('shot', '', { priority: 1, rate: 1.4, pitch: 1.25 });
            return this.say('shot', '', { priority: 0, rate: 1.3, pitch: 1.15 });
        }

        saySave() {
            return this.say('save', '', { priority: 1, rate: 1.32, pitch: 1.2 });
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
            return this.say('danger', '', { priority: 1, rate: 1.28, pitch: 1.18 });
        }

        sayEnd(redScore, blueScore) {
            const result = redScore > blueScore ? 'Đội ĐỎ giành chiến thắng!'
                : (redScore < blueScore ? 'Đội XANH giành chiến thắng!' : 'Hai đội hòa nhau, một trận cầu quá hay!');
            const text = pick(PHRASES.end) + ' Tỷ số chung cuộc ' + redScore + ' - ' + blueScore + '. ' + result;
            return this.say('end', text, { priority: 2, rate: 1.24, pitch: 1.18 });
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
