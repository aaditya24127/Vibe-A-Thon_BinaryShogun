import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The public front door is the landing page; its buttons open /operations in this app.
  async redirects() {
    return [{ source: "/", destination: process.env.NEXT_PUBLIC_LANDING_URL || "https://weconnect-landing-mu.vercel.app", permanent: false }];
  },
};

export default withSerwist(nextConfig);
