import fs from 'node:fs';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import {fileURLToPath} from 'node:url';
const args=process.argv.slice(2);
if(args.some(arg=>arg!=='--local'))throw Error('Usage: node scripts/setup.mjs [--local]');
if(fs.existsSync('.env'))throw Error('.env already exists. Edit it directly; setup will not replace your secrets.');
const local=args.includes('--local');
const terminal=local?null:readline.createInterface({input:process.stdin,output:process.stdout});
try {
 const hostname=local?'localhost':(await terminal.question('Public hostname (e.g. quotes.example.com): ')).trim().toLowerCase();
 const email=local?'admin@example.test':(await terminal.question('Administrator email: ')).trim().toLowerCase();
 if(!local&&(!/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(hostname)||!hostname.includes('.')||hostname.includes('..')))throw Error('Use a hostname without a scheme, port or path.');
 if(!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email))throw Error('Enter a valid email address.');
 const password=crypto.randomBytes(24).toString('hex');
 let content=fs.readFileSync(fileURLToPath(new URL('../.env.example',import.meta.url)),'utf8').replaceAll('quotes.example.com',hostname).replace('OWNER_EMAIL=admin@example.com','OWNER_EMAIL='+email).replace('INTERNAL_PASSWORD=','INTERNAL_PASSWORD='+password).replace('TOKEN_ENCRYPTION_KEY=','TOKEN_ENCRYPTION_KEY='+crypto.randomBytes(32).toString('base64'));
 if(local)content=content.replace('NODE_ENV=production','NODE_ENV=development').replace('HOST=0.0.0.0','HOST=127.0.0.1').replace('DATA_DIR=/app/data','DATA_DIR=./data').replaceAll('https://localhost','http://localhost:3000');
 fs.writeFileSync('.env',content,{mode:0o600,flag:'wx'});
 console.log('Created .env. Your initial password is in INTERNAL_PASSWORD. Keep this file private.');
 console.log(local?'Run npm ci && npm start, then visit http://localhost:3000/login. Email: admin@example.test. Fictional demo records are enabled.':'Point DNS to this server, allow ports 80/443, then run: docker compose up -d --build');
} finally {terminal?.close()}
