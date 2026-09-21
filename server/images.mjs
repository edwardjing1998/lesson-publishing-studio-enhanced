import {BlobServiceClient} from '@azure/storage-blob';
import {DefaultAzureCredential} from '@azure/identity';
import {blobName,hash} from './domain.mjs';

let container;
function client(){
 container||=new BlobServiceClient(process.env.AZURE_STORAGE_ENDPOINT,new DefaultAzureCredential()).getContainerClient(process.env.AZURE_STORAGE_CONTAINER);
 return container;
}

export async function downloadSourceImages(source){
 if(source.images.length>8)throw new Error('More than 8 source images; split or review the learning plan');
 const images=[];
 for(let index=0;index<source.images.length;index++){
  const ref=source.images[index];
  const blob=client().getBlobClient(blobName(ref.blob_path,process.env.AZURE_STORAGE_ENDPOINT,process.env.AZURE_STORAGE_CONTAINER));
  const properties=await blob.getProperties();
  if(properties.contentLength>8*1024*1024)throw new Error('Source image exceeds 8 MiB');
  const bytes=await blob.downloadToBuffer(0,undefined,{conditions:{ifMatch:properties.etag}});
  let mime,extension;
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){mime='image/png';extension='png';}
  else if(bytes[0]===255&&bytes[1]===216){mime='image/jpeg';extension='jpg';}
  else throw new Error('Only PNG and JPEG source images are supported');
  const contentHash=hash(bytes);
  if(ref.content_hash&&ref.content_hash!==contentHash)throw new Error(`Source image changed: ${ref.original_link}`);
  images.push({id:`figure-${index+1}`,bytes,mime,extension,ref:{...ref,content_hash:contentHash}});
 }
 return images;
}

function layoutCandidates(source){
 const candidates=[];
 for(const ref of source.images||[]){
  const raw=String(ref.blob_path||'');
  let name;
  try{name=blobName(raw,process.env.AZURE_STORAGE_ENDPOINT,process.env.AZURE_STORAGE_CONTAINER);}catch{continue;}
  const marker='/figures/';
  const figureIndex=name.indexOf(marker);
  if(figureIndex>0)candidates.push(`${name.slice(0,figureIndex)}/layout.json`);
  else {const slash=name.lastIndexOf('/');if(slash>0)candidates.push(`${name.slice(0,slash)}/layout.json`);}
 }
 return [...new Set(candidates)];
}

export async function downloadSourceAsset(source,index){
 const images=await downloadSourceImages(source);
 const image=images[Number(index)];
 if(!image)throw Object.assign(new Error('Source image not found'),{statusCode:404});
 return image;
}

export async function downloadSourceLayout(source){
 for(const name of layoutCandidates(source)){
  try{
   const blob=client().getBlobClient(name);
   const response=await blob.download();
   const chunks=[];
   for await(const chunk of response.readableStreamBody)chunks.push(Buffer.from(chunk));
   return {name,data:JSON.parse(Buffer.concat(chunks).toString('utf8'))};
  }catch(error){if(error.statusCode!==404)throw error;}
 }
 return null;
}

export async function uploadBytes(name,bytes,mime){
 const blob=client().getBlockBlobClient(name);
 await blob.uploadData(bytes,{blobHTTPHeaders:{blobContentType:mime,blobCacheControl:'private, no-store'}});
 return {name,hash:hash(bytes),size:bytes.length,mime};
}

export async function downloadPublished(name){
 const blob=client().getBlobClient(name);
 const properties=await blob.getProperties();
 const bytes=await blob.downloadToBuffer();
 return {bytes,mime:properties.contentType||'application/octet-stream'};
}
