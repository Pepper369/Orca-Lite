"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { UserPlus } from "lucide-react";
import type { ApiResponse } from "@/lib/types";
import { Button } from "@/components/ui";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || undefined, email, password }),
      });
      const json = (await res.json()) as ApiResponse<unknown>;
      if (!json.success) setError(json.error.message);
      else {
        router.push("/");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function loginWithGoogle() {
    setBusy(true);
    setError(null);
    try {
      const { signInWithPopup } = await import("firebase/auth");
      const { auth, googleAuthProvider } = await import("@/lib/firebase");
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const token = await cred.user.getIdToken();
      const res = await fetch("/api/v1/auth/firebase", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const json = (await res.json()) as ApiResponse<unknown>;
      if (!json.success) {
        setError(json.error.message);
      } else {
        router.push("/");
        router.refresh();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Đăng ký bằng Google không thành công";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-10 max-w-sm">
      <div className="panel p-6">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <UserPlus className="size-5 text-accent" /> Tạo tài khoản
        </h1>
        <p className="mt-1 text-[12px] text-ink-3">
          Tài khoản Cloud SQL PostgreSQL & Firebase Authentication.
        </p>

        <button
          type="button"
          onClick={loginWithGoogle}
          disabled={busy}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-md border border-line bg-panel-2 py-2 text-[13px] font-medium text-ink hover:border-accent hover:bg-panel-3 transition-colors disabled:opacity-50"
        >
          <svg className="size-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          Đăng ký bằng Google
        </button>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-line" />
          </div>
          <div className="relative flex justify-center text-[10px] uppercase">
            <span className="bg-panel px-2 text-ink-3">Hoặc email</span>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tên hiển thị (tuỳ chọn)"
            className="w-full rounded-md border border-line bg-panel-2 px-3 py-2 text-[13px] text-ink focus:border-accent/40"
          />
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-md border border-line bg-panel-2 px-3 py-2 text-[13px] text-ink focus:border-accent/40"
          />
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mật khẩu (≥8 ký tự)"
            className="w-full rounded-md border border-line bg-panel-2 px-3 py-2 text-[13px] text-ink focus:border-accent/40"
          />
          {error && <p className="text-[12px] text-down">{error}</p>}
          <Button type="submit" loading={busy} className="w-full" size="md">
            {busy ? "Đang tạo…" : "Đăng ký"}
          </Button>
        </form>
        <p className="mt-3 text-center text-[12px] text-ink-3">
          Đã có tài khoản?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Đăng nhập
          </Link>
        </p>
      </div>
    </div>
  );
}
