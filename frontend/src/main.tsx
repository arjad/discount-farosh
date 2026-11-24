import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";

// Each page is loaded on demand, so only that page's CSS is on the page (no class clashes).
const path = window.location.pathname;
const Page = lazy(() =>
  path.startsWith("/admin")
    ? import("./admin/Admin")
    : path.startsWith("/restaurant/") || path.startsWith("/offer/")
      ? import("./restaurant/RestaurantPage")
      : path.startsWith("/profile")
      ? import("./profile/Profile")
      : path.startsWith("/login") || path.startsWith("/signup")
      ? import("./auth/Auth")
      : path.startsWith("/dashboard")
      ? import("./dashboard/DashboardGate") // customers: deals · restaurants: their discounts — same URL
      : path === "/" || path === "/index.html"
      ? import("./home/Home")
      : import("./notfound/NotFound"), // anything else: "expired or not available"
);

// Deal assistant (bottom-right) on every page. The dashboard mounts its own copy (it opens deals
// in the sidebar); the admin area doesn't get one.
const Chat = lazy(() => import("./dashboard/ChatBot").then((m) => ({ default: m.GlobalChatBot })));
const showChat = !path.startsWith("/dashboard") && !path.startsWith("/admin");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense fallback={null}>
      <Page />
    </Suspense>
    {showChat && (
      <Suspense fallback={null}>
        <Chat />
      </Suspense>
    )}
  </React.StrictMode>,
);
