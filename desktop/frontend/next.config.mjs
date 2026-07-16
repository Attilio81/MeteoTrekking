/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // build self-contained (.next/standalone): gira con node, senza npm install
  output: "standalone",
};
export default nextConfig;
