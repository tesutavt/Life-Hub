import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import { AuthProvider, useAuth } from './AuthContext'
import { NotificationProvider } from './notifications/NotificationProvider'
import App from './app/App'
import Login from './app/Login'
import Register from './app/Register'
import Dashboard from './pages/Dashboard'
import ProfileFull from './pages/ProfileFull'
import Calendar from './pages/Calendar'
import Languages from './pages/Languages'
import Courses from './pages/Courses'
import YearGoals from './pages/YearGoals'
import Journal from './pages/Journal'
import Habits from './pages/Habits'
import DailyMissions from './pages/DailyMissions'
import Travel from './pages/Travel'
import Socials from './pages/Socials'
import Pages from './pages/Pages';
import PageEditor from './pages/PageEditor';
import Settings from './pages/Settings'
import Reports from './pages/Reports'
import { loadStoredFavicon, updateDocumentFavicon } from './utils/customAssets'


function PrivateRoute({ children }: { children: JSX.Element }){
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />
  return children
}

const initialFavicon = loadStoredFavicon()
if (initialFavicon) {
  updateDocumentFavicon(initialFavicon)
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <NotificationProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login/>} />
            <Route path="/register" element={<Register/>} />
            <Route path="/" element={<PrivateRoute><App/></PrivateRoute>}>
              <Route index element={<Dashboard/>} />
              <Route path="dashboard" element={<Dashboard/>} />
              <Route path="profile-full" element={<ProfileFull/>} />
              <Route path="calendar" element={<Calendar/>} />
              <Route path="languages" element={<Languages/>} />
              <Route path="courses" element={<Courses/>} />
              <Route path="year-goals" element={<YearGoals/>} />
              <Route path="journal" element={<Journal/>} />
              <Route path="habits" element={<Habits/>} />
              <Route path="daily-missions" element={<DailyMissions/>} />
              <Route path="travel" element={<Travel/>} />
              <Route path="socials" element={<Socials/>} />
              <Route path="settings" element={<Settings/>} />
              <Route path="reports" element={<Reports/>} />
              <Route path="pages" element={<Pages/>} />
              <Route path="pages/:id" element={<PageEditor/>} />
            </Route>
          </Routes>
        </BrowserRouter>
      </NotificationProvider>
    </AuthProvider>
  </React.StrictMode>
)

