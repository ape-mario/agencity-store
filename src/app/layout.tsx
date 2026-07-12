import type { Metadata } from "next";
import { Press_Start_2P } from "next/font/google";
import { storeMetadata } from "@tetsuo-ai/store-core/seo";
import { seoContext } from "@/lib/config";
import { Providers } from "@/lib/providers";
import { CityShell } from "@/app/city/components/CityShell";
import "./globals.css";
import "@/app/city/city.css";

const pressStart2P = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-pixel",
});

export const metadata: Metadata = {
  ...storeMetadata(seoContext),
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={pressStart2P.variable}>
      <body>
        <Providers>
          <CityShell>{children}</CityShell>
        </Providers>
      </body>
    </html>
  );
}
