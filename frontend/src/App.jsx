import { Navigate, Route, Routes } from "react-router";
import { SignIn } from "@clerk/clerk-react";
import TripsPage from "./pages/TripsPage";
import PendingPage from "./pages/PendingPage";
import LoadingSpinner from "./components/LoadingSpinner";
import useAuthReq from "./hooks/useAuthReq";
import useUserSync from "./hooks/useUserSync";
import { useMe } from "./hooks/useMe";
import "./tripreport.css";

function Protected({ adminOnly = false, children }) {
  const { data: me, isLoading, isError } = useMe();
  if (isLoading) {
    return (
      <div className="cf" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <LoadingSpinner />
      </div>
    );
  }
  if (isError || !me || me.role === "pending") return <PendingPage />;
  if (adminOnly && me.role !== "admin") return <Navigate to="/" />;
  return children;
}

function App() {
  const { isClerkLoaded, isSignedIn } = useAuthReq();
  useUserSync();

  if (!isClerkLoaded) return null;

  if (!isSignedIn) {
    return (
      <div className="cf" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>TripReport</div>
            <div className="muted">รายงานเที่ยวรถบรรทุกจากกลุ่ม LINE</div>
          </div>
          <SignIn routing="hash" />
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Protected><TripsPage /></Protected>} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default App;
