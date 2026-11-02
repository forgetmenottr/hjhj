# Việc còn lại

Danh sách tự làm theo thứ tự, không cần AI. Làm xong bước nào thì đánh dấu `[x]` bước đó.

## 0. Đẩy các commit đang nằm trên máy

- [ ] Mở terminal trong thư mục `hjhj`, chạy:
  ```bash
  git status
  git push
  ```
  Nhập passphrase của SSH key khi được hỏi.
- [ ] Kiểm tra: `git status` phải báo `Your branch is up to date with 'origin/main'`, và lệnh sau không in ra gì:
  ```bash
  git log --oneline origin/main..HEAD
  ```

## 1. Tạo tài khoản Vercel và triển khai

- [ ] Vào https://vercel.com → **Sign Up** → **Continue with GitHub** → chọn gói **Hobby** (miễn phí).
- [ ] **Add New → Project** → chọn repo **`hjhj`** → **Import**.
  - Nếu không thấy `hjhj` trong danh sách: cấp cho Vercel quyền đọc repo này trên GitHub (Vercel hiện liên kết để chỉnh quyền ngay trên trang import).
- [ ] Ở trang cấu hình, **Framework Preset** phải tự hiện **Vite**. Giữ nguyên:
  - Build Command: `npm run build`
  - Output Directory: `dist`
- [ ] Bấm **Deploy**, đợi xong, mở URL dạng `https://<tên-dự-án>.vercel.app/`.
- [ ] Thử nhanh trên URL đó: dán một môn → "Xếp lịch" → có kết quả.

## 2. Sửa link trong README

- [ ] Mở `README.md`, thay dòng
  ```
  Trang web: `https://<tên-dự-án>.vercel.app/`
  ```
  bằng URL thật vừa có.
- [ ] Commit và push ngay:
  ```bash
  git add README.md
  git commit -m "docs: link Vercel thật"
  git push
  ```

## 3. Tắt GitHub Pages

Bản cũ vẫn chạy ở `https://forgetmenottr.github.io/hjhj/` và sẽ không được cập nhật nữa, nên tắt đi để chỉ còn một site.

- [ ] Trên GitHub: repo `hjhj` → **Settings** → **Pages** → **Source** = **None** → lưu.
- [ ] Đợi vài phút rồi mở lại `https://forgetmenottr.github.io/hjhj/`: phải báo 404.

## 4. Kiểm tra CI

- [ ] Trên GitHub: repo `hjhj` → tab **Actions** → workflow **CI**.
- [ ] Lần chạy mới nhất (của commit vừa push) phải có dấu ✓ xanh ở job **"Test, lint, typecheck"**. Trên trang commit cũng thấy ✓ cạnh mã commit.
- [ ] Nếu ✗ đỏ: bấm vào job để xem bước nào lỗi, rồi chạy lại đúng các bước đó trên máy:
  ```bash
  npm ci
  npm test
  npm run lint
  npx tsc -b
  ```
  Sửa, commit, push, rồi xem lại tab Actions.

## 5. Mock test với khoảng 15 sinh viên

- [ ] Đọc `docs/user-testing.md` (kịch bản, 3 nhiệm vụ, cách đo).
- [ ] Bảng kết quả trong file đó mới có 10 dòng: thêm các dòng 11–15 trước khi bắt đầu.
- [ ] Mỗi buổi khoảng 30 phút, một sinh viên một lần, dùng URL Vercel, cửa sổ ẩn danh. Không hướng dẫn trừ khi sinh viên bí quá 2 phút (và ghi lại là một lỗi).
- [ ] Điền bảng ngay sau mỗi buổi, rồi điền phần **Tổng hợp** khi xong cả nhóm.
- [ ] Commit và push kết quả:
  ```bash
  git add docs/user-testing.md
  git commit -m "docs: kết quả thử nghiệm với sinh viên"
  git push
  ```

## 6. Luôn push ngay sau mỗi commit

Sáu commit làm ngày 28/09/2026 đã mất vì chỉ nằm trên máy, chưa push, rồi máy hỏng. Từ giờ:

- [ ] Sau **mỗi** `git commit` là `git push` ngay.
- [ ] Trước khi tắt máy, chạy `git status`. Nếu thấy `Your branch is ahead of 'origin/main' by N commits` thì vẫn còn commit chưa push: chạy `git push`.
