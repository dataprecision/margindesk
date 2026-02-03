import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "@/components/providers/session-provider";
import Sidebar from "@/components/navigation/sidebar";

export const metadata: Metadata = {
  title: "MarginDesk - Project Margin Management",
  description: "Calculate project margins, manage accruals, and track financial performance",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.Node;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <SessionProvider>
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <main className="flex-1 ml-64 overflow-y-auto bg-gray-50">
              {children}
            </main>
          </div>
        </SessionProvider>
      </body>
    </html>
  );
}
