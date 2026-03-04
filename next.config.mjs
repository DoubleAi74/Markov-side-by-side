function createRemotePatternFromUrl(urlString) {
  if (!urlString) {
    return null;
  }

  try {
    const url = new URL(urlString);
    return {
      protocol: url.protocol.replace(":", ""),
      hostname: url.hostname,
      port: url.port,
      pathname:
        !url.pathname || url.pathname === "/"
          ? "/**"
          : `${url.pathname.replace(/\/+$/, "")}/**`,
      search: "",
    };
  } catch {
    return null;
  }
}

function buildRemotePatterns() {
  const patterns = [
    {
      protocol: "https",
      hostname: "**.r2.dev",
      port: "",
      pathname: "/**",
      search: "",
    },
    {
      protocol: "https",
      hostname: "**.r2.cloudflarestorage.com",
      port: "",
      pathname: "/**",
      search: "",
    },
  ];

  const configuredPattern = createRemotePatternFromUrl(
    process.env.R2_PUBLIC_BASE_URL,
  );

  if (!configuredPattern) {
    return patterns;
  }

  const normalizedPathname =
    configuredPattern.pathname ||
    (!configuredPattern.pathname || configuredPattern.pathname === "/"
      ? "/**"
      : `${configuredPattern.pathname.replace(/\/+$/, "")}/**`);

  const duplicate = patterns.some(
    (pattern) =>
      pattern.protocol === configuredPattern.protocol &&
      pattern.hostname === configuredPattern.hostname &&
      pattern.port === configuredPattern.port &&
      pattern.pathname === normalizedPathname,
  );

  if (!duplicate) {
    patterns.push(configuredPattern);
  }

  return patterns;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: buildRemotePatterns(),
  },
};

export default nextConfig;
