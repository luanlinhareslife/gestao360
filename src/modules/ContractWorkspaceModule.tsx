import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { contracts as seedContracts, type Contract } from '../data/contracts';
import { extractContractFromPdf, type ExtractedContract } from '../services/pdfContractAnalyzer';

type WorkspaceTab = 'Resumo' | 'Tarefas' | 'Documentos' | 'Cronograma físico-financeiro' | 'Medições' | 'Diário 360';
type Stage = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  physicalWeight: number;
  plannedValue: number;
  actualPhysical: number;
  actualValue: number;
};
type ScheduleByContract = Record<string, Stage[]>;
type UploadedSchedule = { contractId: string; name: string; size: number; type: string; savedAt: string };
type ContractDocument = { id: string; contractId: string; name: string; size: number; type: string; savedAt: string; category: string; file: File; extracted?: ExtractedContract; analysisStatus: 'Lido' | 'Armazenado' | 'Falha na leitura' };
const FILE_DB = 'gestao360-contract-files';
const FILE_STORE = 'schedules';
const DOCUMENT_STORE = 'documents';
function openFileDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FILE_DB, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FILE_STORE)) db.createObjectStore(FILE_STORE, { keyPath: 'contractId' });
      if (!db.objectStoreNames.contains(DOCUMENT_STORE)) db.createObjectStore(DOCUMENT_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function saveScheduleFile(contractId: string, file: File) {
  const db = await openFileDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(FILE_STORE, 'readwrite');
    transaction.objectStore(FILE_STORE).put({ contractId, name: file.name, size: file.size, type: file.type, savedAt: new Date().toISOString(), file });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}
async function saveContractDocument(document: ContractDocument) {
  const db = await openFileDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(DOCUMENT_STORE, 'readwrite');
    transaction.objectStore(DOCUMENT_STORE).put(document);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}
async function readContractDocuments(contractId: string): Promise<ContractDocument[]> {
  const db = await openFileDb();
  const records = await new Promise<ContractDocument[]>((resolve, reject) => {
    const request = db.transaction(DOCUMENT_STORE, 'readonly').objectStore(DOCUMENT_STORE).getAll();
    request.onsuccess = () => resolve((request.result as ContractDocument[]).filter(item => item.contractId === contractId));
    request.onerror = () => reject(request.error);
  });
  db.close();
  return records.sort((a,b) => b.savedAt.localeCompare(a.savedAt));
}
async function deleteContractDocument(id: string) {
  const db = await openFileDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(DOCUMENT_STORE, 'readwrite');
    transaction.objectStore(DOCUMENT_STORE).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}
function classifyDocument(name: string): string {
  const value = name.toLocaleLowerCase('pt-BR');
  if (/contrato|termo/.test(value)) return 'Contrato / Aditivo';
  if (/art|responsabilidade/.test(value)) return 'ART / Responsabilidade técnica';
  if (/cronograma|planilha|orcamento|orçamento/.test(value)) return 'Planilha / Cronograma';
  if (/seguro|garantia|apolice|apólice/.test(value)) return 'Seguro / Garantia';
  if (/ordem.?de.?servico|ordem.?de.?serviço|\bos\b/.test(value)) return 'Ordem de Serviço';
  if (/projeto|desenho|memorial/.test(value)) return 'Projeto / Memorial';
  if (/medicao|medição|memoria|memória/.test(value)) return 'Medição';
  return 'Documento geral';
}
async function readScheduleFile(contractId: string): Promise<{ file: File; meta: UploadedSchedule } | null> {
  const db = await openFileDb();
  const record = await new Promise<any>((resolve, reject) => {
    const request = db.transaction(FILE_STORE, 'readonly').objectStore(FILE_STORE).get(contractId);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return record ? { file: record.file as File, meta: { contractId, name: record.name, size: record.size, type: record.type, savedAt: record.savedAt } } : null;
}

const tabs: Array<{ name: WorkspaceTab; icon: string }> = [
  { name: 'Resumo', icon: '▦' },
  { name: 'Tarefas', icon: '☑' },
  { name: 'Documentos', icon: '▤' },
  { name: 'Cronograma físico-financeiro', icon: '▥' },
  { name: 'Medições', icon: 'R$' },
  { name: 'Diário 360', icon: '▣' },
];
const STORAGE_KEY = 'gestao360.workSchedules.v1';
const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const percent = (value: number) => `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

function diaryUrlForContract(contract: Contract) {
  const url = new URL('https://diario-360-9ux61w.v2.appdeploy.ai/');
  // Stable identity: the diary app must use this ID as the primary contract/obra link.
  // Text fields remain as human-readable metadata and migration fallback only.
  url.searchParams.set('contractId', contract.id);
  url.searchParams.set('companyCnpj', contract.cnpj.replace(/\\D/g, ''));
  url.searchParams.set('contract', contract.number);
  url.searchParams.set('process', contract.process);
  url.searchParams.set('contractor', contract.contractor);
  url.searchParams.set('agency', contract.agency);
  url.searchParams.set('object', contract.object);
  url.searchParams.set('embed', '1');
  return url.toString();
}

const CONTRACTS_KEY = 'gestao360.contracts.v1';
type ContractDraft = { number: string; process: string; agency: string; contractor: string; cnpj: string; object: string; value: string; signedAt: string; executionDays: string; validity: string; guaranteePercent: string };
const emptyContractDraft: ContractDraft = { number: '', process: '', agency: '', contractor: '', cnpj: '', object: '', value: '', signedAt: '', executionDays: '', validity: '', guaranteePercent: '' };

export default function ContractWorkspaceModule() {
  const [contractList, setContractList] = useState<Contract[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CONTRACTS_KEY) ?? '[]') as Contract[];
      return [...seedContracts, ...saved.filter(item => !seedContracts.some(seed => seed.id === item.id))];
    } catch { return seedContracts; }
  });
  const [showNewContract, setShowNewContract] = useState(false);
  const [draft, setDraft] = useState<ContractDraft>(emptyContractDraft);
  const [contractError, setContractError] = useState('');
  const [readingNewContract, setReadingNewContract] = useState(false);
  const [newContractFileName, setNewContractFileName] = useState('');
  const [newContractReadMessage, setNewContractReadMessage] = useState('');
  const [selectedId, setSelectedId] = useState(contractList[0]?.id ?? '');
  const [tab, setTab] = useState<WorkspaceTab>('Resumo');
  const [schedule, setSchedule] = useState<ScheduleByContract>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as ScheduleByContract; }
    catch { return {}; }
  });
  const [stageName, setStageName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [weight, setWeight] = useState('0');
  const [plannedValue, setPlannedValue] = useState('0');
  const [formError, setFormError] = useState('');
  const [uploadedSchedule, setUploadedSchedule] = useState<UploadedSchedule | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [documents, setDocuments] = useState<ContractDocument[]>([]);
  const [documentError, setDocumentError] = useState('');
  const [readingDocument, setReadingDocument] = useState(false);
  const [selectedAnalysis, setSelectedAnalysis] = useState<ExtractedContract | null>(null);

  useEffect(() => {
    if (!selectedId) { setUploadedSchedule(null); setDocuments([]); return; }
    readScheduleFile(selectedId).then(result => setUploadedSchedule(result?.meta ?? null)).catch(() => setUploadError('Não foi possível consultar o arquivo salvo neste dispositivo.'));
    readContractDocuments(selectedId).then(setDocuments).catch(() => setDocumentError('Não foi possível consultar os documentos deste contrato.'));
    setSelectedAnalysis(null);
  }, [selectedId]);

  const handleScheduleUpload = async (file?: File) => {
    if (!file || !selected) return;
    setUploadError('');
    const allowed = /\.(pdf|xlsx?)$/i.test(file.name);
    if (!allowed) { setUploadError('Envie um arquivo PDF, XLS ou XLSX.'); return; }
    if (file.size > 30 * 1024 * 1024) { setUploadError('O arquivo deve ter até 30 MB.'); return; }
    setUploading(true);
    try {
      await saveScheduleFile(selected.id, file);
      const result = await readScheduleFile(selected.id);
      setUploadedSchedule(result?.meta ?? null);
    } catch {
      setUploadError('Não foi possível guardar o arquivo neste dispositivo. Verifique o espaço disponível.');
    } finally { setUploading(false); }
  };

  const handleContractDocuments = async (files: FileList | null) => {
    if (!files || !selected) return;
    setDocumentError('');
    setReadingDocument(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 40 * 1024 * 1024) {
          setDocumentError(`${file.name}: arquivo acima do limite de 40 MB.`);
          continue;
        }
        const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
        const supported = ['pdf','doc','docx','xls','xlsx','png','jpg','jpeg','webp'];
        if (!supported.includes(extension)) {
          setDocumentError(`${file.name}: formato não suportado nesta versão.`);
          continue;
        }
        const base = {
          id: crypto.randomUUID(), contractId: selected.id, name: file.name, size: file.size,
          type: file.type || extension, savedAt: new Date().toISOString(),
          category: classifyDocument(file.name), file, analysisStatus: 'Armazenado' as ContractDocument['analysisStatus'],
        };
        let documentRecord: ContractDocument = base;
        if (extension === 'pdf') {
          try {
            const extracted = await extractContractFromPdf(file);
            documentRecord = { ...base, extracted, analysisStatus: extracted.text ? 'Lido' : 'Falha na leitura' };
            if (extracted.text) setSelectedAnalysis(extracted);
          } catch {
            documentRecord = { ...base, analysisStatus: 'Falha na leitura' };
          }
        }
        await saveContractDocument(documentRecord);
      }
      setDocuments(await readContractDocuments(selected.id));
    } catch {
      setDocumentError('Não foi possível salvar os arquivos neste dispositivo. Verifique o espaço disponível.');
    } finally {
      setReadingDocument(false);
    }
  };

  const removeContractDocument = async (id: string) => {
    if (!window.confirm('Excluir este arquivo da pasta contratual?')) return;
    await deleteContractDocument(id);
    setDocuments(await readContractDocuments(selectedId));
    if (selectedAnalysis && documents.find(item => item.id === id)?.extracted === selectedAnalysis) setSelectedAnalysis(null);
  };

  const downloadContractDocument = (item: ContractDocument) => {
    const url = URL.createObjectURL(item.file);
    const link = document.createElement('a');
    link.href = url; link.download = item.name; link.click();
    URL.revokeObjectURL(url);
  };

  const downloadSchedule = async () => {
    if (!selected) return;
    const result = await readScheduleFile(selected.id);
    if (!result) return;
    const url = URL.createObjectURL(result.file);
    const link = document.createElement('a');
    link.href = url; link.download = result.file.name; link.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(schedule));
  }, [schedule]);

  useEffect(() => {
    const additions = contractList.filter(item => !seedContracts.some(seed => seed.id === item.id));
    localStorage.setItem(CONTRACTS_KEY, JSON.stringify(additions));
  }, [contractList]);

  const handleNewContractPdf = async (file?: File) => {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setNewContractReadMessage('Envie um contrato em PDF.');
      return;
    }
    setReadingNewContract(true);
    setNewContractFileName(file.name);
    setNewContractReadMessage('Lendo o PDF e identificando os dados do contrato...');
    try {
      const result = await extractContractFromPdf(file);
      const detected = result.detected;
      const signedAt = detected.signedAt
        ? detected.signedAt
        : '';
      const missing: string[] = [];
      if (!detected.number) missing.push('número');
      if (!detected.process) missing.push('processo');
      if (!detected.contractingAgency) missing.push('contratante');
      if (!detected.contractor) missing.push('contratada');
      if (!detected.contractorCnpj) missing.push('CNPJ da contratada');
      if (detected.value === undefined) missing.push('valor');
      if (!signedAt) missing.push('data de assinatura');
      if (!detected.executionDays) missing.push('prazo de execução');
      if (!detected.validityDays && !detected.validityEndDate) missing.push('vigência');
      if (!detected.object) missing.push('objeto');

      setDraft(current => ({
        ...current,
        number: detected.number ?? current.number,
        process: detected.administrativeProcess ?? detected.process ?? current.process,
        agency: detected.contractingAgency ?? current.agency,
        contractor: detected.contractor ?? current.contractor,
        cnpj: detected.contractorCnpj ?? current.cnpj,
        object: detected.object ?? current.object,
        value: detected.value !== undefined
          ? detected.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : current.value,
        signedAt: signedAt || current.signedAt,
        executionDays: detected.executionDays ? String(detected.executionDays) : current.executionDays,
        guaranteePercent: detected.guaranteePercent !== undefined
          ? String(detected.guaranteePercent)
          : current.guaranteePercent,
        validity: detected.validityEndDate
          ? `Até ${detected.validityEndDate.split('-').reverse().join('/')}${detected.validityRule ? ' · ' + detected.validityRule : ''}`
          : detected.validityDays
            ? `${detected.validityDays} dias${detected.validityRule ? ' · ' + detected.validityRule : ''}`
            : current.validity,
      }));
      const reviewNotes = [...missing, ...(detected.guaranteePercent === undefined ? ['percentual de garantia (não identificado no documento)'] : [])];
      setNewContractReadMessage(
        reviewNotes.length
          ? `Leitura concluída. Confira os campos preenchidos; não consegui identificar com segurança: ${reviewNotes.join(', ')}. A garantia ficará em branco para conferência, sem presumir 0%. Complete manualmente os campos restantes.`
          : 'Leitura concluída. Confira todos os campos antes de salvar. Os dados ainda não foram cadastrados.'
      );
    } catch (error) {
      setNewContractReadMessage(error instanceof Error ? error.message : 'Não foi possível ler o PDF. Você pode preencher os campos manualmente.');
    } finally {
      setReadingNewContract(false);
    }
  };

  const saveNewContract = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedValue = draft.value.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
    const value = Number(normalizedValue);
    const executionDays = Number(draft.executionDays);
    const guaranteePercent = Number(draft.guaranteePercent || 0);
    if (!draft.number.trim() || !draft.agency.trim() || !draft.contractor.trim() || !draft.object.trim()) {
      setContractError('Preencha número, contratante, contratada e objeto do contrato.');
      return;
    }
    if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(executionDays) || executionDays <= 0) {
      setContractError('Informe um valor contratual e prazo de execução válidos.');
      return;
    }
    const id = `contract-${crypto.randomUUID()}`;
    const created: Contract = {
      id, number: draft.number.trim(), process: draft.process.trim() || 'Não informado',
      agency: draft.agency.trim(), contractor: draft.contractor.trim(), cnpj: draft.cnpj.trim(),
      object: draft.object.trim(), value, signedAt: draft.signedAt.trim() || 'Não informado',
      executionDays, validity: draft.validity.trim() || 'Conforme contrato',
      guaranteePercent, guaranteeValue: value * guaranteePercent / 100, status: 'Cadastrado',
    };
    setContractList(items => [...items, created]);
    setSelectedId(id); setTab('Resumo'); setShowNewContract(false);
    setDraft(emptyContractDraft); setContractError('');
  };

  const selected = contractList.find(item => item.id === selectedId);
  const stages = selected ? schedule[selected.id] ?? [] : [];
  const totals = useMemo(() => ({
    weight: stages.reduce((sum, item) => sum + item.physicalWeight, 0),
    planned: stages.reduce((sum, item) => sum + item.plannedValue, 0),
    earned: stages.reduce((sum, item) => sum + item.physicalWeight * item.actualPhysical / 100, 0),
    actualValue: stages.reduce((sum, item) => sum + item.actualValue, 0),
  }), [stages]);

  const addStage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const physicalWeight = Number(weight);
    const value = Number(plannedValue);
    if (!selected) return;
    if (!stageName.trim() || !startDate || !endDate || endDate < startDate) {
      setFormError('Informe a etapa e um período válido.');
      return;
    }
    if (!Number.isFinite(physicalWeight) || physicalWeight <= 0 || physicalWeight > 100 || totals.weight + physicalWeight > 100.001) {
      setFormError('O peso físico deve ser maior que zero e a soma das etapas não pode ultrapassar 100%.');
      return;
    }
    if (!Number.isFinite(value) || value < 0 || totals.planned + value > selected.value + 0.01) {
      setFormError('O valor previsto não pode ser negativo nem ultrapassar o valor do contrato.');
      return;
    }
    const stage: Stage = {
      id: crypto.randomUUID(),
      name: stageName.trim(),
      startDate,
      endDate,
      physicalWeight,
      plannedValue: value,
      actualPhysical: 0,
      actualValue: 0,
    };
    setSchedule(current => ({ ...current, [selected.id]: [...(current[selected.id] ?? []), stage] }));
    setStageName(''); setStartDate(''); setEndDate(''); setWeight('0'); setPlannedValue('0'); setFormError('');
  };

  const updateActual = (stageId: string, actualPhysical: number) => {
    if (!selected || !Number.isFinite(actualPhysical)) return;
    setSchedule(current => ({
      ...current,
      [selected.id]: (current[selected.id] ?? []).map(stage => stage.id === stageId
        ? { ...stage, actualPhysical: Math.min(100, Math.max(0, actualPhysical)) }
        : stage),
    }));
  };

  const removeStage = (stageId: string) => {
    if (!selected || !window.confirm('Excluir esta etapa do cronograma?')) return;
    setSchedule(current => ({ ...current, [selected.id]: (current[selected.id] ?? []).filter(stage => stage.id !== stageId) }));
  };

  return (
    <section className="page contract-workspace-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">GESTÃO 360 • PASTAS CONTRATUAIS</span>
          <h1>Contratos</h1>
          <p>Cada contrato reúne seus documentos, tarefas, planejamento, medições e diário de obra.</p>
        </div>
        <button className="primary-button" type="button" onClick={() => { setShowNewContract(true); setContractError(''); }}>+ Novo contrato</button>
      </div>

      {showNewContract && <div className="contract-new-overlay" role="dialog" aria-modal="true" aria-label="Novo contrato">
        <form className="contract-new-form" onSubmit={saveNewContract}>
          <div className="contract-new-heading"><div><span className="eyebrow">GESTÃO 360 • CADASTRO</span><h2>Novo contrato</h2><p>Cadastre os dados oficiais para criar a pasta contratual.</p></div><button type="button" className="close-button" onClick={() => setShowNewContract(false)}>×</button></div>
          <div className="contract-pdf-import">
            <div><strong>Preencher automaticamente pelo contrato</strong><p>Envie o PDF para tentar identificar número, processo, valor, data de assinatura, prazo e garantia. Você poderá revisar e corrigir tudo antes de salvar.</p></div>
            <label className="primary-button contract-pdf-import-button">{readingNewContract ? 'Lendo contrato...' : '↑ Enviar contrato em PDF'}<input type="file" accept="application/pdf,.pdf" disabled={readingNewContract} onChange={event => { void handleNewContractPdf(event.target.files?.[0]); event.currentTarget.value = ''; }} /></label>
            {newContractFileName && <small className="contract-pdf-filename">Arquivo: {newContractFileName}</small>}
            {newContractReadMessage && <p className="contract-pdf-read-message" role="status">{newContractReadMessage}</p>}
          </div>
          <div className="contract-new-grid">
            <label>Número do contrato *<input value={draft.number} onChange={e => setDraft(v => ({...v, number:e.target.value}))} placeholder="Ex.: 56/2026" /></label>
            <label>Número do processo<input value={draft.process} onChange={e => setDraft(v => ({...v, process:e.target.value}))} placeholder="Ex.: 1-1143/2026" /></label>
            <label>Contratante / órgão público *<input value={draft.agency} onChange={e => setDraft(v => ({...v, agency:e.target.value}))} /></label>
            <label>Contratada *<input value={draft.contractor} onChange={e => setDraft(v => ({...v, contractor:e.target.value}))} /></label>
            <label>CNPJ da contratada<input value={draft.cnpj} onChange={e => setDraft(v => ({...v, cnpj:e.target.value}))} /></label>
            <label>Valor contratual (R$) *<input value={draft.value} onChange={e => setDraft(v => ({...v, value:e.target.value}))} placeholder="Ex.: 530400,00" /></label>
            <label>Data da assinatura<input value={draft.signedAt} onChange={e => setDraft(v => ({...v, signedAt:e.target.value}))} placeholder="dd/mm/aaaa" /></label>
            <label>Prazo de execução (dias) *<input type="number" min="1" value={draft.executionDays} onChange={e => setDraft(v => ({...v, executionDays:e.target.value}))} /></label>
            <label>Garantia (%)<input type="number" min="0" max="100" step="0.01" placeholder="Não identificada" value={draft.guaranteePercent} onChange={e => setDraft(v => ({...v, guaranteePercent:e.target.value}))} /></label>
            <label>Vigência / validade<input value={draft.validity} onChange={e => setDraft(v => ({...v, validity:e.target.value}))} placeholder="Conforme contrato" /></label>
            <label className="contract-new-object">Objeto do contrato *<textarea value={draft.object} onChange={e => setDraft(v => ({...v, object:e.target.value}))} rows={3} /></label>
          </div>
          {contractError && <p className="schedule-form-error">{contractError}</p>}
          <div className="contract-new-actions"><button type="button" className="outline-button" onClick={() => setShowNewContract(false)}>Cancelar</button><button type="submit" className="primary-button">Salvar contrato e abrir pasta</button></div>
        </form>
      </div>}
      <div className="contract-workspace-layout">
        <aside className="contract-picker">
          <div className="measurement-section-heading">
            <div><span className="eyebrow">PASTAS</span><h2>Contratos cadastrados</h2></div>
            <span>{contractList.length}</span>
          </div>
          {contractList.map(contract => (
            <button key={contract.id} className={selectedId === contract.id ? 'contract-picker-item active' : 'contract-picker-item'} onClick={() => { setSelectedId(contract.id); setTab('Resumo'); }}>
              <span className="contract-picker-icon">▤</span>
              <span><strong>Contrato nº {contract.number}</strong><small>{companyLabel(contract.contractor)}</small><small>{contract.agency}</small></span>
              <b>›</b>
            </button>
          ))}
          <div className="contract-sync-warning"><strong>Importante</strong><p>Os três contratos cadastrados originalmente no AppDeploy ainda precisam ser recuperados pela integração. Nenhum cadastro foi recriado ou substituído nesta etapa.</p></div>
        </aside>

        <div className="contract-workspace-main">
          {selected ? <>
            <div className="contract-workspace-title">
              <div><span className="eyebrow">PASTA CONTRATUAL</span><h2>Contrato nº {selected.number}</h2><p>{selected.object}</p></div>
              <strong>{money(selected.value)}</strong>
            </div>
            <div className="contract-workspace-facts">
              <div><small>Contratante</small><strong>{selected.agency}</strong></div>
              <div><small>Contratada</small><strong>{selected.contractor}</strong></div>
              <div><small>Processo</small><strong>{selected.process}</strong></div>
              <div><small>Prazo de execução</small><strong>{selected.executionDays} dias</strong></div>
            </div>
            <nav className="contract-workspace-tabs" aria-label="Seções do contrato">
              {tabs.map(item => <button key={item.name} className={tab === item.name ? 'active' : ''} onClick={() => setTab(item.name)}><span>{item.icon}</span>{item.name}</button>)}
            </nav>
            {tab === 'Resumo' && <div className="contract-tab-panel">
              <h3>Visão geral do contrato</h3>
              <div className="contract-overview-grid">
                <div><small>Etapas planejadas</small><strong>{stages.length}</strong></div>
                <div><small>Peso físico distribuído</small><strong>{percent(totals.weight)}</strong></div>
                <div><small>Valor distribuído</small><strong>{money(totals.planned)}</strong></div>
                <div><small>Avanço físico ponderado</small><strong>{percent(totals.earned)}</strong></div>
              </div>
              <p className="contract-tab-help">Use as abas acima para organizar as tarefas e documentos e montar o cronograma físico-financeiro específico desta obra.</p>
            </div>}
            {tab === 'Cronograma físico-financeiro' && <div className="contract-tab-panel">
              <div className="schedule-heading"><div><h3>Cronograma físico-financeiro</h3><p>Distribua o peso físico e o valor previsto por etapa. O avanço realizado será acompanhado separadamente.</p></div><span className="schedule-total">{percent(totals.weight)} distribuído</span></div>
              <div className="schedule-kpis">
                <div><small>Avanço físico ponderado</small><strong>{percent(totals.earned)}</strong></div>
                <div><small>Valor previsto distribuído</small><strong>{money(totals.planned)}</strong></div>
                <div><small>Saldo a distribuir</small><strong>{money(Math.max(0, selected.value - totals.planned))}</strong></div>
              </div>
              <div className="schedule-upload-panel">
                <div><strong>Já possui o cronograma pronto?</strong><p>Envie o PDF ou a planilha aprovada sem precisar cadastrar cada etapa manualmente. O arquivo ficará anexado a este contrato neste dispositivo.</p></div>
                <label className="primary-button schedule-upload-button">{uploading ? 'Salvando arquivo...' : '↑ Enviar cronograma pronto'}<input type="file" accept=".pdf,.xls,.xlsx,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event => handleScheduleUpload(event.target.files?.[0])} /></label>
                {uploadedSchedule && <div className="schedule-uploaded-file"><span>▤</span><div><strong>{uploadedSchedule.name}</strong><small>{(uploadedSchedule.size / 1024 / 1024).toLocaleString('pt-BR',{maximumFractionDigits:2})} MB · enviado em {new Date(uploadedSchedule.savedAt).toLocaleString('pt-BR')}</small></div><button type="button" onClick={downloadSchedule}>Baixar arquivo</button></div>}
                {uploadError && <p className="schedule-form-error">{uploadError}</p>}
              </div>
              <div className="schedule-manual-heading"><strong>Ou monte o cronograma por etapas</strong><span>Preenchimento opcional</span></div>
              <form className="schedule-stage-form" onSubmit={addStage}>
                <label>Etapa / serviço<input value={stageName} onChange={event => setStageName(event.target.value)} placeholder="Ex.: Fundação e infraestrutura" /></label>
                <label>Início previsto<input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} /></label>
                <label>Término previsto<input type="date" value={endDate} onChange={event => setEndDate(event.target.value)} /></label>
                <label>Peso físico (%)<input type="number" min="0.01" max="100" step="0.01" value={weight} onChange={event => setWeight(event.target.value)} /></label>
                <label>Valor previsto (R$)<input type="number" min="0" step="0.01" value={plannedValue} onChange={event => setPlannedValue(event.target.value)} /></label>
                <button className="primary-button" type="submit">+ Adicionar etapa</button>
                {formError && <p className="schedule-form-error">{formError}</p>}
              </form>
              {stages.length ? <div className="schedule-stage-list">
                {stages.map(stage => <article className="schedule-stage-card" key={stage.id}>
                  <div className="schedule-stage-top"><div><strong>{stage.name}</strong><small>{formatDate(stage.startDate)} até {formatDate(stage.endDate)}</small></div><button onClick={() => removeStage(stage.id)} aria-label={`Excluir etapa ${stage.name}`}>×</button></div>
                  <div className="schedule-stage-metrics"><span>Peso físico: <b>{percent(stage.physicalWeight)}</b></span><span>Previsto: <b>{money(stage.plannedValue)}</b></span><span>Valor executado estimado: <b>{money(stage.plannedValue * stage.actualPhysical / 100)}</b></span></div>
                  <div className="schedule-progress-track"><div style={{ width: `${stage.actualPhysical}%` }} /></div>
                  <label className="schedule-actual-field">Execução da etapa (%)
                    <input type="number" min="0" max="100" step="0.1" value={stage.actualPhysical} onChange={event => updateActual(stage.id, Number(event.target.value))} />
                  </label>
                </article>)}
              </div> : <div className="schedule-empty"><span>▥</span><strong>Nenhuma etapa cadastrada</strong><p>Comece adicionando as etapas do cronograma aprovado da obra.</p></div>}
              <div className="schedule-validation"><strong>Conferência do planejamento</strong><span>Peso físico: {percent(totals.weight)} de 100%</span><span>Valor previsto: {money(totals.planned)} de {money(selected.value)}</span><small>O cronograma poderá ser considerado completo quando o peso físico atingir 100% e o valor previsto corresponder ao valor contratual ou ao valor planejado formalmente.</small></div>
            </div>}
            {tab === 'Tarefas' && <div className="contract-tab-panel"><h3>Tarefas do contrato</h3><p>As obrigações identificadas no contrato serão organizadas aqui por responsável, prazo, prioridade e situação. A vinculação automática das tarefas será conectada ao Motor 360 na próxima etapa.</p></div>}
            {tab === 'Documentos' && <div className="contract-tab-panel">
              <div className="contract-documents-heading"><div><h3>Central de documentos do contrato</h3><p>Envie os arquivos prontos. O Gestão 360 classifica pelo nome e faz leitura textual automática de PDFs pesquisáveis quando possível.</p></div><label className="primary-button contract-document-upload">{readingDocument ? 'Processando arquivos...' : '↑ Enviar documentos'}<input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,application/pdf" onChange={event => { void handleContractDocuments(event.target.files); event.currentTarget.value = ''; }} /></label></div>
              <div className="contract-document-types">
                <span><i>▤</i> Contrato e aditivos</span><span><i>✓</i> ARTs e responsabilidade técnica</span><span><i>▥</i> Planilhas e cronogramas</span><span><i>◷</i> Garantias e ordens de serviço</span>
              </div>
              {documentError && <p className="schedule-form-error">{documentError}</p>}
              {documents.length ? <div className="contract-document-list">{documents.map(item => <article className="contract-document-row" key={item.id}><span className="contract-document-icon">{item.name.toLowerCase().endsWith('.pdf') ? '▤' : '▧'}</span><div className="contract-document-main"><strong>{item.name}</strong><small>{item.category} · {(item.size / 1024 / 1024).toLocaleString('pt-BR',{maximumFractionDigits:2})} MB · {new Date(item.savedAt).toLocaleDateString('pt-BR')}</small></div><span className={item.analysisStatus === 'Lido' ? 'contract-document-status read' : 'contract-document-status'}>{item.analysisStatus === 'Lido' ? 'Leitura concluída' : item.analysisStatus === 'Falha na leitura' ? 'Leitura não disponível' : 'Arquivo guardado'}</span>{item.extracted && <button type="button" onClick={() => setSelectedAnalysis(item.extracted ?? null)}>Ver análise</button>}<button type="button" onClick={() => downloadContractDocument(item)}>Baixar</button><button type="button" className="contract-document-delete" onClick={() => void removeContractDocument(item.id)} aria-label="Excluir documento">×</button></article>)}</div> : <div className="schedule-empty"><span>▤</span><strong>Nenhum documento anexado a esta pasta</strong><p>Envie os arquivos existentes sem precisar preencher formulários manualmente.</p></div>}
              {selectedAnalysis && <section className="contract-analysis-panel"><div><span className="eyebrow">LEITURA AUTOMÁTICA DO PDF</span><h4>{selectedAnalysis.fileName}</h4></div><div className="contract-analysis-grid">{selectedAnalysis.detected.orderServiceNumber && <p><small>Ordem de Serviço</small><strong>{selectedAnalysis.detected.orderServiceNumber}</strong></p>}{selectedAnalysis.detected.number && <p><small>Contrato</small><strong>{selectedAnalysis.detected.number}</strong></p>}{selectedAnalysis.detected.process && <p><small>Processo</small><strong>{selectedAnalysis.detected.process}</strong></p>}{selectedAnalysis.detected.seiProcess && <p><small>Referência SEI</small><strong>{selectedAnalysis.detected.seiProcess}</strong></p>}{selectedAnalysis.detected.contractingAgency && <p><small>Contratante</small><strong>{selectedAnalysis.detected.contractingAgency}</strong></p>}{selectedAnalysis.detected.contractor && <p><small>Contratada</small><strong>{selectedAnalysis.detected.contractor}</strong></p>}{selectedAnalysis.detected.contractorCnpj && <p><small>CNPJ da contratada</small><strong>{selectedAnalysis.detected.contractorCnpj}</strong></p>}{selectedAnalysis.detected.validityDays && <p><small>Vigência</small><strong>{selectedAnalysis.detected.validityDays} dias</strong></p>}{selectedAnalysis.detected.guaranteePercent !== undefined && <p><small>Garantia contratual</small><strong>{selectedAnalysis.detected.guaranteePercent}%{selectedAnalysis.detected.guaranteeValue !== undefined ? ` · ${money(selectedAnalysis.detected.guaranteeValue)}` : ''}</strong></p>}{selectedAnalysis.detected.value !== undefined && <p><small>Valor identificado</small><strong>{money(selectedAnalysis.detected.value)}</strong></p>}{selectedAnalysis.detected.executionDays && <p><small>Prazo identificado</small><strong>{selectedAnalysis.detected.executionDays} dias</strong></p>}{selectedAnalysis.detected.object && <p className="contract-analysis-object"><small>Objeto identificado</small><strong>{selectedAnalysis.detected.object}</strong></p>}{selectedAnalysis.detected.orderServiceIssuedAt && <p><small>Emissão da OS</small><strong>{formatDate(selectedAnalysis.detected.orderServiceIssuedAt)}</strong></p>}{selectedAnalysis.detected.orderServiceMunicipalSignedAt && <p><small>Assinatura do órgão</small><strong>{formatDate(selectedAnalysis.detected.orderServiceMunicipalSignedAt)}</strong></p>}{selectedAnalysis.detected.orderServiceCompanySignedAt && <p><small>Assinatura da contratada</small><strong>{formatDate(selectedAnalysis.detected.orderServiceCompanySignedAt)}</strong></p>}{selectedAnalysis.detected.serviceStartDate && <p className="contract-os-start-date"><small>INÍCIO DOS SERVIÇOS</small><strong>{formatDate(selectedAnalysis.detected.serviceStartDate)}</strong><em>{selectedAnalysis.detected.serviceStartRule}</em></p>}</div><h4>Obrigações localizadas para conferência ({selectedAnalysis.obligations.length})</h4>{selectedAnalysis.obligations.length ? selectedAnalysis.obligations.map(item => <div className="contract-analysis-obligation" key={item.id}><strong>{item.title}</strong><small>{item.deadline} · Prioridade {item.severity}</small><p>{item.action}</p><small>Fonte: {item.source}</small></div>) : <p className="contract-tab-help">Nenhuma obrigação prevista nas regras atuais foi localizada. Isso não significa ausência de obrigações no contrato.</p>}{selectedAnalysis.detected.fieldEvidence && <section className="contract-analysis-evidence-list"><h4>Evidências da leitura automática</h4>{Object.entries(selectedAnalysis.detected.fieldEvidence).map(([key, evidence]) => <details key={key}><summary>{({number:'Número do contrato',administrativeProcess:'Processo administrativo',seiProcess:'Referência SEI',object:'Objeto',value:'Valor contratual',signedAt:'Assinatura',execution:'Prazo de execução',validity:'Prazo de vigência',guarantee:'Garantia',contractor:'Contratada',contractingAgency:'Contratante'} as Record<string,string>)[key] ?? key} · Confiança {selectedAnalysis.detected.fieldConfidence?.[key] ?? 'BAIXA'}</summary><p>{evidence}</p></details>)}</section>}{selectedAnalysis.detected.serviceStartEvidence && <p className="contract-analysis-evidence"><strong>Trecho que fundamenta o marco inicial:</strong> {selectedAnalysis.detected.serviceStartEvidence}</p>}<p className="contract-analysis-disclaimer">A leitura é uma triagem automática por texto e regras. Não substitui OCR de PDF escaneado, leitura integral nem validação humana. Os dados extraídos ainda não alteram o cadastro oficial do contrato.</p></section>}
              <p className="contract-document-storage-note">Nesta etapa, os arquivos ficam armazenados localmente neste computador. A sincronização segura com a versão web será implementada separadamente.</p>
            </div>}
            {tab === 'Medições' && <div className="contract-tab-panel"><h3>Medições deste contrato</h3><p>As planilhas, memórias de cálculo, protocolos, aprovações e pagamentos ficarão vinculados a esta pasta. A consolidação geral será exibida na aba Medições da plataforma.</p></div>}
            {tab === 'Diário 360' && <div className="contract-tab-panel contract-diary-panel"><div className="contract-diary-heading"><div><h3>Diário de Obras · Contrato {selected.number}</h3><p>Crie, edite e imprima os diários nesta pasta, sem abrir outra janela. A sequência e os registros são exclusivos deste contrato e permanecem na base oficial do Diário 360.</p><p className="contract-diary-company-note">A identificação da empresa responsável alimenta o cadastro da obra; logotipo e assinatura utilizados na impressão vêm do perfil oficial dessa empresa no Diário 360.</p></div><span>VINCULADO A ESTE CONTRATO</span></div><iframe key={selected.id} className="contract-diary-frame" src={diaryUrlForContract(selected)} title={`Diário de Obras do contrato ${selected.number}`} loading="eager" allow="camera; geolocation" referrerPolicy="strict-origin-when-cross-origin" /></div>}
          </> : <div className="schedule-empty"><strong>Nenhum contrato disponível nesta versão</strong><p>Os cadastros da versão web precisam ser integrados antes de aparecerem aqui.</p></div>}
        </div>
      </div>
    </section>
  );
}

function companyLabel(name: string) {
  return name.toLowerCase().includes('terra') ? 'TERRA FORTE' : 'MM SERVIÇOS';
}
function formatDate(value: string) {
  if (!value) return 'Data não informada';
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR');
}
