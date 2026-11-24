import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AppShell } from '@/components/layout/AppShell'
import NotFound from '@/pages/NotFound'
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const SettingsPage = lazy(() => import('@/pages/Settings'))
const Deals = lazy(() => import('@/pages/Deals'))
const DealDetail = lazy(() => import('@/pages/DealDetail'))
const Parties = lazy(() => import('@/pages/Parties'))
const Transfers = lazy(() => import('@/pages/Transfers'))
const Expenses = lazy(() => import('@/pages/Expenses'))
const Capital = lazy(() => import('@/pages/Capital'))
const Balances = lazy(() => import('@/pages/Balances'))
const Reports = lazy(() => import('@/pages/Reports'))
const Statements = lazy(() => import('@/pages/Statements'))
const ProfitLoss = lazy(() => import('@/pages/ProfitLoss'))
const PartyLedger = lazy(() => import('@/pages/PartyLedger'))
import { DealDialogProvider } from '@/components/deal/DealDialog'
import { AuthGate } from '@/components/AuthGate'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import Privacy from '@/pages/Privacy'

export default function App() {
  // public page (Google needs it for the Drive backup); everything else is behind sign-in
  if (location.pathname === '/privacy') return <Privacy />
  return (
    <ErrorBoundary>
    <BrowserRouter>
      <AuthGate>
      <DealDialogProvider>
      <Suspense fallback={<div className="p-6 text-sm text-muted">Loading…</div>}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="deals" element={<Deals />} />
          <Route path="deals/:id" element={<DealDetail />} />
          <Route path="transfers" element={<Transfers />} />
          <Route path="batches/*" element={<Navigate to="/transfers" replace />} />
          <Route path="parties" element={<Parties />} />
          <Route path="parties/:id" element={<PartyLedger />} />
          <Route path="capital" element={<Capital />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="balances" element={<Balances />} />
          <Route path="statements" element={<Statements />} />
          <Route path="profit-loss" element={<ProfitLoss />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      </Suspense>
      </DealDialogProvider>
      </AuthGate>
      <Toaster position="top-center" richColors closeButton />
    </BrowserRouter>
    </ErrorBoundary>
  )
}
