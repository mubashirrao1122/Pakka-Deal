import './App.css'
import { usePrivy } from '@privy-io/react-auth'
import { useAnonAadhaar } from '@anon-aadhaar/react'
import { useState, useEffect } from 'react'
import Login from './components/Login'
import VerifyIdentity from './components/VerifyIdentity'
import Dashboard from './components/Dashboard'
import PayDeal from './components/PayDeal'

function App() {
  const { ready, authenticated } = usePrivy()
  const [anonAadhaar] = useAnonAadhaar()
  const [nullifier, setNullifier] = useState<string | null>(null)
  const [zkBypassed, setZkBypassed] = useState(false)

  // Extract nullifier when ZK proof completes
  useEffect(() => {
    if (anonAadhaar.status === 'logged-in') {
      const proof = anonAadhaar.anonAadhaarProofs?.[0]
      if (proof) {
        const n = (proof as any).pcd?.proof?.nullifier ?? (proof as any).nullifier ?? null
        setNullifier(n ? String(n) : null)
      }
    }
  }, [anonAadhaar])

  // Dev bypass handler for hackathon demo
  const handleZkBypass = (dummyNullifier: string) => {
    setNullifier(dummyNullifier)
    setZkBypassed(true)
    console.log('[DEV_BYPASS] ZK proof simulated, nullifier:', dummyNullifier)
  }

  // ── Simple Routing: /pay/:dealId ──
  const pathname = window.location.pathname
  const payMatch = pathname.match(/^\/pay\/(\d+)/)

  if (payMatch) {
    const dealId = parseInt(payMatch[1], 10)
    return <PayDeal dealId={dealId} />
  }

  // ── Standard 3-State Orchestration ──

  // Wait for Privy SDK to initialize
  if (!ready) {
    return (
      <div className="app-layout">
        <div className="boot-screen">[ SYSTEM_BOOT ]</div>
      </div>
    )
  }

  // State 1: Not logged in via Privy → show email login
  if (!authenticated) {
    return (
      <div className="app-layout">
        <Login />
      </div>
    )
  }

  // State 2: Privy authenticated but ZK identity not verified
  if (anonAadhaar.status !== 'logged-in' && !zkBypassed) {
    return (
      <div className="app-layout">
        <VerifyIdentity onBypass={handleZkBypass} />
      </div>
    )
  }

  // State 3: Both Privy + Anon Aadhaar verified → Dashboard
  return <Dashboard pakkaScore={100} nullifier={nullifier} />
}

export default App
