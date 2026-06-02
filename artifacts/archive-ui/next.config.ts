import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  basePath: "/archive",
  output: "standalone",
  images: {
    // Restricted to S3 ap-south-1 (the presigned-media host) so /_next/image is NOT an
    // open image proxy (cost/SSRF abuse). Tighten further to the exact bucket if it never
    // changes. Virtual-hosted style: <bucket>.s3.ap-south-1.amazonaws.com.
    remotePatterns: [
      { protocol: "https", hostname: "*.s3.ap-south-1.amazonaws.com" },
      { protocol: "https", hostname: "s3.ap-south-1.amazonaws.com" },
    ],
  },
};

// withSentryConfig is safe with no DSN/auth token — it simply skips source-map upload.
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
});
