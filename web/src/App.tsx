import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import Assessments from './pages/Assessments.tsx';
import Wizard from './pages/Wizard.tsx';
import Result from './pages/Result.tsx';
import Dashboard from './pages/Dashboard.tsx';
import Referentiel from './pages/Referentiel.tsx';

export default function App() {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <img src="/maveric-logo.png" alt="MAVERIC — Know the risk, lead with confidence" />
        </div>

        <nav className="nav">
          <NavLink to="/evaluations" className={({ isActive }) => (isActive ? 'active' : '')}>
            Évaluations
          </NavLink>
          <NavLink to="/tableau-de-bord" className={({ isActive }) => (isActive ? 'active' : '')}>
            Tableau de bord
          </NavLink>
          <NavLink to="/referentiel" className={({ isActive }) => (isActive ? 'active' : '')}>
            Référentiel
          </NavLink>
        </nav>

        <div className="sidebar__footer">
          Évaluation du risque fournisseur
          <br />
          Score 0–100 : plus la note est haute, plus le risque est élevé.
        </div>
      </aside>

      <main className="main">
        <Routes>
          <Route path="/" element={<Navigate to="/evaluations" replace />} />
          <Route path="/evaluations" element={<Assessments />} />
          <Route path="/evaluations/:id" element={<Wizard />} />
          <Route path="/evaluations/:id/resultat" element={<Result />} />
          <Route path="/tableau-de-bord" element={<Dashboard />} />
          <Route path="/referentiel" element={<Referentiel />} />
        </Routes>
      </main>
    </div>
  );
}
