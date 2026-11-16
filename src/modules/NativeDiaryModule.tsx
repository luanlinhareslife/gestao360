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
  const printEntry = (entry: DiaryEntry) => {
    const photoMarkup = entry.photos.map(photo => {
      const url = URL.createObjectURL(photo.blob);
      return '<figure><img src="'+url+'" /><figcaption>'+photo.name+'</figcaption></figure>';
    }).join('');
    const popup = window.open('', '_blank', 'width=1000,height=800');
    if (!popup) { setError('Permita janelas pop-up para imprimir o diário.'); return; }
    popup.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Diário ${entry.number} - Contrato ${contract.number}</title><style>body{font:14px Arial,sans-serif;color:#172b45;margin:32px}h1{font-size:22px}h2{font-size:17px;margin-top:24px}.meta{display:flex;gap:24px;flex-wrap:wrap;border-block:1px solid #ccd6e2;padding:12px 0}p{line-height:1.55;white-space:pre-wrap}section{margin:18px 0} .photos{display:grid;grid-template-columns:1fr 1fr;gap:14px}figure{margin:0;break-inside:avoid}img{width:100%;max-height:340px;object-fit:contain}figcaption{font-size:11px;color:#555}@media print{button{display:none}}</style></head><body><h1>DIÁRIO DE OBRAS Nº ${String(entry.number).padStart(2,'0')}</h1><strong>Contrato nº ${contract.number} · ${contract.contractor}</strong><div class="meta"><span>Data: ${dateLabel(entry.date)}</span><span>Condição climática: ${entry.weather}</span><span>Processo: ${contract.process}</span></div><section><h2>Serviços executados</h2><p>${entry.description}</p></section><section><h2>Ocorrências</h2><p>${entry.occurrence || 'Não houve registro de ocorrência.'}</p></section><section><h2>Fiscalização</h2><p>${entry.fiscal || 'Não informado.'}</p></section><section><h2>Localização</h2><p>${entry.latitude !== undefined ? entry.latitude+', '+entry.longitude : 'Não registrada'}</p></section><section><h2>Registro fotográfico</h2><div class="photos">${photoMarkup}</div></section><script>window.onload=()=>window.print()<\/script></body></html>`);
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
