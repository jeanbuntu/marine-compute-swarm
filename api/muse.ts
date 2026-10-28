import type { IncomingMessage, ServerResponse } from 'node:http';
import { connection, reason } from '../server/muse.js';
export default async function handler(req:IncomingMessage & {body?:unknown},res:ServerResponse) {
  res.setHeader('Cache-Control','no-store');
  if(req.method==='GET'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(connection(process.env)));return;}
  if(req.method!=='POST'){res.statusCode=405;res.setHeader('Allow','GET, POST');res.end();return;}
  try {
    let body=req.body;
    if(body===undefined){let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>64000){res.statusCode=413;res.end();return;}}body=JSON.parse(text);}
    if(typeof body==='string')body=JSON.parse(body);
    if(Buffer.byteLength(JSON.stringify(body))>64000){res.statusCode=413;res.end();return;}
    const result=await reason(body,req.headers.authorization,process.env);
    res.statusCode=result.status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result.body));
  }catch {res.statusCode=400;res.end(JSON.stringify({error:'Invalid JSON request.'}));}
}
