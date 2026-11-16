export type BrandAssetKind = 'logo' | 'signature';
export type BrandAsset = { cnpj: string; kind: BrandAssetKind; name: string; type: string; blob: Blob; updatedAt: string };
const DB_NAME = 'gestao360-company-brand-assets';
const STORE = 'assets';
const assetKey = (cnpj: string, kind: BrandAssetKind) => cnpj.replace(/\D/g,'') + ':' + kind;
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve,reject) => {
    const request = indexedDB.open(DB_NAME,1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE,{keyPath:'key'}); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function saveBrandAsset(cnpj: string, kind: BrandAssetKind, file: File): Promise<void> {
  const db=await openDb();
  await new Promise<void>((resolve,reject) => {
    const tx=db.transaction(STORE,'readwrite');
    tx.objectStore(STORE).put({key:assetKey(cnpj,kind),cnpj,kind,name:file.name,type:file.type,blob:file,updatedAt:new Date().toISOString()});
    tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error);
  });
  db.close();
}
export async function getBrandAsset(cnpj: string, kind: BrandAssetKind): Promise<BrandAsset|null> {
  const db=await openDb();
  const result=await new Promise<BrandAsset|null>((resolve,reject)=>{
    const request=db.transaction(STORE,'readonly').objectStore(STORE).get(assetKey(cnpj,kind));
    request.onsuccess=()=>resolve(request.result ?? null); request.onerror=()=>reject(request.error);
  });
  db.close(); return result;
}
export async function brandAssetDataUrl(asset: BrandAsset|null): Promise<string> {
  if (!asset) return '';
  return await new Promise((resolve,reject)=>{
    const reader=new FileReader(); reader.onload=()=>resolve(String(reader.result)); reader.onerror=()=>reject(reader.error); reader.readAsDataURL(asset.blob);
  });
}
