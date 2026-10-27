# Street Football - FIFA Street 3 Style ⚽

Game mini bóng đá đường phố (street football) theo phong cách **FIFA Street 3**.

## Đặc điểm

- **Nhân vật phong cách Nekketsu (Goal 3 NES)**: Đầu to chibi, mắt to biểu cảm, tóc đa dạng (spiky/bowl/flat), áo đấu gradient 3D, chân tay chuyển động khi chạy


- **6 cầu thủ trên sân**: 3 đội Đỏ vs 3 đội Xanh (1 thủ môn, 1 hậu vệ, 1 tiền đạo mỗi đội)
- **NPC thông minh**: 
  - Đồng đội **chạy chỗ tạo khoảng trống** để nhận đường chuyền khi đội có bóng (support run)
  - Khi mất bóng, NPC **tự động lùi về đội hình phòng thủ** (defensive fallback)
  - **Tự động chuyển quyền điều khiển** sang cầu thủ gần bóng nhất khi đối phương giữ bóng, và sang người nhận bóng khi chuyền thành công
  - AI chuyền bóng thông minh: ưu tiên đồng đội phía trước, thoáng, đang chạy chỗ
- **Gameplay hành động**: Tốc độ nhanh, ghi bàn liên tục, kỹ năng đặc biệt
- **Sân đường phố**: Có tường bao quanh, bóng nảy, kèo hai đầu
- **Phong cách FIFA Street**: Sút vào góc, né hậu vệ, kỹ năng dash

## Cách chơi

| Phím | Chức năng |
|------|-----------|
| **WASD / Mũi tên** | Di chuyển cầu thủ |
| **Space** | Chuyền bóng cho đồng đội gần nhất |
| **F** | Sút bóng vào khung thành |
| **E** | Kỹ năng đặc biệt (dash nhanh, tốn 25 thể lực) |
| **Shift** | Chạy nhanh (tốn thể lực) |
| **Q** | Chuyển cầu thủ điều khiển |
| **ESC** | Tạm dừng |

> 💡 **Tất cả phím có thể tùy chỉnh** trong **Cài đặt → Bàn phím**. Nhấn vào hàng phím, nhấn phím mới để gán. Cài đặt được lưu tự động (localStorage).

## 🎮 Tay cầm PS5 (DualSense)

Hỗ trợ tay cầm PS5 qua **Gamepad API** (USB hoặc Bluetooth). Cắm tay cầm và nhấn một nút để trình duyệt nhận diện.

| Nút PS5 | Chức năng | Có thể đổi? |
|---------|-----------|-------------|
| **Cần trái / D-pad** | Di chuyển cầu thủ | Cố định |
| **✕ Cross** | Chuyền bóng | ✅ |
| **□ Square** | Sút bóng | ✅ |
| **○ Circle** | Kỹ năng | ✅ |
| **△ Triangle** | Đổi cầu thủ | ✅ |
| **R2** | Chạy nhanh | ✅ |

### Chọn chế độ điều khiển
Vào **Cài đặt → 🎮 Chế độ điều khiển** để chọn:
- **⌨️ Bàn phím** — chỉ dùng bàn phím để chơi
- **🎮 Tay cầm PS5** — chỉ dùng tay cầm (cần trái + các nút)

> Nếu chọn chế độ Tay cầm nhưng chưa kết nối, game hiện cảnh báo và tạm dùng bàn phím để không bị kẹt.

### Cài đặt tay cầm chi tiết
Vào **Cài đặt → 🎮 TAY CẦM PS5** để:
- Xem trạng thái kết nối (đèn xanh = đã kết nối) + chế độ hiện tại
- Bật/tắt nhận diện tay cầm
- **Đổi nút** (nhấn vào hàng nút → nhấn nút mới trên tay cầm)
- Đặt lại mặc định

Cài đặt tay cầm được lưu tự động (localStorage).

## Cài đặt và chạy

```bash
# Khởi động server
cd /home/hailinux/game_football
python3 -m http.server 8080

# Mở trình duyệt
# http://localhost:8080
```

## Cấu trúc

```
game_football/
├── index.html          # Giao diện chính (menu, HUD, màn hình)
├── style.css           # CSS styling
├── js/
│   ├── game.js         # Game engine (Vector2, Entity, Camera, Audio, Input, Particle)
│   ├── entities.js     # Player class, factory functions
│   ├── field.js        # Field/sân bóng
│   ├── ai.js           # AI Manager
│   ├── ui.js           # UI Manager
│   └── main.js         # Game logic chính (update, draw, game loop)
└── test/               # Test harness (Node.js)
```

## Tính năng kỹ thuật

- **Physics**: Bóng bay với vận tốc, ma sát, nảy tường
- **AI**: Đội hình, chasing, passing, shooting, defending với độ khó khác nhau
- **Collision**: Cầu thủ-cầu thủ (separation), cầu thủ-bóng (pickup/tackle)
- **Balance**: Thủ môn chậm nhưng bắt góc, AI độ khó Easy/Normal/Hard/Legend
- **Eff​ects**: Particles, camera shake, ball trail, screen effects
- **Audio**: Web Audio API tones cho actions

## Test

```bash
cd test
node run.js           # Test balance AI
node test_controls.js # Test điều khiển
node test_difficulty.js # Test độ khó
node test_walls.js    # Test vật lý bóng
node test_match_end.js # Test kết thúc trận
```
