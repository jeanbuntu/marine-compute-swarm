import { timingSafeEqual } from 'node:crypto';
import { decisionSchema, messages, observationSchema } from '../src/model/reasoning/protocol.js';

export interface MuseEnv { MODEL_API_KEY?:string; MUSE_MODEL?:string; MUSE_BASE_URL?:string; MUSE_ACCESS_TOKEN?:string; NODE_ENV?:string }
export interface ApiResult { status:number; body:unknown }
// Process-local protection; public multi-instance hosting also needs an ingress rate limit.
let calls:number[]=[];
const endpoint=(env:MuseEnv)=>(env.MUSE_BASE_URL??'https://api.meta.ai/v1').replace(/\/$/,'')+'/chat/completions';
export function connection(env:MuseEnv) {return {configured:!!env.MODEL_API_KEY&&!!env.MUSE_ACCESS_TOKEN,model:env.MUSE_MODEL??'muse-wonder-1.0',endpoint:endpoint(env),protected:!!env.MUSE_ACCESS_TOKEN};}
export async function reason(body:unknown,authorization:string|undefined,env:MuseEnv,fetcher:typeof fetch=fetch):Promise<ApiResult> {
  const config=connection(env);
  if(!config.configured)return {status:503,body:{error:'Set MODEL_API_KEY and MUSE_ACCESS_TOKEN on the server. Local demo remains available.'}};
  const expected=Buffer.from(`Bearer ${env.MUSE_ACCESS_TOKEN}`),actual=Buffer.from(authorization??'');
  if(expected.length!==actual.length||!timingSafeEqual(expected,actual))return {status:401,body:{error:'Invalid dashboard access token.'}};
  const parsed=observationSchema.safeParse(body);
  if(!parsed.success)return {status:400,body:{error:'Invalid observation snapshot.'}};
  if(!parsed.data.coordinatorOnline)return {status:409,body:{error:'Coordinator/backhaul offline; use local autonomy.'}};
  const now=Date.now(); calls=calls.filter(t=>now-t<60000);
  if(calls.length>=6)return {status:429,body:{error:'Server budget: six requests per minute. Continue deterministic control.'}};
  calls.push(now);
  const started=Date.now();
  try {
    const url=new URL(config.endpoint);
    if(url.protocol!=='https:')return {status:503,body:{error:'Muse endpoint must use HTTPS.'}};
    const response=await fetcher(url,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${env.MODEL_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:config.model,messages:messages(parsed.data),max_completion_tokens:4096}),signal:AbortSignal.timeout(45000)});
    if(!response.ok)return {status:502,body:{error:`Meta API returned HTTP ${response.status}. Check server model access, credits and configuration.`}};
    const result=await response.json();
    const raw=result.choices?.[0]?.message?.content;
    if(typeof raw!=='string'||raw.length>32000)return {status:502,body:{error:'Meta returned no bounded text decision.'}};
    let decision;
    try {decision=decisionSchema.parse(JSON.parse(raw));}
    catch {return {status:502,body:{error:'Model decision failed JSON/schema validation.',raw,latencyMs:Date.now()-started}};}
    const usage=result.usage;
    return {status:200,body:{decision,raw,model:config.model,endpoint:config.endpoint,latencyMs:Date.now()-started,usage:usage?{prompt_tokens:usage.prompt_tokens,completion_tokens:usage.completion_tokens,total_tokens:usage.total_tokens}:null}};
  } catch {return {status:502,body:{error:'Muse request timed out or the provider was unreachable. Deterministic control remains active.'}};}
}
