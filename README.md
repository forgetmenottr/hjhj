# Xếp thời khoá biểu HCMUT

Ứng dụng web giúp sinh viên HCMUT chọn nhóm lớp cho 5–6 môn trong đợt đăng ký môn học. Bạn dán dữ liệu copy từ **trang đăng ký môn học**, chọn yêu cầu (cơ sở, ngày nghỉ, ngôn ngữ, còn chỗ, tránh giảng viên…), và ứng dụng tìm các thời khoá biểu không trùng giờ phù hợp nhất. Nếu không lịch nào đáp ứng hết yêu cầu, ứng dụng đưa ra lịch gần nhất và ghi rõ yêu cầu nào bị vi phạm.

Trang web: `https://forgetmenottr.github.io/hjhj/` 

## Các bước sử dụng

1. **Dán dữ liệu.** Mở trang đăng ký môn học, tìm môn, bôi đen và copy **cả khối** từ dòng `STT` đến hết danh sách nhóm lớp, rồi dán vào ô và bấm “Thêm môn”.
   - Có thể dán **từng môn một**, hoặc **nhiều môn cùng lúc** (mỗi môn có dòng `STT` và dòng tóm tắt riêng; số `STT` lặp lại cũng không sao).
   - Dán lại một môn sẽ thay bản cũ (ví dụ để cập nhật số đã đăng ký).
   - Chỉ hỗ trợ trang **đăng ký môn học**; trang kết quả đăng ký không dùng được.
2. **Kiểm tra.** Xem lại nhóm lớp, lịch học và cảnh báo khi đọc dữ liệu. Nếu đã biết sẽ học nhóm nào, bấm “Chọn nhóm này”.
3. **Yêu cầu.** Đặt từng yêu cầu là *Bắt buộc* hoặc *Ưu tiên*, và chỉnh mức độ mong muốn (ít ngày lên trường, lịch gọn, tránh tiết 1–2…).
4. **Kết quả.** Xem 5 lịch tốt nhất dạng lưới theo tuần (chọn “Tất cả” hoặc từng tuần), điểm và vi phạm. “Giữ nhóm này” để khoá một nhóm; lịch được xếp lại tự động.
5. **Đăng ký.** Danh sách mã nhóm cần đăng ký, nút sao chép, ô “Đã đăng ký”. Nếu nhóm đã đầy khi đăng ký, bấm “Đã đầy — tìm nhóm khác”: ứng dụng loại nhóm đó, giữ nguyên các môn còn lại và xếp lại. Xuất lịch ra tệp `.ics` (Google Calendar, Lịch điện thoại), ảnh PNG hoặc in.

## Quyền riêng tư

Mọi dữ liệu nằm **trong trình duyệt của bạn**. Ứng dụng không có máy chủ, không cần tài khoản và không gửi dữ liệu đi đâu. Nội dung đã dán, yêu cầu và danh sách đã đăng ký được lưu trong `localStorage` của trình duyệt (khoá `tkb:v1`); xoá dữ liệu trang web là xoá hết.

## Phát triển

Cần Node.js 24 (hoặc ≥ 20.19).

```bash
npm install
npm run dev       # máy chủ phát triển: http://localhost:5173/
npm test          # Vitest: parser, timing, solver, giao diện (jsdom), tương phản màu…
npm run lint      # oxlint
npm run build     # tsc -b rồi build vào dist/ (base = /tkb_web/)
npm run preview   # xem bản build: http://localhost:4173/tkb_web/
```

## Cấu trúc

```
src/lib/parser/   đọc văn bản copy từ trang đăng ký → môn, nhóm, buổi học (+ cảnh báo có mã)
src/lib/timing/   mặt nạ bit thời gian (30 tuần × 7 ngày × 16 tiết), kiểm tra trùng giờ
src/lib/solver/   tìm top-K lịch: lọc, gộp nhóm tương đương, DFS + bảng xung đột, chấm điểm tăng dần, nới yêu cầu
src/lib/export/   tệp .ics (RFC 5545), bố cục ảnh PNG, giờ các tiết
src/lib/view/     hàm hiển thị thuần: khối lưới, nhãn tuần, định dạng, bảng màu
src/app/          reducer, lưu trữ, Web Worker (useSolver), thông điệp tiếng Việt, sao chép / tải tệp
src/components/   giao diện React (Tailwind, Catppuccin Mocha)
tests/            Vitest; tests/fixtures/ là dữ liệu thật copy từ trang đăng ký
```

p/s: 1g sáng khó ngủ và tôi còn dư usage và không hiểu sao github không cho deploy page khi private nữa nên là dìa dia :)))), just dgaf about this but if ur reading this line i know you did gaf
