import './App.css'
import { usePrivy } from '@privy-io/react-auth'
import { useAnonAadhaar } from '@anon-aadhaar/react'
import Login from './components/Login'
import VerifyIdentity from './components/VerifyIdentity'

function App() {
  const { ready, authenticated } = usePrivy()
  const [anonAadhaar] = useAnonAadhaar()

  // Wait for Privy SDK to initialize
  if (!ready) {
    return (
      <div className="app-layout">
        <div className="boot-screen">[ SYSTEM_BOOT ]</div>
      </div>
    )
  }

  // State 1: Not logged in via Privy → show phone login
  if (!authenticated) {
    return (
      <div className="app-layout">
        <Login />
      </div>
    )
  }

  // State 2: Privy authenticated but ZK identity not verified
  if (anonAadhaar.status !== 'logged-in') {
    return (
      <div className="app-layout">
        <VerifyIdentity />
      </div>
    )
  }

  // State 3: Both Privy + Anon Aadhaar verified → Dashboard placeholder
  return (
    <div className="app-layout">
      <div className="dashboard-gate">
        <div className="terminal-box">
          <div className="terminal-header">
            <span className="dot"></span>
            <span className="dot"></span>
            <span className="dot"></span>
            <div className="header-title">PAKKA_DEAL_v1</div>
          </div>
          <div className="terminal-body">
            <div className="gate-badge">
              <span className="gate-icon">◆</span>
            </div>
            <h2 className="gate-title">[ DASHBOARD_ACCESS_GRANTED ]</h2>
            <p className="gate-sub">Full escrow protocol access unlocked. Identity verified via ZK proof.</p>
            <div className="gate-stats">
              <div className="gate-stat">
                <span className="gate-stat-val">100</span>
                <span className="gate-stat-label">PAKKA_SCORE</span>
              </div>
              <div className="gate-stat">
                <span className="gate-stat-val">0</span>
                <span className="gate-stat-label">ACTIVE_DEALS</span>
              </div>
              <div className="gate-stat">
                <span className="gate-stat-val">ZK</span>
                <span className="gate-stat-label">ID_STATUS</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
