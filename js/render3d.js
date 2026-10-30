// ============================================================
// RENDER 3D - Sân bóng đường phố 3D (FIFA Street style)
// Camera góc nhìn người thứ ba (sau lưng cầu thủ) hoặc toàn cảnh sân.
// Yêu cầu: THREE (js/vendor/three.min.js), PlayerModel (js/player_model.js)
// ============================================================
(function () {
    if (typeof THREE === 'undefined') {
        window.Renderer3D = null;
        return;
    }

    const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

    function angleDiff(a, b) {
        let d = a - b;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        return d;
    }

    function makeCanvas(w, h) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        return c;
    }

    // ============================================================
    //  Renderer3D
    // ============================================================
    class Renderer3D {
        constructor(canvas, game, opts) {
            this.canvas = canvas;
            this.game = game;
            this.opts = opts || {};
            this.quality = this.opts.quality || 'high';
            this.time = 0;
            this.frameCount = 0;
            this.fps = 0;
            this._acc = 0;
            this._frames = 0;

            const f = game.field;
            this.pitch = {
                x0: f.x, x1: f.x + f.width,
                z0: f.y, z1: f.y + f.height,
                cx: f.x + f.width / 2,
                cz: f.y + f.height / 2,
                w: f.width, d: f.height
            };
            this.goalWidth = game.goalHeight || 80;
            // Xà ngang: lấy theo gameplay (mặc định ~0.45 khẩu độ)
            this.goalTop = game.goalBarHeight || Math.round(this.goalWidth * 0.45);
            this.goalDepth = game.goalDepth || 34;
            this.goalPostR = game.goalPostRadius || 2.1;

            // ---- WebGL renderer ----
            this.renderer = new THREE.WebGLRenderer({
                canvas: canvas,
                antialias: this.quality !== 'low',
                powerPreference: 'high-performance',
                stencil: false
            });
            this.renderer.setClearColor(0x0b1020, 1);
            this.renderer.shadowMap.enabled = this.quality !== 'low';
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            this.renderer.outputColorSpace = THREE.SRGBColorSpace;
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            this.renderer.toneMappingExposure = 1.25;

            // ---- Scene / camera ----
            this.scene = new THREE.Scene();
            this.scene.fog = new THREE.Fog(0x18213a, 1100, 2600);
            this.camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.5, 5000);

            // ---- Trạng thái camera ----
            this.cameraMode = 'third';           // 'third' | 'wide'
            this.cam = {
                pos: new THREE.Vector3(0, 40, 0),
                look: new THREE.Vector3(this.pitch.cx, 0, this.pitch.cz),
                yaw: 0,
                yawTarget: 0,
                userYaw: 0,
                userTimer: 0,
                dist: 88,
                height: 38,
                lookAhead: 30,
                lookHeight: 13,
                fov: 58
            };
            this.focusPos = new THREE.Vector3(0, 0, 0);
            this.models = new Map();
            this.prevControlled = null;
            this.refereeModel = null;
            this._crowdAcc = 0;

            // ---- Dựng cảnh ----
            this.buildSky();
            this.buildGround();
            this.buildWalls();
            this.buildStands();
            this.buildGoals();
            this.buildProps();
            this.buildLights();
            this.ballModel = new window.BallModel(3.8);
            this.scene.add(this.ballModel.group);
            this.buildMarker();

            this.bindPointer();
            this.resize();
            this.initCameraPositions();
        }

        // ================= ENVIRONMENT =================
        buildSky() {
            const c = makeCanvas(128, 512);
            const g = c.getContext('2d');
            const grad = g.createLinearGradient(0, 0, 0, 512);
            grad.addColorStop(0.0, '#05070f');
            grad.addColorStop(0.35, '#0c1428');
            grad.addColorStop(0.62, '#1b2a4d');
            grad.addColorStop(0.80, '#3a4266');
            grad.addColorStop(1.0, '#1a2136');
            g.fillStyle = grad;
            g.fillRect(0, 0, 128, 512);
            // sao
            for (let i = 0; i < 260; i++) {
                const y = Math.random() * 300;
                const a = 0.25 + Math.random() * 0.65;
                g.fillStyle = 'rgba(255,255,255,' + a.toFixed(2) + ')';
                g.fillRect(Math.random() * 128, y, 1.2, 1.2);
            }
            // ánh sáng thành phố ở chân trời
            const glow = g.createRadialGradient(64, 470, 4, 64, 470, 150);
            glow.addColorStop(0, 'rgba(255,180,110,0.35)');
            glow.addColorStop(1, 'rgba(255,180,110,0)');
            g.fillStyle = glow;
            g.fillRect(0, 320, 128, 192);

            const tex = new THREE.CanvasTexture(c);
            tex.colorSpace = THREE.SRGBColorSpace;
            const sky = new THREE.Mesh(
                new THREE.SphereGeometry(3000, 32, 20),
                new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false, fog: false })
            );
            this.scene.add(sky);
        }

        buildGround() {
            const P = this.pitch;

            // --- Nền nhựa đường ---
            const ac = makeCanvas(256, 256);
            const ag = ac.getContext('2d');
            ag.fillStyle = '#20232a';
            ag.fillRect(0, 0, 256, 256);
            for (let i = 0; i < 4000; i++) {
                const v = 25 + Math.random() * 45;
                ag.fillStyle = 'rgba(' + v + ',' + v + ',' + (v + 6) + ',0.5)';
                ag.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
            }
            const asphalt = new THREE.CanvasTexture(ac);
            asphalt.wrapS = asphalt.wrapT = THREE.RepeatWrapping;
            asphalt.repeat.set(10, 10);
            asphalt.colorSpace = THREE.SRGBColorSpace;

            const ground = new THREE.Mesh(
                new THREE.PlaneGeometry(3000, 2600),
                new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.95, metalness: 0 })
            );
            ground.userData.kind = 'ground';
            ground.rotation.x = -Math.PI / 2;
            ground.position.y = -0.06;
            ground.receiveShadow = true;
            this.scene.add(ground);

            // --- Mặt sân ---
            const pitchTex = this.buildPitchTexture();
            const court = new THREE.Mesh(
                new THREE.PlaneGeometry(P.w, P.d),
                new THREE.MeshStandardMaterial({ map: pitchTex, roughness: 0.88, metalness: 0.02 })
            );
            court.rotation.x = -Math.PI / 2;
            court.position.set(P.cx, 0, P.cz);
            court.receiveShadow = true;
            court.userData.kind = 'court';
            this.scene.add(court);
            this.court = court;

            // --- Gờ sân (kerb) ---
            const kerbMat = new THREE.MeshStandardMaterial({ color: 0x3b4048, roughness: 0.9 });
            const kerbH = 1.4, kerbT = 6;
            const addKerb = (w, d, x, z) => {
                const m = new THREE.Mesh(new THREE.BoxGeometry(w, kerbH, d), kerbMat);
                m.position.set(x, kerbH / 2, z);
                m.castShadow = true; m.receiveShadow = true;
                this.scene.add(m);
            };
            addKerb(P.w + kerbT * 2, kerbT, P.cx, P.z0 - kerbT / 2);
            addKerb(P.w + kerbT * 2, kerbT, P.cx, P.z1 + kerbT / 2);
            addKerb(kerbT, P.d, P.x0 - kerbT / 2, P.cz);
            addKerb(kerbT, P.d, P.x1 + kerbT / 2, P.cz);
        }

        buildPitchTexture() {
            const W = 1024, H = 640;
            const c = makeCanvas(W, H);
            const g = c.getContext('2d');

            // nền cỏ nhân tạo
            const grad = g.createLinearGradient(0, 0, W, H);
            grad.addColorStop(0, '#2f7d40');
            grad.addColorStop(0.45, '#276b36');
            grad.addColorStop(1, '#2b7139');
            g.fillStyle = grad;
            g.fillRect(0, 0, W, H);

            // sọc cắt cỏ
            for (let i = 0; i < 12; i++) {
                g.fillStyle = i % 2 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.035)';
                g.fillRect(0, i * H / 12, W, H / 12);
            }

            // vết mòn / bùn
            for (let i = 0; i < 70; i++) {
                const x = Math.random() * W, y = Math.random() * H, r = 8 + Math.random() * 46;
                const rg = g.createRadialGradient(x, y, 0, x, y, r);
                rg.addColorStop(0, 'rgba(96,74,44,0.16)');
                rg.addColorStop(1, 'rgba(96,74,44,0)');
                g.fillStyle = rg;
                g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
            }

            // ---- Vạch kẻ sân ----
            g.strokeStyle = 'rgba(255,255,255,0.88)';
            g.lineWidth = 6;
            g.lineCap = 'round';
            const m = 26;
            g.strokeRect(m, m, W - 2 * m, H - 2 * m);

            // vạch giữa sân
            g.beginPath(); g.moveTo(W / 2, m); g.lineTo(W / 2, H - m); g.stroke();
            // vòng tròn giữa
            g.beginPath(); g.arc(W / 2, H / 2, 92, 0, Math.PI * 2); g.stroke();
            g.fillStyle = 'rgba(255,255,255,0.9)';
            g.beginPath(); g.arc(W / 2, H / 2, 7, 0, Math.PI * 2); g.fill();

            // vòng cấm hai bên
            g.strokeRect(m, H / 2 - 155, 128, 310);
            g.strokeRect(W - m - 128, H / 2 - 155, 128, 310);
            g.strokeRect(m, H / 2 - 78, 56, 156);
            g.strokeRect(W - m - 56, H / 2 - 78, 56, 156);
            // chấm phạt đền
            [m + 96, W - m - 96].forEach(x => {
                g.beginPath(); g.arc(x, H / 2, 6, 0, Math.PI * 2); g.fill();
            });
            // cung phạt đền
            g.beginPath(); g.arc(m + 128, H / 2, 84, -0.95, 0.95); g.stroke();
            g.beginPath(); g.arc(W - m - 128, H / 2, 84, Math.PI - 0.95, Math.PI + 0.95); g.stroke();

            // chữ sân đường phố mờ
            g.save();
            g.globalAlpha = 0.16;
            g.fillStyle = '#ffffff';
            g.font = 'bold 84px Arial, sans-serif';
            g.textAlign = 'center';
            g.fillText('STREET', W / 2, H / 2 + 190);
            g.restore();

            const tex = new THREE.CanvasTexture(c);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
            return tex;
        }

        buildWalls() {
            const P = this.pitch;
            const c = makeCanvas(1024, 256);
            const g = c.getContext('2d');
            // bê tông
            const grad = g.createLinearGradient(0, 0, 0, 256);
            grad.addColorStop(0, '#5b6068');
            grad.addColorStop(0.55, '#4b505a');
            grad.addColorStop(1, '#33373f');
            g.fillStyle = grad;
            g.fillRect(0, 0, 1024, 256);
            for (let i = 0; i < 3000; i++) {
                const v = 60 + Math.random() * 50;
                g.fillStyle = 'rgba(' + v + ',' + v + ',' + (v + 5) + ',0.25)';
                g.fillRect(Math.random() * 1024, Math.random() * 256, 2, 2);
            }
            // graffiti
            const tags = ['#ff4d6d', '#4ecdc4', '#ffd166', '#a06cd5', '#06d6a0', '#ff8b3d'];
            for (let i = 0; i < 7; i++) {
                const col = tags[Math.floor(Math.random() * tags.length)];
                g.save();
                g.translate(80 + Math.random() * 860, 80 + Math.random() * 120);
                g.rotate((Math.random() - 0.5) * 0.5);
                g.strokeStyle = col;
                g.lineWidth = 6 + Math.random() * 8;
                g.lineCap = 'round';
                g.beginPath();
                g.moveTo(0, 0);
                for (let k = 0; k < 4; k++) {
                    g.lineTo((k + 1) * 26, (Math.random() - 0.5) * 60);
                }
                g.stroke();
                g.restore();
            }
            // poster / bảng hiệu
            g.fillStyle = 'rgba(255,255,255,0.10)';
            g.fillRect(120, 40, 150, 90);
            g.fillRect(700, 60, 120, 70);
            const wallTex = new THREE.CanvasTexture(c);
            wallTex.colorSpace = THREE.SRGBColorSpace;
            wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
            wallTex.repeat.set(2.2, 1);

            const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.92, metalness: 0.02 });
            const capMat = new THREE.MeshStandardMaterial({ color: 0x7a808c, roughness: 0.8 });
            const H = 18, T = 16;

            const addWall = (w, d, x, z, rotY) => {
                const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), wallMat);
                mesh.position.set(x, H / 2, z);
                if (rotY) mesh.rotation.y = rotY;
                mesh.userData.kind = 'wall';
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                this.scene.add(mesh);
                const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 1.5, 1.2, d + 1.5), capMat);
                cap.position.set(x, H + 0.6, z);
                if (rotY) cap.rotation.y = rotY;
                cap.castShadow = true;
                this.scene.add(cap);
            };

            addWall(P.w + T * 2 + 60, T, P.cx, P.z0 - T / 2 - 6, 0);
            addWall(P.w + T * 2 + 60, T, P.cx, P.z1 + T / 2 + 6, 0);
            addWall(P.d + T * 2, T, P.x0 - T / 2 - 6, P.cz, Math.PI / 2);
            addWall(P.d + T * 2, T, P.x1 + T / 2 + 6, P.cz, Math.PI / 2);
        }

        // ================= KHÁN ĐÀI + KHÁN GIẢ =================
        buildStands() {
            const P = this.pitch;
            const ROWS = 3;
            const ROW_H = 11;
            const ROW_D = 15;
            const gap = 44;              // khoảng cách từ đường biên tới hàng ghế đầu
            const BASE_Y = 24;           // hàng ghế đầu cao hơn tường bao để khán giả nhìn thấy

            const seatMat = new THREE.MeshStandardMaterial({ color: 0x242a38, roughness: 0.85 });
            const stepMat = new THREE.MeshStandardMaterial({ color: 0x1b2130, roughness: 0.9 });
            const roofMat = new THREE.MeshStandardMaterial({
                color: 0x2c3448, roughness: 0.7, metalness: 0.25,
                transparent: true, opacity: 0.85, side: THREE.DoubleSide
            });

            // Mô tả 4 khán đài: hướng, chiều dài, vị trí hàng đầu, hướng lùi
            const sides = [
                { // Bắc (z âm)
                    len: P.w + 150, rowStart: P.z0 - gap, dirZ: -1,
                    center: { x: P.cx, z: 0 }, axis: 'x'
                },
                { // Nam (z dương)
                    len: P.w + 150, rowStart: P.z1 + gap, dirZ: 1,
                    center: { x: P.cx, z: 0 }, axis: 'x'
                },
                { // Tây (x âm)
                    len: P.d + 120, rowStart: P.x0 - gap, dirZ: 0, dirX: -1,
                    center: { x: 0, z: P.cz }, axis: 'z'
                },
                { // Đông (x dương)
                    len: P.d + 120, rowStart: P.x1 + gap, dirZ: 0, dirX: 1,
                    center: { x: 0, z: P.cz }, axis: 'z'
                }
            ];

            const crowdPos = [];
            for (const sd of sides) {
                const isX = sd.axis === 'x';
                for (let r = 0; r < ROWS; r++) {
                    const y = BASE_Y + r * ROW_H;
                    const off = r * ROW_D;
                    const z = isX ? sd.rowStart + sd.dirZ * off : 0;
                    const x = isX ? 0 : sd.rowStart + sd.dirX * off;

                    // bậc ghế
                    const slabW = isX ? sd.len : ROW_D + 4;
                    const slabD = isX ? ROW_D + 4 : sd.len;
                    const slab = new THREE.Mesh(new THREE.BoxGeometry(slabW, 7, slabD), r === 0 ? seatMat : stepMat);
                    slab.position.set(isX ? sd.center.x : x, y, isX ? z : sd.center.z);
                    slab.receiveShadow = true;
                    slab.castShadow = false;
                    slab.userData.kind = 'stand';
                    this.scene.add(slab);

                    // vị trí khán giả trên bậc này
                    const step = 14;
                    const n = Math.floor(sd.len / step);
                    for (let i = 0; i < n; i++) {
                        const t = (i + 0.5) / n - 0.5;
                        const jitter = (Math.random() - 0.5) * 4;
                        const px = isX ? sd.center.x + t * sd.len : x + jitter;
                        const pz = isX ? z + jitter : sd.center.z + t * sd.len;
                        crowdPos.push({ x: px, y: y + 6.5, z: pz, phase: Math.random() * Math.PI * 2 });
                    }
                }

                // tường hậu + mái che
                const backOff = ROWS * ROW_D;
                const backH = BASE_Y + ROWS * ROW_H + 34;
                const bx = isX ? sd.center.x : sd.rowStart + sd.dirX * (backOff + 6);
                const bz = isX ? sd.rowStart + sd.dirZ * (backOff + 6) : sd.center.z;
                const bw = isX ? sd.len + 20 : 8;
                const bd = isX ? 8 : sd.len + 20;
                const back = new THREE.Mesh(new THREE.BoxGeometry(bw, backH, bd), stepMat);
                back.position.set(bx, backH / 2, bz);
                back.userData.kind = 'stand';
                this.scene.add(back);

                // mái che nghiêng phía trên khán đài
                const roofW = isX ? sd.len + 60 : 62;
                const roofD = isX ? 62 : sd.len + 60;
                const roof = new THREE.Mesh(new THREE.BoxGeometry(roofW, 3, roofD), roofMat);
                roof.position.set(
                    isX ? sd.center.x : sd.rowStart + sd.dirX * (backOff * 0.45),
                    BASE_Y + ROWS * ROW_H + 40,
                    isX ? sd.rowStart + sd.dirZ * (backOff * 0.45) : sd.center.z
                );
                roof.userData.kind = 'stand';
                this.scene.add(roof);
            }

            // ===== Khán giả: 2 InstancedMesh (thân + đầu) =====
            const COUNT = crowdPos.length;
            const bodyGeo = new THREE.BoxGeometry(4.2, 8.5, 3.2);
            const headGeo = new THREE.SphereGeometry(2.5, 6, 5);
            headGeo.translate(0, 6.2, 0);          // đặt đầu lên trên thân
            const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
            const headMat = new THREE.MeshLambertMaterial({ color: 0xf3c9a2 });

            this.crowdBody = new THREE.InstancedMesh(bodyGeo, bodyMat, COUNT);
            this.crowdHead = new THREE.InstancedMesh(headGeo, headMat, COUNT);
            this.crowdBody.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            this.crowdHead.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            this.crowdBody.userData.kind = 'crowd';
            this.crowdHead.userData.kind = 'crowd';
            this.crowdBody.frustumCulled = false;
            this.crowdHead.frustumCulled = false;

            const palette = ['#e94560', '#4ecdc4', '#ffd166', '#a06cd5', '#06d6a0', '#ffffff', '#ff8b3d', '#3d7bff'];
            const dummy = new THREE.Object3D();
            const col = new THREE.Color();
            this.crowdData = crowdPos;
            for (let i = 0; i < COUNT; i++) {
                const c = crowdPos[i];
                dummy.position.set(c.x, c.y, c.z);
                dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
                dummy.scale.setScalar(0.85 + Math.random() * 0.35);
                dummy.updateMatrix();
                this.crowdBody.setMatrixAt(i, dummy.matrix);
                this.crowdHead.setMatrixAt(i, dummy.matrix);
                this.crowdBody.setColorAt(i, col.set(palette[Math.floor(Math.random() * palette.length)]));
                // màu da ngẫu nhiên
                const skin = ['#f3c9a2', '#e6b183', '#d29a68', '#b87d4f', '#96603c'];
                this.crowdHead.setColorAt(i, col.set(skin[Math.floor(Math.random() * skin.length)]));
            }
            this.crowdBody.instanceMatrix.needsUpdate = true;
            this.crowdHead.instanceMatrix.needsUpdate = true;
            if (this.crowdBody.instanceColor) this.crowdBody.instanceColor.needsUpdate = true;
            if (this.crowdHead.instanceColor) this.crowdHead.instanceColor.needsUpdate = true;
            this.scene.add(this.crowdBody);
            this.scene.add(this.crowdHead);

            this._crowdDummy = dummy;
            this.crowdJumpTimer = 0;

        }

        // Cập nhật khán giả: nhấp nhô / nhảy khi reo hò
        updateCrowd(dt) {
            if (!this.crowdBody || !this.crowdData) return;
            this._crowdAcc += dt;
            const hz = this.quality === 'low' ? 10 : 30;   // máy yếu cập nhật thưa hơn
            if (this._crowdAcc < 1 / hz) return;
            const step = this._crowdAcc;
            this._crowdAcc = 0;

            this.crowdJumpTimer = Math.max(0, (this.crowdJumpTimer || 0) - step);
            const excite = Math.max(0, Math.min(1, this.game.crowdIntensity || 0.3));
            const cheer = this.crowdJumpTimer > 0 ? 1 : 0;
            const amp = 1.2 + excite * 3.2 + cheer * 4.5;
            const dummy = this._crowdDummy;
            const t = this.time;
            const n = this.crowdData.length;
            for (let i = 0; i < n; i++) {
                const c = this.crowdData[i];
                const bob = Math.sin(t * (5 + excite * 3) + c.phase) * amp;
                const jump = cheer ? Math.abs(Math.sin(t * 9 + c.phase)) * 6 * cheer : 0;
                dummy.position.set(c.x, c.y + bob * 0.5 + jump, c.z);
                dummy.rotation.set(0, c.phase, bob * 0.02);
                dummy.scale.setScalar(0.85 + (i % 5) * 0.05);
                dummy.updateMatrix();
                this.crowdBody.setMatrixAt(i, dummy.matrix);
                this.crowdHead.setMatrixAt(i, dummy.matrix);
            }
            this.crowdBody.instanceMatrix.needsUpdate = true;
            this.crowdHead.instanceMatrix.needsUpdate = true;
        }

        // Khán đài bùng nổ (ghi bàn / hết trận)
        crowdJump(power) {
            this.crowdJumpTimer = Math.max(this.crowdJumpTimer || 0, 1.2 + (power || 1) * 0.8);
        }

        // ================= KHUNG THÀNH CHUẨN FIFA =================
        // Cột + xà trắng tròn có đế, khung sau (trụ + thanh chống chéo),
        // lưới căng 3 mặt (sau / trên dốc / hai hông hình thang) có võng nhẹ.
        buildGoals() {
            const P = this.pitch;
            const gw = this.goalWidth / 2;          // nửa khẩu độ (theo trục dọc sân)
            const gh = this.goalTop;                // chiều cao xà ngang
            const depth = this.goalDepth;           // độ sâu khung thành
            const postR = this.goalPostR;

            // ---- Vật liệu khung ----
            const postMat = new THREE.MeshStandardMaterial({
                color: 0xf8faff, roughness: 0.25, metalness: 0.38,
                emissive: 0x0b0e16, emissiveIntensity: 0.18
            });
            const frameMat = new THREE.MeshStandardMaterial({
                color: 0xdce4f2, roughness: 0.5, metalness: 0.35
            });

            // ---- Texture lưới (mắt vuông nhỏ) ----
            const N = 256;
            const nc = makeCanvas(N, N);
            const ng = nc.getContext('2d');
            ng.clearRect(0, 0, N, N);
            ng.strokeStyle = 'rgba(255,255,255,0.95)';
            ng.lineWidth = 2.6;
            const cell = 16;
            for (let i = 0; i <= N; i += cell) {
                ng.beginPath(); ng.moveTo(i, 0); ng.lineTo(i, N); ng.stroke();
                ng.beginPath(); ng.moveTo(0, i); ng.lineTo(N, i); ng.stroke();
            }
            const netTex = new THREE.CanvasTexture(nc);
            netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
            netTex.colorSpace = THREE.SRGBColorSpace;
            netTex.anisotropy = 4;

            // ---- Dựng một tấm lưới từ 4 góc (nội suy song tuyến tính + võng) ----
            const makeNetQuad = (a, b, c, d, segU, segV, uRep, vRep, bulge) => {
                const geo = new THREE.BufferGeometry();
                const pos = [];
                const uv = [];
                const idx = [];
                const AB = new THREE.Vector3().subVectors(b, a);
                const DC = new THREE.Vector3().subVectors(c, d);
                const AD = new THREE.Vector3().subVectors(d, a);
                const normal = new THREE.Vector3().crossVectors(AB, AD).normalize();
                for (let j = 0; j <= segV; j++) {
                    const v = j / segV;
                    for (let i = 0; i <= segU; i++) {
                        const u = i / segU;
                        const p1 = new THREE.Vector3().copy(a).addScaledVector(AB, u);
                        const p2 = new THREE.Vector3().copy(d).addScaledVector(DC, u);
                        const p = p1.lerp(p2, v);
                        if (bulge) {
                            const s = Math.sin(Math.PI * u) * Math.sin(Math.PI * v) * bulge;
                            p.addScaledVector(normal, s);
                        }
                        pos.push(p.x, p.y, p.z);
                        uv.push(u * uRep, v * vRep);
                    }
                }
                for (let j = 0; j < segV; j++) {
                    for (let i = 0; i < segU; i++) {
                        const a0 = j * (segU + 1) + i;
                        const b0 = a0 + 1;
                        const c0 = a0 + segU + 1;
                        const d0 = c0 + 1;
                        idx.push(a0, c0, b0, b0, c0, d0);
                    }
                }
                geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
                geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
                geo.setIndex(idx);
                geo.computeVertexNormals();
                const mat = new THREE.MeshBasicMaterial({
                    map: netTex, transparent: true, opacity: 0.5,
                    side: THREE.DoubleSide, depthWrite: false,
                    alphaTest: 0.1, fog: false
                });
                const mesh = new THREE.Mesh(geo, mat);
                mesh.userData.kind = 'net';
                return mesh;
            };

            const makeGoal = (dir) => {
                // dir = +1: khung thành bên phải (đội ĐỎ tấn công), -1: bên trái
                const gx = dir > 0 ? P.x1 : P.x0;
                const grp = new THREE.Group();
                const backX = gx + dir * depth;
                const backTopY = gh * 0.74;                     // xà sau thấp hơn xà trước
                const V = (x, y, z) => new THREE.Vector3(x, y, z);

                // ---- Cột dọc ----
                [-1, 1].forEach(s => {
                    const zp = P.cz + s * gw;
                    const post = new THREE.Mesh(new THREE.CylinderGeometry(postR, postR, gh, 18), postMat);
                    post.position.set(gx, gh / 2, zp);
                    post.castShadow = true;
                    post.userData.kind = 'goal';
                    grp.add(post);
                    const foot = new THREE.Mesh(new THREE.CylinderGeometry(postR * 1.4, postR * 1.75, 1.4, 14), frameMat);
                    foot.position.set(gx, 0.7, zp);
                    foot.userData.kind = 'goal';
                    grp.add(foot);
                    // chân trụ phụ đỡ cột (kiểu khung thành chuyên nghiệp)
                    const brace = new THREE.Mesh(new THREE.CylinderGeometry(postR * 0.45, postR * 0.45, depth * 0.8, 8), frameMat);
                    brace.rotation.z = dir > 0 ? Math.PI / 2 - 0.2 : Math.PI / 2 + 0.2;
                    brace.position.set(gx + dir * depth * 0.34, 3.2, zp);
                    brace.userData.kind = 'goal';
                    grp.add(brace);
                });

                // ---- Xà ngang + khớp nối ----
                const bar = new THREE.Mesh(new THREE.CylinderGeometry(postR, postR, gw * 2, 18), postMat);
                bar.rotation.x = Math.PI / 2;
                bar.position.set(gx, gh, P.cz);
                bar.castShadow = true;
                bar.userData.kind = 'goal';
                grp.add(bar);
                [-1, 1].forEach(s => {
                    const joint = new THREE.Mesh(new THREE.SphereGeometry(postR * 1.18, 14, 10), postMat);
                    joint.position.set(gx, gh, P.cz + s * gw);
                    joint.userData.kind = 'goal';
                    grp.add(joint);
                });

                // ---- Khung sau ----
                [-1, 1].forEach(s => {
                    const zl = P.cz + s * gw;
                    const stanchion = new THREE.Mesh(new THREE.CylinderGeometry(postR * 0.62, postR * 0.72, backTopY, 12), frameMat);
                    stanchion.position.set(backX, backTopY / 2, zl);
                    stanchion.castShadow = true;
                    stanchion.userData.kind = 'goal';
                    grp.add(stanchion);

                    const diagLen = Math.hypot(depth, gh - backTopY);
                    const diag = new THREE.Mesh(new THREE.CylinderGeometry(postR * 0.45, postR * 0.45, diagLen, 10), frameMat);
                    diag.position.set(gx + dir * depth / 2, (gh + backTopY) / 2, zl);
                    diag.rotation.z = dir > 0 ? Math.atan2(depth, gh - backTopY) : -Math.atan2(depth, gh - backTopY);
                    diag.userData.kind = 'goal';
                    grp.add(diag);
                });
                const topRear = new THREE.Mesh(new THREE.CylinderGeometry(postR * 0.62, postR * 0.62, gw * 2, 12), frameMat);
                topRear.rotation.x = Math.PI / 2;
                topRear.position.set(backX, backTopY, P.cz);
                topRear.userData.kind = 'goal';
                grp.add(topRear);
                const bottomRear = new THREE.Mesh(new THREE.CylinderGeometry(postR * 0.5, postR * 0.5, gw * 2, 10), frameMat);
                bottomRear.rotation.x = Math.PI / 2;
                bottomRear.position.set(backX, 0.55, P.cz);
                bottomRear.userData.kind = 'goal';
                grp.add(bottomRear);
                [-1, 1].forEach(s => {
                    const bottomSide = new THREE.Mesh(new THREE.CylinderGeometry(postR * 0.5, postR * 0.5, depth, 10), frameMat);
                    bottomSide.rotation.z = Math.PI / 2;
                    bottomSide.position.set(gx + dir * depth / 2, 0.55, P.cz + s * gw);
                    bottomSide.userData.kind = 'goal';
                    grp.add(bottomSide);
                });

                // ---- LƯỚI ----
                const cellSize = 9;      // 1 ô lưới ~ 9 đơn vị
                const uRep = Math.max(1, Math.round((gw * 2) / cellSize));
                const vRepBack = Math.max(1, Math.round(backTopY / cellSize));
                const vRepDepth = Math.max(1, Math.round(depth / cellSize));

                // lưới sau (thẳng đứng, võng ra sau một chút)
                grp.add(makeNetQuad(
                    V(backX, 0, P.cz - gw), V(backX, 0, P.cz + gw),
                    V(backX, backTopY, P.cz + gw), V(backX, backTopY, P.cz - gw),
                    14, 6, uRep, vRepBack, dir * 1.8
                ));

                // lưới trên: dốc từ xà trước xuống xà sau
                grp.add(makeNetQuad(
                    V(gx, gh, P.cz - gw), V(gx, gh, P.cz + gw),
                    V(backX, backTopY, P.cz + gw), V(backX, backTopY, P.cz - gw),
                    14, 5, uRep, vRepDepth, dir * 1.2
                ));

                // lưới hông hai bên (hình thang: cao ở cột, thấp ở sau)
                [-1, 1].forEach(s => {
                    const zl = P.cz + s * gw;
                    grp.add(makeNetQuad(
                        V(gx, 0, zl), V(backX, 0, zl),
                        V(backX, backTopY, zl), V(gx, gh, zl),
                        6, 5, vRepDepth, vRepBack, 0
                    ));
                });

                // ---- Vạch khung thành trên mặt sân ----
                const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false });
                [-1, 1].forEach(s => {
                    const line = new THREE.Mesh(new THREE.PlaneGeometry(depth, 1.1), lineMat);
                    line.rotation.x = -Math.PI / 2;
                    line.position.set(gx + dir * depth / 2, 0.14, P.cz + s * gw);
                    line.userData.kind = 'goal';
                    grp.add(line);
                });

                grp.traverse(o => { if (o.isMesh) { o.userData.kind = o.userData.kind || 'goal'; } });
                this.scene.add(grp);
                this.goalGroups = this.goalGroups || [];
                this.goalGroups.push(grp);
            };

            makeGoal(1);
            makeGoal(-1);
        }

        buildProps() {
            const P = this.pitch;

            // ---- Cột đèn pha ở 4 góc ----
            const poleMat = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.6, metalness: 0.4 });
            const lampMat = new THREE.MeshStandardMaterial({
                color: 0xfff8e0, emissive: 0xfff0c0, emissiveIntensity: 2.2, roughness: 0.3
            });
            const corners = [
                [P.x0 - 40, P.z0 - 40], [P.x1 + 40, P.z0 - 40],
                [P.x0 - 40, P.z1 + 40], [P.x1 + 40, P.z1 + 40]
            ];
            for (const [x, z] of corners) {
                const pole = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.2, 180, 10), poleMat);
                pole.position.set(x, 180 / 2, z);
                pole.castShadow = true;
                this.scene.add(pole);

                const head = new THREE.Mesh(new THREE.BoxGeometry(24, 9, 15), poleMat);
                head.position.set(x, 182, z);
                head.castShadow = true;
                this.scene.add(head);

                for (let i = -1; i <= 1; i++) {
                    const lamp = new THREE.Mesh(new THREE.BoxGeometry(6.5, 4.5, 2), lampMat);
                    lamp.position.set(x + i * 7.6, 181.5, z - 7.6);
                    this.scene.add(lamp);
                }
            }

            // ---- Rào chắn / bảng hiệu 2 bên sân ----
            const boardColors = [0xe94560, 0x2fb3c9, 0xffd166, 0xa06cd5];
            for (let i = 0; i < 8; i++) {
                const col = boardColors[i % boardColors.length];
                const mat = new THREE.MeshStandardMaterial({
                    color: col, roughness: 0.55, emissive: col, emissiveIntensity: 0.28
                });
                const b = new THREE.Mesh(new THREE.BoxGeometry(96, 12, 1.6), mat);
                const side = i < 4 ? -1 : 1;
                b.position.set(P.x0 + 110 + (i % 4) * 190, 7, side > 0 ? P.z1 + 34 : P.z0 - 34);
                b.castShadow = true;
                this.scene.add(b);
            }

            // ---- Chóp nón / bóng rổ / thùng rác trang trí ----
            const coneMat = new THREE.MeshStandardMaterial({ color: 0xff7a1f, roughness: 0.7 });
            const conePos = [
                [P.x0 - 26, P.z0 + 34], [P.x1 + 26, P.z0 + 34],
                [P.x0 - 26, P.z1 - 34], [P.x1 + 26, P.z1 - 34]
            ];
            for (const [x, z] of conePos) {
                const cone = new THREE.Mesh(new THREE.ConeGeometry(2.6, 6, 10), coneMat);
                cone.position.set(x, 3, z);
                cone.castShadow = true;
                this.scene.add(cone);
            }

            // ---- Băng ghế dự bị ----
            const benchMat = new THREE.MeshStandardMaterial({ color: 0x3b6ea5, roughness: 0.7 });
            const bench = new THREE.Mesh(new THREE.BoxGeometry(90, 4, 18), benchMat);
            bench.position.set(P.cx - 300, 6, P.z1 + 46);
            bench.castShadow = true;
            this.scene.add(bench);
            const bench2 = bench.clone();
            bench2.position.set(P.cx + 300, 6, P.z1 + 46);
            this.scene.add(bench2);
        }

        buildLights() {
            const P = this.pitch;

            const hemi = new THREE.HemisphereLight(0xa8ccff, 0x35402a, 1.15);
            this.scene.add(hemi);

            // Đèn chính (đèn pha) chiếu từ trên cao, lệch về phía xa để mặt hướng
            // camera (lưng/ngực cầu thủ) vẫn đủ sáng.
            const dir = new THREE.DirectionalLight(0xfff4de, 3.1);
            dir.position.set(P.cx - 260, 760, P.cz - 460);
            dir.target.position.set(P.cx, 0, P.cz);
            dir.castShadow = this.quality !== 'low';
            if (this.quality !== 'low') {
                dir.shadow.mapSize.set(2048, 2048);
                const cam = dir.shadow.camera;
                cam.left = -620; cam.right = 620;
                cam.top = 520; cam.bottom = -520;
                cam.near = 80; cam.far = 1800;
                dir.shadow.bias = -0.0006;
                dir.shadow.normalBias = 0.6;
            }
            this.scene.add(dir);
            this.scene.add(dir.target);
            this.dirLight = dir;

            // đèn pha phụ (không đổ bóng)
            const fill1 = new THREE.PointLight(0xaecbff, 220, 1900, 1.6);
            fill1.position.set(P.x0 - 40, 175, P.z0 - 40);
            this.scene.add(fill1);
            const fill2 = new THREE.PointLight(0xffd9a8, 220, 1900, 1.6);
            fill2.position.set(P.x1 + 40, 175, P.z1 + 40);
            this.scene.add(fill2);

            const amb = new THREE.AmbientLight(0xffffff, 0.45);
            this.scene.add(amb);

            // Đèn phụ đi theo camera: giữ phần thân hướng về người chơi luôn rõ nét
            this.camLight = new THREE.PointLight(0xdfeaff, 170, 460, 1.8);
            this.scene.add(this.camLight);
        }

        buildMarker() {
            // Vòng chọn cầu thủ đang điều khiển
            const ringMat = new THREE.MeshBasicMaterial({
                color: 0xffd24a, transparent: true, opacity: 0.9,
                side: THREE.DoubleSide, depthWrite: false, fog: false
            });
            this.marker = new THREE.Group();
            const ring = new THREE.Mesh(new THREE.RingGeometry(9.5, 12.5, 48), ringMat);
            ring.rotation.x = -Math.PI / 2;
            ring.position.y = 0.35;
            this.marker.add(ring);

            // mũi tên chỉ trên đầu
            const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffd24a, fog: false });
            const arrow = new THREE.Mesh(new THREE.ConeGeometry(3.4, 7, 4), arrowMat);
            arrow.rotation.x = Math.PI;        // chúc xuống
            arrow.position.y = 42;
            this.marker.add(arrow);
            this.markerArrow = arrow;
            this.markerRing = ring;
            this.scene.add(this.marker);

            // Vòng chọn của người chơi 2 (màu xanh cyan)
            const ring2Mat = new THREE.MeshBasicMaterial({
                color: 0x5ad1ff, transparent: true, opacity: 0.9,
                side: THREE.DoubleSide, depthWrite: false, fog: false
            });
            this.marker2 = new THREE.Group();
            const ring2 = new THREE.Mesh(new THREE.RingGeometry(9.5, 12.5, 48), ring2Mat);
            ring2.rotation.x = -Math.PI / 2;
            ring2.position.y = 0.35;
            this.marker2.add(ring2);
            const arrow2Mat = new THREE.MeshBasicMaterial({ color: 0x5ad1ff, fog: false });
            const arrow2 = new THREE.Mesh(new THREE.ConeGeometry(3.4, 7, 4), arrow2Mat);
            arrow2.rotation.x = Math.PI;
            arrow2.position.y = 42;
            this.marker2.add(arrow2);
            this.marker2Arrow = arrow2;
            this.marker2Ring = ring2;
            this.marker2.visible = false;
            this.scene.add(this.marker2);
        }

        // ================= PLAYERS =================
        createPlayerModel(player) {
            const model = new window.PlayerModel(player, { game: this.game });
            this.scene.add(model.group);
            this.models.set(player, model);
            return model;
        }

        // Lấy model của cầu thủ (tạo nếu chưa có)
        getModel(player) {
            if (!player) return null;
            let m = this.models.get(player);
            if (!m) m = this.createPlayerModel(player);
            return m;
        }

        rebuildPlayers() {
            // Khi trận mới tạo lại danh sách cầu thủ
            for (const [, m] of this.models) {
                this.scene.remove(m.group);
                m.dispose();
            }
            this.models.clear();
            for (const p of this.game.players) this.createPlayerModel(p);
        }

        syncPlayers(dt, safeDt) {
            // Đảm bảo có model cho mọi cầu thủ hiện tại
            let needRebuild = false;
            for (const p of this.game.players) {
                if (!this.models.has(p)) needRebuild = true;
            }
            if (needRebuild) this.rebuildPlayers();

            for (const p of this.game.players) {
                const model = this.getModel(p);
                if (!model) continue;

                const dx = p.pos.x - model.prevX;
                const dy = p.pos.y - model.prevY;
                const step = Math.hypot(dx, dy);
                const speed = safeDt > 0 ? step / safeDt : 0;

                model.speed = speed;
                if (step > 0.08) {
                    model.dirAngle = Math.atan2(dy, dx);   // hướng 2D gameplay
                }
                model.prevX = p.pos.x;
                model.prevY = p.pos.y;
                model.group.position.set(p.pos.x, 0, p.pos.y);
                model.group.visible = p.active !== false;
                model.update(dt);
            }
        }

        // ================= TRỌNG TÀI =================
        syncReferee(dt) {
            const ref = this.game.referee;
            if (!ref) return;
            if (!this.refereeModel) {
                if (!window.PlayerModel) return;
                this.refereeModel = new window.PlayerModel(ref, { game: this.game });
                this.scene.add(this.refereeModel.group);
            }
            const m = this.refereeModel;
            const dx = ref.pos.x - m.prevX;
            const dy = ref.pos.y - m.prevY;
            const step = Math.hypot(dx, dy);
            m.speed = dt > 0 ? step / dt : 0;
            if (step > 0.08) m.dirAngle = Math.atan2(dy, dx);
            m.prevX = ref.pos.x;
            m.prevY = ref.pos.y;
            m.group.position.set(ref.pos.x, 0, ref.pos.y);
            m.group.visible = ref.active !== false;
            m.update(dt);
        }

        // ================= BALL =================
        syncBall(dt) {
            const b = this.game.ball;
            this.ballModel.update(dt, b);
            // bóng đang được giữ: nhấp nhô nhẹ
            if (b.owner) {
                this.ballModel.group.position.y = this.ballModel.radius + Math.sin(this.time * 9) * 0.6 + 1.2;
            }
        }

        // ================= CAMERA =================
        initCameraPositions() {
            const P = this.pitch;
            const cp = this.game.currentControlledPlayer;
            const px = cp ? cp.pos.x : P.cx;
            const pz = cp ? cp.pos.y : P.cz;
            this.cam.pos.set(px, this.cam.height, pz + this.cam.dist);
            this.cam.look.set(px, 10, pz);
            this.camera.position.copy(this.cam.pos);
            this.camera.lookAt(this.cam.look);
        }

        setCameraMode(mode) {
            const m = (mode === 'wide' || mode === 'tv') ? mode : 'third';
            if (m === this.cameraMode) return;
            this.cameraMode = m;
        }

        toggleCamera() {
            const order = ['third', 'wide', 'tv'];
            const i = order.indexOf(this.cameraMode);
            this.setCameraMode(order[(i + 1) % order.length]);
            return this.cameraMode;
        }

        orbit(dx, dy) {
            this.cam.userYaw -= dx * 0.005;
            this.cam.userYaw = clamp(this.cam.userYaw, -Math.PI, Math.PI);
            this.cam.userTimer = 0;
        }

        zoom(delta) {
            this.cam.dist = clamp(this.cam.dist + delta * 0.02, 34, 110);
        }

        getYaw() {
            // Hướng camera nhìn (radian, hệ toạ độ 2D của gameplay)
            return this.cam.yaw;
        }

        updateCamera(dt) {
            const g = this.game;
            const P = this.pitch;
            const cam = this.cam;
            let desiredPos = this._tmpPos || (this._tmpPos = new THREE.Vector3());
            let desiredLook = this._tmpLook || (this._tmpLook = new THREE.Vector3());
            let lambdaPos = 8, lambdaLook = 9;

            if (g.state === 'menu' || g.state === 'match_end') {
                // ---- Camera điện ảnh xoay quanh sân ở menu ----
                const a = this.time * 0.06;
                desiredPos.set(P.cx + Math.cos(a) * 760, 300 + Math.sin(this.time * 0.13) * 40, P.cz + Math.sin(a) * 700);
                desiredLook.set(P.cx, 6, P.cz);
                lambdaPos = 1.6; lambdaLook = 1.6;
            } else if (g.state === 'pre_match' || g.state === 'post_match') {
                // ---- Cận cảnh vòng tròn giữa sân: trọng tài thổi còi ----
                const ref = g.referee;
                const fx = ref ? ref.pos.x : P.cx;
                const fz = ref ? ref.pos.y : P.cz;
                const a = Math.sin(this.time * 0.35) * 0.5;
                desiredPos.set(fx - 120 + Math.cos(a) * 40, 62, fz + 175);
                desiredLook.set(fx, 16, fz);
                lambdaPos = 2.6; lambdaLook = 3.0;
                cam.fov = 46;
            } else if (this.cameraMode === 'tv') {
                // ---- GÓC NHÌN FIFA 99: camera cao từ khán đài bên sân, bám bóng ----
                const b = g.ball.pos;
                const cp2 = g.currentControlledPlayer;
                const px2 = cp2 ? cp2.pos.x : P.cx;
                const followX = P.cx + ((b.x * 0.7 + px2 * 0.3) - P.cx) * 0.55;
                const followZ = P.cz + (b.y - P.cz) * 0.22;
                desiredPos.set(
                    clamp(followX, P.x0 + 60, P.x1 - 60),
                    250,
                    P.z0 - 330
                );
                desiredLook.set(
                    clamp(followX, P.x0 + 40, P.x1 - 40),
                    6,
                    clamp(followZ, P.z0 - 20, P.z1 + 20)
                );
                lambdaPos = 3.0; lambdaLook = 3.4;
                cam.fov = 44;
            } else if (g.state === 'goal_celebration') {
                // ---- Cận cảnh ăn mừng ----
                const scorer = g.lastScorer && g.lastScorer.pos ? g.lastScorer : null;
                const fx = scorer ? scorer.pos.x : P.cx;
                const fz = scorer ? scorer.pos.y : P.cz;
                const a = this.time * 0.9;
                desiredPos.set(fx + Math.cos(a) * 90, 34, fz + Math.sin(a) * 90);
                desiredLook.set(fx, 14, fz);
                lambdaPos = 3.2; lambdaLook = 3.2;
            } else if (this.cameraMode === 'wide') {
                // ---- Toàn cảnh sân nhỏ ----
                const bx = (g.ball.pos.x - P.cx) * 0.10;
                const bz = (g.ball.pos.y - P.cz) * 0.08;
                desiredPos.set(P.cx + bx * 0.7, 540, P.cz + 650 + bz);
                desiredLook.set(P.cx + bx * 0.5, 0, P.cz - 30);
                lambdaPos = 3.4; lambdaLook = 4.2;
                cam.fov = 50;
            } else if (g.playMode && g.playMode !== '1p') {
                // ---- 2 NGƯỜI CHƠI: camera bám BÓNG (thấy cả P1 và P2) ----
                const ball = g.ball.pos;
                const bx = clamp(ball.x, P.x0 + 60, P.x1 - 60);
                const bz = clamp(ball.y, P.z0 + 60, P.z1 - 60);
                desiredPos.set(bx, 210, bz + 300);
                desiredLook.set(bx, 4, bz - 10);
                lambdaPos = 4.2; lambdaLook = 5.0;
                cam.fov = 52;
            } else {
                // ---- GÓC NHÌN NGƯỜI THỨ BA: sau lưng cầu thủ ----
                const p = g.currentControlledPlayer || g.players[0];
                const pm = p ? this.getModel(p) : null;
                const heading = pm ? pm.smoothDir : 0;
                const px = p ? p.pos.x : P.cx;
                const pz = p ? p.pos.y : P.cz;
                const ball = g.ball.pos;
                const toBall = Math.atan2(ball.y - pz, ball.x - px);
                const distBall = Math.hypot(ball.x - px, ball.y - pz);

                // Ưu tiên hướng cầu thủ; nếu bóng ở xa, lai về phía bóng để luôn thấy bóng
                let target = heading;
                if (distBall > 150) {
                    const wgt = clamp((distBall - 150) / 420, 0, 0.7);
                    target = heading + angleDiff(toBall, heading) * wgt;
                }
                target += cam.userYaw;

                // người chơi xoay camera bằng chuột -> giữ offset, tự về giữa khi không xoay
                cam.userTimer += dt;
                if (cam.userTimer > 1.6) {
                    cam.userYaw = damp(cam.userYaw, 0, 1.1, dt);
                }

                cam.yaw += angleDiff(target, cam.yaw) * (1 - Math.exp(-7 * dt));

                const fx = Math.cos(cam.yaw);
                const fz = Math.sin(cam.yaw);

                // Camera lùi về sau lưng, hơi cao để nhìn toàn cảnh động tác
                const bobY = Math.sin(this.time * 1.3) * 0.35;
                // Nếu camera bị đẩy ra ngoài sân (sát tường) -> thu ngắn khoảng cách
                // và nâng cao lên một chút, tránh bị tường chắn tầm nhìn.
                const lim = { x0: P.x0 - 60, x1: P.x1 + 60, z0: P.z0 - 60, z1: P.z1 + 60 };
                let k = 1;
                let cxp = px - fx * cam.dist;
                let czp = pz - fz * cam.dist;
                for (let i = 0; i < 9; i++) {
                    if (cxp >= lim.x0 && cxp <= lim.x1 && czp >= lim.z0 && czp <= lim.z1) break;
                    k -= 0.11;
                    cxp = px - fx * cam.dist * k;
                    czp = pz - fz * cam.dist * k;
                }
                desiredPos.set(cxp, cam.height + (1 - k) * 28 + bobY, czp);

                // Nhìn vào khoảng giữa cầu thủ và bóng
                const lookX = px + fx * cam.lookAhead;
                const lookZ = pz + fz * cam.lookAhead;
                const wBall = clamp(1 - distBall / 380, 0, 0.4);
                desiredLook.set(
                    lerp(lookX, ball.x, wBall),
                    cam.lookHeight,
                    lerp(lookZ, ball.y, wBall)
                );
                lambdaPos = 9; lambdaLook = 10;
                cam.fov = 58;
            }

            if (Math.abs(this.camera.fov - cam.fov) > 0.01) {
                this.camera.fov = damp(this.camera.fov, cam.fov, 5, dt);
                this.camera.updateProjectionMatrix();
            }

            cam.pos.x = damp(cam.pos.x, desiredPos.x, lambdaPos, dt);
            cam.pos.y = damp(cam.pos.y, desiredPos.y, lambdaPos, dt);
            cam.pos.z = damp(cam.pos.z, desiredPos.z, lambdaPos, dt);
            cam.look.x = damp(cam.look.x, desiredLook.x, lambdaLook, dt);
            cam.look.y = damp(cam.look.y, desiredLook.y, lambdaLook, dt);
            cam.look.z = damp(cam.look.z, desiredLook.z, lambdaLook, dt);

            this.camera.position.copy(cam.pos);
            this.camera.lookAt(cam.look);

            if (this.camLight) {
                // đặt hơi lệch trên và phía trước camera
                this.camLight.position.set(
                    cam.pos.x + (cam.look.x - cam.pos.x) * 0.12,
                    cam.pos.y + 26,
                    cam.pos.z + (cam.look.z - cam.pos.z) * 0.12
                );
            }
        }

        // ================= FRAME =================
        frame(dt) {
            const safeDt = Math.min(Math.max(dt || 0, 0.001), 0.05);
            this.time += safeDt;
            this.frameCount++;

            this._acc += safeDt;
            this._frames++;
            if (this._acc > 0.5) {
                this.fps = this._frames / this._acc;
                this._acc = 0;
                this._frames = 0;
            }

            this.syncPlayers(safeDt, safeDt);
            this.syncReferee(safeDt);
            this.syncBall(safeDt);
            this.updateCrowd(safeDt);

            // Vòng chọn + mũi tên (P1 vàng, P2 xanh)
            const cp = this.game.currentControlledPlayer;
            if (cp && cp.active) {
                this.marker.visible = true;
                this.marker.position.set(cp.pos.x, 0, cp.pos.y);
                const pulse = 1 + Math.sin(this.time * 6) * 0.06;
                this.markerRing.scale.set(pulse, pulse, pulse);
                this.markerArrow.position.y = 42 + Math.sin(this.time * 2.4) * 1.6;
                this.markerArrow.rotation.y = this.time * 1.6;
            } else {
                this.marker.visible = false;
            }
            const p2 = this.game.player2;
            if (p2 && p2.active && this.game.isTwoPlayer && this.game.isTwoPlayer()) {
                this.marker2.visible = true;
                this.marker2.position.set(p2.pos.x, 0, p2.pos.y);
                const pulse2 = 1 + Math.sin(this.time * 6 + 1.2) * 0.06;
                this.marker2Ring.scale.set(pulse2, pulse2, pulse2);
                this.marker2Arrow.position.y = 42 + Math.sin(this.time * 2.4 + 1.2) * 1.6;
                this.marker2Arrow.rotation.y = this.time * 1.6;
            } else {
                this.marker2.visible = false;
            }

            this.updateCamera(safeDt);
            this.resizeIfNeeded();
            this.renderer.render(this.scene, this.camera);
        }

        resize() {
            const w = this.canvas.clientWidth || this.canvas.width || 960;
            const h = this.canvas.clientHeight || this.canvas.height || 600;
            const pr = this.quality === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
            this.renderer.setPixelRatio(pr);
            this.renderer.setSize(w, h, false);
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
            this._lastW = w; this._lastH = h;
        }

        resizeIfNeeded() {
            const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
            if (w !== this._lastW || h !== this._lastH) this.resize();
        }

        setQuality(q) {
            this.quality = q === 'low' ? 'low' : 'high';
            this.renderer.shadowMap.enabled = this.quality !== 'low';
            if (this.dirLight) this.dirLight.castShadow = this.quality !== 'low';
            this.resize();
        }

        bindPointer() {
            const el = this.canvas;
            let dragging = false, lastX = 0;
            el.addEventListener('pointerdown', e => {
                dragging = true; lastX = e.clientX;
                el.setPointerCapture && el.setPointerCapture(e.pointerId);
            });
            el.addEventListener('pointermove', e => {
                if (!dragging) return;
                const dx = e.clientX - lastX;
                lastX = e.clientX;
                this.orbit(dx, 0);
            });
            const stop = () => { dragging = false; };
            el.addEventListener('pointerup', stop);
            el.addEventListener('pointercancel', stop);
            el.addEventListener('pointerleave', stop);
            el.addEventListener('wheel', e => {
                e.preventDefault();
                this.zoom(e.deltaY);
            }, { passive: false });
        }

        // Thông tin phục vụ test/kiểm tra
        stats() {
            const v = new THREE.Vector3();
            const info = this.renderer.info;
            let playerMeshes = 0;
            for (const [, m] of this.models) {
                m.group.traverse(o => { if (o.isMesh) playerMeshes++; });
            }
            let visible = 0;
            this.scene.traverse(o => { if (o.isMesh && o.visible) visible++; });
            return {
                cameraMode: this.cameraMode,
                cameraPos: { x: +this.camera.position.x.toFixed(2), y: +this.camera.position.y.toFixed(2), z: +this.camera.position.z.toFixed(2) },
                cameraYaw: this.cam.yaw,
                fov: this.camera.fov,
                players: this.models.size,
                playerMeshes,
                meshes: visible,
                drawCalls: info.render.calls,
                triangles: info.render.triangles,
                fps: Math.round(this.fps),
                quality: this.quality,
                time: +this.time.toFixed(2)
            };
        }
    }

    window.Renderer3D = Renderer3D;
})();
