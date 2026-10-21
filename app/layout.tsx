import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Рядом — объявления поблизости",
  description: "Бесплатные объявления, покупки и продажи рядом.",
  applicationName: "Рядом"
};
export const viewport: Viewport = { themeColor: "#f6f7fb", width: "device-width", initialScale: 1 };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
