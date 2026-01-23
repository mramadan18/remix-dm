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

  // Overwrite console in renderer and redirect to electron-log via IPC
  useEffect(() => {
    if (typeof window !== "undefined" && window.ipc && window.ipc.log) {
      const originalLog = console.log;
      const originalWarn = console.warn;
      const originalError = console.error;
      const originalInfo = console.info;

      console.log = (message: any, ...args: any[]) => {
        originalLog(message, ...args);
        window.ipc.log("info", message, ...args);
      };
      console.warn = (message: any, ...args: any[]) => {
        originalWarn(message, ...args);
        window.ipc.log("warn", message, ...args);
      };
      console.error = (message: any, ...args: any[]) => {
        originalError(message, ...args);
        window.ipc.log("error", message, ...args);
      };
      console.info = (message: any, ...args: any[]) => {
        originalInfo(message, ...args);
        window.ipc.log("info", message, ...args);
      };
    }
  }, []);

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
