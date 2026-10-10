"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import axios from "axios";
import { buildApiUrl } from "@/lib/api";

function PasswordResetPageContent() {
  const searchParams = useSearchParams();
  const initialEmail = useMemo(() => searchParams.get("email") || "", [searchParams]);

  const [email, setEmail] = useState(initialEmail);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const storedLogin = sessionStorage.getItem("initial_login_id");
    const storedPassword = sessionStorage.getItem("initial_temporary_password");
    if (!email && storedLogin) setEmail(storedLogin);
    if (storedPassword) setTemporaryPassword(storedPassword);
  }, [email]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (newPassword.length < 8) {
      setError("Yeni parola en az 8 karakter olmalı.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Yeni parola ve tekrar parola aynı olmalı.");
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post<{ message: string }>(
        buildApiUrl("/auth/complete-password-reset"),
        {
          email: email.trim().toLowerCase(),
          temporary_password: temporaryPassword,
          new_password: newPassword,
        }
      );

      setSuccess(response.data.message || "Parola güncellendi. Giriş yapabilirsiniz.");
      sessionStorage.removeItem("initial_login_id");
      sessionStorage.removeItem("initial_temporary_password");
      localStorage.removeItem("token");
      localStorage.removeItem("refresh_token");
      setTemporaryPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => {
        window.location.href = "/login";
      }, 1200);
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Parola güncellenemedi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">
            S
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Parola Yenileme</h1>
          <p className="text-slate-500">İlk giriş öncesi yeni şifre belirleyin</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">E-posta / Telefon</label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              required
            />
          </div>

          {!temporaryPassword && <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Geçici Şifre</label>
            <input
              type="password"
              value={temporaryPassword}
              onChange={(e) => setTemporaryPassword(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              required
            />
          </div>}

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Yeni Şifre</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Yeni Şifre (Tekrar)</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              required
            />
          </div>

          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-all disabled:opacity-50"
          >
            {loading ? "Güncelleniyor..." : "Parolayı Güncelle"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function PasswordResetPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <PasswordResetPageContent />
    </Suspense>
  );
}
