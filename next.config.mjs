/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Enable server actions and modern features
  experimental: {
    serverComponentsExternalPackages: ["googleapis"]
  }
};

export default nextConfig;
