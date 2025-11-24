/** @type {import('next').NextConfig} */
const nextConfig = {
  /* 既存の設定 */
  reactCompiler: true,

  // ここを追加
  output: 'export',  // 静的サイトとしてエクスポートするため
};

export default nextConfig;
