/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Enable server actions and modern features
  experimental: {
    serverComponentsExternalPackages: ["googleapis"],
  },
  webpack(config, { dev }) {
    if (dev && process.platform === "win32") {
      const ignored = config.watchOptions?.ignored;
      const systemDirectories =
        /(?:^|[\\/])(?:System Volume Information|\$Recycle\.Bin)(?:[\\/]|$)/;
      // Bundled Watchpack lstats every drive-root entry before applying ignored
      // during its initial scan. Exclude root-level dependency/missing paths so
      // that scan is never registered; nested project files remain watched.
      const driveRootEntries = /^[A-Za-z]:[\\/](?:[^\\/]+[\\/]?)?$/;
      config.watchOptions = {
        ...config.watchOptions,
        ignored:
          ignored instanceof RegExp
            ? new RegExp(
                `(?:${ignored.source})|(?:${systemDirectories.source})|(?:${driveRootEntries.source})`,
                ignored.flags,
              )
            : [
                ...(Array.isArray(ignored)
                  ? ignored
                  : ignored
                    ? [ignored]
                    : []),
                "**/System Volume Information",
                "**/System Volume Information/**",
                "**/$Recycle.Bin",
                "**/$Recycle.Bin/**",
                "?:/",
                "?:/*",
              ],
      };
    }
    return config;
  },
};

export default nextConfig;
