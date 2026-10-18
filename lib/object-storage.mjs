import fs from 'node:fs';
import path from 'node:path';
import {S3Client,PutObjectCommand,GetObjectCommand,ListObjectsV2Command,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
export function objectStorage(env=process.env){
 const enabled=Boolean(env.TOS_BUCKET&&env.TOS_ACCESS_KEY_ID&&env.TOS_SECRET_ACCESS_KEY&&env.TOS_ENDPOINT&&env.TOS_REGION);
 if(env.NODE_ENV==='production'&&!enabled&&!(env.DEPLOYMENT_MODE==='self-hosted'&&env.STORAGE_MODE==='local'))throw Error('Production requires private BytePlus TOS storage configuration');
 const client=enabled?new S3Client({region:env.TOS_REGION,endpoint:env.TOS_ENDPOINT,forcePathStyle:env.TOS_FORCE_PATH_STYLE==='true',credentials:{accessKeyId:env.TOS_ACCESS_KEY_ID,secretAccessKey:env.TOS_SECRET_ACCESS_KEY},requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED'}):null;
 const bucket=env.TOS_BUCKET,prefix=env.TOS_PREFIX||'dowi-quotes/';
 const requireClient=()=>{if(!client)throw Error('BytePlus TOS storage is not configured')};
 return {enabled,bucket,
  async put(key,bytes,type='application/octet-stream'){requireClient();await client.send(new PutObjectCommand({Bucket:bucket,Key:prefix+key,Body:bytes,ContentType:type}));},
  async get(key){requireClient();const r=await client.send(new GetObjectCommand({Bucket:bucket,Key:prefix+key}));return Buffer.from(await r.Body.transformToByteArray())},
  async presign(asset,inline=false){requireClient();return getSignedUrl(client,new GetObjectCommand({Bucket:bucket,Key:prefix+'files/'+asset.id,ResponseContentType:asset.type,ResponseContentDisposition:`${inline&&asset.type.startsWith('image/')?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(asset.name)}`}),{expiresIn:60})},
  async uploadAsset(asset,folder){if(!enabled)return;await this.put('files/'+asset.id,fs.readFileSync(path.join(folder,asset.id)),asset.type);asset.storage='tos';},
  async ensureLocal(asset,folder){
   if(asset.storage!=='tos')return;
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(asset.id))throw Error('Invalid attachment identifier');
   const file=path.join(folder,asset.id);
   try{const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{if(!fs.fstatSync(fd).isFile())throw Error('Invalid cached attachment')}finally{fs.closeSync(fd)}return}
   catch(error){if(error.code!=='ENOENT')throw error}
   fs.mkdirSync(folder,{recursive:true,mode:0o700});
   const bytes=await this.get('files/'+asset.id);
   // A competing request may have populated the cache; never overwrite it or a symlink.
   try{fs.writeFileSync(file,bytes,{mode:0o600,flag:'wx'})}catch(error){if(error.code!=='EEXIST')throw error}
  },
  async list(prefixKey){requireClient();const rows=[];let token;do{const r=await client.send(new ListObjectsV2Command({Bucket:bucket,Prefix:prefix+prefixKey,ContinuationToken:token}));rows.push(...(r.Contents||[]));token=r.IsTruncated?r.NextContinuationToken:undefined}while(token);return rows.map(r=>({...r,Key:r.Key.slice(prefix.length)}))},
  async remove(key){requireClient();await client.send(new DeleteObjectCommand({Bucket:bucket,Key:prefix+key}))}
 };
}
