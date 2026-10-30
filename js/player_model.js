// ============================================================
// PLAYER MODEL 3D - Cầu thủ 3D có đầy đủ chân tay (FIFA Street style)
// Mô hình humanoid phân khúc: hông, thân, đầu, 2 tay (vai/khuỷu/bàn),
// 2 chân (đùi/gối/cổ chân/bàn chân) + animation procedural.
// Yêu cầu: THREE (js/vendor/three.min.js) đã load trước file này.
// ============================================================
(function () {
    if (typeof THREE === 'undefined') {
        window.PlayerModel = null;
        window.BallModel = null;
        return;
    }

    // ----- Bảng màu -----
    const SKIN_TONES = ['#f3c9a2', '#e6b183', '#d29a68', '#b87d4f', '#96603c', '#f7dcc0'];
    const HAIR_COLORS = ['#1a1310', '#2b1a12', '#3c2415', '#5a3a1f', '#0e0e0e', '#6d4a26'];
    const BOOT_COLORS = ['#101418', '#f5f5f5', '#e8e01f', '#ff5a1f', '#2b7bff', '#23d18b'];

    const KIT = {
        red: {
            shirt: 0xe94560, shirtDark: 0x9d2038, shirtLight: 0xff7c92,
            shorts: 0xf2f2f4, socks: 0xd7384f, trim: 0xffd9e0, accent: 0xffffff
        },
        blue: {
            shirt: 0x2fb3c9, shirtDark: 0x136b7c, shirtLight: 0x8ff0ff,
            shorts: 0xf2f2f4, socks: 0x2392a6, trim: 0xd8fbff, accent: 0xffffff
        },
        // Trọng tài: áo đen, viền vàng
        ref: {
            shirt: 0x15181f, shirtDark: 0x0b0d12, shirtLight: 0x2c313c,
            shorts: 0x15181f, socks: 0x15181f, trim: 0xffd24a, accent: 0xffd24a
        }
    };

    // ----- Helpers -----
    function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function ease(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }
    function damp(current, target, lambda, dt) { return lerp(current, target, 1 - Math.exp(-lambda * dt)); }

    function makeMat(color, opts) {
        return new THREE.MeshStandardMaterial(Object.assign({
            color: new THREE.Color(color),
            roughness: 0.72,
            metalness: 0.04
        }, opts || {}));
    }

    function box(w, h, d, mat, x, y, z) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x || 0, y || 0, z || 0);
        m.castShadow = true;
        return m;
    }

    function makeNumberTexture(num, color) {
        const c = document.createElement('canvas');
        c.width = 128; c.height = 128;
        const g = c.getContext('2d');
        g.clearRect(0, 0, 128, 128);
        g.fillStyle = color || '#ffffff';
        g.font = 'bold 92px Arial, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(num), 64, 70);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        return tex;
    }

    // ============================================================
    // PlayerModel: nhân vật 3D phân khúc với animation procedural
    // ============================================================
    class PlayerModel {
        constructor(player, opts) {
            this.player = player;
            this.opts = opts || {};
            this.team = KIT[player.team] ? player.team : 'red';

            this.group = new THREE.Group();
            this.group.position.set(player.pos.x, 0, player.pos.y);

            this.t = Math.random() * 40;
            this.phase = Math.random() * Math.PI * 2;
            this.speed = 0;                 // units/giây (quan sát từ vị trí)
            this.dirAngle = 0;              // hướng di chuyển (radian, hệ 2D gameplay)
            this.smoothDir = 0;             // đã làm mượt
            this.prevX = player.pos.x;
            this.prevY = player.pos.y;
            this.actionBlend = 0;
            this.diveT = 0;
            this.diveDir = 1;
            this.diveCd = 0;
            this.celebrateT = 0;

            // Bảng joint đích (được lerp mỗi frame để chuyển động mượt)
            this.pose = {
                rootY: 0, rootRotY: 0, rootRotZ: 0, rootRotX: 0,
                hipsY: 0, torsoX: 0, torsoY: 0, torsoZ: 0,
                headX: 0, headY: 0, headZ: 0,
                armLx: 0, armLy: 0, armLz: 0, elbowL: 0,
                armRx: 0, armRy: 0, armRz: 0, elbowR: 0,
                legLx: 0, legLy: 0, legLz: 0, kneeL: 0, ankleL: 0,
                legRx: 0, legRy: 0, legRz: 0, kneeR: 0, ankleR: 0
            };

            this._build();
        }

        // ---------- Dựng mô hình ----------
        _build() {
            const p = this.player;
            const kit = KIT[this.team];
            const seed = (p.playerNum || 3) % 6;

            this.matSkin = makeMat(SKIN_TONES[seed], { roughness: 0.62 });
            this.matHair = makeMat(HAIR_COLORS[(seed + 2) % HAIR_COLORS.length], { roughness: 0.85 });
            this.matShirt = makeMat(kit.shirt, { roughness: 0.62 });
            this.matShirtDark = makeMat(kit.shirtDark, { roughness: 0.6 });
            this.matShorts = makeMat(kit.shorts, { roughness: 0.66 });
            this.matSocks = makeMat(kit.socks, { roughness: 0.7 });
            this.matBoot = makeMat(BOOT_COLORS[(seed + 1) % BOOT_COLORS.length], { roughness: 0.42, metalness: 0.18 });
            this.matTrim = makeMat(kit.trim, { roughness: 0.5 });
            this.matDark = makeMat(0x14161c, { roughness: 0.5 });

            // ---------- ROOT ----------
            this.body = new THREE.Group();
            this.group.add(this.body);

            // ---------- HÔNG / QUẦN ----------
            this.hips = new THREE.Group();
            this.hips.position.y = 13.5;
            this.body.add(this.hips);

            const pelvis = box(9.4, 4.0, 6.2, this.matShorts, 0, 2.0, 0);
            this.hips.add(pelvis);
            // sọc quần
            const stripe = box(9.7, 0.7, 6.5, this.matTrim, 0, 3.6, 0);
            this.hips.add(stripe);

            // ---------- THÂN ----------
            this.torso = new THREE.Group();
            this.torso.position.y = 4.0;         // đỉnh hông = eo
            this.hips.add(this.torso);

            // áo đấu (thuôn dần lên trên)
            const waist = box(9.2, 3.0, 6.0, this.matShirt, 0, 1.5, 0);
            this.torso.add(waist);
            const chest = box(11.2, 5.4, 6.8, this.matShirt, 0, 5.6, 0);
            this.torso.add(chest);
            // vai/đệm vai
            const shoulders = box(11.6, 1.5, 6.9, this.matShirtDark, 0, 8.1, 0);
            this.torso.add(shoulders);
            // sọc áo
            const chestStripe = box(10.95, 0.8, 6.95, this.matTrim, 0, 6.6, 0);
            this.torso.add(chestStripe);
            // cổ áo
            const collar = box(4.6, 1.0, 4.6, this.matShirtDark, 0, 8.95, 0);
            this.torso.add(collar);

            // Số áo phía sau lưng
            const numTex = makeNumberTexture(p.playerNum || 0, '#ffffff');
            const numMat = new THREE.MeshBasicMaterial({ map: numTex, transparent: true, depthWrite: false });
            const numPlane = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.4), numMat);
            numPlane.position.set(0, 5.4, -3.56);
            numPlane.rotation.y = Math.PI;
            this.torso.add(numPlane);

            // ---------- ĐẦU ----------
            this.head = new THREE.Group();
            this.head.position.y = 9.0;
            this.torso.add(this.head);

            const neck = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 1.8, 10), this.matSkin);
            neck.position.y = 0.5;
            neck.castShadow = true;
            this.head.add(neck);

            const headMesh = new THREE.Mesh(new THREE.SphereGeometry(3.5, 20, 16), this.matSkin);
            headMesh.position.y = 3.9;
            headMesh.scale.set(1.0, 1.06, 0.96);
            headMesh.castShadow = true;
            this.head.add(headMesh);

            // tai
            [-1, 1].forEach(s => {
                const ear = new THREE.Mesh(new THREE.SphereGeometry(0.85, 8, 6), this.matSkin);
                ear.position.set(s * 3.35, 3.9, 0.2);
                ear.scale.set(0.6, 1, 0.8);
                this.head.add(ear);
            });

            // mắt + lông mày + miệng (mặt hướng +Z)
            [-1, 1].forEach(s => {
                const eye = new THREE.Mesh(new THREE.SphereGeometry(0.52, 8, 8), this.matDark);
                eye.position.set(s * 1.35, 4.15, 3.05);
                eye.scale.set(0.85, 1.0, 0.6);
                this.head.add(eye);
                const brow = box(1.5, 0.32, 0.3, this.matHair, s * 1.4, 5.0, 3.1);
                this.head.add(brow);
            });
            const mouth = box(1.25, 0.28, 0.3, makeMat(0x7a3a34, { roughness: 0.8 }), 0, 2.75, 3.2);
            this.head.add(mouth);
            const nose = box(0.55, 0.7, 0.6, new THREE.MeshStandardMaterial({ color: new THREE.Color(SKIN_TONES[seed]).multiplyScalar(0.92), roughness: 0.6 }), 0, 3.4, 3.35);
            this.head.add(nose);

            // tóc theo kiểu (hairStyle 0=spiky, 1=bowl, 2=flat)
            const style = (p.hairStyle || 0) % 3;
            const capGeo = new THREE.SphereGeometry(3.62, 18, 12, 0, Math.PI * 2, 0, Math.PI * (style === 2 ? 0.42 : 0.56));
            const cap = new THREE.Mesh(capGeo, this.matHair);
            cap.position.y = 3.95;
            cap.castShadow = true;
            this.head.add(cap);
            if (style === 0) {
                // tóc dựng (spiky)
                for (let i = 0; i < 7; i++) {
                    const a = (i / 7) * Math.PI * 2;
                    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.95, 3.0, 6), this.matHair);
                    spike.position.set(Math.cos(a) * 2.1, 6.6 + Math.sin(i * 1.7) * 0.35, Math.sin(a) * 2.0);
                    spike.rotation.z = Math.cos(a) * 0.5;
                    spike.rotation.x = -Math.sin(a) * 0.5;
                    spike.castShadow = true;
                    this.head.add(spike);
                }
            } else if (style === 1) {
                // tóc bowl (mái bằng)
                const fringe = new THREE.Mesh(new THREE.SphereGeometry(3.5, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.75), this.matHair);
                fringe.position.y = 3.6;
                fringe.scale.set(1.02, 1.0, 1.02);
                this.head.add(fringe);
            } else {
                // tóc ngắn mái lệch
                const back = box(6.6, 3.0, 1.4, this.matHair, 0, 4.6, -2.6);
                this.head.add(back);
                const part = box(5.2, 1.0, 2.0, this.matHair, 0.6, 6.3, 2.0);
                this.head.add(part);
            }

            // ---------- TAY ----------
            this.armL = this._buildArm(-1);
            this.armR = this._buildArm(1);
            this.torso.add(this.armL);
            this.torso.add(this.armR);

            // ---------- CHÂN ----------
            this.legL = this._buildLeg(-1);
            this.legR = this._buildLeg(1);
            this.hips.add(this.legL);
            this.hips.add(this.legR);

            this.group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.userData.kind = 'player'; } });
        }

        _buildArm(side) {
            // Pivot ở vai; tay buông xuống theo trục -Y
            const arm = new THREE.Group();
            arm.position.set(side * 6.5, 7.7, 0);

            const upper = new THREE.Mesh(new THREE.CapsuleGeometry(1.15, 3.6, 6, 10), this.matSkin);
            upper.position.y = -2.9;
            upper.castShadow = true;
            arm.add(upper);

            // ống tay áo
            const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.35, 2.6, 10), this.matShirt);
            sleeve.position.y = -1.35;
            sleeve.castShadow = true;
            arm.add(sleeve);

            const elbow = new THREE.Group();
            elbow.position.y = -5.9;
            arm.add(elbow);

            const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.95, 3.0, 6, 10), this.matSkin);
            fore.position.y = -2.4;
            fore.castShadow = true;
            elbow.add(fore);

            const hand = new THREE.Mesh(new THREE.SphereGeometry(1.05, 10, 8), this.matSkin);
            hand.position.y = -4.8;
            hand.scale.set(0.85, 1.15, 0.8);
            hand.castShadow = true;
            elbow.add(hand);

            arm.userData.elbow = elbow;
            return arm;
        }

        _buildLeg(side) {
            const leg = new THREE.Group();
            leg.position.set(side * 3.0, 0, 0);        // gắn vào hips (y=13.5)

            // đùi
            const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(1.42, 3.3, 6, 10), this.matSkin);
            thigh.position.y = -3.2;
            thigh.castShadow = true;
            leg.add(thigh);
            // ống quần
            const shortsLeg = new THREE.Mesh(new THREE.CylinderGeometry(1.72, 1.58, 3.0, 10), this.matShorts);
            shortsLeg.position.y = -1.3;
            shortsLeg.castShadow = true;
            leg.add(shortsLeg);

            // gối
            const knee = new THREE.Group();
            knee.position.y = -6.5;
            leg.add(knee);

            // bắp chân + tất
            const shin = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.05, 4.6, 10), this.matSocks);
            shin.position.y = -2.4;
            shin.castShadow = true;
            knee.add(shin);
            const sockTop = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.35, 0.7, 10), this.matTrim);
            sockTop.position.y = -0.15;
            knee.add(sockTop);

            // cổ chân
            const ankle = new THREE.Group();
            ankle.position.y = -4.8;
            knee.add(ankle);

            // giày
            const shoe = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.5, 5.6), this.matBoot);
            shoe.position.set(0, -0.75, 1.1);
            shoe.castShadow = true;
            ankle.add(shoe);
            const toe = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.0, 1.4), this.matBoot);
            toe.position.set(0, -0.95, 3.9);
            toe.castShadow = true;
            ankle.add(toe);
            const sole = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.35, 5.9), this.matDark);
            sole.position.set(0, -1.35, 1.15);
            ankle.add(sole);

            leg.userData.knee = knee;
            leg.userData.ankle = ankle;
            return leg;
        }

        // ---------- Cập nhật animation ----------
        update(dt) {
            const p = this.player;
            this.t += dt;

            const sn = clamp(this.speed / 300, 0, 1.2);   // 1.0 ~ tốc độ chạy thường
            const moving = this.speed > 14;
            if (moving) {
                this.phase += dt * (5.4 + sn * 6.2);
            } else {
                this.phase += dt * 1.4;
            }
            const ph = this.phase;

            // Xoay về hướng di chuyển (mượt)
            let d = this.dirAngle - this.smoothDir;
            while (d > Math.PI) d -= Math.PI * 2;
            while (d < -Math.PI) d += Math.PI * 2;
            this.smoothDir += d * (1 - Math.exp(-12 * dt));
            // Model hướng mặt về +Z; hướng 2D (cos, sin) tương ứng rotY = PI/2 - dir
            this.group.rotation.y = Math.PI / 2 - this.smoothDir;

            const T = this.pose;
            // ---- Mặc định: đứng yên ----
            const breathe = Math.sin(this.t * 2.1);
            T.rootY = 0;
            T.rootRotX = 0; T.rootRotY = 0; T.rootRotZ = 0;
            T.torsoX = -0.02 + breathe * 0.012; T.torsoY = 0; T.torsoZ = 0;
            T.headX = 0.02 - breathe * 0.01; T.headY = Math.sin(this.t * 0.7) * 0.12; T.headZ = 0;
            T.armLx = -0.1 + breathe * 0.05; T.armLz = -0.26; T.armLy = 0.12; T.elbowL = -0.42;
            T.armRx = -0.1 - breathe * 0.05; T.armRz = 0.26; T.armRy = -0.12; T.elbowR = -0.42;
            T.legLx = 0.02; T.legLz = -0.04; T.legLy = 0; T.kneeL = 0.06; T.ankleL = 0;
            T.legRx = 0.02; T.legRz = 0.04; T.legRy = 0; T.kneeR = 0.06; T.ankleR = 0;

            // ---- Chạy ----
            if (moving) {
                const amp = 0.34 + sn * 0.58;   // biên độ vung đùi (rad)
                const s = Math.sin(ph);
                const c = Math.cos(ph);
                T.rootY = Math.abs(Math.sin(ph)) * 0.55 * sn;
                T.torsoX = -(0.06 + sn * 0.16);
                T.torsoY = s * 0.14 * sn;
                T.torsoZ = s * 0.05 * sn;
                T.headX = 0.05 + sn * 0.10;
                T.headY = -s * 0.10 * sn;

                // chân: đùi lệch pha, gối gập khi đưa về trước
                T.legLx = -s * amp;
                T.legRx = s * amp;
                T.kneeL = 0.12 + Math.max(0, -c) * (0.55 + sn * 0.55);
                T.kneeR = 0.12 + Math.max(0, c) * (0.55 + sn * 0.55);
                T.ankleL = 0.18 * sn * Math.max(0, Math.sin(ph + 0.7));
                T.ankleR = 0.18 * sn * Math.max(0, Math.sin(ph + 0.7 + Math.PI));
                T.legLz = -0.05; T.legRz = 0.05;

                // tay vung ngược pha với chân
                T.armLx = -s * amp * 0.85 + 0.1;
                T.armRx = s * amp * 0.85 + 0.1;
                T.armLz = -(0.28 + sn * 0.12);
                T.armRz = 0.28 + sn * 0.12;
                T.elbowL = -(0.55 + sn * 0.5 + Math.max(0, -s) * 0.4);
                T.elbowR = -(0.55 + sn * 0.5 + Math.max(0, s) * 0.4);
            }

            // ---- Theo bóng / giữ bóng: hơi cúi & tay che bóng ----
            if (p.hasBall) {
                T.torsoX -= 0.06;
                T.armLz -= 0.25;
                T.armRz += 0.25;
            }

            // ================= ACTION OVERLAY =================
            const act = p.action;
            if (act) {
                const dur = Math.max(0.05, p.actionDur || 0.5);
                const u = clamp(1 - (p.actionT / dur), 0, 1);   // 0 -> 1
                this.actionBlend = Math.min(1, this.actionBlend + dt * 14);
                this._applyAction(act, u, T);
            } else {
                this.actionBlend = Math.max(0, this.actionBlend - dt * 6);
            }

            // ---- GK bay người (visual) ----
            this._updateDive(dt, T);

            // ---- Áp dụng pose (làm mượt) ----
            this._applyPose(T, dt);
        }

        _applyAction(act, u, T) {
            if (act === 'kick') {
                // Lấy đà ngắn rồi tiếp xúc bóng sớm để khớp với lúc bóng rời chân
                let lx = 0, kn = 0.1, tw = 0, plant = 0.15, ball = 0;
                if (u < 0.22) {
                    const k = ease(u / 0.22);
                    lx = 0.95 * k; kn = 1.45 * k; tw = -0.32 * k; plant = 0.2 + 0.25 * k;
                } else if (u < 0.46) {
                    const k = ease((u - 0.22) / 0.24);
                    lx = 0.95 - 2.15 * k; kn = 1.45 - 1.4 * k; tw = -0.32 + 0.6 * k;
                    plant = 0.45 - 0.15 * k; ball = 0.6;
                } else {
                    const k = ease((u - 0.46) / 0.54);
                    lx = -1.2 + 1.25 * k; kn = 0.05 + 0.12 * k; tw = 0.28 - 0.28 * k;
                    plant = 0.3 - 0.2 * k;
                }
                T.legRx = lx; T.kneeR = kn; T.legLx = 0.1 + plant * 0.3; T.kneeL = plant;
                T.torsoY = tw; T.torsoX -= 0.08;
                T.armLz = -(0.75 + 0.4 * Math.sin(u * Math.PI));
                T.armRz = 1.15;
                T.armLx = 0.35; T.armRx = -0.55;
                T.elbowL = -0.5; T.elbowR = -0.9;
                T.rootY += ball * 0.6;
            } else if (act === 'pass') {
                const k = u < 0.45 ? ease(u / 0.45) : 1 - ease((u - 0.45) / 0.55);
                T.legRx = 0.55 - 1.4 * k;
                T.kneeR = 0.9 - 0.75 * k;
                T.legLx = 0.12 + 0.3 * k; T.kneeL = 0.3 * k;
                T.torsoY = -0.18 * k; T.torsoX -= 0.05;
                T.armLz = -0.45; T.armRz = 0.7;
                T.elbowL = -0.6; T.elbowR = -0.8;
            } else if (act === 'skill') {
                // động tác kỹ thuật: hạ thấp trọng tâm + xoay người
                const k = ease(Math.min(1, u * 2.2));
                T.rootY = -2.2 * k;
                T.rootRotY = ease(u) * Math.PI * 2 * 0.65;
                T.torsoX -= 0.28 * k;
                T.legLx = -0.5 * k; T.legRx = 0.5 * k;
                T.kneeL = 0.85 * k; T.kneeR = 0.85 * k;
                T.armLz = -1.15 * k; T.armRz = 1.15 * k;
                T.armLx = -0.5; T.armRx = -0.5;
                T.elbowL = -1.1; T.elbowR = -1.1;
            } else if (act === 'celebrate') {
                const bounce = Math.abs(Math.sin(u * Math.PI * 3));
                T.rootY = bounce * 3.2;
                T.rootRotY = Math.sin(u * Math.PI * 2) * 0.5;
                T.armLx = -2.55; T.armRx = -2.55;
                T.armLz = -0.75; T.armRz = 0.75;
                T.elbowL = -0.35; T.elbowR = -0.35;
                T.torsoX = -0.12;
                T.headX = -0.18;
            } else if (act === 'tackle') {
                const k = Math.sin(clamp(u, 0, 1) * Math.PI);
                T.rootY = -4.2 * k;
                T.rootRotX = -0.25 * k;
                T.torsoX = 0.45 * k;
                T.legRx = -1.35 * k; T.kneeR = 0.15 * k;
                T.legLx = 0.55 * k; T.kneeL = 1.1 * k;
                T.armLx = -0.9 * k; T.armRz = 0.9 * k;
            } else if (act === 'dive') {
                const k = Math.sin(clamp(u, 0, 1) * Math.PI * 0.85);
                T.rootRotZ = this.diveDir * 1.45 * k;
                T.rootY = 3.2 * k;
                T.armLx = -2.4 * k; T.armRx = -2.4 * k;
                T.armLz = -0.5; T.armRz = 0.5;
                T.legLx = -0.5 * k; T.legRx = -0.4 * k;
                T.kneeL = 0.7 * k; T.kneeR = 0.6 * k;
            }
        }

        _updateDive(dt, T) {
            const p = this.player;
            if (p.role !== 'goalkeeper') return;
            this.diveCd = Math.max(0, this.diveCd - dt);
            const g = this.opts.game;
            if (!g) return;
            const ball = g.ball;
            const bSpeed = ball.vel.mag() * 60;
            const goalX = p.team === 'red' ? g.field.x : g.field.x + g.field.width;
            const dGoal = Math.hypot(ball.pos.x - goalX, ball.pos.y - p.pos.y);
            const movingToGoal = (p.team === 'red') ? ball.vel.x < -4 : ball.vel.x > 4;
            if (this.diveCd <= 0 && bSpeed > 220 && dGoal < 150 && movingToGoal) {
                this.diveCd = 1.4;
                this.diveDir = (ball.pos.y > p.pos.y) ? -1 : 1;
                p.setAction('dive', 0.75);
            }
        }

        _applyPose(T, dt) {
            const k = 1 - Math.exp(-18 * dt);
            const P = this.pose;
            for (const key in T) {
                if (P[key] === undefined) continue;
                P[key] += (T[key] - P[key]) * k;
            }
            const body = this.body;
            body.position.y = P.rootY;
            body.rotation.set(P.rootRotX, P.rootRotY, P.rootRotZ);

            this.hips.position.y = 13.5 + Math.sin(this.t * 2.1) * 0.04;
            this.torso.rotation.set(P.torsoX, P.torsoY, P.torsoZ);
            this.head.rotation.set(P.headX, P.headY, P.headZ);

            this.armL.rotation.set(P.armLx, P.armLy, P.armLz);
            this.armL.userData.elbow.rotation.x = P.elbowL;
            this.armR.rotation.set(P.armRx, P.armRy, P.armRz);
            this.armR.userData.elbow.rotation.x = P.elbowR;

            this.legL.rotation.set(P.legLx, P.legLy, P.legLz);
            this.legL.userData.knee.rotation.x = P.kneeL;
            this.legL.userData.ankle.rotation.x = P.ankleL;
            this.legR.rotation.set(P.legRx, P.legRy, P.legRz);
            this.legR.userData.knee.rotation.x = P.kneeR;
            this.legR.userData.ankle.rotation.x = P.ankleR;
        }

        dispose() {
            this.group.traverse(o => {
                if (o.isMesh) {
                    if (o.geometry) o.geometry.dispose();
                    if (o.material && o.material.dispose) o.material.dispose();
                }
            });
        }
    }

    // ============================================================
    // BallModel: bóng 3D lăn theo vận tốc
    // ============================================================
    class BallModel {
        constructor(radius) {
            this.radius = radius || 3.8;
            this.group = new THREE.Group();
            this.hop = 0;
            this.hopVel = 0;
            this.prevSpeed = 0;
            this.spin = new THREE.Quaternion();
            this._build();
        }

        _build() {
            const tex = this._texture();
            const mat = new THREE.MeshStandardMaterial({
                map: tex, roughness: 0.45, metalness: 0.02
            });
            this.mesh = new THREE.Mesh(new THREE.SphereGeometry(this.radius, 26, 20), mat);
            this.mesh.userData.kind = 'ball';
            this.mesh.castShadow = true;
            this.group.add(this.mesh);

            // vòng sáng mờ dưới bóng cho dễ thấy
            const ringMat = new THREE.MeshBasicMaterial({
                color: 0xffffff, transparent: true, opacity: 0.14,
                depthWrite: false, side: THREE.DoubleSide
            });
            this.ring = new THREE.Mesh(new THREE.RingGeometry(this.radius * 1.05, this.radius * 1.9, 24), ringMat);
            this.ring.rotation.x = -Math.PI / 2;
            this.ring.position.y = 0.12;
            this.group.add(this.ring);
        }

        _texture() {
            const c = document.createElement('canvas');
            c.width = 512; c.height = 256;
            const g = c.getContext('2d');
            g.fillStyle = '#f7f7f2';
            g.fillRect(0, 0, 512, 256);
            // các mảng đen kiểu bóng đá hiện đại
            g.fillStyle = '#14161c';
            const spots = [
                [64, 78, 34], [190, 60, 30], [320, 82, 33], [450, 60, 30],
                [128, 176, 32], [258, 190, 34], [390, 172, 31], [500, 180, 26],
                [0, 150, 26], [256, 128, 0]
            ];
            for (const [x, y, r] of spots) {
                if (!r) continue;
                g.beginPath();
                for (let i = 0; i < 5; i++) {
                    const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
                    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
                    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
                }
                g.closePath();
                g.fill();
            }
            // đường may
            g.strokeStyle = 'rgba(20,22,28,0.35)';
            g.lineWidth = 2;
            g.beginPath(); g.moveTo(0, 128); g.lineTo(512, 128); g.stroke();
            g.beginPath(); g.moveTo(0, 40); g.lineTo(512, 216); g.stroke();
            const tex = new THREE.CanvasTexture(c);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.anisotropy = 4;
            return tex;
        }

        update(dt, ball) {
            const speed = ball.vel.mag() * 60;   // units/giây
            const airH = ball.height || 0;       // độ cao bóng bổng (world units)

            // Cú sút/chuyền: bóng nảy nhẹ lên (chỉ để nhìn, không ảnh hưởng gameplay)
            if (airH <= 0 && speed - this.prevSpeed > 240) {
                this.hopVel = Math.max(this.hopVel, 120);
            }
            this.prevSpeed = speed;

            if (this.hopVel !== 0 || this.hop > 0) {
                this.hopVel -= 620 * dt;
                this.hop += this.hopVel * dt;
                if (this.hop <= 0) { this.hop = 0; this.hopVel = 0; }
            }

            // Bóng bổng: nhấc bóng lên theo độ cao + bóng to hơn một chút cho dễ nhìn
            const y = this.radius + this.hop + airH * 0.8;
            this.group.position.set(ball.pos.x, y, ball.pos.y);
            const scale = 1 + Math.min(airH, 90) / 300;
            this.group.scale.setScalar(scale);

            // vệt sáng dưới chân bóng: giữ trên mặt sân và mờ dần khi bóng lên cao
            if (this.ring) {
                this.ring.visible = airH < 8;
                this.ring.position.y = 0.12 - (y - this.radius) / scale;
            }

            // Lăn theo vận tốc
            if (speed > 6) {
                const dx = ball.vel.x, dz = ball.vel.y;
                const len = Math.hypot(dx, dz) || 1;
                const axis = new THREE.Vector3(dz / len, 0, -dx / len);
                const angle = (speed * dt) / this.radius;
                const q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
                this.spin.premultiply(q);
                this.mesh.quaternion.copy(this.spin);
            }
            this.ring.rotation.z += dt * 0.5;
        }
    }

    window.PlayerModel = PlayerModel;
    window.BallModel = BallModel;
    window.SF_KIT = KIT;
})();
