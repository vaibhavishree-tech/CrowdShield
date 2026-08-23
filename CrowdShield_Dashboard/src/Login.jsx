import React, { useState } from "react";
import { ShieldCheck, Lock, User } from "lucide-react";

export default function AuthorityLogin({ onLogin }) {
  const [credentials, setCredentials] = useState({ username: "", password: "" });
  const [error, setError] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (credentials.username === "admin" && credentials.password === "crowd2026") {
      onLogin();
    } else {
      setError("Invalid security credentials. (Demo: admin / crowd2026)");
    }
  };

  return (
    <div 
      className="relative min-h-screen w-full flex items-center justify-center p-4 font-sans overflow-hidden" 
      style={{ color: "#E7EAF2" }}
    >
      {/* --- BULLETPROOF BACKGROUND LAYER --- */}
      <div 
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 0,
          backgroundColor: "#05070D",
          backgroundImage: `
            radial-gradient(circle at 10% 10%, rgba(47, 214, 214, 0.35) 0%, transparent 50%),
            radial-gradient(circle at 90% 90%, rgba(226, 59, 78, 0.3) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(232, 185, 59, 0.25) 0%, transparent 40%)
          `,
        }}
      />

      {/* --- FROSTED GLASS CONTAINER --- */}
      <div 
        className="relative z-10 w-full max-w-md rounded-3xl p-8"
        style={{ 
          backgroundColor: "rgba(16, 19, 27, 0.65)", 
          border: "1px solid rgba(47, 214, 214, 0.4)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.7), 0 0 45px rgba(47, 214, 214, 0.15)"
        }}
      >
        <div className="flex flex-col items-center mb-8">
          <div 
            className="p-4 rounded-2xl mb-3 relative flex items-center justify-center" 
            style={{ 
              backgroundColor: "#171B26", 
              border: "1px solid rgba(47, 214, 214, 0.5)",
              boxShadow: "0 0 25px rgba(47, 214, 214, 0.25)"
            }}
          >
            <ShieldCheck size={36} style={{ color: "#2FD6D6" }} />
          </div>
          <h1 className="text-3xl font-bold tracking-wide mt-1" style={{ color: "#E7EAF2" }}>CrowdShield</h1>
          <p className="text-xs uppercase tracking-widest mt-1.5 font-semibold" style={{ color: "#2FD6D6" }}>
            Command Center Portal
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "#8993A8" }}>Officer ID / Username</label>
            <div className="relative flex items-center">
              <User className="absolute left-3 w-4 h-4" style={{ color: "#5B6376" }} />
              <input
                type="text"
                required
                value={credentials.username}
                onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                placeholder="e.g. admin"
                className="w-full text-sm rounded-xl pl-10 pr-4 py-3 outline-none"
                style={{ 
                  backgroundColor: "rgba(8, 10, 15, 0.7)", 
                  border: "1px solid #232838", 
                  color: "#E7EAF2" 
                }}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "#8993A8" }}>Access Key</label>
            <div className="relative flex items-center">
              <Lock className="absolute left-3 w-4 h-4" style={{ color: "#5B6376" }} />
              <input
                type="password"
                required
                value={credentials.password}
                onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                placeholder="••••••••"
                className="w-full text-sm rounded-xl pl-10 pr-4 py-3 outline-none"
                style={{ 
                  backgroundColor: "rgba(8, 10, 15, 0.7)", 
                  border: "1px solid #232838", 
                  color: "#E7EAF2" 
                }}
              />
            </div>
          </div>

          {error && (
            <div className="px-3 py-2 rounded-lg text-xs font-medium text-center" style={{ backgroundColor: "rgba(226, 59, 78, 0.15)", color: "#E23B4E", border: "1px solid rgba(226, 59, 78, 0.3)" }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full mt-2 font-semibold text-sm py-3.5 rounded-xl transition-opacity hover:opacity-85"
            style={{ 
              backgroundColor: "#2FD6D6", 
              color: "#080A0F",
              boxShadow: "0 0 25px rgba(47, 214, 214, 0.35)" 
            }}
          >
            Authenticate & Access Dashboard
          </button>
        </form>

        <div className="mt-8 text-center border-t pt-4" style={{ borderColor: "#232838" }}>
          <p className="text-[10px] uppercase tracking-wider font-mono" style={{ color: "#5B6376" }}>
            Authorized Personnel Only · Command Network
          </p>
        </div>
      </div>
    </div>
  );
}