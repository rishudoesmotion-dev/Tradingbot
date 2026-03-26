import type { Metadata } from "next";
import Script from "next/script";
import { Inter } from "next/font/google";
import "./globals.css";
import { tradingRulesService } from "@/lib/services/TradingRulesService";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Trading Terminal ",
  description: "Professional trading terminal with strict risk management",
  icons: {
    icon: "/favicon.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Initialize trading rules from Supabase on app startup
  try {
    await tradingRulesService.initialize();
    console.log("✅ Trading Rules Service initialized from Supabase");
  } catch (error) {
    console.warn(
      "⚠️  Trading Rules Service initialization warning:",
      error instanceof Error ? error.message : String(error)
    );
    // App continues to work with fallback to environment variables
  }
  return (
    <html lang="en">
      <head>
        {/* Kotak Neo WebSocket SDK */}
        <Script
          src="/kotak-neo-sdk/hslib.js"
          strategy="beforeInteractive"
        />
        <Script
          src="/kotak-neo-sdk/init-sdk.js"
          strategy="afterInteractive"
        />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
