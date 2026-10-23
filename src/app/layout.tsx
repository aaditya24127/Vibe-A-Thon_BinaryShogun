import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { DataProvider } from "@/lib/data/hooks";
import { TopBar } from "@/components/TopBar";
import { SwRegister } from "@/components/SwRegister";

export const metadata: Metadata = {
  title: { default: "WeConnect", template: "%s | WeConnect" },
  description: "Dispatch and safety coordination for perishable surplus and fragile aid.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
};
export const viewport: Viewport = { themeColor: "#4A0F1F", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <DataProvider>
          <TopBar />
          <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
          <SwRegister />
        </DataProvider>
      </body>
    </html>
  );
}
