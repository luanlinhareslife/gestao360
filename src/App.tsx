import { useMemo, useState } from 'react';

const modules = [
  ['Dashboard', '⌂'],
  ['Empresas', '♧'],
  ['Contratos', '▤'],
  ['ART / Responsabilidade Técnica', '✓'],
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

const artRules = [
  {
    code: 'ART-001',
    title: 'Controle de Responsabilidade Técnica',
    description: 'Ao cadastrar um contrato, identificar as atividades de engenharia e verificar profissional habilitado, vínculo/responsabilidade compatível e ART correspondente.',
    severity: 'CRÍTICO',
  },
  {
    code: 'ART-002',
    title: 'Especialidade profissional',
    description: 'Quando o objeto envolver uma modalidade de engenharia, conferir profissional com atribuição compatível e situação regular perante o Conselho antes de considerar a responsabilidade técnica atendida.',
    severity: 'CRÍTICO',
  },
  {
    code: 'ART-003',
    title: 'ART posterior ao início',
    description: 'Comparar registro da ART com a Ordem de Serviço e o início efetivo. Se a ART for posterior ao início, gerar alerta para análise.',
    severity: 'ALERTA',
  },
  {
    code: 'ART-004',
    title: 'ART autônomo × empresa',
    description: 'Se a ART estiver registrada em nome de profissional autônomo enquanto o serviço é executado por pessoa jurídica, exigir conferência da vinculação da responsabilidade técnica à empresa.',
    severity: 'CRÍTICO',
  },
];

const timeline = [
  ['Contrato assinado', 'Iniciar conferência de responsabilidade técnica'],
  ['Objeto analisado', 'Identificar especialidades e atividades'],
  ['Profissionais identificados', 'Conferir habilitação e vínculo'],
  ['ART cargo/função', 'Conferir existência e compatibilidade'],
  ['ART obra/serviço', 'Conferir registro e vínculo ao contrato'],
  ['OS / início', 'Liberar somente após conferência das pendências críticas'],
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
        <button className="context-button"><span>▣</span><strong>Gestão por exceção<br />Motor 360 ativo</strong></button>
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
        {active === 'ART / Responsabilidade Técnica' && <ArtModule />}
        {!['Dashboard', 'Empresas', 'ART / Responsabilidade Técnica'].includes(active) && (
          <section className="module-placeholder"><div className="placeholder-icon">{modules.find(([name]) => name === active)?.[1]}</div><h2>{active}</h2><p>Este módulo será desenvolvido dentro da plataforma definitiva do Gestão 360.</p></section>
        )}
      </main>
    </div>
  );
}

function ArtModule() {
  return (
    <section className="page art-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">MOTOR 360 • CONTROLE PREVENTIVO</span>
          <h1>ART / Responsabilidade Técnica</h1>
          <p>Controle de ARTs, profissionais, especialidades, vínculos e prazos antes do início dos serviços.</p>
        </div>
        <button className="primary-button">+ Nova ART</button>
      </div>

      <div className="art-warning">
        <div className="warning-icon">!</div>
        <div><strong>Regra preventiva ativa</strong><p>Contrato assinado → analisar objeto → identificar especialidades → conferir profissional e vínculo → conferir ART → somente então liberar o início dos serviços.</p></div>
      </div>

      <div className="art-summary">
        <div className="art-stat"><span>ARTs pendentes</span><strong>3</strong><small>Exigem análise</small></div>
        <div className="art-stat"><span>ARTs regulares</span><strong>9</strong><small>Conferidas pelo sistema</small></div>
        <div className="art-stat critical"><span>Alertas críticos</span><strong>2</strong><small>Antes do início</small></div>
        <div className="art-stat"><span>Especialidades</span><strong>4</strong><small>Identificadas em contratos</small></div>
      </div>

      <div className="art-section">
        <div className="section-title"><div><span className="eyebrow">REGRAS DO MOTOR 360</span><h2>Regras ART cadastradas</h2></div><span className="rule-count">{artRules.length} regras</span></div>
        <div className="rule-grid">
          {artRules.map(rule => (
            <article className="rule-card" key={rule.code}>
              <div className="rule-top"><span className="rule-code">{rule.code}</span><span className={rule.severity === 'CRÍTICO' ? 'severity critical' : 'severity alert'}>{rule.severity}</span></div>
              <h3>{rule.title}</h3>
              <p>{rule.description}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="art-two-col">
        <div className="art-panel">
          <div className="section-title"><div><span className="eyebrow">LINHA DO TEMPO</span><h2>Fluxo preventivo</h2></div></div>
          <div className="timeline">
            {timeline.map(([title, detail], index) => (
              <div className="timeline-item" key={title}>
                <span className="timeline-dot">{index + 1}</span>
                <div><strong>{title}</strong><p>{detail}</p></div>
              </div>
            ))}
          </div>
        </div>

        <div className="art-panel">
          <div className="section-title"><div><span className="eyebrow">ESPECIALIDADES</span><h2>Conferência por modalidade</h2></div></div>
          <div className="specialty-list">
            <div><span>⚡</span><strong>Elétrica</strong><em>RT compatível + ART específica</em></div>
            <div><span>🏗</span><strong>Civil</strong><em>RT compatível + ART específica</em></div>
            <div><span>⚙</span><strong>Mecânica</strong><em>RT compatível + ART específica</em></div>
            <div><span>🦺</span><strong>Segurança do Trabalho</strong><em>Conferir atribuição e vínculo</em></div>
          </div>
        </div>
      </div>

      <div className="art-principle">
        <span>🧠</span>
        <div><strong>Princípio do Motor 360</strong><p>O sistema não deve apenas registrar a ART. Deve detectar antecipadamente quando a responsabilidade técnica, a especialidade, o vínculo ou a data de registro podem gerar uma pendência.</p></div>
      </div>
    </section>
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
      <section className="welcome-row"><div className="welcome"><div className="sun">☼</div><div><h3>Bem-vindo, Luan!</h3><p>Aqui é onde grandes obras começam com uma boa gestão.</p></div></div><div className="date-card"><span>▣</span><div><strong>Segunda-feira, 28 de Setembro de 2026</strong><small>"Disciplina hoje, grandes resultados amanhã."</small></div></div></section>
      <section className="metrics"><Metric icon="▤" title="Contratos Ativos" value="12" tone="blue" /><Metric icon="▣" title="Obras em Execução" value="5" tone="green" /><Metric icon="◷" title="Pendências" value="8" tone="yellow" /><Metric icon="✓" title="ART / RT" value="Acessar" tone="purple" /></section>
    </>
  );
}

function Metric({ icon, title, value, tone }: { icon: string; title: string; value: string; tone: string }) {
  return <button className={`metric ${tone}`}><span className="metric-icon">{icon}</span><div><small>{title}</small><strong>{value}</strong></div><b>›</b></button>;
}
