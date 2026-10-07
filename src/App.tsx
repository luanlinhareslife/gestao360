import { useMemo, useState } from 'react';
import { analyzePostSignature, contracts, obligations, type Contract, type Obligation } from './data/contracts';
import { extractContractFromPdf, type ExtractedContract } from './services/pdfContractAnalyzer';

const modules = [
  ['Dashboard', '⌂'],
  ['Empresas', '♧'],
  ['Contratos', '▤'],
  ['Obrigações e Alertas', '⚠'],
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
        {active === 'Contratos' && <ContractModule />}
        {active === 'Obrigações e Alertas' && <ObligationModule />}
        {active === 'ART / Responsabilidade Técnica' && <ArtModule />}
        {!['Dashboard', 'Empresas', 'Contratos', 'Obrigações e Alertas', 'ART / Responsabilidade Técnica'].includes(active) && (
          <section className="module-placeholder"><div className="placeholder-icon">{modules.find(([name]) => name === active)?.[1]}</div><h2>{active}</h2><p>Este módulo será desenvolvido dentro da plataforma definitiva do Gestão 360.</p></section>
        )}
      </main>
    </div>
  );
}

function ContractModule() {
  const [selected, setSelected] = useState<Contract | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [pdfAnalysis, setPdfAnalysis] = useState<ExtractedContract | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState('');

  const openAnalysis = (contract: Contract) => {
    setSelected(contract);
    setAnalysisOpen(true);
  };

  const handleContractPdf = async (file?: File) => {
    if (!file) return;
    setPdfError('');
    setPdfLoading(true);
    try {
      const result = await extractContractFromPdf(file);
      setPdfAnalysis(result);
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : 'Não foi possível analisar o PDF.');
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <section className="page contract-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">MOTOR 360 • GESTÃO CONTRATUAL</span>
          <h1>Contratos</h1>
          <p>O contrato assinado dispara automaticamente o checklist de pós-assinatura, prazos, gatilhos e alertas.</p>
        </div>
        <label className="primary-button upload-contract-button">
          {pdfLoading ? 'Analisando PDF...' : '📄 Analisar contrato PDF'}
          <input type="file" accept="application/pdf,.pdf" onChange={event => handleContractPdf(event.target.files?.[0])} />
        </label>
      </div>

      {pdfError && <div className="pdf-error">{pdfError}</div>}
      <div className="contract-principle">
        <div className="contract-principle-icon">🧠</div>
        <div>
          <strong>Fluxo inteligente do Gestão 360</strong>
          <p>Cadastrar contrato → analisar obrigações → criar tarefas → calcular gatilhos → alertar → acompanhar até concluir.</p>
        </div>
      </div>

      <div className="contract-grid">
        {contracts.map(contract => (
          <article className="contract-card" key={contract.id}>
            <div className="contract-card-head">
              <div>
                <span className="contract-status">{contract.status}</span>
                <h2>Contrato nº {contract.number}</h2>
                <p>Processo {contract.process}</p>
              </div>
              <div className="contract-value">
                <small>Valor contratual</small>
                <strong>{formatCurrency(contract.value)}</strong>
              </div>
            </div>

            <div className="contract-facts">
              <div><span>Contratante</span><strong>{contract.agency}</strong></div>
              <div><span>Contratada</span><strong>{contract.contractor}</strong></div>
              <div><span>Assinatura</span><strong>{contract.signedAt}</strong></div>
              <div><span>Execução</span><strong>{contract.executionDays} dias</strong></div>
              <div><span>Garantia</span><strong>{contract.guaranteePercent}% · {formatCurrency(contract.guaranteeValue)}</strong></div>
              <div><span>Validade</span><strong>{contract.validity}</strong></div>
            </div>

            <div className="contract-object"><span>Objeto</span><p>{contract.object}</p></div>

            <button className="primary-button contract-analysis-button" onClick={() => openAnalysis(contract)}>
              Analisar pós-assinatura →
            </button>
          </article>
        ))}
      </div>

      {analysisOpen && selected && (
        <PostSignaturePanel contract={selected} onClose={() => setAnalysisOpen(false)} />
      )}
      {pdfAnalysis && (
        <PdfAnalysisPanel analysis={pdfAnalysis} onClose={() => setPdfAnalysis(null)} />
      )}
    </section>
  );
}

function PdfAnalysisPanel({ analysis, onClose }: { analysis: ExtractedContract; onClose: () => void }) {
  const detectedEntries = Object.entries(analysis.detected).filter(([, value]) => value !== undefined);
  return (
    <div className="analysis-overlay" role="dialog" aria-modal="true">
      <div className="analysis-panel">
        <div className="analysis-header">
          <div>
            <span className="eyebrow">MOTOR 360 • LEITURA AUTOMÁTICA</span>
            <h2>{analysis.fileName}</h2>
            <p>{analysis.pages} página(s) analisada(s) · {analysis.obligations.length} regra(s) identificada(s)</p>
          </div>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="pdf-detected-grid">
          <div><span>Contrato</span><strong>{analysis.detected.number ?? 'Não identificado'}</strong></div>
          <div><span>Processo</span><strong>{analysis.detected.process ?? 'Não identificado'}</strong></div>
          <div><span>Valor</span><strong>{analysis.detected.value ? formatCurrency(analysis.detected.value) : 'Não identificado'}</strong></div>
          <div><span>Assinatura</span><strong>{analysis.detected.signedAt ?? 'Não identificado'}</strong></div>
          <div><span>Execução</span><strong>{analysis.detected.executionDays ? `${analysis.detected.executionDays} dias` : 'Não identificado'}</strong></div>
          <div><span>Garantia</span><strong>{analysis.detected.guaranteePercent ? `${analysis.detected.guaranteePercent}%` : 'Não identificada'}</strong></div>
        </div>

        <div className="analysis-summary">
          <div><strong>{analysis.obligations.length}</strong><span>obrigações encontradas</span></div>
          <div className="critical-summary"><strong>{analysis.obligations.filter(item => item.severity === 'CRÍTICO').length}</strong><span>críticas</span></div>
          <div><strong>{analysis.obligations.filter(item => item.severity === 'ALTO').length}</strong><span>alta prioridade</span></div>
        </div>

        <div className="obligation-list">
          {analysis.obligations.length ? analysis.obligations.map(item => <ObligationCard key={item.id} item={item} />) : (
            <div className="pdf-empty">O texto foi extraído, mas nenhuma regra automática foi acionada. O contrato precisa de revisão manual.</div>
          )}
        </div>

        <div className="analysis-footer">
          <strong>Como o Motor 360 está trabalhando nesta versão</strong>
          <span>O PDF é lido localmente no aplicativo, o texto é extraído e as regras contratuais cadastradas procuram cláusulas e termos relevantes. O resultado deve ser revisado antes de virar obrigação definitiva.</span>
        </div>
      </div>
    </div>
  );
}

function PostSignaturePanel({ contract, onClose }: { contract: Contract; onClose: () => void }) {
  const items = analyzePostSignature(contract.id);
  const critical = items.filter(item => item.severity === 'CRÍTICO' || item.severity === 'ALTO').length;
  return (
    <div className="analysis-overlay" role="dialog" aria-modal="true">
      <div className="analysis-panel">
        <div className="analysis-header">
          <div>
            <span className="eyebrow">ANÁLISE PÓS-ASSINATURA</span>
            <h2>Contrato nº {contract.number}</h2>
            <p>{contract.process} · {items.length} obrigações identificadas · {critical} de prioridade alta/crítica</p>
          </div>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="analysis-summary">
          <div><strong>{items.length}</strong><span>obrigações</span></div>
          <div className="critical-summary"><strong>{critical}</strong><span>prioridade alta/crítica</span></div>
          <div><strong>{items.filter(item => item.status === 'PENDENTE' || item.status === 'VERIFICAÇÃO URGENTE').length}</strong><span>pendências</span></div>
        </div>

        <div className="obligation-list">
          {items.map(item => <ObligationCard key={item.id} item={item} />)}
        </div>

        <div className="analysis-footer">
          <strong>Regra aplicada pelo Motor 360</strong>
          <span>O sistema transforma as obrigações contratuais em tarefas acompanháveis, mantendo a cláusula de origem e o gatilho de cada item.</span>
        </div>
      </div>
    </div>
  );
}

function ObligationCard({ item }: { item: Obligation }) {
  return (
    <article className="obligation-card">
      <div className="obligation-card-top">
        <div>
          <span className={`severity-badge ${item.severity.toLowerCase()}`}>{item.severity}</span>
          <h3>{item.title}</h3>
        </div>
        <span className={`obligation-status ${item.status.toLowerCase().replace(/\s+/g, '-')}`}>{item.status}</span>
      </div>
      <div className="obligation-meta">
        <span><b>Gatilho:</b> {item.trigger}</span>
        <span><b>Prazo:</b> {item.deadline}</span>
        <span><b>Origem:</b> {item.source}</span>
      </div>
      <p className="obligation-action"><b>Ação:</b> {item.action}</p>
    </article>
  );
}

function ObligationModule() {
  const [filter, setFilter] = useState<'TODAS' | Obligation['status']>('TODAS');
  const visible = filter === 'TODAS' ? obligations : obligations.filter(item => item.status === filter);
  const urgent = obligations.filter(item => item.severity === 'CRÍTICO' || item.severity === 'ALTO').length;

  return (
    <section className="page obligation-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">MOTOR 360 • RADAR PREVENTIVO</span>
          <h1>Obrigações e Alertas</h1>
          <p>Centralize tudo que precisa ser feito antes, durante e depois da execução contratual.</p>
        </div>
      </div>

      <div className="obligation-summary">
        <div><span>Total</span><strong>{obligations.length}</strong><small>obrigações cadastradas</small></div>
        <div><span>Pendentes</span><strong>{obligations.filter(item => item.status === 'PENDENTE' || item.status === 'VERIFICAÇÃO URGENTE').length}</strong><small>exigem ação</small></div>
        <div className="urgent"><span>Alta prioridade</span><strong>{urgent}</strong><small>críticas ou altas</small></div>
        <div><span>Em acompanhamento</span><strong>{obligations.filter(item => item.status === 'EM ACOMPANHAMENTO').length}</strong><small>monitoradas pelo sistema</small></div>
      </div>

      <div className="obligation-toolbar">
        <div>
          <span className="eyebrow">CONTRATO Nº 89/2026</span>
          <h2>Radar de pós-assinatura</h2>
        </div>
        <div className="filter-buttons">
          {(['TODAS', 'PENDENTE', 'VERIFICAÇÃO URGENTE', 'EM ACOMPANHAMENTO'] as const).map(option => (
            <button key={option} className={filter === option ? 'filter-button active' : 'filter-button'} onClick={() => setFilter(option)}>
              {option === 'TODAS' ? 'Todas' : option.toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="obligation-list standalone">
        {visible.map(item => <ObligationCard key={item.id} item={item} />)}
      </div>
    </section>
  );
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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
