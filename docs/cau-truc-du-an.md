# Cấu trúc dự án — tài liệu để thuyết trình

Tài liệu này giải thích **từng thư mục và từng file** của ứng dụng xếp thời khoá biểu HCMUT, để người trình bày trả lời được câu hỏi "file này làm gì, vì sao tách riêng, ai dùng nó". Tên hàm, tên file và thuật ngữ kỹ thuật giữ nguyên tiếng Anh.

Mọi con số dưới đây được đo bằng lệnh ngày 2026-11-02 (Node 24.19.0, Windows 11), sau commit `54db1ae` (forward checking). Tài liệu sản phẩm: [`SPEC.md`](../SPEC.md); lịch sử và quyết định: [`HANDOVER.md`](../HANDOVER.md).

Năm bước người dùng thấy trên màn hình (`STEP_LABELS` trong `src/lib/view/format.ts`), viết tắt **B1–B5** trong cả tài liệu:

| Bước | Tên | Người dùng làm gì |
|---|---|---|
| B1 | Dán dữ liệu | dán khối môn học copy từ trang đăng ký môn học, bấm "Thêm môn" |
| B2 | Kiểm tra | xem nhóm lớp, lịch học, cảnh báo khi đọc dữ liệu |
| B3 | Yêu cầu | chọn Bắt buộc / Ưu tiên / Tắt cho từng yêu cầu, chỉnh trọng số, bấm "Xếp lịch" |
| B4 | Kết quả | xem 5 lịch tốt nhất, khoá nhóm, "Đã đầy — tìm nhóm khác" |
| B5 | Đăng ký | danh sách mã nhóm để đăng ký, xuất `.ics` / PNG / in |

---

## 1. Cây thư mục

Lấy từ `git ls-files`; số bên trái là số dòng (`wc -l`). Lệnh tạo lại (bash):

```bash
git ls-files | while read f; do printf "%6s  %s\n" "$(wc -l < "$f")" "$f"; done
```

```
hjhj/
├── .github/workflows/
│      30  ci.yml                    CI: test + lint + tsc trên mỗi push / pull request
├── docs/
│     413  cau-truc-du-an.md         tài liệu này
│      56  user-testing.md           kịch bản thử nghiệm với sinh viên
├── public/
│      14  favicon.svg               biểu tượng trang (lưới lịch)
├── src/
│     281  App.tsx                   ghép 5 bước, giữ đồng hồ, gọi solver và export
│      10  main.tsx                  điểm vào React
│     124  index.css                 Tailwind + màu Catppuccin Mocha (ctp-*), bản in
│   ├── app/                         tầng ứng dụng: trạng thái, lưu trữ, Worker
│   │     51  browser.ts
│   │     44  imageExport.ts
│   │    140  messages.ts
│   │     95  pastes.ts
│   │    156  selection.ts
│   │    287  state.ts
│   │    137  storage.ts
│   │    109  useSolver.ts
│   ├── components/                  giao diện React
│   │    114  Checklist.tsx           205  CoursePreview.tsx      54  DayList.tsx
│   │     75  ExportPanel.tsx         148  PasteInput.tsx        168  PickList.tsx
│   │    374  PreferencesForm.tsx     164  ResultTabs.tsx         81  ScoreBreakdown.tsx
│   │    101  SelectionsCard.tsx      191  StatusBanner.tsx       45  Stepper.tsx
│   │     94  TimetableGrid.tsx        58  TimetableSection.tsx   78  WeekSelector.tsx
│   │      7  courseColor.ts          198  ui.tsx
│   └── lib/                         thư viện thuần (không React, không trình duyệt)
│       ├── parser/   139 README.md    4 index.ts  436 parse.ts   26 program.ts   86 types.ts
│       ├── timing/   120 README.md  141 build.ts   68 conflicts.ts  16 constants.ts
│       │               4 index.ts   103 mask.ts
│       ├── solver/   194 README.md   31 constants.ts  59 equivalence.ts  81 filter.ts
│       │               7 index.ts    39 protocol.ts  456 score.ts  180 search.ts
│       │             305 solve.ts   225 types.ts      11 worker.ts
│       ├── view/      21 checklist.ts  186 format.ts  185 grid.ts  45 palette.ts  32 summary.ts
│       └── export/   165 ics.ts      131 image.ts    21 periods.ts
├── tests/
│     481  app.smoke.test.tsx        173  contrast.test.ts      17  fixtureText.ts
│     178  format.test.ts            133  grid.test.ts         133  ics.test.ts
│      64  image.test.ts             119  messages.test.ts     461  parser.test.ts
│      93  perf.test.ts               53  protocol.test.ts     134  shortterm.test.ts
│     675  solver.test.ts            553  state.test.ts        115  storage.test.ts
│      73  summary.test.ts           438  timing.test.ts
│   └── fixtures/
│         15  CO2001.txt    81  CO2003.txt    75  CO2007.txt
│         33  CO2011.txt   195  SK2001.txt    67  SP1031.txt
└── (gốc)
       25  .gitignore           8  .oxlintrc.json     637  HANDOVER.md
       57  README.md          130  SPEC.md             15  index.html
     3029  package-lock.json   35  package.json        19  vite.config.ts
        8  tsconfig.json       26  tsconfig.app.json    23  tsconfig.node.json
       25  tsconfig.test.json
```

**Tóm tắt theo thư mục**

| Thư mục | Số file | Số dòng | Vai trò |
|---|---|---|---|
| (gốc) | 13 | 4 037 | cấu hình build, test, lint; tài liệu; `package-lock.json` chiếm 3 029 dòng |
| `.github/workflows` | 1 | 30 | CI |
| `docs` | 2 | 469 | tài liệu cho người dùng thử và người trình bày |
| `public` | 1 | 14 | file tĩnh, chép nguyên vào bản build |
| `src` (file gốc) | 3 | 415 | điểm vào, khung ứng dụng, CSS |
| `src/app` | 8 | 1 019 | trạng thái, lưu trữ, Web Worker, thông điệp tiếng Việt |
| `src/components` | 17 | 2 155 | giao diện React |
| `src/lib/parser` | 5 | 691 | văn bản → môn / nhóm / buổi học |
| `src/lib/timing` | 6 | 452 | mặt nạ bit thời gian, kiểm tra trùng giờ |
| `src/lib/solver` | 11 | 1 588 | tìm top-K lịch |
| `src/lib/view` | 5 | 469 | hàm hiển thị thuần |
| `src/lib/export` | 3 | 317 | `.ics`, bố cục ảnh PNG, giờ các tiết |
| `tests` | 17 | 3 893 | 16 file test + 1 file tiện ích |
| `tests/fixtures` | 6 | 466 | dữ liệu thật copy từ trang đăng ký |
| **Tổng** | **98** | **16 015** | |

---

## 2. Giải thích từng thư mục

### Quy tắc phụ thuộc (quan trọng nhất khi trình bày)

`src/lib/**` **không import React và không chạm API trình duyệt** (không `window`, `document`, `localStorage`, `navigator`). Nhờ vậy mọi phần quan trọng — đọc dữ liệu, kiểm tra trùng giờ, tìm lịch, chấm điểm, xuất `.ics` — chạy và được test trong Node thuần, không cần mở trình duyệt. Hai ngoại lệ có chủ ý:
- `src/lib/solver/worker.ts` (11 dòng) dùng `self` của Web Worker; toàn bộ logic của nó nằm trong `protocol.ts` nên vẫn test được không cần Worker.
- `solve.ts` đo thời gian bằng `performance.now()`, hàm này có sẵn cả trong Node.

Các tầng chỉ phụ thuộc xuống dưới, không bao giờ ngược lên (kiểm bằng `grep` trên các dòng `import`):

```
parser  ←  timing  ←  solver  ←  view  ←  export          (src/lib, thuần)
                                   ↑
                         src/app  (trạng thái, Worker, localStorage)
                                   ↑
                         src/components  ←  src/App.tsx  ←  src/main.tsx
```

### `src/lib/parser/` — đọc dữ liệu
- **Sở hữu:** biến văn bản copy từ trang đăng ký môn học thành `Course[]` cùng danh sách cảnh báo có mã.
- **Vì sao tách riêng:** định dạng trang trường là thứ dễ đổi nhất; mọi hiểu biết về nó nằm ở một chỗ, phía sau một hàm `parse()` không bao giờ ném lỗi.
- **Phục vụ:** B1, B2; kỹ thuật *parser*.

### `src/lib/timing/` — thời gian dạng bit
- **Sở hữu:** mặt nạ bit 3 360 ô (30 tuần × 7 ngày × 16 tiết) cho mỗi nhóm, phép kiểm tra trùng giờ, và luật "bản dán sau thắng" khi một môn hoặc nhóm xuất hiện hai lần.
- **Vì sao tách riêng:** luật trùng giờ là luật miền ("cùng ngày VÀ chung tiết VÀ chung tuần"); đặt riêng thì solver chỉ cần hỏi "hai nhóm có chung bit không".
- **Phục vụ:** B2 (cảnh báo trùng lặp), B4; kỹ thuật *bitmask*.

### `src/lib/solver/` — tìm lịch
- **Sở hữu:** lọc theo yêu cầu, gộp nhóm tương đương, tìm kiếm quay lui với MRV và forward checking, chấm điểm tăng dần, nới yêu cầu, chẩn đoán; cùng giao thức với Web Worker.
- **Vì sao tách riêng:** đây là phần thuật toán; là hàm thuần `solve(courses, prefs)` nên so được với một bộ duyệt vét cạn trong test.
- **Phục vụ:** B3 → B4, B5 (khi "Đã đầy" chạy lại); kỹ thuật *backtracking, MRV, forward checking, gộp nhóm, chấm điểm tăng dần, nới yêu cầu, Web Worker*.

### `src/lib/view/` — dữ liệu để hiển thị
- **Sở hữu:** các hàm thuần biến kết quả thành thứ để vẽ: khối trên lưới tuần, nhãn tuần, định dạng chữ tiếng Việt, bảng màu, văn bản danh sách đăng ký.
- **Vì sao tách riêng:** logic hiển thị (ví dụ "lab học tuần 6,10,12,14") test được mà không cần render React.
- **Phục vụ:** B2, B4, B5.

### `src/lib/export/` — xuất lịch
- **Sở hữu:** tệp `.ics` theo RFC 5545, bố cục ảnh PNG (chỉ là dữ liệu: hình chữ nhật, chữ), giờ thực của từng tiết.
- **Vì sao tách riêng:** cùng một lịch luôn cho cùng một tệp (đồng hồ được truyền vào), nên test so sánh được từng dòng.
- **Phục vụ:** B5; kỹ thuật *export*.

### `src/app/` — tầng ứng dụng
- **Sở hữu:** reducer (toàn bộ trạng thái màn hình), khoá / loại nhóm, lưu `localStorage`, chia văn bản dán theo môn, hook `useSolver` bọc Web Worker, thông điệp tiếng Việt, sao chép / tải tệp, vẽ PNG lên canvas.
- **Vì sao tách riêng:** đây là nơi *duy nhất* (cùng `App.tsx` và các component) chạm tới trình duyệt; phần lớn vẫn là hàm thuần (reducer, `selection.ts`) nên được test kỹ.
- **Phục vụ:** cả 5 bước; kỹ thuật *Web Worker*.

### `src/components/` — giao diện
- **Sở hữu:** các component React (Tailwind v4, màu Catppuccin Mocha tiền tố `ctp-`).
- **Vì sao tách riêng:** không chứa logic nghiệp vụ; mọi thứ cần test nằm ở `lib/` hoặc `app/`.
- **Phục vụ:** cả 5 bước.

### `src/` (file gốc)
- **Sở hữu:** `main.tsx` gắn React vào trang, `App.tsx` ghép 5 bước, `index.css` định nghĩa màu và kiểu in.

### `tests/` — kiểm thử
- **Sở hữu:** 16 file test Vitest (401 test) và `fixtureText.ts` để đọc dữ liệu mẫu.
- **Vì sao tách riêng:** cấu hình Vitest chỉ chạy `tests/**/*.test.{ts,tsx}`; thư viện chạy trong Node, test giao diện bật jsdom bằng dòng chú thích `// @vitest-environment jsdom`.
- **Phục vụ:** mọi kỹ thuật; đáng nhắc nhất là test so sánh với bộ vét cạn (`bruteForce` trong `solver.test.ts`).

### `tests/fixtures/` — dữ liệu thật
- **Sở hữu:** 6 môn copy nguyên văn từ trang đăng ký môn học. **Không bao giờ tự gõ hay bịa dữ liệu**; ca biên được *suy ra* từ dữ liệu thật bằng một chỉnh sửa nhỏ có chú thích trong test.
- **Phục vụ:** parser, solver, hiệu năng.

### `.github/workflows/`
- **Sở hữu:** `ci.yml` — trên mỗi push và pull request chạy `npm ci`, `npm test`, `npm run lint`, `npx tsc -b` với Node 24. Không triển khai (triển khai do Vercel lo).

### `docs/`
- **Sở hữu:** `user-testing.md` (kịch bản thử nghiệm với sinh viên) và tài liệu này.

### `public/`
- **Sở hữu:** `favicon.svg`. Vite chép nguyên thư mục này vào `dist/`.

### Gốc repo
- **Sở hữu:** cấu hình (`package.json`, `vite.config.ts`, các `tsconfig*.json`, `.oxlintrc.json`, `.gitignore`), trang HTML gốc `index.html`, và tài liệu (`README.md` tiếng Việt cho người dùng, `SPEC.md`, `HANDOVER.md`).

---

## 3. Giải thích từng file

Cột "phụ thuộc vào" và "được dùng bởi" lấy từ các dòng `import` thật. `parser`, `timing`, `solver` nghĩa là import qua `index.ts` của thư mục đó.

### 3.1 `src/lib/parser/`

| File | Vai trò | Phụ thuộc vào | Được dùng bởi | Bước / kỹ thuật |
|---|---|---|---|---|
| `types.ts` | Kiểu dữ liệu `Day`, `Session`, `Group`, `Course`, `ParseWarning` (có `code`, `params`), `ParseResult` | — | `parse.ts`, `program.ts`, mọi tầng trên | mô hình dữ liệu |
| `parse.ts` | Hàm `parse(text)`: văn bản → `{ courses, warnings }`, không bao giờ ném lỗi | `types.ts` | `index.ts` | B1–B2, parser |
| `program.ts` | `programOf(group)`: chương trình đào tạo là chữ cái đầu của mã nhóm lý thuyết (`L`, `A`, `CC`, `TN`) | `types.ts` | `index.ts` → `solver/filter.ts`, `solver/solve.ts`, `view/format.ts`, `app/messages.ts` | B3 (thẻ "Chương trình") |
| `index.ts` | Gom và xuất lại ba file trên | ba file trên | `timing`, `solver`, `view`, `export`, `app`, components, tests | — |
| `README.md` | Định dạng đầu vào, các loại dòng, cảnh báo | — | người đọc | — |

**`parse.ts` — ý tưởng.** Mỗi dòng không trống được xếp vào đúng một loại (dòng tóm tắt, tiêu đề môn, dòng nhóm, dòng buổi học, các dòng tiêu đề bảng) bằng biểu thức chính quy; dòng không nhận ra thì sinh cảnh báo có mã, không dừng lại. Dòng có tab được đọc theo vị trí cột; nếu cột lệch (tab bị đổi thành dấu cách khi copy) thì đọc theo từ quanh các "mốc" cố định như mã nhóm, `34/40`, mã phòng. Chuỗi tuần 30 ký tự được đọc theo **vị trí** (ký tự thứ *i* là tuần *i*+1); buổi có các tuần không liền nhau được coi là buổi thực hành (`kind: "lab"`), vì cột BT/TN trên trang trường không đáng tin.

### 3.2 `src/lib/timing/`

| File | Vai trò | Phụ thuộc vào | Được dùng bởi | Bước / kỹ thuật |
|---|---|---|---|---|
| `constants.ts` | `MAX_WEEK = 30`, `DAYS = 7`, `PERIODS = 16`, `TOTAL_BITS = 3360`, `MASK_WORDS = 105` | — | `mask.ts`, `build.ts`, `conflicts.ts` | bitmask |
| `mask.ts` | Tạo, đặt, đọc và giao các mặt nạ bit (`bitIndex`, `setSlot`, `intersects`, `popcount`) | `constants.ts`, `parser` | `build.ts`, `conflicts.ts` | bitmask |
| `build.ts` | `buildMasks(courses)`: một mặt nạ cho mỗi nhóm, khoá nhóm `"CO2007:A01_A01"`, luật bản sau thắng, cảnh báo | `mask.ts`, `constants.ts`, `parser` | `index.ts` → `solver/protocol.ts`, tests | B2, bitmask |
| `conflicts.ts` | `conflicts(a, b)` và tóm tắt chỗ trùng ("Thứ 2 tiết 2–3, tuần 1–7") | `build.ts`, `mask.ts`, `parser` | `index.ts` → `solver/solve.ts` (kiểm tra cuối), tests | B4 (chẩn đoán) |
| `index.ts` | Xuất lại | các file trên | `solver`, `app`, tests | — |
| `README.md` | Bố cục bit, luật trùng giờ | — | người đọc | — |

**`mask.ts` — ý tưởng.** Mỗi ô (tuần, thứ, tiết) là một bit, vị trí `((tuần−1)×7 + (thứ−2))×16 + (tiết−1)`, cả học kỳ vừa trong một `Uint32Array(105)`. Hai nhóm trùng giờ **khi và chỉ khi** hai mặt nạ có chung một bit, nên kiểm tra trùng chỉ là AND 105 từ và dừng ngay ở từ đầu tiên khác 0. Vì 16 tiết bằng đúng nửa từ 32 bit, mỗi (tuần, thứ) là nửa từ, và bộ chấm điểm tận dụng điều đó.

### 3.3 `src/lib/solver/`

| File | Vai trò | Phụ thuộc vào | Được dùng bởi | Bước / kỹ thuật |
|---|---|---|---|---|
| `types.ts` | `Preferences`, `CONSTRAINTS` (7 yêu cầu), `Schedule`, `SolveResult`, `DEFAULT_PREFERENCES`, `normalizePreferences` | `constants.ts`, `parser`, `timing` | mọi file solver, `app/state.ts`, `app/storage.ts` | B3 |
| `constants.ts` | Khung giờ (`MORNING` 1–6, `AFTERNOON` 7–12, `EVENING` 13–16, `EARLY` 1–2), `RELAX_WEIGHT = 1000`, `IDLE_PER_DAY = 11`, mặc định top-K và `maxNodes` | — | `filter.ts`, `score.ts`, `solve.ts`, `types.ts` | chấm điểm, nới yêu cầu |
| `filter.ts` | Vị từ "nhóm có vi phạm yêu cầu X không" (`violates`), luật khoá / loại nhóm (`applyHardRules`), lọc (`applyConstraints`) | `constants.ts`, `types.ts`, `parser`, `timing` | `equivalence.ts`, `score.ts`, `solve.ts` | B3 → B4 |
| `equivalence.ts` | Gộp các nhóm luôn được chấm điểm như nhau thành một lớp | `filter.ts`, `score.ts`, `types.ts`, `timing` | `search.ts`, `solve.ts` | gộp nhóm tương đương |
| `score.ts` | Đặc trưng của từng nhóm, bộ chấm điểm đầy đủ (tham chiếu) và bộ chấm điểm tăng dần | `constants.ts`, `filter.ts`, `types.ts`, `timing` | `equivalence.ts`, `search.ts`, `solve.ts` | chấm điểm tăng dần |
| `search.ts` | DFS theo thứ tự MRV với forward checking, giữ top-K | `equivalence.ts`, `score.ts`, `timing` | `solve.ts` | backtracking, MRV, forward checking |
| `solve.ts` | Quy trình chặt → nới → không có lời giải, cùng chẩn đoán | gần như mọi file solver, `parser`, `timing` | `protocol.ts`, `index.ts` | nới yêu cầu |
| `protocol.ts` | Kiểu tin nhắn với Worker và `handleRequest` | `solve.ts`, `types.ts`, `parser`, `timing` | `worker.ts`, `app/useSolver.ts`, `app/state.ts` | Web Worker |
| `worker.ts` | Điểm vào của Worker: một yêu cầu vào, một phản hồi ra | `protocol.ts` | `app/useSolver.ts` (`new Worker(new URL(...))`) | Web Worker |
| `index.ts` | Xuất lại mọi thứ trừ `protocol.ts` và `worker.ts` | các file trên | `app`, `view`, `export`, components, tests | — |
| `README.md` | Luật từng yêu cầu, thuật toán, công thức điểm | — | người đọc | — |

**`equivalence.ts` — ý tưởng.** Hai nhóm cùng môn mà có cùng mặt nạ thời gian, cùng cơ sở từng buổi, cùng ngôn ngữ, và cùng trạng thái với bộ lọc chương trình, còn chỗ, tránh giảng viên thì mọi lịch chứa nhóm này có đúng cùng điểm với lịch chứa nhóm kia. Vì vậy solver chỉ tìm với **một đại diện** (mã nhỏ nhất) và ghi các nhóm còn lại vào `alternatives`, để người dùng đăng ký nhóm nào cũng được. Môn SK2001 có 64 nhóm, gộp lại còn 42 lớp với yêu cầu mặc định của ứng dụng.

**`score.ts` — ý tưởng.** Năm tiêu chí thời gian (buổi sáng/chiều, ít ngày lên trường, lịch gọn, không đổi cơ sở trong ngày, tránh tiết 1–2) cùng các yêu cầu "Ưu tiên" đều là một số trong [0, 1]; `penalty = Σ trọng số × chỉ số`, còn `score = round(100 × (1 − penalty / Σ trọng số))`. Hàm `penalty()` quét đủ 30 × 7 ô và là bản tham chiếu; khi tìm kiếm, `Scorer.start()` cho một trạng thái cộng dồn: thêm nhóm (`push`) hoặc bỏ nhóm (`pop`) chỉ cập nhật những ô (tuần, thứ) mà nhóm đó chạm tới. Cùng công thức, cùng thứ tự cộng, nên kết quả bằng đúng bản quét đầy đủ, và test vét cạn kiểm tra điều này.

**`search.ts` — ý tưởng.** Các môn được xếp theo **MRV**: môn có ít lựa chọn (ít lớp tương đương) nhất được chọn trước, vì chọn sai ở môn hẹp thì phát hiện sớm. Trước khi tìm, `compatibilityTable` so mọi lựa chọn của môn này với mọi lựa chọn của mỗi môn sau, một lần, và lưu thành bitset "những lựa chọn không trùng giờ". Khi chọn một nhóm, tập lựa chọn còn sống của mọi môn phía sau được thu hẹp bằng phép AND; nếu một môn hết lựa chọn thì nhánh bị cắt ngay (**forward checking**). Năm lịch tốt nhất được giữ trong một mảng đã sắp xếp; đến `maxNodes` (5 000 000) thì dừng và đánh dấu `truncated`.

**`solve.ts` — ý tưởng.** Lần 1 (*chặt*): yêu cầu "Bắt buộc" lọc bỏ nhóm. Nếu có môn hết nhóm hoặc không tìm được lịch nào, lần 2 (*nới*): mọi yêu cầu bắt buộc thành phạt mềm với trọng số 1 000, và báo rõ yêu cầu nào đã bị nới, môn nào bị chặn. Nếu vẫn không có thì trả `infeasible` cùng lý do (ví dụ hai nhóm đã khoá trùng giờ); mọi lần thử dùng chung một ngân sách `maxNodes`, và trước khi trả về, mỗi lịch được kiểm tra lại từng cặp bằng `conflicts()`.

**`protocol.ts` — ý tưởng.** Đây là "hợp đồng" giữa giao diện và Worker: `SolveRequest { id, courses, prefs }` đi vào, `SolveResponse` (`ok: true` kèm kết quả, hoặc `ok: false` kèm lỗi tiếng Việt) đi ra, mang cùng `id` để giao diện bỏ qua phản hồi cũ. `handleRequest` = `buildMasks` + `solve` trong `try/catch`, nên Worker không bao giờ chết vì dữ liệu lạ. Vì toàn bộ logic nằm ở đây chứ không ở `worker.ts`, `tests/protocol.test.ts` test được nó mà không cần tạo Worker.

### 3.4 `src/lib/view/`

| File | Vai trò | Phụ thuộc vào | Được dùng bởi | Bước / kỹ thuật |
|---|---|---|---|---|
| `format.ts` | Nhãn tiếng Việt (thứ, bước, yêu cầu), định dạng tuần / tiết / tín chỉ, huy hiệu chương trình, tuổi dữ liệu dán ("12 phút trước") | `parser` | gần như mọi component, `app/messages.ts`, `export` | B1–B5 |
| `grid.ts` | Lịch → các khối trên lưới tuần, lọc theo tuần, nhãn tuần ("tuần 6,10,12,14"), xếp khối chồng nhau cạnh nhau | `format.ts`, `parser`, `solver` | `TimetableGrid.tsx`, `DayList.tsx`, `WeekSelector.tsx`, `export/image.ts` | B4, B5 |
| `summary.ts` | Nhãn tab "Lịch 1 · 98 điểm" hoặc "Lịch 2 · ⚠ 1 yêu cầu", các vi phạm, môn có dữ liệu cũ | `format.ts`, `solver` | `ResultTabs.tsx`, `PickList.tsx`, `ScoreBreakdown.tsx`, `App.tsx` | B4 |
| `checklist.ts` | Văn bản "Sao chép tất cả" (`CO2007  L01_L02`) và tổng tín chỉ | `solver` | `Checklist.tsx` | B5 |
| `palette.ts` | Bản sao màu Catppuccin Mocha cho canvas PNG và cho test tương phản | — | `courseColor.ts`, `export/image.ts`, `tests/contrast.test.ts` | B5 |

### 3.5 `src/lib/export/`

| File | Vai trò | Phụ thuộc vào | Được dùng bởi | Bước / kỹ thuật |
|---|---|---|---|---|
| `periods.ts` | Giờ thực của tiết: tiết *n* bắt đầu lúc (*n*+5):00, dài 50 phút | — | `ics.ts` | export |
| `ics.ts` | Lịch → tệp `.ics` (RFC 5545, múi giờ Asia/Ho_Chi_Minh), mỗi sự kiện là một dãy tiết liền nhau trong một tuần | `periods.ts`, `view/format.ts`, `parser`, `solver` | `App.tsx`, `ExportPanel.tsx` | B5, export |
| `image.ts` | Bố cục ảnh PNG rộng 1080 px dưới dạng dữ liệu (hình, chữ) | `view/grid.ts`, `view/format.ts`, `view/palette.ts` | `App.tsx`, `app/imageExport.ts` | B5, export |

### 3.6 `src/app/`

| File | Vai trò | Phụ thuộc vào | Được dùng bởi | Bước / kỹ thuật |
|---|---|---|---|---|
| `state.ts` | Reducer với toàn bộ trạng thái (bước, bản dán, yêu cầu, kết quả, khoá…), `defaultPrefs()` của ứng dụng | `pastes.ts`, `selection.ts`, `solver`, `solver/protocol.ts`, `timing` | `App.tsx`, `useSolver.ts`, `storage.ts`, nhiều component | B1–B5 |
| `pastes.ts` | Chia văn bản dán thành từng môn (`splitByCourse`), gộp với bản cũ, đọc lại bằng `parse` | `parser` | `state.ts`, `App.tsx`, `PasteInput.tsx`, `CoursePreview.tsx` | B1–B2 |
| `selection.ts` | Đại số khoá / loại nhóm, "Đã đầy" (tự khoá các môn khác), "Đã đăng ký" | `pastes.ts` | `state.ts`, `storage.ts`, `SelectionsCard.tsx` | B2, B4, B5 |
| `storage.ts` | Lưu / đọc `localStorage` khoá `tkb:v1`; dữ liệu hỏng thì về mặc định; không lưu kết quả | `state.ts`, `pastes.ts`, `selection.ts`, `solver` | `App.tsx` | cả 5 bước |
| `useSolver.ts` | Hook bọc Web Worker: `run`, `cancel`, hết giờ sau 15 giây thì khởi động lại Worker | `state.ts`, `solver/protocol.ts`, `solver/worker.ts` | `App.tsx` | B3 → B4, Web Worker |
| `messages.ts` | Biến mã cảnh báo / chẩn đoán thành câu tiếng Việt (tiếng Anh khi gặp mã lạ) | `view/format.ts`, `parser`, `timing`, `solver` | `CoursePreview.tsx`, `StatusBanner.tsx` | B2, B4 |
| `browser.ts` | Tải tệp và sao chép văn bản, không bao giờ ném lỗi | — | `App.tsx` | B5 |
| `imageExport.ts` | Vẽ bố cục PNG lên canvas rồi mã hoá thành ảnh | `export/image.ts` | `App.tsx` | B5, export |

### 3.7 `src/components/`

| File | Vai trò | Phụ thuộc vào | Được dùng bởi | Bước |
|---|---|---|---|---|
| `PasteInput.tsx` | Ô dán, hướng dẫn, danh sách môn đã thêm | `app/pastes.ts`, `app/state.ts`, `ui.tsx` | `App.tsx` | B1 |
| `CoursePreview.tsx` | Mỗi môn một thẻ: nhóm, sĩ số, buổi học, cảnh báo, nút "Chọn nhóm này" | `app/messages.ts`, `app/pastes.ts`, `view/format.ts`, `ui.tsx` | `App.tsx` | B2 |
| `PreferencesForm.tsx` | Thẻ yêu cầu (Tắt / Bắt buộc / Ưu tiên) và thanh trọng số | `parser`, `solver`, `view/format.ts`, `ui.tsx` | `App.tsx` | B3 |
| `SelectionsCard.tsx` | Các nhóm đã khoá / đã loại, nút bỏ | `app/selection.ts`, `ui.tsx` | `App.tsx` | B3, B4 |
| `StatusBanner.tsx` | Trạng thái solver, chẩn đoán tiếng Việt, nút "Bỏ lọc chương trình" | `app/messages.ts`, `app/state.ts`, `solver`, `view/format.ts`, `ui.tsx` | `App.tsx` | B4 |
| `ResultTabs.tsx` | Các tab "Lịch 1 · 98 điểm" và lịch đang chọn | `PickList.tsx`, `ScoreBreakdown.tsx`, `TimetableSection.tsx`, `view/*`, `app/state.ts` | `App.tsx` | B4 |
| `PickList.tsx` | Nhóm được chọn của từng môn, "Giữ nhóm này", "Đã đầy — tìm nhóm khác" | `solver`, `view/format.ts`, `view/summary.ts`, `courseColor.ts`, `ui.tsx` | `ResultTabs.tsx` | B4 |
| `ScoreBreakdown.tsx` | Bảng điểm từng tiêu chí | `solver`, `view/format.ts`, `view/summary.ts`, `ui.tsx` | `ResultTabs.tsx` | B4 |
| `TimetableSection.tsx` | Chọn tuần + lưới (máy tính) hoặc danh sách theo ngày (điện thoại) | `TimetableGrid.tsx`, `DayList.tsx`, `WeekSelector.tsx`, `view/grid.ts` | `ResultTabs.tsx`, `App.tsx` | B4, B5 |
| `TimetableGrid.tsx` | Lưới tuần: cột là thứ, hàng là tiết | `view/grid.ts`, `view/format.ts`, `courseColor.ts`, `ui.tsx` | `TimetableSection.tsx` | B4, B5 |
| `DayList.tsx` | Danh sách theo ngày cho màn hình hẹp | `view/grid.ts`, `view/format.ts`, `courseColor.ts`, `ui.tsx` | `TimetableSection.tsx` | B4, B5 |
| `WeekSelector.tsx` | Chip "Tuần: Tất cả · 1 · 2 · …" | `view/grid.ts` | `TimetableSection.tsx` | B4, B5 |
| `Checklist.tsx` | Danh sách đăng ký: mã nhóm, sao chép, "Đã đăng ký", "Đã đầy" | `solver`, `view/checklist.ts`, `view/format.ts`, `courseColor.ts`, `ui.tsx` | `App.tsx` | B5 |
| `ExportPanel.tsx` | Ngày bắt đầu học kỳ, nút `.ics`, PNG, in | `export/ics.ts`, `ui.tsx` | `App.tsx` | B5 |
| `Stepper.tsx` | Thanh 5 bước | `app/state.ts`, `view/format.ts`, `ui.tsx` | `App.tsx` | B1–B5 |
| `ui.tsx` | Khối dùng chung: `Button`, `ToggleButton`, `Card`, `Badge`, `PasteAge`, biểu tượng | `view/format.ts` | gần như mọi component, `App.tsx` | — |
| `courseColor.ts` | Gán màu thứ *n* của bảng màu cho một môn qua biến CSS | `view/palette.ts` | 5 component vẽ môn | B2, B4, B5 |

### 3.8 `src/` (file gốc)

| File | Vai trò | Phụ thuộc vào | Được dùng bởi | Bước |
|---|---|---|---|---|
| `main.tsx` | Gắn `<App />` vào `#root` trong `index.html` | `App.tsx`, `index.css`, React | `index.html` | — |
| `App.tsx` | Ghép 5 bước; giữ đồng hồ (`now`, cập nhật mỗi 30 s); tự chạy lại sau khi khoá nhóm (trễ 200 ms); gọi export | `app/*`, hầu hết components, `lib/view`, `lib/export` | `main.tsx` | B1–B5 |
| `index.css` | Tailwind v4, màu Catppuccin Mocha `ctp-*`, khi in đổi sang Catppuccin Latte | — | `main.tsx`, `tests/contrast.test.ts` (đọc màu) | — |

### 3.9 `tests/`

| File | Số test | Kiểm tra gì | Phụ thuộc vào | Kỹ thuật |
|---|---|---|---|---|
| `parser.test.ts` | 48 | đọc đúng 6 fixture, bố cục tab / dấu cách, mọi mã cảnh báo | `parser`, fixtures | parser |
| `timing.test.ts` | 32 | mặt nạ, luật trùng giờ (lab tuần xen kẽ không trùng), bản sau thắng | `parser`, `timing` | bitmask |
| `solver.test.ts` | 69 | so với bộ vét cạn, MRV, gộp nhóm, nới yêu cầu, chẩn đoán | `parser`, `timing`, `solver` | backtracking, MRV, forward checking, chấm điểm |
| `shortterm.test.ts` | 10 | SK2001: 64 nhóm, 42 lớp, 0 tín chỉ, nhãn 5 tuần | `app/state.ts`, `parser`, `timing`, `solver`, `view` | gộp nhóm |
| `perf.test.ts` | 12 | 5 cấu hình trên 6 môn và trên 8 môn (6 fixture + 2 bản sao đổi mã) | `app/state.ts`, `parser`, `timing`, `solver` | hiệu năng |
| `protocol.test.ts` | 4 | `handleRequest` không cần Worker, lỗi thành tiếng Việt | `solver/protocol.ts` | Web Worker |
| `state.test.ts` | 42 | reducer, khoá / loại, "Đã đầy", phản hồi cũ bị bỏ | `app/*`, `solver` | — |
| `storage.test.ts` | 9 | `localStorage` hỏng / cũ / thiếu trường | `app/storage.ts` | — |
| `format.test.ts` | 19 | định dạng tuần, tuổi dữ liệu dán | `view/format.ts`, `view/grid.ts` | — |
| `grid.test.ts` | 11 | khối lưới, nhãn tuần | `view/grid.ts` | — |
| `summary.test.ts` | 6 | nhãn tab, vi phạm | `view/summary.ts` | — |
| `ics.test.ts` | 12 | tệp `.ics` đúng RFC 5545 | `export/ics.ts` | export |
| `image.test.ts` | 3 | bố cục PNG | `export/image.ts` | export |
| `messages.test.ts` | 8 | mọi mã có câu tiếng Việt | `app/messages.ts` | — |
| `contrast.test.ts` | 101 | độ tương phản màu ≥ 4.5:1 (chữ), ≥ 3:1 (viền) | `src/index.css`, `view/palette.ts` | — |
| `app.smoke.test.tsx` | 15 | chạy cả luồng trong jsdom: dán → khoá → "Đã đầy" → danh sách | gần như mọi thứ | toàn bộ |
| `fixtureText.ts` | — | đọc file trong `fixtures/` | Node `fs` | — |

Tổng: **401 test trong 16 file** (`npx vitest run --reporter=json`).

### 3.10 `tests/fixtures/`

| File | Số nhóm | Đặc điểm dùng để test |
|---|---|---|
| `CO2001.txt` | 4 | môn nhỏ; tên môn bị dính chữ khi copy, giữ nguyên |
| `CO2003.txt` | 19 | có đủ 4 chương trình L / A / CC / TN |
| `CO2007.txt` | 18 | có buổi thực hành học tuần xen kẽ (`A01_A01`) |
| `CO2011.txt` | 10 | chỉ lý thuyết (`L01`, không có nhóm thực hành) |
| `SK2001.txt` | 64 | môn ngắn hạn 5 tuần, 0 tín chỉ, nhiều nhóm đầy, không có L và TN |
| `SP1031.txt` | 21 | phòng hội trường (`C5-HOITRUONG`, `H1-GDH1`, `H6-GDH6`) |

### 3.11 Gốc repo, `.github`, `docs`, `public`

| File | Vai trò |
|---|---|
| `package.json` / `package-lock.json` | Lệnh `dev`, `build`, `test`, `lint`, `preview`; phụ thuộc lúc chạy chỉ có `react`, `react-dom`; yêu cầu Node `24.x` |
| `vite.config.ts` | Plugin React + Tailwind, Worker dạng ES module, cấu hình Vitest |
| `tsconfig.json` | Gom ba cấu hình: `tsconfig.app.json` (`src/`, có DOM), `tsconfig.node.json` (`vite.config.ts`), `tsconfig.test.json` (`tests/`) |
| `.oxlintrc.json` | Luật lint (oxlint), gồm luật hook của React |
| `.gitignore` | Bỏ qua `node_modules`, `dist`, `.vercel`… |
| `index.html` | Trang gốc: tiêu đề, `theme-color`, favicon, nạp `src/main.tsx` |
| `README.md` | Hướng dẫn tiếng Việt cho người dùng và cách triển khai Vercel |
| `SPEC.md` | Đặc tả sản phẩm |
| `HANDOVER.md` | Lịch sử từng phase, quyết định, số liệu hiệu năng, việc còn mở |
| `.github/workflows/ci.yml` | CI: test, lint, `tsc -b` trên Node 24 |
| `docs/user-testing.md` | Kịch bản và bảng ghi kết quả thử nghiệm với sinh viên |
| `public/favicon.svg` | Biểu tượng trang |

---

## 4. Luồng dữ liệu — một thao tác từ đầu đến cuối

Tình huống: dán **CO2007 + CO2011** cùng lúc, để yêu cầu mặc định, bấm **"Xếp lịch"**, xem kết quả. Các con số lấy từ việc chạy đúng các hàm này trên hai fixture.

1. **B1 — dán.** `src/components/PasteInput.tsx`: người dùng dán văn bản và bấm "Thêm môn" → `onAdd` trong `src/App.tsx` gửi action `addPaste` (kèm thời điểm dán) tới reducer `src/app/state.ts`.
2. `src/app/pastes.ts` → `splitByCourse` cắt văn bản thành **2 khối**, CO2007 và CO2011; mỗi khối gồm các dòng tóm tắt ngay phía trên tiêu đề môn và mọi dòng nhóm, buổi học của môn đó. `mergePastes` thêm vào danh sách.
3. `src/App.tsx` (effect) → `src/app/storage.ts` → `saveState` ghi văn bản thô, yêu cầu, khoá… vào `localStorage` khoá `tkb:v1`.
4. `src/App.tsx` (`useMemo`) → `src/app/pastes.ts` → `parsePaste` → `src/lib/parser/parse.ts` → `parse`:
   - CO2007: **18 nhóm, 36 buổi học, 4 tín chỉ, 0 cảnh báo**;
   - CO2011: **10 nhóm, 10 buổi học, 3 tín chỉ, 0 cảnh báo**.
5. **B2.** `src/components/CoursePreview.tsx` hiển thị các nhóm (nhãn từ `src/lib/view/format.ts`, cảnh báo qua `src/app/messages.ts`).
6. **B3.** `src/components/PreferencesForm.tsx` hiển thị yêu cầu mặc định của ứng dụng (`defaultPrefs` trong `src/app/state.ts`): `freeSeats` = Ưu tiên; `programs` = Bắt buộc nhưng chưa chọn chương trình nào nên không lọc gì; trọng số `fewerDays` 5, `compactDays` 3, `noCampusSwitch` 5, `avoidEarly` 3, các yêu cầu Ưu tiên 5.
7. **Bấm "Xếp lịch"** (nút trong `src/App.tsx`) → `runSolver` → `src/app/useSolver.ts` → `run(courses, prefs)`:
   - gửi `solveStart` → reducer chuyển sang **B4**, trạng thái "đang chạy";
   - `worker.postMessage({ id, courses, prefs })`: dữ liệu được *sao chép* sang luồng của Worker.
8. **Trong Worker:** `src/lib/solver/worker.ts` → `src/lib/solver/protocol.ts` → `handleRequest`:
   1. `src/lib/timing/build.ts` → `buildMasks` (dùng `mask.ts`): mỗi nhóm một mặt nạ 3 360 bit (105 từ). Ví dụ `CO2007:A01_A01` (Thứ 2 tiết 2–4, 15 tuần, cộng thực hành Thứ 2 tiết 8–12 các tuần 6, 10, 12, 14) bật **65 bit** (3 × 15 + 5 × 4). 0 cảnh báo.
   2. `src/lib/solver/solve.ts` → `solve`: `normalizePreferences` (`types.ts`); `applyHardRules` / `applyConstraints` (`filter.ts`) — không có yêu cầu bắt buộc nào đang hoạt động; `buildCandidates` (`equivalence.ts`) — CO2011 **10 lớp**, CO2007 **18 lớp** (không gộp được nhóm nào); `createScorer` (`score.ts`).
   3. `src/lib/solver/search.ts`: `orderByMrv` → **CO2011 (10) trước CO2007 (18)**; `compatibilityTable` so 10 × 18 = **180 cặp, 22 cặp trùng giờ**; DFS thử **168 nút** (10 nhóm CO2011 + 158 cặp không trùng), giữ 5 lịch tốt nhất.
   4. Quay lại `solve.ts`: `explain` tính bảng điểm, `isConflictFree` kiểm tra lại từng lịch → `status: "ok"`, 5 lịch, không chẩn đoán.
9. Worker gửi `SolveResponse` về → `src/app/useSolver.ts` (`onmessage`, bỏ qua nếu `id` đã cũ) → `responseAction` → reducer `solveDone` (`src/app/state.ts`) lưu kết quả.
10. **B4 — xem kết quả.** `src/App.tsx` → `src/components/StatusBanner.tsx` và `src/components/ResultTabs.tsx`:
    - nhãn tab từ `src/lib/view/summary.ts`: **"Lịch 1 · 98 điểm"**;
    - lịch 1 = **CO2007:L04_L08 (29/40) + CO2011:L03 (110/120)**; `src/components/PickList.tsx` hiển thị hai nhóm này;
    - `src/components/ScoreBreakdown.tsx`: `fewerDays` 5 × 0,0444 + `compactDays` 3 × 0,0718 = penalty 0,4375; tổng trọng số 21 (5 + 3 + 5 + 3 + 5 cho `freeSeats`), điểm = round(100 × (1 − 0,4375 / 21)) = **98**;
    - `src/lib/view/grid.ts` → `toGridBlocks` → `src/components/TimetableSection.tsx` → `TimetableGrid.tsx` (máy tính) hoặc `DayList.tsx` (điện thoại).

Bốn lịch còn lại: 97, 96, 96, 96 điểm (ví dụ lịch 2 = CO2007:CC01_CC01 + CO2011:CC04).

---

## 5. Những chỗ khó giải thích

### Bitmask (mặt nạ bit)
Mỗi học kỳ có 30 tuần × 7 ngày × 16 tiết = 3 360 "ô"; mỗi nhóm lớp được biểu diễn bằng một dãy 3 360 công tắc, bật ở những ô nhóm đó có học. Hai nhóm trùng giờ khi và chỉ khi có một công tắc cùng bật ở cả hai, và máy tính kiểm tra điều đó bằng một phép AND trên 105 số 32 bit thay vì so từng buổi học.
- **Nếu bị hỏi thêm:** `CO2007:A01_A01` bật 65 ô; giữa 18 nhóm CO2007 và 10 nhóm CO2011 có 180 cặp, trong đó 22 cặp trùng giờ. Lab học tuần xen kẽ cùng phòng cùng giờ không bị tính là trùng, vì khác tuần thì khác bit.

### Backtracking + MRV
Máy chọn nhóm cho từng môn một; nếu đến một môn mà không còn nhóm nào hợp thì quay lại môn trước, thử nhóm khác (quay lui). MRV nghĩa là bắt đầu từ môn có ít lựa chọn nhất, giống như xếp chỗ ngồi thì xếp người khó tính nhất trước.
- **Nếu bị hỏi thêm:** với CO2007 + CO2011, MRV chọn CO2011 (10 lựa chọn) trước CO2007 (18): tìm kiếm thử 10 + 158 = 168 nút (158 = số cặp nhóm không trùng giờ); đi ngược thứ tự thì là 18 + 158 = 176. Test "orders courses by MRV" trong `tests/solver.test.ts` kiểm tra đúng con số `10 + số cặp không trùng`.

### Forward checking (kiểm tra trước)
Mỗi khi chọn một nhóm, máy gạch ngay khỏi danh sách của mọi môn còn lại những nhóm trùng giờ với nhóm vừa chọn. Nếu một môn bị gạch hết thì biết ngay nhánh này hỏng, quay lại luôn, khỏi đi tiếp rồi mới phát hiện.
- **Nếu bị hỏi thêm:** 6 môn, yêu cầu mặc định: số nút giảm từ 2 778 034 xuống 1 347 479 (−51,5 %), nhưng vẫn ra đúng 1 278 259 lịch hoàn chỉnh và cùng 5 lịch tốt nhất. Với 8 môn mà không có yêu cầu bắt buộc nào, tìm hết cần 19 638 693 nút, vượt giới hạn 5 000 000, nên kết quả bị đánh dấu "chưa tìm hết".

### Gộp nhóm tương đương
Nếu hai nhóm của cùng một môn học cùng giờ, cùng cơ sở, cùng ngôn ngữ và giống nhau về mọi yêu cầu, thì đổi nhóm này lấy nhóm kia không làm lịch tốt hơn hay tệ đi. Máy chỉ xét một nhóm đại diện, rồi báo cho người dùng rằng nhóm kia cũng đăng ký được.
- **Nếu bị hỏi thêm:** SK2001 có 64 nhóm, gộp lại còn 42 lớp. Khi nhóm đại diện "Đã đầy", ứng dụng gợi ý "Có thể đăng ký nhóm tương đương" trước khi xếp lại.

### Web Worker
Việc tìm lịch có thể tốn hàng triệu bước; nếu chạy chung luồng với giao diện thì trang bị đơ, không bấm được gì. Web Worker là một luồng chạy nền: giao diện gửi đề bài sang, Worker tính rồi gửi kết quả về, còn trang vẫn phản hồi bình thường.
- **Nếu bị hỏi thêm:** 6 môn với yêu cầu mặc định, solver chạy 236–311 ms (đo trong Vitest); nếu quá 15 giây (`SOLVE_TIMEOUT_MS`), Worker bị dừng và khởi động lại. Mỗi yêu cầu có `id`, phản hồi của yêu cầu cũ bị bỏ qua.

### Chấm điểm tăng dần
Thay vì chấm lại cả thời khoá biểu từ đầu mỗi khi thử một tổ hợp, máy giữ sẵn các con số tổng (bao nhiêu ngày lên trường, bao nhiêu tiết trống…) và chỉ cộng / trừ phần mà nhóm vừa thêm hoặc vừa bỏ chạm tới. Kết quả giống hệt cách chấm đầy đủ, chỉ nhanh hơn rất nhiều.
- **Nếu bị hỏi thêm:** với 6 môn, máy chấm 1 278 259 lịch hoàn chỉnh trong 236–311 ms. Ví dụ lịch 1 của CO2007 + CO2011: penalty 0,4375 trên tổng trọng số 21 → 98 điểm.

### Nới yêu cầu
Khi không lịch nào thoả hết các yêu cầu "Bắt buộc", ứng dụng không trả lời "không có kết quả" mà biến các yêu cầu đó thành điểm phạt rất nặng (1 000) rồi tìm lại. Người dùng nhận được lịch gần đúng nhất, kèm danh sách yêu cầu nào đã bị vi phạm.
- **Nếu bị hỏi thêm:** CO2007 + SK2001 với "Chương trình = L, Bắt buộc": SK2001 không có nhóm L, nên ứng dụng báo "SK2001 … chỉ có A, CC" (`course-no-program`), nới yêu cầu và trả lịch CO2007:L04_L07 + SK2001:CC03, penalty 500,482 = 1 000 × ½ môn vi phạm + 0,482 phạt mềm; trên giao diện có nút "Bỏ lọc chương trình".
