import type { Metadata } from "next";
import { Anuphan, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { AuthProvider } from "@/components/AuthProvider";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
});

// Thai text in Anuphan (as in Paapjam). Plus Jakarta has no Thai letters, so with Anuphan next in line the Thai
// falls to it while English and figures stay in Plus Jakarta.
const anuphan = Anuphan({
  subsets: ["thai"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-anuphan",
});

export const metadata: Metadata = {
  title: "TradeJournal",
  description: "A comprehensive trading journal and dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${plusJakarta.variable} ${anuphan.variable}`}>
      <body className={`font-sans text-ink h-[100dvh] flex overflow-hidden bg-surface print:h-auto print:block print:overflow-visible print:bg-white`}>
        <AuthProvider>
          <Sidebar />
          <main className="flex-1 p-4 pb-[calc(7rem+env(safe-area-inset-bottom))] md:p-8 md:pl-[calc(var(--rail,96px)+2rem)] print:pl-0 transition-[padding] duration-300 overflow-y-auto w-full print:overflow-visible print:p-0">
            <div className="max-w-7xl mx-auto">
              {children}
            </div>
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
