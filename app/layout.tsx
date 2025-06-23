import type React from "react";
import type { Metadata } from "next";
import { Raleway } from "next/font/google";
import "./globals.css";
import { Web3Provider } from "./providers"; // 👈 Importamos el envoltorio de wagmi/rainbowkit

const raleway = Raleway({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-raleway",
});

export const metadata: Metadata = {
  title: "Abi.dil - Dapp",
  description: "Crear, pagar y libera tratos",
  generator: "v0.dev",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className={`${raleway.variable} font-sans antialiased`}>
        <Web3Provider>
          {children}
        </Web3Provider>
      </body>
    </html>
  );
}
