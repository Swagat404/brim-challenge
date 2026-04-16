import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { BackgroundGradient } from "@/components/ui/background-components";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Brim Expense Intelligence",
  description: "AI-powered fleet expense management for Brim Financial",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} h-full`}>
      <body className="h-full bg-zinc-950 antialiased selection:bg-[#8b9286] selection:text-white">
        <BackgroundGradient>
          <div className="flex items-center justify-center min-h-screen p-4 sm:p-8">
            <div className="flex w-full max-w-[1400px] h-[90vh] bg-white rounded-[24px] shadow-2xl overflow-hidden ring-1 ring-white/10">
              <SidebarProvider className="flex w-full h-full">
                <Sidebar />
                <SidebarInset className="flex-1 bg-[#F9F9F9] overflow-y-auto relative z-10">
                  {children}
                </SidebarInset>
              </SidebarProvider>
            </div>
          </div>
        </BackgroundGradient>
      </body>
    </html>
  );
}
