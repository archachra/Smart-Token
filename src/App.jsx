import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import HomePage from './pages/HomePage.jsx';
import AttendancePage from './pages/AttendancePage.jsx';
import ParticipationPage from './pages/ParticipationPage.jsx';
import AssignmentsPage from './pages/AssignmentsPage.jsx';
import QuickTokenPage from './pages/QuickTokenPage.jsx';
import HistoryPage from './pages/HistoryPage.jsx';
import StudentHomePage from './pages/StudentHomePage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AdminPlaceholder from './pages/AdminPlaceholder.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/student/*" element={<ProtectedRoute><StudentHomePage /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute><AdminPlaceholder /></ProtectedRoute>} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<HomePage />} />
          <Route path="attendance" element={<AttendancePage />} />
          <Route path="participation" element={<ParticipationPage />} />
          <Route path="assignments" element={<AssignmentsPage />} />
          <Route path="quick-token" element={<QuickTokenPage />} />
          <Route path="history" element={<HistoryPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
