import React from "react";
import { useNavigate } from "react-router-dom";
import { auth, setToken } from "../lib/api";

export default function Login({ onAuthed }){
  const nav = useNavigate();
  const [identity, setIdentity] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const submit = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const { data } = await auth.login(identity, password); // { token, ...user }
      if (data?.token) setToken(data.token);
      const me = (await auth.me()).data;
      onAuthed?.(me);
      nav("/");
    } catch (ex) {
      setErr(ex?.response?.data?.error || "Login failed");
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="max-w-md mx-auto p-4">
      <label className="block text-sm font-black">Username or Email</label>
      <input className="w-full mb-3 border rounded px-3 py-2" value={identity} onChange={e=>setIdentity(e.target.value)} />
      <label className="block text-sm font-black">Password</label>
      <input type="password" className="w-full mb-3 border rounded px-3 py-2" value={password} onChange={e=>setPassword(e.target.value)} />
      {err && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>}
      <button className="px-4 py-2 rounded-full font-black text-white" style={{background:'#f28ab3'}} disabled={busy}>
        {busy ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
