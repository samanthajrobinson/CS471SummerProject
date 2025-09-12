import axios from "axios";
const TOKEN_KEY = "of_token";

const RAW = (import.meta.env.VITE_API_URL || "").trim();
const baseURL = RAW || "http://localhost:4000";    // dev default

export const api = axios.create({
  baseURL,
  withCredentials: true,
});

export function setToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    localStorage.removeItem(TOKEN_KEY);
    delete api.defaults.headers.common.Authorization;
  }
}
const saved = localStorage.getItem(TOKEN_KEY);
if (saved) api.defaults.headers.common.Authorization = `Bearer ${saved}`;

export const auth = {
  register: (email, password, handle) => api.post("/auth/register", { email, password, handle }),
  login:    (identity, password)       => api.post("/auth/login", { identity, password }),
  me:       ()                         => api.get("/auth/me"),
  logout:   ()                         => api.post("/auth/logout"),
};
