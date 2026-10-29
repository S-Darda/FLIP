import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth'
import { Spinner } from './ui'

function Guard({ role, signIn, children }) {
  const { user, ready } = useAuth()
  const location = useLocation()
  if (!ready) return <div className="center-page"><Spinner /></div>
  if (!user) return <Navigate to={signIn} replace state={{ from: location.pathname }} />
  if (user.role !== role) return <Navigate to={user.role === 'Admin' ? '/admin' : '/app'} replace />
  return children
}

/** Only users with the Admin role; everyone else is sent to the admin sign-in. */
export const AdminRoute = ({ children }) => <Guard role="Admin" signIn="/admin/signin">{children}</Guard>

/** Only model developers. */
export const DeveloperRoute = ({ children }) => <Guard role="Developer" signIn="/signin">{children}</Guard>
