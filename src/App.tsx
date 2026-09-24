import { useMemo, useState } from 'react';

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

const companies = [
  { name: 'Terra Forte LTDA', cnpj: '01.999.130/0001-42', city: 'Porto Velho/RO', status: 'Ativa', contracts: 4, works: 3 },
  { name: 'M&M Serviços Especializados EIRELI', cnpj: '26.473.197/0001-70', city: 'Porto Velho/RO', status: 'Ativa', contracts: 2, works: 1 },
];

export default function App() {
  const [active, setActive] = useState('Dashboard');
  const [query, setQuery] = useState('');

  const filteredCompanies = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return companies;
    return companies.filter(company => Object.values(company).some(value => String(value).toLowerCase().includes(term)));
  }, [query]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-panel">
          <div className="brand-emblem"><span>⚙</span><b>▥</b></div>
          <div className="brand-copy"><strong>GESTÃO 360</strong><span>GESTÃO DE EMPRESAS<br />DE ENGENHARIA CIVIL</span></div>
        </div>
        <button className="context-button"><span>▣</span><strong>Não se trata de uma<br />questão de...</strong></button>
        <nav>
          {modules.map(([label, icon]) => (
            <button key={label} className={active === label ? 'nav-item active' : 'nav-item'} onClick={() => setActive(label)}>
              <span className="nav-icon">{icon}</span>{label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="content">
        <header className="topbar">
          <div />
          <div className="top-actions">
            <button className="notification" aria-label="Notificações">♧<i>1</i></button>
            <div className="profile"><div className="profile-icon">◯</div><div><strong>Luan Linhares</strong><span>Administrador</span></div></div>
          </div>
        </header>

        {active === 'Dashboard' && <Dashboard />}
        {active === 'Empresas' && (
          <section className="page">
            <div className="page-heading">
              <div><span className="eyebrow">CADASTRO CENTRAL</span><h1>Empresas</h1><p>Cadastre e acompanhe as empresas que fazem parte da gestão.</p></div>
              <button className="primary-button">+ Nova empresa</button>
            </div>
            <div className="company-toolbar">
              <div className="search-box">⌕<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por empresa, CNPJ ou cidade..." /></div>
              <div className="toolbar-count">{filteredCompanies.length} empresa(s)</div>
            </div>
            <div className="company-grid">
              {filteredCompanies.map(company => (
                <article className="company-card" key={company.cnpj}>
                  <div className="company-card-top"><div className="company-logo">⚙</div><span className="status-pill">{company.status}</span></div>
                  <h3>{company.name}</h3>
                  <p className="cnpj">{company.cnpj}</p>
                  <p className="city-line">⌖ {company.city}</p>
                  <div className="company-stats"><div><strong>{company.contracts}</strong><span>Contratos</span></div><div><strong>{company.works}</strong><span>Obras</span></div></div>
                  <button className="outline-button">Abrir empresa →</button>
                </article>
              ))}
            </div>
            <div className="next-step-card"><div className="next-step-icon">⚡</div><div><strong>Próxima evolução do cadastro</strong><p>Ao abrir uma empresa, o Gestão 360 vai centralizar documentos, responsáveis, contratos, licitações, obras e pendências.</p></div></div>
          </section>
        )}

        {!['Dashboard', 'Empresas'].includes(active) && (
          <section className="module-placeholder"><div className="placeholder-icon">{modules.find(([name]) => name === active)?.[1]}</div><h2>{active}</h2><p>Este módulo será desenvolvido dentro da plataforma definitiva do Gestão 360.</p></section>
        )}
      </main>
    </div>
  );
}

function Dashboard() {
  return (
    <>
      <section className="hero">
        <div className="sky-glow" /><div className="mountain" /><div className="city" />
        <div className="building"><div className="building-grid" /></div>
        <div className="crane"><span className="crane-mast" /><span className="crane-arm" /><span className="crane-cable" /></div>
        <div className="hero-copy"><div className="hero-emblem">⚙<b>▥</b></div><div className="hero-divider" /><div><h1>GESTÃO 360</h1><h2>GESTÃO DE EMPRESAS DE ENGENHARIA CIVIL</h2><p>PLANEJAMENTO&nbsp;&nbsp;•&nbsp;&nbsp;CONTROLE&nbsp;&nbsp;•&nbsp;&nbsp;EXECUÇÃO&nbsp;&nbsp;•&nbsp;&nbsp;RESULTADOS</p></div></div>
        <div className="hero-message"><strong>OBRAS<br />MAIS ORGANIZADAS<br />CONSTROEM<br />GRANDES RESULTADOS</strong><em>Hoje<br />construímos<br />o amanhã</em></div>
        <div className="hero-strip">PESSOAS | PROCESSOS | TECNOLOGIA | CRESCIMENTO</div>
      </section>
      <section className="welcome-row"><div className="welcome"><div className="sun">☼</div><div><h3>Bem-vindo, Luan!</h3><p>Aqui é onde grandes obras começam com uma boa gestão.</p></div></div><div className="date-card"><span>▣</span><div><strong>Quinta-feira, 24 de Setembro de 2026</strong><small>"Disciplina hoje, grandes resultados amanhã."</small></div></div></section>
      <section className="metrics"><Metric icon="▤" title="Contratos Ativos" value="12" tone="blue" /><Metric icon="▣" title="Obras em Execução" value="5" tone="green" /><Metric icon="◷" title="Pendências" value="8" tone="yellow" /><Metric icon="▥" title="Relatórios" value="Acessar" tone="purple" /></section>
    </>
  );
}

function Metric({ icon, title, value, tone }: { icon: string; title: string; value: string; tone: string }) {
  return <button className={`metric ${tone}`}><span className="metric-icon">{icon}</span><div><small>{title}</small><strong>{value}</strong></div><b>›</b></button>;
}
