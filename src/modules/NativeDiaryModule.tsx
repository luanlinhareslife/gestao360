import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Contract } from '../data/contracts';

type DiaryPhoto = { id: string; name: string; type: string; blob: Blob; capturedAt: string };
type DiaryEntry = {
  id: string; contractId: string; companyCnpj: string; number: number; date: string;
  weather: string; description: string; occurrence: string; fiscal: string;
  latitude?: number; longitude?: number; photos: DiaryPhoto[];
  createdAt: string; updatedAt: string;
};
type DiaryDraft = Pick<DiaryEntry, 'date'|'weather'|'description'|'occurrence'|'fiscal'>;
const DB_NAME = 'gestao360-native-diary';
const STORE = 'entries';
const emptyDraft = (): DiaryDraft => ({ date: new Date().toISOString().slice(0,10), weather: 'BOM', description: '', occurrence: '', fiscal: '' });

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
  const updateDraft = (field: keyof DiaryDraft, value: string) => setDraft(current => ({...current,[field]:value}));

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
    setDraft({date:entry.date,weather:entry.weather,description:entry.description,occurrence:entry.occurrence,fiscal:entry.fiscal});
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
        photos, createdAt:existing?.createdAt ?? now, updatedAt:now,
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
  const printEntry = (entry: DiaryEntry) => {
    const photoMarkup = entry.photos.map(photo => {
      const url = URL.createObjectURL(photo.blob);
      return '<figure><img src="'+url+'" /><figcaption>'+escapeHtml(photo.name)+'</figcaption></figure>';
    }).join('');
    const popup = window.open('', '_blank', 'width=1000,height=800');
    if (!popup) { setError('Permita janelas pop-up para imprimir o diário.'); return; }
    popup.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Diário ${entry.number} - Contrato ${escapeHtml(contract.number)}</title><style>
      @page{size:A4;margin:16mm 15mm}
      *{box-sizing:border-box}
      body{font:11px Arial,Helvetica,sans-serif;color:#183b59;margin:0;line-height:1.5}
      .topline{height:8px;background:#0b3d63;margin-bottom:24px}
      .brand{display:flex;justify-content:space-between;align-items:center;padding-bottom:13px;border-bottom:2px solid #0b3d63}
      .brand strong{font-size:13px;letter-spacing:.7px;color:#0b3153}
      .brand span{font-size:9px;color:#668099;text-align:right}
      .title{margin:24px 0 5px;font-size:22px;letter-spacing:.2px;color:#0b3153}
      .subtitle{font-size:11px;color:#42617c;font-weight:700}
      .meta{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:17px 0;padding:12px;background:#f1f6fb;border:1px solid #d7e4ef;border-radius:6px}
      .meta div{display:grid;gap:3px}.meta small{font-size:8px;color:#6b8297;text-transform:uppercase;letter-spacing:.5px}.meta strong{font-size:10px;color:#173e60}
      section{margin:18px 0;break-inside:avoid}
      h2{margin:0 0 7px;padding-bottom:6px;border-bottom:1px solid #dce6ef;font-size:12px;color:#0b4d7a}
      p{margin:0;white-space:pre-wrap;line-height:1.65}
      .photos{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      figure{margin:0;padding:7px;border:1px solid #dce6ef;border-radius:5px;break-inside:avoid}
      img{width:100%;max-height:310px;object-fit:contain}
      figcaption{margin-top:4px;font-size:8px;color:#627a90;overflow-wrap:anywhere}
      .footer{margin-top:28px;padding-top:8px;border-top:1px solid #dce6ef;display:flex;justify-content:space-between;color:#7b8fa2;font-size:8px}
      @media print{.topline{-webkit-print-color-adjust:exact;print-color-adjust:exact}.meta{background:#f1f6fb!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body><div class="topline"></div><div class="brand"><strong>GESTÃO 360 · DIÁRIO DE OBRAS</strong><span>REGISTRO DE EXECUÇÃO CONTRATUAL<br>Documento gerado pelo Gestão 360 Desktop</span></div>
    <h1 class="title">DIÁRIO DE OBRAS Nº ${String(entry.number).padStart(2,'0')}</h1><div class="subtitle">Contrato nº ${escapeHtml(contract.number)} · ${escapeHtml(contract.contractor)}</div>
    <div class="meta"><div><small>Data do diário</small><strong>${dateLabel(entry.date)}</strong></div><div><small>Condição climática</small><strong>${escapeHtml(entry.weather)}</strong></div><div><small>Processo administrativo</small><strong>${escapeHtml(contract.process || 'Não informado')}</strong></div><div><small>Contratante</small><strong>${escapeHtml(contract.agency)}</strong></div><div><small>Fiscal / responsável</small><strong>${escapeHtml(entry.fiscal || 'Não informado')}</strong></div><div><small>Empresa contratada</small><strong>${escapeHtml(contract.contractor)}</strong></div></div>
    <section><h2>Serviços executados</h2><p>${escapeHtml(entry.description)}</p></section>
    <section><h2>Ocorrências e interferências</h2><p>${escapeHtml(entry.occurrence || 'Não houve registro de ocorrência.')}</p></section>
    <section><h2>Fiscalização</h2><p>${escapeHtml(entry.fiscal || 'Não informado.')}</p></section>
    <section><h2>Georreferenciamento</h2><p>${entry.latitude !== undefined ? escapeHtml(entry.latitude.toFixed(6)+', '+entry.longitude!.toFixed(6)) : 'Localização não registrada'}</p></section>
    <section><h2>Registro fotográfico (${entry.photos.length} foto(s))</h2><div class="photos">${photoMarkup || '<p>Nenhuma fotografia anexada.</p>'}</div></section>
    <div class="footer"><span>Contrato ${escapeHtml(contract.number)} · Diário nº ${String(entry.number).padStart(2,'0')}</span><span>Emitido em ${new Date().toLocaleString('pt-BR')}</span></div>
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
      </div>
      <div className="native-diary-photo-tools"><div><strong>Registro fotográfico</strong><small>Até 20 imagens JPG, PNG ou WEBP por diário. Os arquivos ficam vinculados ao registro.</small></div><label className="primary-button">+ Adicionar fotos<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>{void addPhotos(e.target.files);e.currentTarget.value='';}} /></label></div>
      {photos.length>0 && <div className="native-diary-photo-list">{photos.map(photo=><div key={photo.id}><span>▧</span><span>{photo.name}</span><button type="button" onClick={()=>setPhotos(items=>items.filter(item=>item.id!==photo.id))}>Remover</button></div>)}</div>}
      <div className="native-diary-gps"><div><strong>Georreferenciamento</strong><small>{gps ? `${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}` : 'Localização ainda não registrada'}</small></div><button type="button" className="outline-button" onClick={captureGps}>⌖ Registrar GPS</button><span>{gpsMessage}</span></div>
      {error && <p className="schedule-form-error" role="alert">{error}</p>}
      <div className="native-diary-actions"><button type="submit" className="primary-button" disabled={saving}>{saving?'Salvando...':editingId?'Salvar alterações':'Salvar diário'}</button></div>
    </form>
    <div className="native-diary-list-heading"><div><span className="eyebrow">HISTÓRICO DE EXECUÇÃO</span><h4>Diários deste contrato ({entries.length})</h4></div><button className="outline-button" type="button" onClick={()=>{resetForm();window.scrollTo({top:0,behavior:'smooth'});}}>+ Novo diário</button></div>
    {loading ? <p>Carregando registros...</p> : entries.length ? <div className="native-diary-list">{entries.map(entry=><article className="native-diary-card" key={entry.id}><div className="native-diary-number">{String(entry.number).padStart(2,'0')}</div><div className="native-diary-card-main"><div><strong>Diário {String(entry.number).padStart(2,'0')}</strong><small>{dateLabel(entry.date)} · {entry.weather}</small></div><p>{entry.description}</p><small>{entry.photos.length} foto(s) · ocorrências: {entry.occurrence?'sim':'não'} · fiscalização: {entry.fiscal?'sim':'não'}</small></div><div className="native-diary-card-actions"><button type="button" onClick={()=>editEntry(entry)}>Editar</button><button type="button" onClick={()=>printEntry(entry)}>Imprimir</button><button type="button" className="danger" onClick={()=>void deleteDiary(entry)}>Excluir</button></div></article>)}</div> : <div className="schedule-empty"><strong>Nenhum diário cadastrado neste contrato</strong><p>O primeiro registro começará pelo Diário 01. Nenhum dado de outro contrato será exibido.</p></div>}
  </section>;
}
