import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AppShell } from '@/components/layout/AppShell'
import NotFound from '@/pages/NotFound'
import Dashboard from '@/pages/Dashboard'
import SettingsPage from '@/pages/Settings'
import Deals from '@/pages/Deals'
import DealDetail from '@/pages/DealDetail'
import Parties from '@/pages/Parties'
import Transfers from '@/pages/Transfers'
import Expenses from '@/pages/Expenses'
import Capital from '@/pages/Capital'
import Balances from '@/pages/Balances'
import Reports from '@/pages/Reports'
import Statements from '@/pages/Statements'
import PartyLedger from '@/pages/PartyLedger'
import { DealDialogProvider } from '@/components/deal/DealDialog'
import { AuthGate } from '@/components/AuthGate'

export default function App() {
  return (
    <BrowserRouter>
      <AuthGate>
      <DealDialogProvider>
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
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      </DealDialogProvider>
      </AuthGate>
      <Toaster position="top-center" richColors closeButton />
    </BrowserRouter>
  )
}
