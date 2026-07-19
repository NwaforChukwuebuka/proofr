"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () =>
      window.removeEventListener(
        "beforeinstallprompt",
        onBeforeInstallPrompt
      );
  }, []);

  if (!deferredPrompt || dismissed) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-sm shadow-2xl sm:inset-x-auto sm:right-4 sm:w-80">
      <span className="font-medium text-zinc-700">
        Install PROOFR for quicker access.
      </span>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded-full px-2 py-1 text-zinc-500 hover:text-zinc-700"
        >
          Dismiss
        </button>
        <button
          type="button"
          onClick={async () => {
            await deferredPrompt.prompt();
            await deferredPrompt.userChoice;
            setDeferredPrompt(null);
          }}
          className="rounded-full bg-brand px-3 py-1.5 font-bold text-white hover:bg-brand-dark"
        >
          Install
        </button>
      </div>
    </div>
  );
}
