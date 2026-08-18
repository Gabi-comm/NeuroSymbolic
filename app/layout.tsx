"use client";
import "./globals.css";
// 1. Import your actual Navigation component!
import Navigation from "@/components/Navigation"; 
import { usePathname } from "next/navigation";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  
  // Check if we are on the detailed report screen
  const isDetailedPage = pathname.includes("/admin/reports/") && pathname !== "/admin/reports";

  return (
    <html lang="en">
      <body className="bg-dark-bg text-white">
        
        {/* 2. ONLY render your SMART Navigation if we are NOT on the detailed page! */}
        {!isDetailedPage && <Navigation />}

        {children}

      </body>
    </html>
  );
}