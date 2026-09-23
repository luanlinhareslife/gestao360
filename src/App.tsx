import { useState } from 'react';

const modules = [
  ['Dashboard', '⌂'],
  ['Empresas', '♧'],
  ['Contratos', '▤'],
  ['Diário de Obras', '▣'],
  ['Licitações', '⚖'],
  ['Documentos', '□'],
  ['Financeiro', '▥'],
  ['Relatórios', '◫'],
  ['Configurações', '⚙'],
];

export default function App() {
  const [active, setActive] = useState('Dashboard');

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-panel">
          <div className="brand-logo"><span>⚙</span><b>▥</b></div>
          <div className="brand-copy">
            <strong>GESTÃO 360</strong>
            <span>GESTÃO DE EMPRESAS<br />DE ENGENHARIA CIVIL</span>
          </div>
        </div>

        <button className="context-button">
          <span>▣</span>
          <strong>Não se trata de uma<br />questão de...</strong>
        </button>

        <nav>
          {modules.map(([label, icon]) => (
            <button
              key={label}
              className={active === label ? 'nav-item active' : 'nav-item'}
              onClick={() => setActive(label)}
            >
              <span className="nav-icon">{icon}</span>
              {label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="content">
        <header className="topbar">
          <div className="topbar-spacer" />
          <div className="top-actions">
            <button className="notification" aria-label="Notificações">♧<i>1</i></button>
            <div className="profile">
              <div className="profile-icon">◯</div>
              <div><strong>Luan Linhares</strong><span>Administrador</span></div>
            </div>
          </div>
        </header>

        {active === 'Dashboard' ? (
          <>
            <section className="hero">
              <div className="hero-overlay" />
              <div className="hero-copy">
                <div className="hero-logo">⚙</div>
                <div className="hero-divider" />
                <div>
                  <h1>GESTÃO 360</h1>
                  <h2>GESTÃO DE EMPRESAS DE ENGENHARIA CIVIL</h2>
                  <p>PLANEJAMENTO&nbsp;&nbsp;•&nbsp;&nbsp;CONTROLE&nbsp;&nbsp;•&nbsp;&nbsp;EXECUÇÃO&nbsp;&nbsp;•&nbsp;&nbsp;RESULTADOS</p>
                </div>
              </div>
              <div className="hero-message">
                <strong>OBRAS<br />MAIS ORGANIZADAS<br />CONSTROEM<br />GRANDES RESULTADOS</strong>
                <em>Hoje<br />construímos<br />o amanhã</em>
              </div>
              <div className="hero-building">
                <span className="tower" />
                <span className="crane" />
                <span className="beam beam-a" />
                <span className="beam beam-b" />
              </div>
              <div className="hero-footer">PESSOAS | PROCESSOS | TECNOLOGIA | CRESCIMENTO</div>
            </section>

            <section className="welcome-row">
              <div className="welcome">
                <div className="sun">☼</div>
                <div><h3>Bem-vindo, Luan!</h3><p>Aqui é onde grandes obras começam com uma boa gestão.</p></div>
              </div>
              <div className="date-card"><span>▣</span><div><strong>Segunda-feira, 15 de Setembro de 2026</strong><small>"Disciplina hoje, grandes resultados amanhã."</small></div></div>
            </section>

            <section className="metrics">
              <Metric icon="▤" title="Contratos Ativos" value="12" />
              <Metric icon="▣" title="Obras em Execução" value="5" />
              <Metric icon="◷" title="Pendências" value="8" />
              <Metric icon="▥" title="Relatórios" value="Acessar" />
            </section>
          </>
        ) : (
          <section className="module-placeholder">
            <div className="placeholder-icon">{modules.find(([name]) => name === active)?.[1]}</div>
            <h2>{active}</h2>
            <p>Este módulo será desenvolvido dentro da plataforma definitiva do Gestão 360.</p>
          </section>
        )}
      </main>
    </div>
  );
}

function Metric({ icon, title, value }: { icon: string; title: string; value: string }) {
  return <button className="metric"><span className="metric-icon">{icon}</span><div><small>{title}</small><strong>{value}</strong></div><b>›</b></button>;
}
