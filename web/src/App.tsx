import { Suspense, lazy, useCallback } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Skeleton } from './components/Chrome'
import { Layout } from './components/Layout'
import { I18nProvider } from './lib/i18n'
import { StoreProvider, useStore } from './lib/store'
import type { Lang } from './lib/types'
import ConfirmExtraction from './screens/ConfirmExtraction'
import Landing from './screens/Landing'
import People from './screens/People'
import Privacy from './screens/Privacy'
import Processing from './screens/Processing'
import Reports from './screens/Reports'
import Results from './screens/Results'
import { ErrorScreen } from './screens/States'

// Trends pulls in the charting library; load it only when opened.
const Trends = lazy(() => import('./screens/Trends'))

function PageSkeleton() {
  return (
    <div className="page" aria-busy="true">
      <Skeleton className="card" lines={2} />
      <Skeleton className="card" lines={4} />
    </div>
  )
}

function Localised() {
  const { state, dispatch } = useStore()
  const setLang = useCallback((lang: Lang) => dispatch({ type: 'lang', lang }), [dispatch])
  return (
    <I18nProvider lang={state.lang} setLang={setLang}>
      <Layout>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/processing" element={<Processing />} />
          <Route path="/confirm" element={<ConfirmExtraction />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/report/:id" element={<Results />} />
          <Route path="/trends" element={<Suspense fallback={<PageSkeleton />}><Trends /></Suspense>} />
          <Route path="/people" element={<People />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/error" element={<ErrorScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </I18nProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <StoreProvider>
        <Localised />
      </StoreProvider>
    </BrowserRouter>
  )
}
