# 0012 · 清理没用上的药方照片（FIX-8）

- 状态：已实现
- 日期：2026-11-08
- 作者：Hao、Claude

## 1. 问题

拍照识别时，照片先上传到 Supabase Storage（私有 bucket `prescription-photos`，路径 `<药柜 id>/<uuid>.<扩展名>`），再识别。用户识别完没有保存药方就离开，照片就一直留在存储里，没有任何药方用它。线上冒烟测试每次手动测识别也会留一张。（删除药方时照片本来就会立刻删掉，见 §3。）

## 2. 决定（2026-11-08 Hao）

- **没挂到任何药方上、超过 7 天的照片删掉**。留 7 天：用户隔几天回来补录还来得及
- 不是定时任务：每次有人**拍照识别成功**或**保存药方**时，顺手清理本药柜的（见 §3）。这个药柜一直没人用，照片就先留着，不影响别人

## 3. 做法

**为什么不是定时任务**：Storage 里的文件只能通过 Storage API 删（直接删 `storage.objects` 的行不会删掉文件），全站定时清理需要管理员密钥（service role key）。现在 App 服务器上没有这个密钥，也不想为了清理照片把它放到 Vercel 上。所以改成**顺手清理**：用当前用户自己的权限，只删他自己药柜里的。

- 新表 `photo_uploads(path, workspace_id, uploaded_by, created_at)`：每次上传照片记一行。按药柜隔离（RLS 用 `is_member`），只能查、加、删，不能改；`path` 的第一段必须是 `workspace_id`
- 函数 `stale_photo_paths(p_days default 7)`：本药柜里超过 `p_days` 天、没有任何药方的 `photo_path` 指向它的照片（`security invoker`，RLS 照常生效），一次最多 50 张
- 拍照识别成功（`/api/parse-prescription`）和保存药方（`createPrescription`）**返回之后**（`after()`，不拖慢用户）调用 `cleanupStalePhotos()`：取出这些路径 → Storage API 删文件 → 删 `photo_uploads` 的行。失败了只记日志，下次再试
- 识别全部失败（502）时不清理：那条路径上识别之后没有再查数据库，登录状态如果要刷新，会在响应之后才刷新，新的 cookie 写不回浏览器，可能把用户登出
- 已有的照片：migration 在线上（有 `storage` schema 时）把 `storage.objects` 里这个 bucket 的照片补登记进 `photo_uploads`（用照片原来的上传时间），之后照常清理

**删药方时**：和以前一样，照片立刻删（`deletePrescription`），登记也一起删。

**部署时的小缝**：CI 先执行 migration、再部署代码。两步之间（几分钟）旧代码上传的照片不会登记，补登记也已经跑完，这几张会一直留着。数量很少，可以接受；以后哪个 migration 再跑一遍 §3 的补登记 SQL 就能补上（可以重复执行）。

**上线前后要核对**（补登记依赖执行 migration 的角色能读 `storage.objects`）：上线前在 Supabase SQL Editor 里执行 `select count(*) from storage.objects where bucket_id = 'prescription-photos';`，上线后执行 `select count(*) from photo_uploads;`，两个数应该接近（差的是部署那几分钟上传的）。如果 `photo_uploads` 是 0 而 Storage 里有照片，说明补登记没读到，要手动补。

## 4. 测试

- SQL（`photo_uploads_test`）：只看得到 / 删得掉自己药柜的；路径和药柜对不上不能登记；`stale_photo_paths` 只返回超过 7 天、没被药方引用的
- E2E（isolated，@FIX-8）：
  1. 识别后不保存 → 登记了、文件在
  2. 再识别一次并保存到药方上
  3. 两张都改到 8 天前 → 再识别一次 → 没用上的那张文件和登记都没了，保存了的那张还在
  4. 刚识别的那张也改到 8 天前 → 不识别、只手动保存一张药方 → 也被清掉（保存药方时的清理）
  5. 删除带照片的药方 → 照片和登记立刻一起删
- 升级测试：已有数据不受影响
