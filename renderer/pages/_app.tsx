import type { AppProps } from "next/app";
import Head from "next/head";
import { HeroUIProvider } from "@heroui/react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { useRouter } from "next/router";
import { useEffect } from "react";
import "../styles/globals.css";
import MainLayout from "../components/layout/MainLayout";
import { APP_CONFIG } from "../config/app-config";
import { useDownloadStore } from "../store";

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const initializeListeners = useDownloadStore(
    (state) => state.initializeListeners,
  );

  // Initialize download store listeners once at app start
  useEffect(() => {
    const cleanup = initializeListeners();
    return cleanup;
  }, [initializeListeners]);

  return (
    <>
      <Head>
        <title>{`${APP_CONFIG.name} - ${APP_CONFIG.titleSuffix}`}</title>
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
