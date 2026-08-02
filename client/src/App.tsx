import { Route, Routes } from 'react-router-dom';
import ProtectedRoute from './auth/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import DutyDesk from './pages/DutyDesk';
import VendorsList from './pages/VendorsList';
import VendorWorkspace from './pages/VendorWorkspace';
import FleetCalendar from './pages/FleetCalendar';
import BookingsList from './pages/BookingsList';
import BookingWizard from './pages/BookingWizard';
import Vehicles from './pages/Vehicles';
import Drivers from './pages/Drivers';
import Customers from './pages/Customers';
import Expenses from './pages/Expenses';
import Maintenance from './pages/Maintenance';
import InvoicesList from './pages/InvoicesList';
import InvoiceDetail from './pages/InvoiceDetail';
import Settings from './pages/Settings';
import Reports from './pages/Reports';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/duties" element={<DutyDesk />} />
          <Route path="/vendors" element={<VendorsList />} />
          <Route path="/vendors/:id" element={<VendorWorkspace />} />
          <Route path="/calendar" element={<FleetCalendar />} />
          <Route path="/bookings" element={<BookingsList />} />
          <Route path="/bookings/new" element={<BookingWizard />} />
          <Route path="/vehicles" element={<Vehicles />} />
          <Route path="/drivers" element={<Drivers />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/maintenance" element={<Maintenance />} />
          <Route path="/invoices" element={<InvoicesList />} />
          <Route path="/invoices/:id" element={<InvoiceDetail />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/reports" element={<Reports />} />
        </Route>
      </Route>
    </Routes>
  );
}
