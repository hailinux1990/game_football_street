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
            this.goalTop = 52;

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

            // ---- Dựng cảnh ----
            this.buildSky();
            this.buildGround();
            this.buildWalls();
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

        buildGoals() {
            const P = this.pitch;
            const gw = this.goalWidth / 2;         // nửa khung thành
            const gh = this.goalTop;               // xà ngang
            const depth = 46;
            const postMat = new THREE.MeshStandardMaterial({ color: 0xf2f5ff, roughness: 0.35, metalness: 0.25 });

            // lưới (texture trong suốt)
            const nc = makeCanvas(128, 128);
            const ng = nc.getContext('2d');
            ng.clearRect(0, 0, 128, 128);
            ng.strokeStyle = 'rgba(240,248,255,0.85)';
            ng.lineWidth = 2;
            for (let i = 0; i <= 128; i += 12) {
                ng.beginPath(); ng.moveTo(i, 0); ng.lineTo(i, 128); ng.stroke();
                ng.beginPath(); ng.moveTo(0, i); ng.lineTo(128, i); ng.stroke();
            }
            const netTex = new THREE.CanvasTexture(nc);
            netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
            netTex.colorSpace = THREE.SRGBColorSpace;
            const netMat = new THREE.MeshBasicMaterial({
                map: netTex, transparent: true, opacity: 0.55,
                side: THREE.DoubleSide, depthWrite: false, alphaTest: 0.15
            });

            const makeGoal = (dir) => {
                // dir = +1: khung thành bên phải (đội ĐỎ tấn công), -1: bên trái
                const gx = dir > 0 ? P.x1 : P.x0;
                const grp = new THREE.Group();

                // cột dọc
                [-1, 1].forEach(s => {
                    const post = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, gh, 14), postMat);
                    post.position.set(gx, gh / 2, P.cz + s * gw);
                    post.castShadow = true;
                    grp.add(post);
                });
                // xà ngang
                const bar = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, gw * 2, 14), postMat);
                bar.rotation.x = Math.PI / 2;
                bar.position.set(gx, gh, P.cz);
                bar.castShadow = true;
                grp.add(bar);

                // thanh sau
                const backX = gx + dir * depth;
                [-1, 1].forEach(s => {
                    const rail = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, gw * 2), postMat);
                    rail.position.set(backX, gh * 0.62, P.cz);
                    rail.castShadow = true;
                    grp.add(rail);
                    const bar2 = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, gh * 0.62, 10), postMat);
                    bar2.position.set(backX, gh * 0.31, P.cz + s * gw);
                    grp.add(bar2);
                });

                // lưới: mặt sau + 2 mặt bên + mặt trên
                const backGeo = new THREE.PlaneGeometry(gw * 2, gh * 0.92);
                const back = new THREE.Mesh(backGeo, netMat);
                back.position.set(backX, gh * 0.46, P.cz);
                back.rotation.y = Math.PI / 2;
                back.userData.kind = 'net';
                grp.add(back);

                [-1, 1].forEach(s => {
                    const side = new THREE.Mesh(new THREE.PlaneGeometry(depth, gh * 0.92), netMat);
                    side.position.set(gx + dir * depth / 2, gh * 0.46, P.cz + s * gw);
                    side.userData.kind = 'net';
                    grp.add(side);
                    const top = new THREE.Mesh(new THREE.PlaneGeometry(depth, gw * 2), netMat);
                    top.position.set(gx + dir * depth / 2, gh, P.cz);
                    top.rotation.x = -Math.PI / 2;
                    top.userData.kind = 'net';
                    grp.add(top);
                });

                // lưới phía trên (mái) + khung chữ
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
            const m = (mode === 'wide') ? 'wide' : 'third';
            if (m === this.cameraMode) return;
            this.cameraMode = m;
        }

        toggleCamera() {
            this.setCameraMode(this.cameraMode === 'third' ? 'wide' : 'third');
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
            this.syncBall(safeDt);

            // Vòng chọn + mũi tên
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
