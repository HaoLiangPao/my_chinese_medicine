import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 关闭 Cache Components（Next 16 新的缓存模型）。原因见 docs/design/0002-decoctions-and-testing.md §4：
  // 开启时，服务器端操作（删除药方等）之后客户端会显示过期数据，E2E 测试稳定复现。
  // 这个 App 的页面都是每个用户自己的实时数据，没有可缓存的静态内容，用传统的动态渲染更简单可靠。
  cacheComponents: false,
  partialPrefetching: false,
  poweredByHeader: false,
  // 安全响应头：不允许被别的网站用 iframe 嵌入（防点击劫持）、不猜 MIME 类型、跨站只带来源域名。
  // 拍照用的是 <input capture>，不需要 getUserMedia，所以摄像头/麦克风/定位都关掉。
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
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
