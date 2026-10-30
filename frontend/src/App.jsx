import { Link, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import { AdminRoute, DeveloperRoute } from './components/RouteGuards'
import { Aurora } from './components/ui'
import Account from './pages/Account'
import AdminDashboard from './pages/admin/Dashboard'
import ManageProjects from './pages/admin/ManageProjects'
import ModelApprovals from './pages/admin/ModelApprovals'
import ProjectReview from './pages/admin/ProjectReview'
import Security from './pages/admin/Security'
import Sites from './pages/admin/Sites'
import UsersRoles from './pages/admin/UsersRoles'
import SignIn from './pages/auth/SignIn'
import SignUp from './pages/auth/SignUp'
import Apply from './pages/dev/Apply'
import DevDashboard from './pages/dev/Dashboard'
import DevModels from './pages/dev/Models'
import Projects from './pages/dev/Projects'
import ProjectView from './pages/dev/ProjectView'
import Home from './pages/Home'
import CompareRuns from './pages/shared/CompareRuns'
import LiveUpdates from './pages/shared/LiveUpdates'
import Logs from './pages/shared/Logs'
import TrainingList from './pages/shared/TrainingList'
import TrainingRun from './pages/shared/TrainingRun'

function NotFound() {
  return (
    <div className="center-page">
      <Aurora />
      <div className="card narrow">
        <h1>Page not found</h1>
        <p className="muted">That address doesn't exist on FLIP.</p>
        <Link className="btn btn-primary" to="/">Go to the home page</Link>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/signin" element={<SignIn portal="developer" />} />
      <Route path="/admin/signin" element={<SignIn portal="admin" />} />
      <Route path="/signup" element={<SignUp />} />

      <Route path="/admin" element={<AdminRoute><AppShell variant="admin" /></AdminRoute>}>
        <Route index element={<AdminDashboard />} />
        <Route path="projects" element={<ManageProjects />} />
        <Route path="projects/:id" element={<ProjectReview />} />
        <Route path="users" element={<UsersRoles />} />
        <Route path="sites" element={<Sites />} />
        <Route path="logs" element={<Logs admin />} />
        <Route path="training" element={<TrainingList admin />} />
        <Route path="training/:id" element={<TrainingRun admin />} />
        <Route path="compare" element={<CompareRuns admin />} />
        <Route path="models" element={<ModelApprovals />} />
        <Route path="security" element={<Security />} />
        <Route path="live" element={<LiveUpdates admin />} />
        <Route path="account" element={<Account />} />
      </Route>

      <Route path="/app" element={<DeveloperRoute><AppShell variant="dev" /></DeveloperRoute>}>
        <Route index element={<DevDashboard />} />
        <Route path="apply" element={<Apply />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:id" element={<ProjectView />} />
        <Route path="training" element={<TrainingList />} />
        <Route path="training/:id" element={<TrainingRun />} />
        <Route path="compare" element={<CompareRuns />} />
        <Route path="models" element={<DevModels />} />
        <Route path="logs" element={<Logs />} />
        <Route path="live" element={<LiveUpdates />} />
        <Route path="account" element={<Account />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
