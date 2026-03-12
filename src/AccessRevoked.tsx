import React from "react";

type Props = {
  adminEmail?: string | null;
};

export default function AccessRevoked({ adminEmail }: Props) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-8">
      <div className="max-w-xl rounded-2xl border border-slate-800 bg-slate-900/70 p-8 text-center">
        <div className="text-xl font-semibold mb-2">User not found</div>
        <p className="text-sm text-slate-300">
          Please contact your company admin{adminEmail ? `: ${adminEmail}` : "."}
        </p>
      </div>
    </div>
  );
}
