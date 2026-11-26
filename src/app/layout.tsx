import type { Metadata } from "next";
import { Anek_Latin, Mukta } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";
import { DataProvider } from "@/lib/DataContext";

// Indian typefaces by Ek Type: Anek (display, variable width) and Mukta (text).
const anek = Anek_Latin({ subsets: ["latin"], variable: "--font-anek", display: "swap" });
const mukta = Mukta({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-text", display: "swap" });

export const metadata: Metadata = {
    title: "SDG Nexus — Local problems, verified solutions",
    description: "Citizens report local problems, district officers verify them, universities build solutions, CSR partners fund them milestone by milestone, and every step is recorded.",
    keywords: "SDG, sustainability, impact, CSR, NGO, partnerships, climate, development",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className={`${anek.variable} ${mukta.variable}`}>
            <head>
                <link rel="icon" type="image/png" href="/favicon.png" />
                <link rel="apple-touch-icon" href="/logo.png" />
            </head>
            <body>
                <AuthProvider>
                    <DataProvider>
                        {children}
                    </DataProvider>
                </AuthProvider>
            </body>
        </html>
    );
}
