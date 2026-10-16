import { useEffect, useState } from 'react';

type PhotoRecord = {
  id: string;
  name: string;
  dataUrl: string;
  capturedAt: string;
  latitude?: number;
  longitude?: number;
  locationStatus: string;
  weather: string;
};

type DiaryRecord = {
  id: string;
  obra: string;
  servicos: string;
  createdAt: string;
  photos: PhotoRecord[];
};

const STORAGE_KEY = 'gestao360.diario360.records.v1';

function formatDate(value: string) {
  return new Date(value).toLocaleString('pt-BR');
}

async function photoAsDataUrl(file: File): Promise<string> {
  const source = await new Promise<HTMLImageElement>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler a fotografia.'));
    reader.onload = () => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Arquivo de imagem inválido.'));
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(source.naturalWidth, source.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Não foi possível preparar a fotografia.');
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.78);
}

async function readPhotoMetadata() {
  const capturedAt = new Date().toISOString();
  let latitude: number | undefined;
  let longitude: number | undefined;
  let locationStatus = 'GPS não autorizado ou indisponível';
  let weather = 'Clima não consultado';

  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('GPS indisponível'));
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 0,
      });
    });
    latitude = position.coords.latitude;
    longitude = position.coords.longitude;
    locationStatus = 'GPS registrado';

    try {
      const params = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',
        timezone: 'auto',
      });
      const response = await fetch('https://api.open-meteo.com/v1/forecast?' + params.toString());
      if (response.ok) {
        const payload = await response.json();
        const current = payload.current;
        const conditions: Record<number, string> = {
          0: 'Céu limpo', 1: 'Predominantemente limpo', 2: 'Parcialmente nublado', 3: 'Nublado',
          45: 'Nevoeiro', 48: 'Nevoeiro com geada', 51: 'Garoa fraca', 53: 'Garoa moderada',
          55: 'Garoa intensa', 61: 'Chuva fraca', 63: 'Chuva moderada', 65: 'Chuva forte',
          71: 'Neve fraca', 80: 'Pancadas fracas', 81: 'Pancadas moderadas', 82: 'Pancadas fortes',
          95: 'Trovoada',
        };
        weather = (conditions[Number(current.weather_code)] || 'Condição variável') +
          ' · ' + current.temperature_2m + ' °C · umidade ' + current.relative_humidity_2m +
          '% · vento ' + current.wind_speed_10m + ' km/h · precipitação ' + current.precipitation + ' mm';
      } else {
        weather = 'Clima indisponível no momento do registro';
      }
    } catch {
      weather = 'Clima indisponível no momento do registro';
    }
  } catch {
    // A foto continua válida mesmo sem autorização de GPS.
  }

  return { capturedAt, latitude, longitude, locationStatus, weather };
}

export default function DiaryModule() {
  const [records, setRecords] = useState<DiaryRecord[]>([]);
  const [obra, setObra] = useState('');
  const [servicos, setServicos] = useState('');
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setRecords(JSON.parse(saved) as DiaryRecord[]);
    } catch {
      setMessage('Não foi possível ler os diários salvos neste dispositivo.');
    }
  }, []);

  function persist(next: DiaryRecord[]) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setRecords(next);
      return true;
    } catch {
      setMessage('Armazenamento local cheio. Remova fotos antigas ou use imagens menores.');
      return false;
    }
  }

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setMessage('');
    try {
      const incoming: PhotoRecord[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        const [dataUrl, metadata] = await Promise.all([photoAsDataUrl(file), readPhotoMetadata()]);
        incoming.push({
          id: crypto.randomUUID(),
          name: file.name || 'fotografia.jpg',
          dataUrl,
          ...metadata,
        });
      }
      setPhotos(current => [...current, ...incoming]);
      if (incoming.length) setMessage(incoming.length + ' fotografia(s) adicionada(s) com os metadados disponíveis.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao preparar as fotografias.');
    } finally {
      setBusy(false);
    }
  }

  function saveDiary() {
    if (!obra.trim() || !servicos.trim()) {
      setMessage('Informe a obra e os serviços executados antes de salvar.');
      return;
    }
    const record: DiaryRecord = {
      id: crypto.randomUUID(),
      obra: obra.trim(),
      servicos: servicos.trim(),
      createdAt: new Date().toISOString(),
      photos,
    };
    if (persist([record, ...records])) {
      setObra('');
      setServicos('');
      setPhotos([]);
      setMessage('Diário salvo neste dispositivo.');
    }
  }

  function printDiary(record: DiaryRecord) {
    const popup = window.open('', '_blank', 'width=1000,height=800');
    if (!popup) {
      setMessage('Permita janelas pop-up para imprimir o relatório.');
      return;
    }
    const escapeHtml = (value: string) => value.replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char] || char));
    const photoHtml = record.photos.map(photo => {
      const gps = photo.latitude !== undefined && photo.longitude !== undefined
        ? photo.latitude.toFixed(6) + ', ' + photo.longitude.toFixed(6)
        : 'GPS não registrado';
      return '<article class="photo"><img src="' + photo.dataUrl + '"><p><b>' + escapeHtml(photo.name) +
        '</b><br>Data/hora: ' + escapeHtml(formatDate(photo.capturedAt)) + '<br>GPS: ' + gps +
        '<br>' + escapeHtml(photo.weather) + '<br>' + escapeHtml(photo.locationStatus) + '</p></article>';
    }).join('');
    popup.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Diário 360</title><style>body{font:14px Arial,sans-serif;color:#172b4d;margin:24px}h1{color:#12345c}.photos{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.photo{border:1px solid #d5dde7;padding:8px;break-inside:avoid}.photo img{width:100%;max-height:230px;object-fit:contain}.photo p{font-size:11px;line-height:1.5;overflow-wrap:anywhere}@media print{body{margin:10mm}}</style></head><body><h1>Diário 360</h1><h2>' +
      escapeHtml(record.obra) + '</h2><p><b>Registrado em:</b> ' + escapeHtml(formatDate(record.createdAt)) +
      '</p><h3>Serviços executados</h3><p>' + escapeHtml(record.servicos).replace(/\n/g, '<br>') +
      '</p><h3>Relatório fotográfico</h3><div class="photos">' + (photoHtml || '<p>Sem fotografias.</p>') +
      '</div><script>window.onload=()=>window.print()</script></body></html>');
    popup.document.close();
  }

  function deleteDiary(id: string) {
    if (!window.confirm('Excluir este diário e suas fotografias salvas neste dispositivo?')) return;
    persist(records.filter(record => record.id !== id));
  }

  return (
    <section className="page diary-module">
      <div className="page-heading">
        <div><span className="eyebrow">REGISTRO DE CAMPO</span><h1>Diário 360</h1><p>Registre serviços e fotografias com data/hora, GPS e condição climática quando disponíveis.</p></div>
      </div>
      <div className="diary-notice"><strong>Importante:</strong> o protótipo salva os diários neste dispositivo. O GPS depende da permissão do sistema e o clima depende de conexão com a internet.</div>
      <div className="diary-form card">
        <h2>Novo registro de obra</h2>
        <label>Obra<input value={obra} onChange={event => setObra(event.target.value)} placeholder="Nome ou identificação da obra" /></label>
        <label>Serviços executados<textarea value={servicos} onChange={event => setServicos(event.target.value)} rows={4} placeholder="Descreva os serviços realizados..." /></label>
        <div className="diary-photo-actions">
          <label className="primary-button file-button">▣ Tirar foto com GPS<input type="file" accept="image/*" capture="environment" onChange={event => { void addPhotos(event.target.files); event.currentTarget.value = ''; }} /></label>
          <label className="secondary-button file-button">＋ Enviar fotos existentes<input type="file" accept="image/*" multiple onChange={event => { void addPhotos(event.target.files); event.currentTarget.value = ''; }} /></label>
          {busy && <span>Preparando fotos e consultando metadados…</span>}
        </div>
        {photos.length > 0 && <div className="diary-photo-grid">{photos.map(photo => <article className="diary-photo-card" key={photo.id}>
          <img src={photo.dataUrl} alt={photo.name} />
          <div className="diary-photo-meta"><strong>{photo.name}</strong><span>{formatDate(photo.capturedAt)}</span><span>{photo.latitude !== undefined && photo.longitude !== undefined ? 'GPS: ' + photo.latitude.toFixed(6) + ', ' + photo.longitude.toFixed(6) : photo.locationStatus}</span><span>{photo.weather}</span></div>
          <button className="text-danger" type="button" onClick={() => setPhotos(current => current.filter(item => item.id !== photo.id))}>Remover foto</button>
        </article>)}</div>}
        {message && <p className="diary-message" role="status">{message}</p>}
        <button className="primary-button" type="button" onClick={saveDiary}>Salvar diário</button>
      </div>
      <div className="diary-saved">
        <div className="diary-section-heading"><h2>Diários salvos neste dispositivo</h2><span>{records.length} registro(s)</span></div>
        {records.length === 0 ? <div className="empty-state">Nenhum diário salvo ainda.</div> : records.map(record => <article className="diary-record" key={record.id}>
          <div className="diary-record-head"><div><strong>{record.obra}</strong><span>{formatDate(record.createdAt)} · {record.photos.length} foto(s)</span></div><div className="diary-record-actions"><button className="secondary-button" onClick={() => printDiary(record)}>Imprimir / PDF</button><button className="text-danger" onClick={() => deleteDiary(record.id)}>Excluir</button></div></div>
          <p>{record.servicos}</p>
          {record.photos.length > 0 && <div className="diary-photo-grid saved">{record.photos.map(photo => <article className="diary-photo-card" key={photo.id}><img src={photo.dataUrl} alt={photo.name}/><div className="diary-photo-meta"><span>{formatDate(photo.capturedAt)}</span><span>{photo.latitude !== undefined && photo.longitude !== undefined ? 'GPS: ' + photo.latitude.toFixed(6) + ', ' + photo.longitude.toFixed(6) : photo.locationStatus}</span><span>{photo.weather}</span></div></article>)}</div>}
        </article>)}
      </div>
    </section>
  );
}
