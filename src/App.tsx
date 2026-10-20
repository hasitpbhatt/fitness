import { Routes, Route } from 'react-router-dom'
import AppShell from './components/AppShell'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Log from './pages/Log'
import Achievements from './pages/Achievements'
import Leaderboard from './pages/Leaderboard'
import Install from './pages/Install'
import NotFound from './pages/NotFound'
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt'

export default function App() {
  return (
    <>
      <PwaUpdatePrompt />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/install" element={<Install />} />
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/log" element={<Log />} />
          <Route path="/achievements" element={<Achievements />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  )
}