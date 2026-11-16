import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Contract } from '../data/contracts';
import { getBrandAsset, brandAssetDataUrl } from '../services/companyBrandAssets';

type DiaryPhoto = { id: string; name: string; type: string; blob: Blob; capturedAt: string };
type DiaryEntry = {
  id: string; contractId: string; companyCnpj: string; number: number; date: string;
  weather: string; description: string; occurrence: string; fiscal: string; observations: string; team: Record<string,string>; ppe: string[];
  latitude?: number; longitude?: number; photos: DiaryPhoto[];
  createdAt: string; updatedAt: string;
};
type DiaryDraft = Pick<DiaryEntry, 'date'|'weather'|'description'|'occurrence'|'fiscal'> & { observations: string; team: Record<string,string>; ppe: string[] };
const DB_NAME = 'gestao360-native-diary';
const STORE = 'entries';
const TEAM_ROLES = ['AJUDANTE','CARPINTEIRO','ARMADOR','PEDREIRO','PINTOR','ENCARREGADO','MESTRE DE OBRAS','ENGENHEIRO'];
const PPE_OPTIONS = ['CAPACETE','BOTINA','LUVAS','ÓCULOS','UNIFORME','PROT. AURICULAR','PROT. SOLAR'];
const emptyTeam = () => Object.fromEntries(TEAM_ROLES.map(role => [role,'0']));
const emptyDraft = (): DiaryDraft => ({ date: new Date().toISOString().slice(0,10), weather: 'BOM', description: '', occurrence: '', fiscal: '', observations: '', team: emptyTeam(), ppe: [] });

function openDiaryDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function getEntries(contractId: string): Promise<DiaryEntry[]> {
  const db = await openDiaryDb();
  const rows = await new Promise<DiaryEntry[]>((resolve,reject) => {
    const request = db.transaction(STORE,'readonly').objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result as DiaryEntry[]).filter(row => row.contractId === contractId));
    request.onerror = () => reject(request.error);
  });
  db.close();
  return rows.sort((a,b) => a.number-b.number);
}
async function putEntry(entry: DiaryEntry) {
  const db = await openDiaryDb();
  await new Promise<void>((resolve,reject) => {
    const tx = db.transaction(STORE,'readwrite');
    tx.objectStore(STORE).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
async function removeEntry(id: string) {
  const db = await openDiaryDb();
  await new Promise<void>((resolve,reject) => {
    const tx = db.transaction(STORE,'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
const dateLabel = (value: string) => value ? new Date(value + 'T12:00:00').toLocaleDateString('pt-BR') : 'Data não informada';

export default function NativeDiaryModule({ contract }: { contract: Contract }) {
  const [entries,setEntries] = useState<DiaryEntry[]>([]);
  const [draft,setDraft] = useState<DiaryDraft>(emptyDraft);
  const [photos,setPhotos] = useState<DiaryPhoto[]>([]);
  const [editingId,setEditingId] = useState<string|null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [gps,setGps] = useState<{latitude:number;longitude:number}|null>(null);
  const [gpsMessage,setGpsMessage] = useState('');
  const [saving,setSaving] = useState(false);

  const reload = async () => {
    setLoading(true);
    try { setEntries(await getEntries(contract.id)); setError(''); }
    catch { setError('Não foi possível acessar o armazenamento local do diário neste dispositivo.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void reload(); setDraft(emptyDraft()); setPhotos([]); setEditingId(null); }, [contract.id]);

  const nextNumber = useMemo(() => Math.max(0,...entries.map(item => item.number))+1,[entries]);
  const updateDraft = (field: 'date'|'weather'|'description'|'occurrence'|'fiscal'|'observations', value: string) => setDraft(current => ({...current,[field]:value}));

  const addPhotos = async (files: FileList|null) => {
    if (!files) return;
    const accepted = Array.from(files).filter(file => /^image\/(jpeg|png|webp)$/i.test(file.type));
    if (accepted.length !== files.length) setError('Algumas imagens foram ignoradas. Use JPG, PNG ou WEBP.');
    const remaining = Math.max(0,20-photos.length);
    const selected = accepted.slice(0,remaining);
    if (accepted.length > remaining) setError('Limite de 20 fotografias por diário.');
    const additions = await Promise.all(selected.map(async file => ({
      id: crypto.randomUUID(), name: file.name, type: file.type, blob: file as Blob,
      capturedAt: new Date(file.lastModified || Date.now()).toISOString(),
    })));
    setPhotos(current => [...current,...additions]);
  };

  const captureGps = () => {
    if (!navigator.geolocation) { setGpsMessage('Geolocalização indisponível neste ambiente.'); return; }
    setGpsMessage('Obtendo localização...');
    navigator.geolocation.getCurrentPosition(
      position => { setGps({latitude:position.coords.latitude,longitude:position.coords.longitude}); setGpsMessage('Localização registrada neste diário.'); },
      () => setGpsMessage('Não foi possível obter GPS. Verifique a permissão de localização.'),
      {enableHighAccuracy:true,timeout:12000,maximumAge:0}
    );
  };

  const resetForm = () => { setDraft(emptyDraft()); setPhotos([]); setEditingId(null); setGps(null); setGpsMessage(''); };
  const editEntry = (entry: DiaryEntry) => {
    setEditingId(entry.id);
    setDraft({date:entry.date,weather:entry.weather,description:entry.description,occurrence:entry.occurrence,fiscal:entry.fiscal,observations:entry.observations ?? '',team:entry.team ?? emptyTeam(),ppe:entry.ppe ?? []});
    setPhotos(entry.photos);
    setGps(entry.latitude !== undefined && entry.longitude !== undefined ? {latitude:entry.latitude,longitude:entry.longitude} : null);
    window.scrollTo({top:0,behavior:'smooth'});
  };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.date || !draft.description.trim()) { setError('Informe a data e a descrição dos serviços executados.'); return; }
    setSaving(true); setError('');
    try {
      const existing = editingId ? entries.find(item => item.id === editingId) : undefined;
      const now = new Date().toISOString();
      const entry: DiaryEntry = {
        id: existing?.id ?? crypto.randomUUID(), contractId: contract.id,
        companyCnpj: contract.cnpj, number: existing?.number ?? nextNumber,
        ...draft, description:draft.description.trim(), occurrence:draft.occurrence.trim(),
        fiscal:draft.fiscal.trim(), latitude:gps?.latitude, longitude:gps?.longitude,
        photos, observations:draft.observations, team:draft.team, ppe:draft.ppe, createdAt:existing?.createdAt ?? now, updatedAt:now,
      };
      await putEntry(entry);
      await reload(); resetForm();
    } catch { setError('Falha ao salvar o diário. Verifique o espaço disponível no dispositivo.'); }
    finally { setSaving(false); }
  };
  const deleteDiary = async (entry: DiaryEntry) => {
    if (!window.confirm('Excluir permanentemente este diário deste dispositivo?')) return;
    try { await removeEntry(entry.id); await reload(); if (editingId === entry.id) resetForm(); }
    catch { setError('Não foi possível excluir o diário.'); }
  };
  const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char] ?? char));
  const printEntry = async (entry: DiaryEntry) => {
    const photoMarkup = entry.photos.map(photo => {
      const url = URL.createObjectURL(photo.blob);
      return '<figure><img src="'+url+'" /><figcaption>'+escapeHtml(photo.name)+'</figcaption></figure>';
    }).join('');
    const teamMarkup = TEAM_ROLES.map(role => '<tr><td>'+role+'</td><td>'+escapeHtml(entry.team?.[role] ?? '0')+'</td></tr>').join('');
    const ppeMarkup = PPE_OPTIONS.map(item => '<span class="ppe">'+(entry.ppe?.includes(item) ? '☑' : '☐')+' '+item+'</span>').join('');
    const [logoAsset, signatureAsset] = await Promise.all([getBrandAsset(contract.cnpj,'logo'),getBrandAsset(contract.cnpj,'signature')]);
    const [logoUrl, signatureUrl] = await Promise.all([brandAssetDataUrl(logoAsset),brandAssetDataUrl(signatureAsset)]);
    const popup = window.open('', '_blank', 'width=1000,height=800');
    if (!popup) { setError('Permita janelas pop-up para imprimir o diário.'); return; }
    popup.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Diário ${entry.number} - Contrato ${escapeHtml(contract.number)}</title><style>
      @page{size:A4;margin:10mm}
      *{box-sizing:border-box}body{font:9px Arial,Helvetica,sans-serif;color:#171717;margin:0;line-height:1.35}
      .masthead{min-height:64px;border:1px solid #777;display:grid;grid-template-columns:130px minmax(0,1fr) 120px;align-items:center;padding:5px 10px;text-align:center;gap:10px;overflow:hidden}
      .company-mark{font-size:13px;font-weight:900;color:#174a73;text-align:left;min-width:0;overflow:hidden}.company-mark img{display:block;max-width:120px;max-height:48px;object-fit:contain;object-position:left center}.company-mark small{display:block;font-size:7px;color:#333;overflow-wrap:anywhere}
      .masthead h1{margin:0;font-size:23px;letter-spacing:.8px;color:#123452}.masthead h2{margin:5px 0 0;font-size:11px}
      .contract-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;border:1px solid #777;padding:8px;margin-top:6px}
      .contract-grid p{margin:0;font-size:8px;line-height:1.35}.contract-grid strong{font-weight:800}
      .bar{margin-top:7px;border:1px solid #777;text-align:center;font-weight:800;padding:4px;font-size:9px}
      table{width:100%;max-width:100%;table-layout:fixed;border-collapse:collapse;border-spacing:0;margin:2px 0 0}td{border:1px solid #888;padding:3px 5px;font-size:8px;line-height:1.25;vertical-align:middle}td:first-child{width:78%;overflow-wrap:anywhere}td:last-child{width:22%;text-align:center}
      .ppe-list{border:1px solid #888;padding:7px;display:flex;gap:10px;flex-wrap:wrap}.ppe{font-size:8px}
      .weather{border:1px solid #888;margin-top:6px;padding:6px;font-size:8px}
      .content{border:1px solid #888;min-height:54px;padding:8px;white-space:pre-wrap;font-size:8px}
      .photos{border:1px solid #888;padding:7px;display:grid;grid-template-columns:1fr 1fr;gap:8px;min-height:90px}
      figure{margin:0;border:1px solid #aaa;padding:5px;break-inside:avoid}img{width:100%;max-height:250px;object-fit:contain}figcaption{font-size:7px;margin-top:3px}
      .signatures{display:grid;grid-template-columns:1fr 1fr;gap:45px;margin-top:58px;text-align:center;break-inside:avoid;align-items:start}.signatures div{position:relative;border-top:1px solid #333;padding-top:6px;font-size:8px;min-height:58px}.signatures strong{display:block}.signatures img{position:absolute;left:50%;bottom:calc(100% + 5px);transform:translateX(-50%);width:auto;max-width:125px;max-height:34px;object-fit:contain;object-position:center bottom}
      .foot{margin-top:10px;border-top:1px solid #aaa;padding-top:4px;text-align:right;font-size:7px;color:#555}
      @media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body>
    <header class="masthead"><div class="company-mark">${logoUrl ? '<img src="'+logoUrl+'" alt="Logotipo da empresa">' : escapeHtml(contract.contractor)}<small>${escapeHtml(contract.cnpj || '')}</small></div><div><h1>DIÁRIO 360</h1><h2>DIÁRIO DE OBRA Nº ${String(entry.number).padStart(2,'0')}</h2></div><div style="font-size:8px">GESTÃO DE OBRAS<br>REGISTRO DIÁRIO</div></header>
    <div class="contract-grid"><p><strong>CONTRATANTE:</strong> ${escapeHtml(contract.agency)}</p><p><strong>CONTRATADA:</strong> ${escapeHtml(contract.contractor)}</p><p><strong>PROCESSO:</strong> ${escapeHtml(contract.process || 'Não informado')}</p><p><strong>CONTRATO:</strong> ${escapeHtml(contract.number)}</p><p style="grid-column:1/-1"><strong>OBRA:</strong> ${escapeHtml(contract.object)}</p><p style="grid-column:1/-1"><strong>LOCAL / ENDEREÇO DA OBRA:</strong> ${escapeHtml(contract.object)}</p></div>
    <div class="bar">EQUIPE</div><table>${teamMarkup}</table>
    <div class="bar">EPIs</div><div class="ppe-list">${ppeMarkup}</div>
    <div class="weather"><strong>TEMPO:</strong> ${escapeHtml(entry.weather)} &nbsp;&nbsp; <strong>DATA:</strong> ${dateLabel(entry.date)}</div>
    <div class="bar">SERVIÇOS EXECUTADOS</div><div class="content">${escapeHtml(entry.description)}</div>
    <div class="bar">OCORRÊNCIAS</div><div class="content" style="min-height:48px">${escapeHtml(entry.occurrence || 'Nenhuma ocorrência registrada.')}</div>
    <div class="bar">OBSERVAÇÕES DA FISCALIZAÇÃO / ENG. FISCAL DA OBRA</div><div class="content" style="min-height:48px">${escapeHtml(entry.observations || entry.fiscal || 'Sem observações.')}</div>
    <div class="bar">RELATÓRIO FOTOGRÁFICO</div><div class="photos">${photoMarkup || '<div style="padding:28px;text-align:center">Sem fotos.</div>'}</div>
    <div class="signatures"><div><strong>Engenheiro Fiscal da Obra</strong>ENGENHEIRO FISCAL DA OBRA</div><div>${signatureUrl ? '<img src="'+signatureUrl+'" alt="Assinatura do engenheiro responsável">' : ''}<strong>Engenheiro Responsável</strong>RESPONSÁVEL PELA EMPRESA</div></div>
    <div class="foot">Contrato ${escapeHtml(contract.number)} · Diário nº ${String(entry.number).padStart(2,'0')} · Emitido em ${new Date().toLocaleString('pt-BR')}</div>
    <script>window.onload=()=>window.print()<\/script></body></html>`);
    popup.document.close();
  };

  return <section className="native-diary">
    <header className="native-diary-header"><div><span className="eyebrow">GESTÃO 360 • DIÁRIO DE OBRAS</span><h3>Diário de Obras · Contrato {contract.number}</h3><p>{contract.agency} · {contract.contractor}</p><small>Os registros abaixo pertencem exclusivamente a este contrato e ficam armazenados neste computador.</small></div><span className="native-diary-badge">VINCULADO AO CONTRATO</span></header>
    <div className="native-diary-notice"><strong>Diário nativo em implantação</strong><span>Esta versão grava os registros e fotografias localmente neste dispositivo. Ainda não sincroniza com outros computadores nem importa automaticamente os diários antigos.</span></div>
    <form className="native-diary-form" onSubmit={save}>
      <div className="native-diary-form-title"><div><span className="eyebrow">{editingId ? 'EDIÇÃO' : 'NOVO REGISTRO'}</span><h4>{editingId ? 'Editar diário' : `Próximo diário · Nº ${String(nextNumber).padStart(2,'0')}`}</h4></div>{editingId && <button type="button" className="outline-button" onClick={resetForm}>Cancelar edição</button>}</div>
      <div className="native-diary-fields">
        <label>Data do diário<input type="date" value={draft.date} onChange={e=>updateDraft('date',e.target.value)} /></label>
        <label>Condição climática<select value={draft.weather} onChange={e=>updateDraft('weather',e.target.value)}><option>BOM</option><option>NUBLADO</option><option>CHUVOSO</option><option>INSTÁVEL</option><option>SEM ATIVIDADE</option></select></label>
        <label>Fiscal / responsável<input value={draft.fiscal} onChange={e=>updateDraft('fiscal',e.target.value)} placeholder="Nome do fiscal ou responsável" /></label>
        <label className="native-diary-wide">Serviços executados *<textarea rows={5} value={draft.description} onChange={e=>updateDraft('description',e.target.value)} placeholder="Descreva os serviços executados, equipes, equipamentos e frentes de trabalho..." /></label>
        <label className="native-diary-wide">Ocorrências<textarea rows={3} value={draft.occurrence} onChange={e=>updateDraft('occurrence',e.target.value)} placeholder="Registre ocorrências, paralisações, interferências ou imprevistos..." /></label>
        <label className="native-diary-wide">Observações da fiscalização / engenheiro fiscal<textarea rows={3} value={draft.observations} onChange={e=>updateDraft('observations',e.target.value)} placeholder="Observações da fiscalização..." /></label>
      </div>
      <div className="native-diary-extra-grid">
        <section className="native-diary-extra-card"><h5>Equipe mobilizada</h5><div className="native-diary-team-grid">{TEAM_ROLES.map(role=><label key={role}>{role}<input type="number" min="0" step="1" value={draft.team[role] ?? '0'} onChange={e=>setDraft(current=>({...current,team:{...current.team,[role]:e.target.value}}))}/></label>)}</div></section>
        <section className="native-diary-extra-card"><h5>EPIs utilizados</h5><div className="native-diary-ppe-grid">{PPE_OPTIONS.map(item=><label key={item}><input type="checkbox" checked={draft.ppe.includes(item)} onChange={e=>setDraft(current=>({...current,ppe:e.target.checked?[...current.ppe,item]:current.ppe.filter(value=>value!==item)}))}/>{item}</label>)}</div></section>
      </div>
      <div className="native-diary-photo-tools"><div><strong>Registro fotográfico</strong><small>Até 20 imagens JPG, PNG ou WEBP por diário. Os arquivos ficam vinculados ao registro.</small></div><label className="primary-button">+ Adicionar fotos<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>{void addPhotos(e.target.files);e.currentTarget.value='';}} /></label></div>
      {photos.length>0 && <div className="native-diary-photo-list">{photos.map(photo=><div key={photo.id}><span>▧</span><span>{photo.name}</span><button type="button" onClick={()=>setPhotos(items=>items.filter(item=>item.id!==photo.id))}>Remover</button></div>)}</div>}
      <div className="native-diary-gps"><div><strong>Georreferenciamento</strong><small>{gps ? `${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}` : 'Localização ainda não registrada'}</small></div><button type="button" className="outline-button" onClick={captureGps}>⌖ Registrar GPS</button><span>{gpsMessage}</span></div>
      {error && <p className="schedule-form-error" role="alert">{error}</p>}
      <div className="native-diary-actions"><button type="submit" className="primary-button" disabled={saving}>{saving?'Salvando...':editingId?'Salvar alterações':'Salvar diário'}</button></div>
    </form>
    <div className="native-diary-list-heading"><div><span className="eyebrow">HISTÓRICO DE EXECUÇÃO</span><h4>Diários deste contrato ({entries.length})</h4></div><button className="outline-button" type="button" onClick={()=>{resetForm();window.scrollTo({top:0,behavior:'smooth'});}}>+ Novo diário</button></div>
    {loading ? <p>Carregando registros...</p> : entries.length ? <div className="native-diary-list">{entries.map(entry=><article className="native-diary-card" key={entry.id}><div className="native-diary-number">{String(entry.number).padStart(2,'0')}</div><div className="native-diary-card-main"><div><strong>Diário {String(entry.number).padStart(2,'0')}</strong><small>{dateLabel(entry.date)} · {entry.weather}</small></div><p>{entry.description}</p><small>{entry.photos.length} foto(s) · ocorrências: {entry.occurrence?'sim':'não'} · fiscalização: {entry.fiscal?'sim':'não'}</small></div><div className="native-diary-card-actions"><button type="button" onClick={()=>editEntry(entry)}>Editar</button><button type="button" onClick={()=>{void printEntry(entry).catch(()=>setError('Não foi possível carregar o logotipo ou a assinatura da empresa.'));}}>Imprimir</button><button type="button" className="danger" onClick={()=>void deleteDiary(entry)}>Excluir</button></div></article>)}</div> : <div className="schedule-empty"><strong>Nenhum diário cadastrado neste contrato</strong><p>O primeiro registro começará pelo Diário 01. Nenhum dado de outro contrato será exibido.</p></div>}
  </section>;
}
