import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "SupplyChain México | Automatizador de tareas",
  description: "Plataforma de automatización de órdenes, validación postal y cierres para SupplyChain México",
  icons: {
    icon: "/logo-supplychain.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-white text-slate-900 font-sans antialiased selection:bg-[#233762] selection:text-white">
        {children}
      </body>
    </html>
  );
}
