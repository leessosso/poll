import { BrowserRouter, Routes, Route } from 'react-router-dom';
import VoterPage from './pages/VoterPage';
import AdminPage from './pages/AdminPage';

const basename = import.meta.env.BASE_URL.replace(/\/$/, '');

export default function App() {
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/" element={<VoterPage />} />
        <Route path="/v/:sessionId" element={<VoterPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </BrowserRouter>
  );
}
