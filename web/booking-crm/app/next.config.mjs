/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', // 静的書き出し（サーバーなし。Cloudflare Pages に out/ を置く）
  images: { unoptimized: true },
  trailingSlash: true,
};
export default nextConfig;
