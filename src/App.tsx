import { useState } from 'react';

const modules = [
  ['Dashboard', '⌂'],
  ['Empresas', '▣'],
  ['Licitações', '⚖'],
  ['Contratos', '▤'],
  ['Obras', '⌂'],
  ['Diário 360', '▥'],
  ['Medições', '◫'],
  ['Documentos', '▱'],
  ['Obrigações e Alertas', '⚠'],
  ['Financeiro', 'R$'],
  ['Relatórios', '▤'],
  ['Configurações', '⚙'],
];

export default function App() {
  const [active, setActive] = useState('Dashboard');

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">⚙</div>
          <div>
            <strong>Gestão 360</strong>
            <span>Engenharia Civil</span>
          </div>
        </div>

        <nav>
          {modules.map(([label, icon]) => (
            <button
              key={label}
              className={active === label ? 'nav-item active' : 'nav-item'}
              onClick={() => setActive(label)}
            >
              <span>{icon}</span>
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">Versão 0.1.0</div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">GESTÃO INTEGRADA</p>
            <h1>{active}</h1>
          </div>
          <div className="user-badge">LL · Administrador</div>
        </header>

        {active === 'Dashboard' ? (
          <section className="dashboard">
            <div className="hero-card">
              <div>
                <p className="eyebrow">BEM-VINDO AO</p>
                <h2>Gestão 360</h2>
                <p>
                  Uma plataforma única para acompanhar licitações, contratos,
                  obras, documentos, medições e obrigações da sua empresa.
                </p>
              </div>
              <div className="hero-gear">⚙</div>
            </div>

            <div className="cards">
              <article><span>Licitações</span><strong>Em construção</strong><small>Próximo módulo</small></article>
              <article><span>Contratos</span><strong>Estrutura pronta</strong><small>Integração planejada</small></article>
              <article><span>Diário 360</span><strong>Validado</strong><small>Módulo preservado</small></article>
              <article><span>Alertas</span><strong>Motor 360</strong><small>Regras serão incorporadas</small></article>
            </div>

            <div className="roadmap">
              <h3>Fluxo principal</h3>
              <p>Empresas → Licitações → Contratos → Obras → Diário 360 → Medições → Pagamentos → Encerramento</p>
            </div>
          </section>
        ) : (
          <section className="module-placeholder">
            <div className="placeholder-icon">{modules.find(([name]) => name === active)?.[1]}</div>
            <h2>{active}</h2>
            <p>Este módulo faz parte da plataforma definitiva e será implementado por etapas.</p>
          </section>
        )}
      </main>
    </div>
  );
}
