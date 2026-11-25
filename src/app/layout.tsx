import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";
import { STORE_NAME } from "@/lib/format";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `${STORE_NAME} — Catálogo y Pedidos por WhatsApp`,
  description:
    "Arma tu carrito sin registrarte, envía tu pedido por WhatsApp y sigue el estado en tiempo real.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${jakarta.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#F8F7F4] text-zinc-900 font-sans selection:bg-emerald-100 selection:text-emerald-900">
        {children}
      </body>
    </html>
  );
}
