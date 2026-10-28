// @vitest-environment node
import { connection, reason } from './muse';
import { observe, demoDecision } from '../src/model/reasoning/harness';
import { createWeather, SCENARIOS } from '../src/model/weather';
import { workerDesign,masterDesign } from '../src/model/nodeDesign';
import { defaultConfig } from '../src/model/config';
const designs={worker:workerDesign(),master:masterDesign()};
const o=observe(createWeather(designs),SCENARIOS[0].conditions,'day',designs,defaultConfig());
const env={MODEL_API_KEY:'private-provider-key',MUSE_ACCESS_TOKEN:'dashboard-token'};
test('configuration never returns credentials; missing credentials and unauthorized calls never reach provider',async()=>{
  expect(JSON.stringify(connection(env))).not.toContain('private-provider-key');
  const f=vi.fn();
  expect((await reason(o,undefined,{},f)).status).toBe(503);
  expect((await reason(o,'Bearer wrong',env,f)).status).toBe(401);
  expect((await reason({},'Bearer dashboard-token',env,f)).status).toBe(400);
  expect(f).not.toHaveBeenCalled();
});
test('proxy sends server key and exact prompt, validates response and reports usage',async()=>{
  const d=demoDecision(o),f=vi.fn().mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(d)}}],usage:{total_tokens:123}})));
  const result=await reason(o,'Bearer dashboard-token',env,f);
  expect(result.status).toBe(200);expect(result.body).toMatchObject({decision:d,usage:{total_tokens:123}});
  const [url,init]=f.mock.calls[0];expect(url.toString()).toBe('https://api.meta.ai/v1/chat/completions');
  expect(init.headers.Authorization).toBe('Bearer private-provider-key');expect(JSON.parse(init.body).model).toBe('muse-wonder-1.0');
  expect(JSON.stringify(result.body)).not.toContain('private-provider-key');
});
test('bad model JSON, provider failure and unavailable coordinator produce fallback errors',async()=>{
  const f=vi.fn().mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:'{"strategy":"tow"}'}}]})));
  expect((await reason(o,'Bearer dashboard-token',env,f)).status).toBe(502);
  f.mockResolvedValue(new Response('secret upstream error',{status:401}));
  const result=await reason(o,'Bearer dashboard-token',env,f);expect(result.status).toBe(502);expect(JSON.stringify(result.body)).not.toContain('secret upstream error');
  expect((await reason({...o,coordinatorOnline:false},'Bearer dashboard-token',env,f)).status).toBe(409);
});
