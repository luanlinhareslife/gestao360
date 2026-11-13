import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { contracts, type Contract } from '../data/contracts';

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
const FILE_DB = 'gestao360-contract-files';
const FILE_STORE = 'schedules';
function openFileDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FILE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(FILE_STORE, { keyPath: 'contractId' });
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

export default function ContractWorkspaceModule() {
  const [selectedId, setSelectedId] = useState(contracts[0]?.id ?? '');
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

  useEffect(() => {
    if (!selectedId) { setUploadedSchedule(null); return; }
    readScheduleFile(selectedId).then(result => setUploadedSchedule(result?.meta ?? null)).catch(() => setUploadError('Não foi possível consultar o arquivo salvo neste dispositivo.'));
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

  const selected = contracts.find(item => item.id === selectedId);
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
        <span className="contract-source-note">Base atual do desktop · sincronização com a versão web ainda pendente</span>
      </div>

      <div className="contract-workspace-layout">
        <aside className="contract-picker">
          <div className="measurement-section-heading">
            <div><span className="eyebrow">PASTAS</span><h2>Contratos cadastrados</h2></div>
            <span>{contracts.length}</span>
          </div>
          {contracts.map(contract => (
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
            {tab === 'Documentos' && <div className="contract-tab-panel"><h3>Documentos contratuais</h3><p>Espaço para contrato assinado, ordem de serviço, ARTs, garantias, aditivos, projetos e demais arquivos vinculados a esta pasta.</p></div>}
            {tab === 'Medições' && <div className="contract-tab-panel"><h3>Medições deste contrato</h3><p>As planilhas, memórias de cálculo, protocolos, aprovações e pagamentos ficarão vinculados a esta pasta. A consolidação geral será exibida na aba Medições da plataforma.</p></div>}
            {tab === 'Diário 360' && <div className="contract-tab-panel"><h3>Diário de Obras</h3><p>O Diário 360 existente será preservado. A vinculação automática dos diários a este contrato depende da integração segura com a base web atual.</p><a className="primary-button schedule-diary-link" href="https://diario-360-9ux61w.v2.appdeploy.ai/" target="_blank" rel="noreferrer">Abrir Diário 360 em nova aba ↗</a></div>}
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
