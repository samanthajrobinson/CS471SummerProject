// frontend/src/App.jsx
import React from "react";
import { Routes, Route, NavLink, Navigate, useNavigate } from "react-router-dom";
import { auth, setToken } from "./lib/api";

// your existing pages
import Home from "./pages/Home.jsx";         // outfit generator w/ weather
import Closet from "./pages/Closet.jsx";
import Laundry from "./pages/Laundry.jsx";
import Profile from "./pages/Profile.jsx";
import Login from "./pages/Login.jsx";
import Discover from "./pages/Discover.jsx";

function Protected({ user, children }) {
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function Navbar({ user, onLogout }) {
  return (
    <header className="w-full border-b border-gray-200 bg-white">
      <div className="max-w-6xl mx-auto px-4 h-12 flex items-center">
        {/* left: title */}
        <div className="font-black tracking-wide">404 FITS NOT FOUND</div>

        {/* center: nav */}
        <nav className="mx-auto flex items-center gap-4 text-sm">
          <NavLink to="/" className={({isActive})=> isActive ? "font-semibold" : ""}>Home</NavLink>
          <NavLink to="/closet" className={({isActive})=> isActive ? "font-semibold" : ""}>Closet</NavLink>
          <NavLink to="/laundry" className={({isActive})=> isActive ? "font-semibold" : ""}>Laundry</NavLink>
          <NavLink to="/profile" className={({isActive})=> isActive ? "font-semibold" : ""}>Profile</NavLink>
        </nav>

        {/* right: user + logout */}
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="text-sm text-gray-600">signed in as @{user.handle || user.email}</span>
              <button
                onClick={onLogout}
                className="rounded-full bg-pink-500 text-white px-4 py-1 shadow hover:bg-pink-600" 
                style={{ background: "#f28ab3" }}
              >
                Log out
              </button>
            </>
          ) : (
            <NavLink to="/login" className="px-3 py-1.5 rounded-full border">Sign in</NavLink>
          )}
        </div>
      </div>
    </header>
  );
}

export default function App() {
  const [user, setUser] = React.useState(null);
  const [ready, setReady] = React.useState(false);
  const nav = useNavigate();

  // try to hydrate session (cookie or localStorage token)
  React.useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const { data } = await auth.me();
        if (!ignore) setUser(data);
      } catch {
        if (!ignore) setUser(null);
      } finally {
        if (!ignore) setReady(true);
      }
    })();
    return () => { ignore = true; };
  }, []);

  const handleLogout = async () => {
    try { await auth.logout(); } catch {}
    setToken(null);
    setUser(null);
    nav("/login", { replace: true });
  };

  if (!ready) return <div className="p-4">Loading…</div>;

  return (
    <>
      <Navbar user={user} onLogout={handleLogout} />
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login onAuthed={setUser} />} />
          <Route path="/" element={<Protected user={user}><Home /></Protected>} />
          <Route path="/discover" element={<Protected user={user}><Discover /></Protected>} />
          <Route path="/closet" element={<Protected user={user}><Closet /></Protected>} />
          <Route path="/laundry" element={<Protected user={user}><Laundry /></Protected>} />
          <Route path="/profile" element={<Protected user={user}><Profile /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
