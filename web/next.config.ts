import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 关闭 Cache Components（Next 16 新的缓存模型）。原因见 docs/design/0002-decoctions-and-testing.md §4：
  // 开启时，服务器端操作（删除药方等）之后客户端会显示过期数据，E2E 测试稳定复现。
  // 这个 App 的页面都是每个用户自己的实时数据，没有可缓存的静态内容，用传统的动态渲染更简单可靠。
  cacheComponents: false,
  partialPrefetching: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
