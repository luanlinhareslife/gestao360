import { useEffect, useMemo, useState, type FormEvent } from 'react';

type CompanyDocument = { id: string; name: string; category: string; expiresAt: string; fileName: string };
type CompanyRecord = { id: string; name: string; cnpj: string; city: string; email: string; phone: string; logoName: string; signatureName: string; documents: CompanyDocument[]; createdAt: string };
const STORAGE_KEY = 'gestao360.companies.v1';

const initialCompanies: CompanyRecord[] = [
  { id: 'terra-forte', name: 'Terra Forte LTDA', cnpj: '01.999.130/0001-42', city: 'Porto Velho/RO', email: '', phone: '', logoName: '', signatureName: '', documents: [], createdAt: '2026-01-01' },
  { id: 'mm-servicos', name: 'MM Serviços Especializados LTDA', cnpj: '26.473.197/0001-70', city: 'Porto Velho/RO', email: '', phone: '', logoName: '', signatureName: '', documents: [], createdAt: '2026-01-01' },
];

function readCompanies(): CompanyRecord[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored) as CompanyRecord[];
  } catch { /* usa a base inicial quando o armazenamento local não estiver disponível */ }
  return initialCompanies;
}

function daysUntil(date: string) {
  if (!date) return null;
  return Math.ceil((new Date(date + 'T23:59:59').getTime() - Date.now()) / 86400000);
}

export default function EmpresasModule() {
  const [companies, setCompanies] = useState<CompanyRecord[]>(readCompanies);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState({ name: '', cnpj: '', city: '', email: '', phone: '' });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(companies)); } catch {
      window.alert('Não foi possível salvar. O armazenamento local pode estar cheio.');
    }
  }, [companies]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return companies.filter(company => !term || [company.name, company.cnpj, company.city].some(value => value.toLowerCase().includes(term)));
  }, [companies, search]);

  const selected = companies.find(company => company.id === selectedId) ?? null;
  const expiring = companies.flatMap(company => company.documents.map(doc => ({ company, doc, days: daysUntil(doc.expiresAt) })))
    .filter(item => item.days !== null && item.days <= 30);

  const createCompany = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const company: CompanyRecord = { ...draft, id: 'company-' + Date.now().toString(36), logoName: '', signatureName: '', documents: [], createdAt: new Date().toISOString() };
    setCompanies(current => [...current, company]);
    setSelectedId(company.id);
    setShowForm(false);
    setDraft({ name: '', cnpj: '', city: '', email: '', phone: '' });
  };

  const updateSelected = (patch: Partial<CompanyRecord>) => {
    if (!selected) return;
    setCompanies(current => current.map(company => company.id === selected.id ? { ...company, ...patch } : company));
  };

  const addDocument = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const file = form.get('document') as File;
    const name = String(form.get('docName') || file?.name || 'Documento');
    const category = String(form.get('category') || 'Geral');
    const expiresAt = String(form.get('expiresAt') || '');
    const doc: CompanyDocument = { id: 'doc-' + Date.now().toString(36), name, category, expiresAt, fileName: file?.name || '' };
    updateSelected({ documents: [...selected.documents, doc] });
    event.currentTarget.reset();
  };

  const saveBrandFile = (kind: 'logoName' | 'signatureName', file?: File) => {
    if (file) updateSelected({ [kind]: file.name });
  };

  return (
    <section className="page companies-page">
      <div className="page-heading">
        <div><span className="eyebrow">GESTÃO 360 • CADASTRO CENTRAL</span><h1>Empresas</h1><p>Cadastre cada empresa e mantenha seus documentos, identidade visual e vencimentos organizados separadamente.</p></div>
        <button className="primary-button" onClick={() => setShowForm(value => !value)}>＋ Nova empresa</button>
      </div>

      {showForm && <form className="company-create-form" onSubmit={createCompany}>
        <label>Razão social<input required value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Nome da empresa" /></label>
        <label>CNPJ<input required value={draft.cnpj} onChange={e => setDraft({ ...draft, cnpj: e.target.value })} placeholder="00.000.000/0000-00" /></label>
        <label>Cidade/UF<input value={draft.city} onChange={e => setDraft({ ...draft, city: e.target.value })} placeholder="Cidade/UF" /></label>
        <label>E-mail<input type="email" value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} placeholder="contato@empresa.com" /></label>
        <label>Telefone<input value={draft.phone} onChange={e => setDraft({ ...draft, phone: e.target.value })} placeholder="(00) 00000-0000" /></label>
        <div className="company-form-actions"><button className="primary-button" type="submit">Salvar empresa</button><button className="outline-button" type="button" onClick={() => setShowForm(false)}>Cancelar</button></div>
      </form>}

      <div className="company-toolbar">
        <div className="search-box">⌕<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por empresa, CNPJ ou cidade..." /></div>
        <div className="toolbar-count">{filtered.length} empresa(s) cadastrada(s)</div>
      </div>

      {expiring.length > 0 && <div className="company-expiry-alert"><strong>⚠ Atenção: {expiring.length} documento(s) vencido(s) ou próximo(s) do vencimento</strong><span>{expiring.map(item => item.company.name + ' — ' + item.doc.name).join(' · ')}</span></div>}

      <div className="company-workspace">
        <div className="company-list">
          {filtered.map(company => <button key={company.id} className={'company-list-item' + (selectedId === company.id ? ' active' : '')} onClick={() => setSelectedId(company.id)}>
            <span className="company-list-logo">⚙</span><span><strong>{company.name}</strong><small>{company.cnpj}</small><small>{company.city || 'Cidade não informada'}</small></span><b>›</b>
          </button>)}
          {!filtered.length && <p className="company-empty">Nenhuma empresa encontrada.</p>}
        </div>

        {selected ? <div className="company-detail">
          <div className="company-detail-head"><div><span className="eyebrow">PAINEL DA EMPRESA</span><h2>{selected.name}</h2><p>{selected.cnpj} · {selected.city || 'Cidade não informada'}</p></div><span className="status-pill">Cadastro ativo</span></div>
          <div className="company-branding-grid">
            <label className="company-upload-tile"> <span>▧</span><strong>Logotipo da empresa</strong><small>{selected.logoName || 'Enviar imagem do logotipo'}</small><input type="file" accept="image/*" onChange={e => saveBrandFile('logoName', e.target.files?.[0])} /></label>
            <label className="company-upload-tile"><span>✍</span><strong>Assinatura</strong><small>{selected.signatureName || 'Enviar imagem da assinatura'}</small><input type="file" accept="image/*,.png,.jpg,.jpeg" onChange={e => saveBrandFile('signatureName', e.target.files?.[0])} /></label>
          </div>
          <div className="company-doc-header"><div><span className="eyebrow">ARQUIVO DOCUMENTAL</span><h3>Documentos e certidões</h3></div><span>{selected.documents.length} arquivo(s) registrados</span></div>
          <form className="company-document-form" onSubmit={addDocument}>
            <label>Nome do documento<input name="docName" placeholder="Ex.: Certidão Federal" required /></label>
            <label>Categoria<select name="category"><option>Fiscal</option><option>Trabalhista</option><option>Previdenciária</option><option>Conselho profissional</option><option>Societária</option><option>Outros</option></select></label>
            <label>Vencimento<input name="expiresAt" type="date" /></label>
            <label className="file-field">Arquivo<input name="document" type="file" /></label>
            <button className="primary-button" type="submit">＋ Registrar documento</button>
          </form>
          <div className="company-document-list">
            {selected.documents.map(doc => {
              const days = daysUntil(doc.expiresAt);
              const status = days === null ? 'Sem vencimento informado' : days < 0 ? 'Vencido há ' + Math.abs(days) + ' dia(s)' : days <= 30 ? 'Vence em ' + days + ' dia(s)' : 'Dentro da validade';
              return <article key={doc.id}><span className="document-file-icon">▤</span><div><strong>{doc.name}</strong><small>{doc.category} · {doc.fileName || 'Sem arquivo anexado'}</small></div><span className={days !== null && days <= 30 ? 'document-expiry warning' : 'document-expiry'}>{status}</span><button type="button" className="delete-document" onClick={() => updateSelected({ documents: selected.documents.filter(item => item.id !== doc.id) })}>Excluir</button></article>;
            })}
            {!selected.documents.length && <p className="company-empty">Nenhum documento registrado para esta empresa.</p>}
          </div>
          <p className="company-storage-note">Este primeiro cadastro grava os metadados no armazenamento local deste computador. A guarda segura e sincronizada dos arquivos e das imagens será conectada à base central na próxima etapa.</p>
        </div> : <div className="company-detail company-empty-state"><span>♧</span><h2>Selecione uma empresa</h2><p>Escolha uma empresa para administrar seus dados e documentos.</p></div>}
      </div>
    </section>
  );
}
