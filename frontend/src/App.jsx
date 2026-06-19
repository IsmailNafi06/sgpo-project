import { Route, Routes } from 'react-router-dom'
import { ToastProvider } from './contexts/ToastContext'
import HomePage from './pages/HomePage'
import StudentPage from './pages/StudentPage'
import AdminPage from './pages/AdminPage'
import SharedPage from './pages/SharedPage'
import HowItWorksPage from './pages/HowItWorksPage'
import FaqPage from './pages/FaqPage'
import NotFoundPage from './pages/NotFoundPage'
import Footer from './components/Footer'
import ScrollTopButton from './components/ScrollTopButton'

function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/eleve" element={<StudentPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/comment-ca-marche" element={<HowItWorksPage />} />
        <Route path="/faq" element={<FaqPage />} />
        <Route path="/shared/:token" element={<SharedPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <Footer />
      <ScrollTopButton />
    </ToastProvider>
    )
  }

export default App
