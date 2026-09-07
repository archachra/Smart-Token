import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import HomePage from './pages/HomePage.jsx'
import AttendancePage from './pages/AttendancePage.jsx'
import ParticipationPage from './pages/ParticipationPage.jsx'
import AssignmentsPage from './pages/AssignmentsPage.jsx'
import QuickTokenPage from './pages/QuickTokenPage.jsx'
import HistoryPage from './pages/HistoryPage.jsx'
import StudentHomePage from './pages/StudentHomePage.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/student/*" element={<StudentHomePage />} />
        <Route path="/" element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="attendance" element={<AttendancePage />} />
          <Route path="participation" element={<ParticipationPage />} />
          <Route path="assignments" element={<AssignmentsPage />} />
          <Route path="quick-token" element={<QuickTokenPage />} />
          <Route path="history" element={<HistoryPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
