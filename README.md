# Street Football 3D - FIFA Street Style ⚽

Game bóng đá đường phố (street football) **3D** theo phong cách **FIFA Street**, render bằng WebGL (three.js),
với **cầu thủ có đầy đủ chân tay** (mô hình humanoid phân khúc + animation procedural) và
**góc nhìn người thứ ba** — camera đặt sau lưng cầu thủ, có thể chuyển sang **toàn cảnh sân bóng nhỏ**.

## Điểm mới: 3D + góc nhìn người thứ ba

- **Cầu thủ 3D đầy đủ chân tay**: mỗi cầu thủ được dựng từ ~45 bộ phận (đầu, tóc, thân, hông, 2 tay với
  vai → khuỷu → bàn tay, 2 chân với đùi → gối → cổ chân → giày). Không còn nhân vật "đầu to chibi 2D".
- **Animation procedural** (không cần file model/animation ngoài):
  - Đứng yên: thở, đung đưa nhẹ
  - **Chạy**: đùi vung, gối gập/duỗi, tay vung ngược pha, thân đổ người, dáng chạy nhanh
  - **Sút / Chuyền**: lấy đà → vung chân → theo đà, xoay người, tay giữ thăng bằng
  - **Kỹ năng**: hạ thấp trọng tâm + xoay người (động tác kỹ thuật)
  - **Tắc bóng (tackle)**, **thủ môn bay người (dive)**, **ăn mừng** (giơ 2 tay, nhảy)
- **Camera góc nhìn người thứ ba**: đặt sau lưng cầu thủ đang điều khiển, cao hơn đầu một chút, tự bám
  theo hướng chạy, tự lai về phía bóng khi bóng ở xa để luôn quan sát được bóng.
  - Kéo chuột để xoay quanh cầu thủ, lăn chuột để zoom.
  - Di chuyển theo hướng camera: `W` = đi xa camera (về phía trước), `S` = lùi về camera, `A/D` = sang trái/phải.
- **Camera toàn cảnh sân bóng nhỏ** (bấm `C` hoặc chọn trong Cài đặt): nhìn từ trên cao bao trọn sân,
  thấy cả 6 cầu thủ, khung thành và bóng.
- **Sân 3D**: mặt sân cỏ nhân tạo có vạch kẻ, tường bê tông graffiti, khung thành + lưới, cột đèn pha,
  bảng hiệu, nón tập, băng ghế dự bị; đèn pha đổ bóng (chất lượng Cao).
- **Bóng 3D**: lăn theo vận tốc, nảy nhẹ khi bị sút, vòng sáng dưới chân bóng cho dễ thấy;
  bóng bổng bay theo quỹ đạo parabol (không ai chặn được khi bóng còn trên cao).

## Cách chơi

| Phím | Chức năng |
|------|-----------|
| **WASD / Mũi tên** | Di chuyển cầu thủ (theo hướng camera ở góc nhìn người thứ ba) |
| **Space** | Chuyền bóng ngắn (khi có bóng) / **TRANH BÓNG** (khi không có bóng) |
| **R** | **Chọc khe** — chuyền sệt vào khoảng trống phía trước đồng đội đang chạy |
| **T** | **Chuyền bóng bổng** — bóng bay cao qua đầu hàng phòng ngự |
| **F** | Sút bóng vào khung thành |
| **E** | Kỹ năng đặc biệt (dash nhanh, tốn 25 thể lực) |
| **Shift** | Chạy nhanh (tốn thể lực) |
| **Q** | Chuyển cầu thủ điều khiển |
| **C** | **Đổi góc nhìn: Người thứ ba → Toàn cảnh sân → FIFA 99 (góc cao bám bóng)** |
| **Chuột** | Kéo để xoay camera, lăn để zoom (góc nhìn người thứ ba) |
| **ESC** | Tạm dừng |

> 💡 **Tất cả phím có thể tùy chỉnh** trong **Cài đặt → Bàn phím**.

## Cài đặt 3D

Trong **Cài đặt**:

- **🎥 Góc nhìn**: `Người thứ ba (sau lưng cầu thủ)` · `Toàn cảnh sân bóng` · `📺 FIFA 99 (góc cao bám bóng)`
- **🖥️ Chất lượng 3D**: `Cao (đổ bóng)` hoặc `Thấp (máy yếu)`

Có thể ép chế độ bằng URL:

| URL | Ý nghĩa |
|-----|---------|
| `http://localhost:8080/` | 3D chất lượng cao (đổ bóng) |
| `http://localhost:8080/?gfx=low` | 3D chất lượng thấp (không đổ bóng, êm hơn trên máy yếu) |
| `http://localhost:8080/?gfx=2d` | Ép chế độ 2D cũ (dự phòng khi máy không có WebGL) |

Nếu trình duyệt không hỗ trợ WebGL, game tự động quay về chế độ 2D cũ (không bị lỗi trắng màn hình).

## Diễn biến trận đấu

- **Nghi thức vào trận**: NPC **trọng tài** (áo đen, viền vàng) dắt đội ra sân, tiến vào vòng tròn giữa sân,
  **thổi còi bắt đầu** (2 tiếng còi rít thật) → bóng vào cuộc. Hết giờ, trọng tài chạy về giữa sân
  **thổi còi kết thúc** (2 ngắn + 1 dài) rồi mới hiện bảng kết quả.
- **Khán đài có khán giả reo hò**: 4 khán đài nhiều tầng quanh sân với hàng trăm khán giả 3D (mỗi người
  một màu áo riêng), **nhấp nhô liên tục**, càng gay cấn (bóng gần khung thành) càng ồn và nhảy mạnh;
  ghi bàn/hết trận thì cả khán đài **bùng nổ**. Âm thanh khán đài là tiếng ồn nền tổng hợp (WebAudio),
  tự to nhỏ theo diễn biến — tắt bằng checkbox "Âm thanh".
- **Kết thúc trận**: hiện bảng kết quả (tỉ số, đội thắng) và **tự động trở về MENU CHÍNH sau 8 giây**
  (vẫn có nút TRẬN MỚI / MENU CHÍNH để đi ngay).
- **Banner kiểu FIFA 99**: `⚽ TRẬN ĐẤU SẮP BẮT ĐẦU` → `🔔 TRỌNG TÀI THỔI CÒI — BẮT ĐẦU!` → `GOAL!!! #9 · 3'`.

## Gameplay (NPC kiểu FIFA 99)

- **6 cầu thủ trên sân**: 3 đội Đỏ vs 3 đội Xanh (1 thủ môn, 1 hậu vệ, 1 tiền đạo mỗi đội)
- **NPC thông minh**:
  - Đồng đội **chạy chỗ tạo khoảng trống** để nhận đường chuyền khi đội có bóng (support run)
  - Khi mất bóng, NPC **tự động lùi về đội hình phòng thủ** (defensive fallback)
  - **Tự động chuyển quyền điều khiển** (mũi tên vàng) sang cầu thủ gần bóng nhất ngay khi bị đối phương
    cướp bóng — không cần bấm `Q`
  - **Nút chuyền ngắn = nút tranh bóng**: khi không có bóng, bấm `Space` (hoặc `✕`) để lao vào áp sát/xoạc bóng
  - AI chuyền bóng thông minh kiểu FIFA 99: chấm điểm từng phương án (độ thoáng của người nhận,
    có bị chặn đường chuyền không, đang ở phía trước không), **ra quyết định mỗi ~0.15s** nên bóng
    luân chuyển liên tục; bị bí ở sân nhà thì phá bóng dài, bị chặn hẳn thì chuyền bổng
  - Tiền đạo **lao vào vòng cấm** khi đồng đội dẫn bóng tới gần khung thành, tiền vệ dâng theo tấn công
- **Thủ môn** bắt góc, bay người theo hướng bóng
- **Sân đường phố**: tường bao quanh, bóng nảy tường

## 🎮 Tay cầm PS5 (DualSense)

| Nút PS5 | Chức năng |
|---------|-----------|
| **Cần trái / D-pad** | Di chuyển cầu thủ |
| **✕ Cross** | Chuyền ngắn / Tranh bóng |
| **L1** | Chọc khe |
| **R1** | Chuyền bóng bổng |
| **□ Square** | Sút bóng |
| **○ Circle** | Kỹ năng |
| **△ Triangle** | Đổi cầu thủ |
| **R2** | Chạy nhanh |

Chọn **Cài đặt → 🎮 Chế độ điều khiển** để dùng Bàn phím hoặc Tay cầm.

## Cài đặt và chạy

```bash
# Khởi động server tĩnh
cd /home/hailinux/game_football
python3 -m http.server 8080

# Mở trình duyệt
# http://localhost:8080
```

> Game cần được phục vụ qua HTTP (không mở trực tiếp `file://`) để tải được `js/vendor/three.min.js`.

## Cấu trúc

```
game_football/
├── index.html              # Giao diện chính (menu, HUD, màn hình)
├── style.css               # CSS styling (gồm lớp canvas 3D, badge góc nhìn)
├── js/
│   ├── vendor/three.min.js # three.js (WebGL) - thư viện 3D, đóng gói cục bộ
│   ├── game.js             # Game engine (Vector2, Entity, Camera 2D, Audio, Input)
│   ├── entities.js         # Player class (có action/animation state), factory
│   ├── field.js            # Field/sân bóng (toạ độ 2D của gameplay)
│   ├── ai.js               # AI Manager
│   ├── player_model.js     # MÔ HÌNH CẦU THỦ 3D: humanoid đầy đủ chân tay + animation
│   ├── render3d.js         # RENDERER 3D: sân, tường, khung thành, ánh sáng, camera
│   ├── ui.js               # UI Manager
│   └── main.js             # Game logic chính (update, draw, game loop)
└── test/                   # Test harness (Node.js + Puppeteer)
```

### Kiến trúc 3D

- **Gameplay vẫn tính bằng toạ độ 2D** (`Vector2(x, y)`) như trước → không thay đổi luật chơi/AI.
- `render3d.js` ánh xạ `(x, y)` → `(x, 0, z)` trong không gian 3D và dựng toàn bộ cảnh.
- `player_model.js` dựng cầu thủ theo hệ xương: `hips → torso → head/arms`, `hips → legs`,
  và cập nhật tư thế mỗi frame từ trạng thái (`speed`, `dirAngle`, `action`).
- Hành động được kích hoạt từ gameplay: `tryShoot()` → `setAction('kick')`, `tryPass()` → `'pass'`,
  `trySkill()` → `'skill'`, tắc bóng → `'tackle'`, ghi bàn → `'celebrate'`, thủ môn → `'dive'`.

## Tính năng kỹ thuật

- **3D**: three.js r160 (WebGL 2), đèn pha đổ bóng (shadow map), tone mapping, sương mờ, texture vẽ
  bằng canvas (cỏ, tường graffiti, lưới, bóng, bầu trời) → không cần tải asset ngoài.
- **Animation procedural**: ~20 khớp xương, làm mượt bằng exponential damping, chuyển động theo tốc độ thực.
- **Physics**: bóng bay với vận tốc, ma sát, nảy tường
- **AI**: đội hình, chasing, passing, shooting, defending với độ khó khác nhau
- **Collision**: cầu thủ-cầu thủ (separation), cầu thủ-bóng (pickup/tackle)
- **Effects**: particles, camera shake (2D), ball trail, hiệu ứng GOAL
- **Audio**: Web Audio API tones cho actions

## Test

```bash
cd test
node run.js              # Test balance AI (node console)
node test_controls.js    # Test điều khiển
node test_difficulty.js  # Test độ khó
node test_walls.js       # Test vật lý bóng
node test_match_end.js   # Test kết thúc trận
node test_ai_behavior.js # Test hành vi AI

# Test 3D end-to-end (cần Chrome + puppeteer-core, server đang chạy)
node test_3d_render.js
```

`test_3d_render.js` kiểm tra: khởi tạo WebGL, đủ 6 cầu thủ 3D với đầy đủ chân tay, camera nằm sau lưng
cầu thủ, camera toàn cảnh bao trọn sân, phím `C` đổi góc nhìn, animation chạy/sút/ăn mừng thay đổi
tư thế, di chuyển theo hướng camera, khung hình không trống và không có lỗi JS.
Ảnh chụp được lưu vào `test/screenshots/3d_third_person.png` và `test/screenshots/3d_wide_camera.png`.
