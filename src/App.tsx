import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import ChatPage from './pages/ChatPage';
import TasksPage from './pages/TasksPage';
import RemindersPage from './pages/RemindersPage';
import CollectionsPage from './pages/CollectionsPage';
import BrainPage from './pages/BrainPage';
import DocumentsPage from './pages/DocumentsPage';
import SettingsPage from './pages/SettingsPage';
import IntegrationsPage from './pages/IntegrationsPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />

          <Route path="/" element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }>
            <Route index element={<ChatPage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="reminders" element={<RemindersPage />} />
            <Route path="collections" element={<CollectionsPage />} />
            <Route path="brain" element={<BrainPage />} />
            <Route path="documents" element={<DocumentsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="integrations" element={<IntegrationsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
