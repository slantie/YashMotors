"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

type State = "idle" | "building" | "done" | "error";

export function DownloadButton({ caseNumber }: { caseNumber: string }) {
  const [state, setState] = useState<State>("idle");
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  function handleDownload() {
    setState("building");
    setCountdown(30);

    const a = document.createElement("a");
    a.href = `/archive/api/cases/${caseNumber}/download`;
    a.download = `${caseNumber}-archive.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timerRef.current!);
          setState("done");
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }

  function reset() {
    if (timerRef.current) clearInterval(timerRef.current);
    setState("idle");
    setCountdown(0);
  }

  if (state === "idle" || state === "error") {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button onClick={handleDownload} className="gap-2">
          <Download className="h-4 w-4" />
          Download ZIP
        </Button>
        {state === "error" && (
          <p className="text-xs text-destructive">Download failed — try again</p>
        )}
      </div>
    );
  }

  if (state === "building") {
    return (
      <div className="flex flex-col items-end gap-2">
        <Button disabled className="gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Building archive…
        </Button>
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-right max-w-xs shadow-sm">
          <p className="text-xs font-semibold text-amber-800">⚠ Do not close this tab</p>
          <p className="text-xs text-amber-700 mt-0.5">
            Building your ZIP — this may take a while for large cases.
          </p>
          {countdown > 0 && (
            <p className="text-xs text-amber-600 mt-1">
              ~{countdown}s remaining
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" onClick={reset} className="gap-2 text-green-700 border-green-300 bg-green-50 hover:bg-green-100">
        <CheckCircle2 className="h-4 w-4" />
        Download started
      </Button>
      <p className="text-xs text-muted-foreground">Check your browser's download bar</p>
    </div>
  );
}
