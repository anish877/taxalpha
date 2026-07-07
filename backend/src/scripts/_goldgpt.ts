import { readFile, writeFile } from 'node:fs/promises';
import { ingestFormV2Paged } from '../lib/ingestion/ingest-paged.js';
const GOLD='/Users/anishsuman/Documents/projects/taxalpha/taxalpha/backend/tests/fixtures/gold';
const OUT='/Users/anishsuman/Documents/projects/taxalpha/form-ingestion/gold-gpt55';
const forms=[['SFC','Statement of Financial Condition'],['BAIODF','Alternative Investment Order Ticket'],['BAIV_506C','506(c) Policy and Accreditation'],['INVESTOR_PROFILE_ADDITIONAL_HOLDER','Investor Profile Additional Holder'],['INVESTOR_PROFILE','Investor Profile']];
for(const [code,title] of forms){
  try{
    const r=await ingestFormV2Paged(new Uint8Array(await readFile(`${GOLD}/${code}.source.pdf`)),{apiKey:process.env.OPENROUTER_API_KEY!,model:'openai/gpt-5.5',baseUrl:'https://openrouter.ai/api/v1',hint:title,vision:true,reasoningEffort:'high'});
    await writeFile(`${OUT}/${code}.json`, JSON.stringify(r.schema,null,2));
    const m=r.stats; const showif=r.schema.items.filter((i:any)=>i.showIf).length;
    console.log(`${code}: ${m.steps} steps, ${m.questions} q | ${m.mapped}/${m.totalFields} (${Math.round(m.mapped/m.totalFields*100)}%) | showIf:${showif} | visionPages ${m.visionPages}`);
  }catch(e){console.log(`${code}: ERROR ${(e as Error).message}`);}
}
console.log('DONE');
