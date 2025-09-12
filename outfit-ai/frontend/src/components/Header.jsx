import { Link, NavLink } from "react-router-dom";

export default function Header({ user, onLogout }) {
  const displayName =
    user?.handle ||
    user?.username ||
    (user?.email ? user.email.split("@")[0] : "user");

  const pill = (to, label, end = false) => (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `px-3 py-1.5 rounded-full bg-white border border-gray-200 shadow-soft
         ${isActive ? "bg-blush-200" : "hover:bg-blush-100"}`
      }
    >
      {label}
    </NavLink>
  );

  return (
    <header className="header">
      {/* Three-column grid: left title, centered nav, right user section */}
      <div className="container-padded h-full grid grid-cols-[1fr_auto_1fr] items-center">
        {/* LEFT: brand/title */}
        <Link
          to="/"
          className="font-black tracking-wider text-xl justify-self-start"
        >
          404 FITS NOT FOUND
        </Link>

        {/* CENTER: nav buttons */}
        <nav className="flex items-center gap-3 text-sm justify-self-center">
          {user ? (
            <>
              {pill("/", "Home", true)}
              {pill("/closet", "Closet")}
              {pill("/laundry", "Laundry")}
              {pill("/profile", "Profile")}
            </>
          ) : (
            <>
              {pill("/login", "Sign in", true)}
            </>
          )}
        </nav>

        {/* RIGHT: signed-in badge + logout */}
        {user ? (
          <div className="flex items-center gap-3 justify-self-end">
            <span
              className="hidden sm:inline-flex px-3 py-1.5 rounded-full bg-white border border-gray-200 text-xs text-gray-600 shadow-soft"
              title={user?.email || displayName}
            >
              signed in as @{displayName}
            </span>
            <button
              className="btn-ghost btn-small"
              onClick={onLogout}
              type="button"
            >
              Log out
            </button>
          </div>
        ) : (
          <div className="justify-self-end" />
        )}
      </div>
    </header>
  );
}
