# Quiz OCR Assistant - Ý tưởng và yêu cầu

## 1. Mục tiêu

Xây dựng tính năng cho app QuizAssistant trên Android để:

1. Người dùng cấu hình vùng chứa câu hỏi trên màn hình game/app.
2. App chụp màn hình và chỉ OCR vùng câu hỏi.
3. Dùng nội dung câu hỏi OCR để tìm câu hỏi đã được lưu trước trong database.
4. Mỗi câu hỏi đã biết trước đáp án đúng dưới dạng index `0`, `1`, `2`, `3`.
5. Trả về index đáp án đúng.
6. Vì thứ tự 4 đáp án trên màn hình **không thay đổi**, không cần OCR 4 đáp án để xác định đáp án đúng.
7. Có thể mở rộng sau này để tự thao tác/chọn đáp án dựa trên 4 vùng đáp án đã cấu hình.

Ví dụ:

```text
Câu hỏi:
"Ẩm thực Tứ Xuyên nổi tiếng với _____?"

Các đáp án luôn có thứ tự:

0 = Độ mặn
1 = Độ ngọt
2 = Độ cay
3 = Màu sắc

Database biết:
question -> 2

Kết quả OCR:
"Ẩm thực Tứ Xuyên nổi tiếng với _____?"

=> correctIndex = 2
```

---

## 2. Quy tắc quan trọng

### Thứ tự đáp án cố định

Thứ tự đáp án luôn cố định theo vị trí trên màn hình:

```text
0 = đáp án thứ nhất
1 = đáp án thứ hai
2 = đáp án thứ ba
3 = đáp án thứ tư
```

Không cần phát hiện hoặc sắp xếp lại đáp án.

Không cần OCR nội dung của 4 đáp án trong flow chính.

---

## 3. Cấu hình vùng OCR

Người dùng cần một màn hình/chế độ overlay để cấu hình vùng đọc câu hỏi.

### Bắt buộc

Một vùng:

```text
Question Region
```

Vùng này có thể:

- kéo để di chuyển;
- resize chiều rộng;
- resize chiều cao;
- lưu lại tọa độ.

Ví dụ:

```ts
interface OcrRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

Config:

```ts
interface QuizOcrConfig {
  questionRegion: OcrRegion;
}
```

---

## 4. Có thể cấu hình 4 vùng đáp án

Mặc dù flow tìm đáp án không cần OCR 4 đáp án, vẫn nên thiết kế kiến trúc để hỗ trợ 4 vùng đáp án.

Mục đích của 4 vùng này là phục vụ tính năng tương lai:

- xác định vị trí click;
- tự chọn đáp án;
- highlight đáp án;
- thao tác tự động.

Config mở rộng:

```ts
interface QuizOcrConfig {
  questionRegion: OcrRegion;

  answerRegions: [
    OcrRegion, // index 0
    OcrRegion, // index 1
    OcrRegion, // index 2
    OcrRegion  // index 3
  ];
}
```

UI cấu hình nên cho người dùng tạo 4 vùng/con trỏ:

```text
[0] Answer Region 0
[1] Answer Region 1
[2] Answer Region 2
[3] Answer Region 3
```

Mỗi vùng có thể kéo và resize.

Nếu phiên bản đầu tiên chưa cần tự click thì có thể chỉ triển khai `questionRegion`, nhưng data model nên chừa sẵn `answerRegions`.

---

## 5. Database câu hỏi

Không cần lưu đáp án dạng text nếu thứ tự đáp án luôn cố định.

Dữ liệu tối thiểu:

```ts
interface QuizQuestion {
  question: string;
  correctIndex: 0 | 1 | 2 | 3;
}
```

Ví dụ:

```json
{
  "question": "ẩm thực tứ xuyên nổi tiếng với",
  "correctIndex": 2
}
```

Có thể lưu nhiều câu:

```json
[
  {
    "question": "ẩm thực tứ xuyên nổi tiếng với",
    "correctIndex": 2
  },
  {
    "question": "thủ đô của việt nam là",
    "correctIndex": 0
  }
]
```

---

## 6. Normalize OCR

OCR có thể trả về text khác nhẹ so với database.

Ví dụ:

```text
Database:
Ẩm thực Tứ Xuyên nổi tiếng với

OCR:
Ẩm thực Tứ Xuyên nổi tiếng với _____?
```

Cần normalize trước khi tìm kiếm.

Nên xử lý:

- lowercase;
- bỏ dấu tiếng Việt để tăng khả năng match;
- bỏ ký tự đặc biệt;
- bỏ dấu `?`, `.`, `,`, `_`, v.v.;
- chuẩn hóa nhiều khoảng trắng thành một;
- trim đầu/cuối.

Ví dụ:

```ts
function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}
```

Lưu ý: cần kiểm tra kỹ việc normalize tiếng Việt và Unicode trước khi dùng production.

---

## 7. Flow runtime

Flow chính:

```text
User bật Quiz Assistant
        |
        v
Android Screenshot
        |
        v
Crop Question Region
        |
        v
OCR
        |
        v
Raw Question Text
        |
        v
Normalize Text
        |
        v
Search Question Database
        |
        v
Found?
   /           \
  Yes           No
  |              |
  v              v
correctIndex    Không xác định
0/1/2/3         / báo chưa tìm thấy
```

Ví dụ:

```text
Screenshot
    ↓
Crop questionRegion
    ↓
OCR
    ↓
"Ẩm thực Tứ Xuyên nổi tiếng với _____?"
    ↓
normalize
    ↓
"am thuc tu xuyen noi tieng voi"
    ↓
database lookup
    ↓
correctIndex = 2
```

---

## 8. Hiển thị kết quả

Phiên bản đầu tiên chỉ cần hiển thị index trên floating bubble/overlay:

```text
┌──────────────┐
│      2       │
└──────────────┘
```

Hoặc:

```text
Đáp án: 2
```

Không cần tự click trong phiên bản đầu tiên.

---

## 9. Tự động chọn đáp án - giai đoạn sau

Khi đã có:

```ts
correctIndex = 2;
```

và đã cấu hình:

```ts
answerRegions[0]
answerRegions[1]
answerRegions[2]
answerRegions[3]
```

thì có thể mở rộng:

```text
correctIndex
     |
     v
answerRegions[correctIndex]
     |
     v
lấy tọa độ tâm vùng
     |
     v
Android thao tác tại tọa độ đó
```

Ví dụ:

```ts
const targetRegion = config.answerRegions[correctIndex];

const centerX =
  targetRegion.x + targetRegion.width / 2;

const centerY =
  targetRegion.y + targetRegion.height / 2;
```

Tính năng tự click phải được tách thành module riêng, không trộn với OCR/question matching.

---

## 10. Kiến trúc đề xuất cho React Native project

Project hiện tại sử dụng React Native và có native Android `FloatingBubbleService`.

Nên phân chia trách nhiệm:

### React Native

Phụ trách:

- UI chính;
- quản lý database câu hỏi;
- thêm/sửa/xóa câu hỏi;
- cấu hình settings;
- bật/tắt Quiz Assistant;
- hiển thị danh sách câu hỏi;
- giao tiếp với native module.

### Android Native

Phụ trách:

- MediaProjection / screenshot;
- crop screenshot;
- OCR;
- floating overlay;
- draggable OCR region;
- lưu/tải tọa độ region;
- phát hiện khi cần OCR;
- trả `correctIndex` về React Native hoặc hiển thị trực tiếp trên overlay.

---

## 11. Tách module

Không nên viết toàn bộ logic vào `FloatingBubbleService`.

Nên có các thành phần độc lập, ví dụ:

```text
QuizAssistant
├── ScreenshotManager
├── OcrManager
├── QuestionMatcher
├── OcrRegionManager
├── FloatingBubbleService
└── QuizAssistantService
```

### ScreenshotManager

Nhiệm vụ:

- chụp screenshot;
- cung cấp Bitmap/Image cho OCR pipeline.

### OcrRegionManager

Nhiệm vụ:

- lưu questionRegion;
- lưu answerRegions;
- convert tọa độ giữa overlay/screenshot nếu cần;
- cung cấp region cho pipeline.

### OcrManager

Nhiệm vụ:

- nhận bitmap/crop;
- chạy OCR;
- trả text.

Có thể thiết kế interface để dễ thay OCR engine:

```ts
interface OcrManager {
  recognize(image): Promise<string>;
}
```

### QuestionMatcher

Nhiệm vụ:

```text
OCR text
   ↓
normalize
   ↓
database lookup
   ↓
correctIndex | null
```

Không được phụ thuộc vào Android UI.

### FloatingBubbleService

Nhiệm vụ:

- hiển thị trạng thái assistant;
- hiển thị correctIndex;
- mở màn hình cấu hình;
- sau này có thể thực hiện auto-click.

---

## 12. Matching câu hỏi

Ưu tiên matching chính xác sau normalize.

```text
normalized OCR question
        ↓
Map<String, correctIndex>
        ↓
O(1) lookup
```

Nếu không tìm thấy:

```text
correctIndex = null
```

Không tự đoán đáp án trong phiên bản đầu tiên.

Có thể bổ sung fuzzy matching ở giai đoạn sau nếu cần, nhưng phải tách riêng:

```text
Exact Match
    ↓
không tìm thấy
    ↓
Optional Fuzzy Match
```

Không được tự chọn một đáp án chỉ vì similarity thấp.

---

## 13. Tối ưu OCR

Không OCR liên tục ở tốc độ cao.

Nên có cơ chế:

```text
Screenshot
   ↓
OCR
   ↓
Question changed?
   ├── No → bỏ qua
   └── Yes → match database
```

Có thể hash/normalize text câu hỏi để tránh xử lý lặp lại.

Ví dụ:

```ts
if (normalizedQuestion === previousQuestion) {
  return;
}
```

Điều này giúp giảm:

- CPU;
- battery;
- OCR processing;
- latency.

---

## 14. Trạng thái runtime

Có thể dùng:

```ts
type AssistantState =
  | 'IDLE'
  | 'CAPTURING'
  | 'OCR_PROCESSING'
  | 'MATCHING'
  | 'ANSWER_FOUND'
  | 'NOT_FOUND'
  | 'ERROR';
```

Ví dụ:

```text
IDLE
 ↓
CAPTURING
 ↓
OCR_PROCESSING
 ↓
MATCHING
 ↓
ANSWER_FOUND
```

---

## 15. UX cấu hình

Màn hình cấu hình nên có:

```text
┌─────────────────────────────┐
│      CẤU HÌNH QUIZ          │
│                             │
│  [ Bật overlay ]            │
│                             │
│  Vùng câu hỏi               │
│  [ Chọn vùng ]              │
│                             │
│  Vùng đáp án                │
│  [0] [ Chọn vùng ]          │
│  [1] [ Chọn vùng ]          │
│  [2] [ Chọn vùng ]          │
│  [3] [ Chọn vùng ]          │
│                             │
│  [ Test OCR ]               │
│                             │
│  [ Lưu cấu hình ]           │
└─────────────────────────────┘
```

`Test OCR` rất quan trọng.

Khi người dùng bấm:

```text
Test OCR
   ↓
capture
   ↓
crop questionRegion
   ↓
OCR
   ↓
hiển thị text OCR
```

Ví dụ:

```text
OCR result:

Ẩm thực Tứ Xuyên nổi tiếng với _____?

Matched:
YES

Correct index:
2
```

---

## 16. Import dữ liệu câu hỏi

Nên thiết kế database để sau này có thể import hàng loạt.

Ví dụ JSON:

```json
[
  {
    "question": "Ẩm thực Tứ Xuyên nổi tiếng với",
    "correctIndex": 2
  },
  {
    "question": "Câu hỏi tiếp theo",
    "correctIndex": 1
  }
]
```

Có thể hỗ trợ import JSON/CSV ở giai đoạn sau.

---

## 17. Acceptance Criteria cho phiên bản đầu tiên

### Configuration

- [ ] Có thể tạo/chọn `questionRegion`.
- [ ] Có thể kéo và resize region.
- [ ] Có thể lưu region.
- [ ] App khôi phục region sau khi restart.
- [ ] Data model hỗ trợ thêm 4 `answerRegions`.

### OCR

- [ ] Screenshot được màn hình.
- [ ] Crop đúng `questionRegion`.
- [ ] OCR được text tiếng Việt.
- [ ] Normalize text.
- [ ] Không OCR 4 đáp án trong flow chính.

### Matching

- [ ] Tìm câu hỏi trong database.
- [ ] Trả về `0`, `1`, `2` hoặc `3`.
- [ ] Không tìm thấy thì trả `null`.
- [ ] Không tự đoán khi không match.

### UI

- [ ] Floating bubble hiển thị trạng thái.
- [ ] Khi tìm thấy hiển thị correct index.
- [ ] Có nút test OCR.
- [ ] Có thể bật/tắt assistant.

---

## 18. Không làm trong phiên bản đầu tiên

Không cần:

- OCR 4 đáp án;
- nhận diện thứ tự đáp án;
- fuzzy matching phức tạp;
- AI/LLM để đoán câu trả lời;
- tự click đáp án;
- tự thay đổi vùng OCR;
- xử lý nhiều game/app cùng lúc.

Mục tiêu MVP chỉ là:

```text
SCREENSHOT
    ↓
QUESTION OCR
    ↓
QUESTION MATCH
    ↓
CORRECT INDEX 0/1/2/3
    ↓
DISPLAY RESULT
```

Sau khi MVP ổn định mới thêm auto-click.

---

## 19. Yêu cầu khi implement

Trước khi code:

1. Đọc cấu trúc project hiện tại.
2. Xác định `FloatingBubbleService` hiện có.
3. Xác định cách project đang xử lý overlay permission.
4. Kiểm tra Android version/minSdk hiện tại.
5. Không phá vỡ flow hiện tại của app.
6. Ưu tiên native Android cho screenshot/OCR/overlay.
7. React Native chỉ xử lý phần UI/data phù hợp.
8. Không thêm dependency lớn nếu không cần thiết.
9. Tách logic thành service/module dễ test.
10. Implement MVP trước, không tự mở rộng sang auto-click.

## 20. Kết quả mong muốn

Sau khi implement, người dùng có thể:

1. Mở QuizAssistant.
2. Chọn `Cấu hình vùng đọc`.
3. Kéo vùng OCR vào vị trí câu hỏi.
4. Lưu.
5. Thêm database câu hỏi + `correctIndex`.
6. Bật Assistant.
7. App đọc câu hỏi trên màn hình.
8. Tìm câu hỏi trong database.
9. Hiển thị:

```text
Đáp án: 2
```

Trong tương lai, nếu bật auto-select:

```text
Đáp án: 2
    ↓
answerRegions[2]
    ↓
thao tác chọn đáp án thứ 3
```

**Lưu ý:** index bắt đầu từ `0`, nên đáp án hiển thị thứ 1 = `0`, thứ 2 = `1`, thứ 3 = `2`, thứ 4 = `3`.


---

# 21. Thiết kế giao diện ứng dụng

Ứng dụng chính có **3 tab navigation cố định** ở phía dưới:

```text
┌─────────────────────────────────┐
│                                 │
│          QuizAssistant          │
│                                 │
│       Nội dung từng trang       │
│                                 │
│                                 │
├─────────────────────────────────┤
│      🏠        📚        ⚙️     │
│  Trang chủ  Câu hỏi   Cài đặt   │
└─────────────────────────────────┘
```

Navigation:

```text
Home       → Trang chủ
Questions  → Câu hỏi
Settings   → Cài đặt
```

Không tạo quá nhiều tab chính. Các chức năng chi tiết nên mở từ từng tab hoặc modal/screen phụ.

---

## 22. Tab Trang chủ

Trang chủ là màn hình điều khiển Assistant.

Nội dung đề xuất:

```text
┌─────────────────────────────────┐
│          QuizAssistant           │
│                                 │
│  Assistant                      │
│  ● Đang tắt                     │
│                                 │
│       [ BẬT ASSISTANT ]         │
│                                 │
│  ─────────────────────────────  │
│                                 │
│  🔍 Scan câu hỏi                │
│                                 │
│  Trạng thái quyền               │
│  ✓ Overlay                      │
│  ✓ Screenshot                   │
│  ✓ OCR                          │
│                                 │
│  Câu hỏi đã lưu                 │
│  128 câu                        │
│                                 │
├─────────────────────────────────┤
│     🏠       📚       ⚙️        │
│   Trang chủ  Câu hỏi  Cài đặt   │
└─────────────────────────────────┘
```

### Chức năng

Trang chủ cần có:

- Trạng thái Assistant.
- Nút Bật/Tắt Assistant.
- Nút `Scan câu hỏi`.
- Trạng thái các quyền cần thiết.
- Số lượng câu hỏi đã lưu.
- Trạng thái OCR.
- Trạng thái overlay.

### Bật Assistant

Khi người dùng bật:

```text
Home
  ↓
Bật Assistant
  ↓
Kiểm tra quyền
  ↓
Khởi động Android Assistant Service
  ↓
Hiển thị floating bubble 🤖
```

Khi tắt:

```text
Tắt Assistant
  ↓
Stop Assistant Service
  ↓
Ẩn bubble
```

---

# 23. Floating Bubble

Khi Assistant đang chạy và người dùng chuyển sang game/app khác:

```text
┌──────────────────────────────┐
│                              │
│        GAME / APP            │
│                              │
│                     ┌────┐   │
│                     │ 🤖 │   │
│                     └────┘   │
│                              │
└──────────────────────────────┘
```

Bubble:

- luôn nổi trên app/game;
- có thể kéo trên màn hình;
- nhớ vị trí gần nhất;
- không che màn hình quá nhiều;
- chạm bubble để mở menu Assistant.

---

# 24. Menu khi bấm Bubble

Khi bấm bubble:

```text
┌──────────────────────┐
│   Quiz Assistant     │
│                      │
│   🔍 Quét câu hỏi    │
│   ▶ Auto Mode        │
│   📚 Câu hỏi         │
│   ⚙ Cài đặt          │
│                      │
│   ✕ Đóng             │
└──────────────────────┘
```

### 🔍 Quét câu hỏi

Thực hiện một lần:

```text
Screenshot
    ↓
Crop Question Region
    ↓
OCR
    ↓
Normalize
    ↓
Question Matcher
    ↓
Correct Index
```

Sau đó bubble/menu hiển thị kết quả:

```text
Đáp án: 2
```

Nếu không tìm thấy:

```text
Không tìm thấy câu hỏi
```

Không tự đoán đáp án.

### ▶ Auto Mode

Bật/tắt Auto Mode.

Auto Mode là tính năng mở rộng:

```text
OCR Question
     ↓
Match Question
     ↓
correctIndex
     ↓
answerRegions[correctIndex]
     ↓
thao tác chọn đáp án
```

Nếu Auto Mode chưa được implement thì vẫn hiển thị toggle nhưng phải đánh dấu tính năng chưa khả dụng hoặc không cho bật.

### 📚 Câu hỏi

Chuyển tới tab `Câu hỏi`.

### ⚙ Cài đặt

Chuyển tới tab `Cài đặt`.

### ✕ Đóng

Đóng menu, giữ bubble.

---

# 25. Tab Câu hỏi

Tab này quản lý database câu hỏi.

```text
┌─────────────────────────────────┐
│          Câu hỏi                │
│                                 │
│  🔍 Tìm kiếm câu hỏi...         │
│                                 │
│  ┌───────────────────────────┐  │
│  │ Ẩm thực Tứ Xuyên...       │  │
│  │ Đáp án: 2                 │  │
│  │                    ✏  🗑  │  │
│  └───────────────────────────┘  │
│                                 │
│  ┌───────────────────────────┐  │
│  │ Thủ đô Việt Nam...        │  │
│  │ Đáp án: 0                 │  │
│  │                    ✏  🗑  │  │
│  └───────────────────────────┘  │
│                                 │
│                         ＋       │
├─────────────────────────────────┤
│     🏠       📚       ⚙️        │
│   Trang chủ  Câu hỏi  Cài đặt   │
└─────────────────────────────────┘
```

### Chức năng

- Danh sách câu hỏi.
- Tìm kiếm.
- Xem đáp án.
- Thêm câu hỏi.
- Sửa câu hỏi.
- Xóa câu hỏi.
- Có thể import dữ liệu ở giai đoạn sau.

---

## 26. Thêm/Sửa câu hỏi

Form:

```text
┌──────────────────────────────┐
│       Thêm câu hỏi           │
│                              │
│ Câu hỏi                      │
│ ┌──────────────────────────┐ │
│ │ Ẩm thực Tứ Xuyên...      │ │
│ └──────────────────────────┘ │
│                              │
│ Đáp án đúng                  │
│                              │
│  ○ 0                         │
│  ○ 1                         │
│  ● 2                         │
│  ○ 3                         │
│                              │
│       [ Lưu ]                │
└──────────────────────────────┘
```

Model:

```ts
interface QuizQuestion {
  id: string;
  question: string;
  correctIndex: 0 | 1 | 2 | 3;
}
```

Không cần nhập nội dung 4 đáp án trong database MVP vì thứ tự đáp án trên game cố định.

---

# 27. Tab Cài đặt

Tab Cài đặt chứa các cấu hình Assistant:

```text
┌─────────────────────────────────┐
│           Cài đặt               │
│                                 │
│ Assistant                      │
│ ────────────────────────────── │
│ Auto Mode                 OFF   │
│                                 │
│ Độ trễ click              500ms │
│                                 │
│ OCR                            │
│ ────────────────────────────── │
│ Vùng câu hỏi                    │
│ [ Cấu hình vùng đọc ]           │
│                                 │
│ Vùng đáp án                     │
│ [ Cấu hình 4 vùng ]             │
│                                 │
│ [ Test OCR ]                    │
│                                 │
│ Overlay                         │
│ ────────────────────────────── │
│ Vị trí Bubble                   │
│ Độ trong suốt                   │
│                                 │
├─────────────────────────────────┤
│     🏠       📚       ⚙️        │
│   Trang chủ  Câu hỏi  Cài đặt   │
└─────────────────────────────────┘
```

### Auto Mode

```ts
autoMode: boolean;
```

Mặc định:

```ts
false
```

Không tự bật Auto Mode.

### Độ trễ click

```ts
clickDelayMs: number;
```

Ví dụ:

```text
0ms
100ms
250ms
500ms
1000ms
```

Chỉ có tác dụng khi Auto Mode được implement.

---

# 28. Cấu hình vùng đọc

Từ Settings:

```text
Cấu hình vùng đọc
```

Mở chế độ overlay để người dùng kéo vùng OCR.

Bắt buộc:

```text
Question Region
```

Có thể cấu hình thêm:

```text
Answer Region 0
Answer Region 1
Answer Region 2
Answer Region 3
```

UI:

```text
┌──────────────────────────────┐
│      CẤU HÌNH VÙNG OCR       │
│                              │
│  [ Q ] Vùng câu hỏi          │
│                              │
│  [ 0 ] Vùng đáp án 0         │
│  [ 1 ] Vùng đáp án 1         │
│  [ 2 ] Vùng đáp án 2         │
│  [ 3 ] Vùng đáp án 3         │
│                              │
│       [ Test OCR ]           │
│       [ Lưu ]                │
└──────────────────────────────┘
```

Mỗi region:

- kéo được;
- resize được;
- có label rõ ràng;
- không nhầm index.

---

# 29. Navigation architecture

React Native nên sử dụng Bottom Tab Navigation:

```text
RootNavigator
│
└── BottomTabNavigator
    │
    ├── HomeStack
    │   ├── HomeScreen
    │   └── ScanResultScreen
    │
    ├── QuestionsStack
    │   ├── QuestionsScreen
    │   ├── QuestionDetailScreen
    │   └── EditQuestionScreen
    │
    └── SettingsStack
        ├── SettingsScreen
        └── OcrRegionScreen
```

Bottom tab chỉ có 3 tab:

```text
Home
Questions
Settings
```

Các màn hình phụ không xuất hiện trong bottom navigation.

---

# 30. Trạng thái giữa React Native và Android

React Native và Android Native cần dùng một state/model thống nhất.

Ví dụ:

```ts
interface AssistantState {
  enabled: boolean;
  autoMode: boolean;
  status:
    | 'IDLE'
    | 'CAPTURING'
    | 'OCR_PROCESSING'
    | 'MATCHING'
    | 'ANSWER_FOUND'
    | 'NOT_FOUND'
    | 'ERROR';
  lastQuestion?: string;
  lastCorrectIndex?: 0 | 1 | 2 | 3;
}
```

Android Native cập nhật trạng thái.

React Native hiển thị trạng thái tương ứng.

---

# 31. Home Screen là màn hình điều khiển chính

Luồng sử dụng mong muốn:

```text
Mở app
   ↓
Trang chủ
   ↓
Kiểm tra quyền
   ↓
Cấu hình OCR nếu chưa có
   ↓
Bật Assistant
   ↓
Bubble 🤖 xuất hiện
   ↓
Mở game
   ↓
Bấm bubble
   ↓
"Quét câu hỏi"
   ↓
OCR
   ↓
Tìm câu hỏi
   ↓
Hiển thị correctIndex
```

Người dùng không cần quay lại app chính trong quá trình chơi.

---

# 32. Nguyên tắc UI

Giao diện cần:

- đơn giản;
- dễ nhìn;
- ít thao tác;
- phù hợp màn hình điện thoại;
- Bottom Navigation rõ ràng;
- trạng thái Assistant luôn dễ nhận biết;
- các thao tác quan trọng có feedback;
- Bubble nhỏ, không che game;
- menu Bubble gọn;
- không đưa quá nhiều setting lên Home.

### Màu trạng thái

Có thể dùng semantic color:

```text
ON / SUCCESS  → xanh
OFF           → xám
WARNING       → vàng
ERROR         → đỏ
```

Không hard-code màu rải rác trong component; tập trung vào theme/design tokens.

---

# 33. Scope UI MVP

MVP bắt buộc có:

- [ ] 3 bottom tabs: Home / Questions / Settings.
- [ ] Home điều khiển Assistant.
- [ ] Bật/Tắt Assistant.
- [ ] Hiển thị trạng thái quyền.
- [ ] Floating bubble 🤖.
- [ ] Bubble menu.
- [ ] Quét câu hỏi thủ công.
- [ ] Questions list.
- [ ] Search.
- [ ] Add/Edit/Delete question.
- [ ] correctIndex `0 | 1 | 2 | 3`.
- [ ] Settings.
- [ ] OCR region configuration.
- [ ] Test OCR.

Chưa bắt buộc:

- [ ] Auto Mode thực tế.
- [ ] Auto click.
- [ ] Fuzzy matching.
- [ ] Import CSV/JSON.
- [ ] Đồng bộ cloud.

---

# 34. Yêu cầu cho OpenCode

Khi implement UI:

1. Đọc project hiện tại trước khi sửa.
2. Tận dụng React Native Navigation/dependencies đã có.
3. Không cài thêm navigation library nếu project đã có đủ dependency.
4. Giữ kiến trúc hiện tại nếu không có lý do rõ ràng để thay đổi.
5. Tạo 3 tab chính đúng theo thiết kế.
6. Không biến Bubble thành một tab.
7. Bubble phải thuộc Android Native overlay/service.
8. React Native chịu trách nhiệm UI/settings/database.
9. Android Native chịu trách nhiệm overlay/screenshot/OCR.
10. Auto Mode chỉ tạo UI/state trước nếu phần native auto-click chưa được implement.
11. Không tự ý implement auto-click trong cùng task UI nếu chưa được yêu cầu.
12. Ưu tiên component nhỏ, dễ bảo trì.
13. Dùng TypeScript.
14. Không hard-code dữ liệu câu hỏi trong UI.
15. Tách model, storage, service và UI.


---

# 35. Phân chia bộ câu hỏi

Ứng dụng có **2 bộ câu hỏi độc lập**:

1. `Snail Quiz - Cathay`
2. `Snail Quiz - Yamato`

Mỗi bộ có database câu hỏi và đáp án riêng.

Không gộp hai bộ vào một danh sách duy nhất vì người dùng cần biết rõ đang làm việc với bộ nào.

## 35.1. Tab Câu hỏi

Tab `📚 Câu hỏi` được chia thành **2 tab con**:

```text
┌─────────────────────────────────┐
│            Câu hỏi              │
│                                 │
│   [ Cathay ]    [ Yamato ]      │
│   ─────────                     │
│                                 │
│  🔍 Tìm kiếm câu hỏi...         │
│                                 │
│  ┌───────────────────────────┐  │
│  │ Ẩm thực Tứ Xuyên...       │  │
│  │ Đáp án: 2                 │  │
│  │                    ✏  🗑  │  │
│  └───────────────────────────┘  │
│                                 │
│  ┌───────────────────────────┐  │
│  │ Câu hỏi khác...           │  │
│  │ Đáp án: 1                 │  │
│  │                    ✏  🗑  │  │
│  └───────────────────────────┘  │
│                                 │
│                         ＋       │
├─────────────────────────────────┤
│     🏠       📚       ⚙️        │
│   Trang chủ  Câu hỏi  Cài đặt   │
└─────────────────────────────────┘
```

Tab con:

```text
Cathay
Yamato
```

Khi người dùng thêm/sửa/xóa câu hỏi, thao tác phải áp dụng đúng bộ đang được chọn.

Ví dụ:

```text
Câu hỏi > Cathay
```

chỉ hiển thị dữ liệu:

```text
Snail Quiz - Cathay
```

và:

```text
Câu hỏi > Yamato
```

chỉ hiển thị:

```text
Snail Quiz - Yamato
```

---

# 36. Model dữ liệu theo bộ câu hỏi

Không nên tạo hai model khác nhau.

Dùng một model chung:

```ts
type QuizSetId = 'cathay' | 'yamato';

interface QuizQuestion {
  id: string;
  quizSetId: QuizSetId;
  question: string;
  correctIndex: 0 | 1 | 2 | 3;
}
```

Có thể dùng enum nếu project đang sử dụng enum:

```ts
enum QuizSetId {
  CATHAY = 'cathay',
  YAMATO = 'yamato',
}
```

Ví dụ:

```json
{
  "id": "cathay-001",
  "quizSetId": "cathay",
  "question": "ẩm thực tứ xuyên nổi tiếng với",
  "correctIndex": 2
}
```

```json
{
  "id": "yamato-001",
  "quizSetId": "yamato",
  "question": "câu hỏi yamato",
  "correctIndex": 1
}
```

---

# 37. Bộ câu hỏi được chọn trong Bubble

Floating Bubble 🤖 phải có thêm **lựa chọn bộ câu hỏi hiện tại**.

Menu:

```text
┌──────────────────────────┐
│    Quiz Assistant        │
│                          │
│  Bộ câu hỏi              │
│  ┌────────────────────┐  │
│  │ ● Cathay           │  │
│  │ ○ Yamato           │  │
│  └────────────────────┘  │
│                          │
│  🔍 Quét câu hỏi         │
│  ▶ Auto Mode             │
│  📚 Câu hỏi              │
│  ⚙ Cài đặt              │
│                          │
│  ✕ Đóng                 │
└──────────────────────────┘
```

Hoặc thiết kế gọn hơn:

```text
┌──────────────────────────┐
│    Quiz Assistant        │
│                          │
│  Bộ: [ Cathay ▼ ]        │
│                          │
│  🔍 Quét câu hỏi         │
│  ▶ Auto Mode             │
│  📚 Câu hỏi              │
│  ⚙ Cài đặt              │
│                          │
│  ✕ Đóng                 │
└──────────────────────────┘
```

### Hành vi

Nếu chọn:

```text
Cathay
```

thì OCR/matching chỉ tìm trong:

```text
Snail Quiz - Cathay
```

Nếu chọn:

```text
Yamato
```

thì OCR/matching chỉ tìm trong:

```text
Snail Quiz - Yamato
```

Không được tìm xuyên cả hai bộ khi người dùng đã chọn một bộ cụ thể.

---

# 38. Global selected quiz set

Cần có một state dùng chung cho toàn bộ Assistant:

```ts
type QuizSetId = 'cathay' | 'yamato';

interface QuizAssistantSettings {
  selectedQuizSet: QuizSetId;
}
```

Ví dụ:

```ts
selectedQuizSet = 'cathay';
```

Khi thực hiện scan:

```text
selectedQuizSet
       ↓
QuestionMatcher
       ↓
filter quizSetId
       ↓
search question
       ↓
correctIndex
```

Flow:

```text
Bubble
  ↓
Selected Set = Cathay
  ↓
Scan
  ↓
OCR Question
  ↓
Normalize
  ↓
Search Cathay database only
  ↓
correctIndex
```

---

# 39. Đổi bộ câu hỏi trong Bubble

Khi người dùng đổi:

```text
Cathay → Yamato
```

cần cập nhật ngay:

```ts
selectedQuizSet = 'yamato';
```

Assistant đang chạy không cần restart service chỉ vì đổi bộ câu hỏi.

Lần scan tiếp theo sử dụng ngay bộ mới.

Nếu Auto Mode đang chạy, Auto Mode cũng phải sử dụng bộ mới từ lần xử lý tiếp theo.

---

# 40. Database / Storage

Có thể lưu chung một database nhưng bắt buộc có `quizSetId`.

Ví dụ:

```text
QuizQuestion
├── id
├── quizSetId
├── question
└── correctIndex
```

Query:

```ts
getQuestionsByQuizSet('cathay');
getQuestionsByQuizSet('yamato');
```

Matcher:

```ts
findQuestion(
  normalizedQuestion,
  selectedQuizSet
);
```

Không tạo hai implementation matcher riêng cho Cathay/Yamato.

---

# 41. Home Screen

Trang chủ cũng nên hiển thị bộ hiện tại:

```text
┌─────────────────────────────────┐
│          QuizAssistant          │
│                                 │
│  Assistant                      │
│  ● Đang chạy                    │
│                                 │
│  Bộ câu hỏi                     │
│  📚 Snail Quiz - Cathay         │
│                                 │
│       [ QUÉT CÂU HỎI ]          │
│                                 │
│  Câu hỏi đã lưu                 │
│  128 câu                        │
│                                 │
├─────────────────────────────────┤
│     🏠       📚       ⚙️        │
│   Trang chủ  Câu hỏi  Cài đặt   │
└─────────────────────────────────┘
```

Nếu đang chọn Yamato:

```text
📚 Snail Quiz - Yamato
```

---

# 42. Settings

Có thể cho phép chọn bộ mặc định trong Settings:

```text
Bộ câu hỏi mặc định
┌──────────────────────────────┐
│ ● Snail Quiz - Cathay        │
│ ○ Snail Quiz - Yamato        │
└──────────────────────────────┘
```

Nhưng **Bubble vẫn phải cho phép đổi nhanh bộ hiện tại**, vì người dùng có thể chuyển game/bộ quiz mà không muốn vào app chính.

---

# 43. Acceptance Criteria bổ sung

### Question Sets

- [ ] Có 2 bộ: `Snail Quiz - Cathay` và `Snail Quiz - Yamato`.
- [ ] Tab Câu hỏi có 2 tab con Cathay/Yamato.
- [ ] Danh sách câu hỏi được filter đúng theo bộ.
- [ ] Thêm câu hỏi lưu đúng `quizSetId`.
- [ ] Sửa câu hỏi không làm thay đổi bộ.
- [ ] Xóa câu hỏi chỉ xóa câu hỏi thuộc bộ hiện tại.
- [ ] Search chỉ search trong bộ hiện tại.

### Bubble

- [ ] Bubble menu hiển thị bộ câu hỏi hiện tại.
- [ ] Có thể đổi giữa Cathay/Yamato ngay trong Bubble.
- [ ] Scan sử dụng đúng bộ đang chọn.
- [ ] Auto Mode sử dụng đúng bộ đang chọn.
- [ ] Đổi bộ không cần restart Assistant.
- [ ] Home hiển thị bộ hiện tại.

### Matching

- [ ] `QuestionMatcher` nhận `quizSetId`.
- [ ] Không tìm câu hỏi xuyên hai bộ.
- [ ] Nếu câu hỏi không tồn tại trong bộ đang chọn thì trả `null`.
- [ ] Không tự fallback sang bộ còn lại.

---

# 44. Luồng sử dụng hoàn chỉnh

```text
Mở QuizAssistant
       ↓
Trang chủ
       ↓
Chọn bộ:
Snail Quiz - Cathay
       ↓
Bật Assistant
       ↓
Bubble 🤖 xuất hiện
       ↓
Mở game Cathay
       ↓
Bấm 🤖
       ↓
Bộ: Cathay
       ↓
🔍 Quét câu hỏi
       ↓
OCR
       ↓
QuestionMatcher
       ↓
Search Cathay database
       ↓
correctIndex = 2
       ↓
Hiển thị "Đáp án: 2"
```

Khi chuyển sang Yamato:

```text
Bấm 🤖
   ↓
Bộ: Cathay ▼
   ↓
Chọn Yamato
   ↓
Bộ: Yamato
   ↓
🔍 Quét câu hỏi
   ↓
Search Yamato database ONLY
   ↓
correctIndex
```

Đây là **context của Assistant**, không phải chỉ là filter UI. `selectedQuizSet` phải được truyền xuyên suốt pipeline OCR → matching → Auto Mode.
