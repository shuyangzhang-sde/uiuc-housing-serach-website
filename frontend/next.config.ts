import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@illirent/core", "@illirent/api-client", "@illirent/search-state", "@illirent/design-tokens"],
  turbopack: {
    root: path.resolve(__dirname, ".."),
  },
};

export default nextConfig;
