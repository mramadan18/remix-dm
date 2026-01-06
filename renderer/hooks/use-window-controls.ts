import { useEffect, useState } from "react";

export const useWindowControls = () => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.ipc) {
      // Get initial state
      try {
        const initialState = window.ipc.sendSync("get-window-state", null);
        setIsMaximized(!!initialState);
      } catch (error) {
        console.error("Failed to get initial window state:", error);
      }

      const unsubscribe = window.ipc.on(
        "window-maximized",
        (maximized: any) => {
          setIsMaximized(!!maximized);
        }
      );
      return () => {
        if (typeof unsubscribe === "function") {
          unsubscribe();
        }
      };
    }
  }, []);

  const minimize = () => {
    if (window.ipc) {
      window.ipc.send("window-minimize", null);
    }
  };

  const maximize = () => {
    if (window.ipc) {
      window.ipc.send("window-maximize", null);
    }
  };

  const close = () => {
    if (window.ipc) {
      window.ipc.send("window-close", null);
    }
  };

  const reload = () => {
    if (window.ipc) {
      window.ipc.send("window-reload", null);
    }
  };

  const toggleDevTools = () => {
    if (window.ipc) {
      window.ipc.send("window-devtools", null);
    }
  };

  return { isMaximized, minimize, maximize, close, reload, toggleDevTools };
};
