import DashboardLogin from './components/DashboardLogin'
import './Dashboard.css'

export default function Dashboard() {
  const fakeSignIn = async () => {
    throw new Error('Stub: auth no implementado todavía')
  }
  return <DashboardLogin onSignIn={fakeSignIn} />
}
