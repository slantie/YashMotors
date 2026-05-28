"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock } from "lucide-react";
import { Footer } from "@/components/footer";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/archive/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push("/cases");
        router.refresh();
      } else {
        setError("Invalid password");
      }
    } catch {
      setError("Connection error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-sm animate-in fade-in zoom-in-95 duration-500 ease-out-expo">
          {/* Logo block */}
          <div className="flex flex-col items-center mb-10 text-center">
            <div className="w-24 h-24 rounded-[1.25rem] bg-primary flex items-center justify-center mb-6 shadow-2xl shadow-primary/20 ring-1 ring-primary/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/archive/logo.svg"
                width={72}
                height={72}
                alt="Yash Motors"
                className="drop-shadow-md"
              />
            </div>
            <h1 className="text-3xl font-extrabold text-foreground tracking-tight">
              Yash Motors
            </h1>
            <p className="text-base text-muted-foreground mt-2 font-medium">
              Case Archive Portal
            </p>
          </div>

          {/* Login card */}
          <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] border border-border/60 shadow-xl p-8 ring-1 ring-black/[0.02]">
            {/* <p className="text-xs font-bold text-primary uppercase tracking-widest mb-6 flex items-center justify-sa gap-2">
              <Lock className="w-4 h-4" /> Enter Password to Access
            </p> */}
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label
                  htmlFor="password"
                  className="text-sm font-semibold text-foreground/80 ml-1"
                >
                  Password
                </Label>
                <div className="relative group">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/60 group-focus-within:text-primary transition-colors" />
                  <Input
                    id="password"
                    type="password"
                    className="pl-11 h-12 rounded-xl border-border/80 bg-white shadow-sm focus-visible:ring-primary/20 text-md transition-all placeholder:text-muted-foreground/50"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter archive password"
                    autoComplete="current-password"
                    required
                  />
                </div>
              </div>
              {error && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3 pb-2.5">
                  <p className="text-sm text-destructive font-semibold flex items-center justify-center">
                    {error}
                  </p>
                </div>
              )}
              <Button
                type="submit"
                className="w-full h-12 rounded-xl text-base font-bold shadow-md hover:shadow-lg transition-all active:scale-[0.98]"
                disabled={loading}
              >
                {loading ? "Verifying…" : "Access Archive"}
              </Button>
            </form>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
