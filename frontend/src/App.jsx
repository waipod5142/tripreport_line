import { Navigate, Outlet, Route, Routes } from "react-router";
import Navbar from "./components/Navbar";
import HomePage from "./pages/HomePage";
import ProductPage from "./pages/ProductPage";
import ProfilePage from "./pages/ProfilePage";
import CreatePage from "./pages/CreatePage";
import EditProductPage from "./pages/EditProductPage";
import OrderPage from "./pages/OrderPage";
import MyOrdersPage from "./pages/MyOrdersPage";
import DispatcherDashboard from "./pages/DispatcherDashboard";
import TruckView from "./pages/TruckView";
import useAuthReq from "./hooks/useAuthReq";
import useUserSync from "./hooks/useUserSync";

const LegacyLayout = () => (
  <div className="min-h-screen bg-base-100">
    <Navbar />
    <main className="max-w-5xl mx-auto px-4 py-8">
      <Outlet />
    </main>
  </div>
);

function App() {
  const { isClerkLoaded, isSignedIn } = useAuthReq();
  useUserSync();

  if (!isClerkLoaded) return null;

  return (
    <Routes>
      {/* Legacy Productify layout */}
      <Route element={<LegacyLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/product/:id" element={<ProductPage />} />
        <Route
          path="/profile"
          element={isSignedIn ? <ProfilePage /> : <Navigate to="/" />}
        />
        <Route
          path="/create"
          element={isSignedIn ? <CreatePage /> : <Navigate to="/" />}
        />
        <Route
          path="/edit/:id"
          element={isSignedIn ? <EditProductPage /> : <Navigate to="/" />}
        />
        {/* ConcreteFlow routes — full-screen sidebar layout */}
        <Route
          path="/order"
          element={isSignedIn ? <OrderPage /> : <Navigate to="/" />}
        />
        <Route
          path="/my-orders"
          element={isSignedIn ? <MyOrdersPage /> : <Navigate to="/" />}
        />
        <Route
          path="/dispatch"
          element={isSignedIn ? <DispatcherDashboard /> : <Navigate to="/" />}
        />
        <Route
          path="/trucks"
          element={isSignedIn ? <TruckView /> : <Navigate to="/" />}
        />
      </Route>
    </Routes>
  );
}

export default App;
