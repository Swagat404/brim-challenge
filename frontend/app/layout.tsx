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
      <body className="h-full">
        <SidebarProvider>
          <Sidebar />
          <SidebarInset className="min-h-screen">
            <BackgroundGradient>
              {children}
            </BackgroundGradient>
          </SidebarInset>
        </SidebarProvider>
      </body>
    </html>
  );
}
