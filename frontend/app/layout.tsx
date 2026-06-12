import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { CarbonProvider } from "@/context/CarbonContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Carbon Impact Platform",
  description: "Awareness as an Experience",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <CarbonProvider>
          {children}
        </CarbonProvider>
      </body>
    </html>
  );
}
