import type { AppProps } from "next/app";
import Head from "next/head";
import { HeroUIProvider } from "@heroui/react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { useRouter } from "next/router";
import "../styles/globals.css";
import MainLayout from "../components/layout/MainLayout";

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();

  return (
    <>
      <Head>
        <title>JokerDL - Pro Video Downloader</title>
      </Head>
      <HeroUIProvider navigate={router.push}>
        <NextThemesProvider attribute="class" defaultTheme="dark">
          <MainLayout>
            <Component {...pageProps} />
          </MainLayout>
        </NextThemesProvider>
      </HeroUIProvider>
    </>
  );
}

export default MyApp;
