/**
 * /dashboard — one URL, two pages:
 *   customers (and logged-out visitors) -> the deals dashboard
 *   restaurant accounts                 -> their discount manager (partner/Partner)
 */
import { Suspense, lazy, useEffect, useState } from "react";
import { authApi } from "../auth/api";
import { readKind, saveKind, type AccountKind } from "../shared/role";

const CustomerDashboard = lazy(() => import("./Dashboard"));
const RestaurantDashboard = lazy(() => import("../partner/Partner"));

export default function DashboardGate() {
  const [kind, setKind] = useState<AccountKind | null>(readKind);

  useEffect(() => {
    authApi.me().then((u) => {
      const k: AccountKind = u?.role === "restaurant" ? "restaurant" : "customer";
      saveKind(k);
      setKind(k);
    });
  }, []);

  if (!kind) return <></>; // first visit on this browser: wait for the server's answer (one quick request)
  return <Suspense fallback={null}>{kind === "restaurant" ? <RestaurantDashboard /> : <CustomerDashboard />}</Suspense>;
}
