import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

import { AnimatedGridPattern } from "@/components/ui/animated-grid-pattern";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Steam Price Calculator",
  description:
    "Compare the cheapest way to buy a Steam game in Vietnam — gifting service vs. selling TF2 keys on the Steam Market.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className="h-full antialiased" suppressHydrationWarning>
      <body className="relative flex min-h-full flex-col">
        <AnimatedGridPattern
          numSquares={30}
          maxOpacity={0.15}
          duration={3}
          repeatDelay={1}
          className="fixed inset-0 -z-10 h-screen w-screen skew-y-12 mask-[radial-gradient(ellipse_at_center,white,transparent_75%)]"
        />
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
