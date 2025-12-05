import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";

// Add Special Gothic Expanded One font via link in head

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Live Orléans - Découvrez la vie à Orléans",
  description: "L'application qui vous connecte à tous les événements, lieux et communautés d'Orléans. Téléchargez l'app maintenant sur iOS et Android.",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} antialiased dark`}
      >
        <Script
          id="force-dark-mode"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const html = document.documentElement;
                html.classList.add('dark');
                html.style.colorScheme = 'dark';
              })();
            `,
          }}
        />
        {children}
      </body>
    </html>
  );
}
