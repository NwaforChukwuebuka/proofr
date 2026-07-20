"use client";

import { useEffect } from "react";

/**
 * Register the shell SW in production only. In `next dev`, a SW that
 * intercepts navigations/RSC causes continuous GET /page reload storms.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) {
          void reg.unregister();
        }
      });
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failures shouldn't break the app.
    });
  }, []);

  return null;
}
