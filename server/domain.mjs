import {createHash} from 'node:crypto';

export const hash=value=>createHash('sha256').update(value).digest('hex');
export const ACTIVITY_TYPES={
 CONCEPT_EXPLANATION:{label:'概念讲解',category:'LEARNING'}, THEOREM_PROOF:{label:'定理证明',category:'LEARNING'},
 WORKED_EXAMPLE:{label:'例题精讲',category:'EXAMPLE'}, GUIDED_PRACTICE:{label:'引导练习',category:'PRACTICE'},
 MULTIPLE_CHOICE:{label:'多项选择题',category:'ASSESSMENT'}, TRUE_FALSE:{label:'判断题',category:'ASSESSMENT'},
 FILL_IN_BLANK:{label:'填空题',category:'ASSESSMENT'}, SHORT_ANSWER:{label:'简答题',category:'ASSESSMENT'},
 CALCULATION:{label:'计算题',category:'ASSESSMENT'}, PROOF_EXERCISE:{label:'证明题',category:'ASSESSMENT'},
 DIAGRAM_EXPLORATION:{label:'作图/图形探究',category:'EXPLORATION'}, ERROR_ANALYSIS:{label:'错误诊断',category:'ASSESSMENT'},
 APPLICATION_PROBLEM:{label:'应用题',category:'APPLICATION'}
};
export const activityCatalog=()=>Object.entries(ACTIVITY_TYPES).map(([type,value])=>({type,...value}));

const mathReplacements=[
 [/\\angle\s*/g,'∠'],[/\^\{?\\circ\}?/g,'°'],[/\\times\b/g,'×'],[/\\div\b/g,'÷'],
 [/\\cdot\b/g,'·'],[/\\pm\b/g,'±'],[/\\leq\b/g,'≤'],[/\\geq\b/g,'≥'],
 [/\\neq\b/g,'≠'],[/\\pi\b/g,'π']
];
export function normalizeActivityMath(value){
 const normalize=item=>{
  if(typeof item==='string')return mathReplacements.reduce((text,[pattern,symbol])=>text.replace(pattern,symbol),item).replace(/\\\((.*?)\\\)/gs,'$1').replace(/\\\[(.*?)\\\]/gs,'$1');
  if(Array.isArray(item))return item.map(normalize);
  if(item&&typeof item==='object')return Object.fromEntries(Object.entries(item).map(([key,child])=>[key,normalize(child)]));
  return item;
 };
 return normalize(value);
}
export function blobName(raw,endpoint,container){
 if(typeof raw!=='string'||!raw)throw new Error('Missing blob_path'); if(!raw.includes('://'))return raw.replace(/^\/+/, '');
 const url=new URL(raw),account=new URL(endpoint).hostname.split('.')[0]; let name;
 if(url.protocol==='abfss:'){if(url.username!==container||url.hostname!==`${account}.dfs.core.windows.net`)throw new Error('Image account/container mismatch');name=url.pathname.slice(1);}
 else if(url.protocol==='https:'){if(![`${account}.blob.core.windows.net`,`${account}.dfs.core.windows.net`].includes(url.hostname))throw new Error('Image host mismatch');const parts=url.pathname.slice(1).split('/');if(parts.shift()!==container)throw new Error('Image container mismatch');name=parts.join('/');}
 else throw new Error('Unsupported image URI'); return decodeURIComponent(name);
}
const requiredText=(value,name,max=16000)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error(`Invalid ${name}`);return value.trim();};
export function safeSegment(value,fallback='item'){const segment=String(value||'').trim().replace(/[^A-Za-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,100);return segment||fallback;}
export function validateActivityRequest(value,processIds){
 const instruction=String(value?.additional_instruction||'').trim();if(instruction.length>1000)throw new Error('Additional instruction is limited to 1,000 characters');
 if(!Array.isArray(value?.selections)||!value.selections.length)throw new Error('Select at least one activity'); const selections=[];
 for(const selection of value.selections){if(!processIds.has(selection.process_id))throw new Error('Unknown process_id');if(!ACTIVITY_TYPES[selection.activity_type])throw new Error('Unsupported activity_type');const variants=Number(selection.variants??1);if(!Number.isInteger(variants)||variants<1||variants>3)throw new Error('Variants must be 1, 2, or 3');selections.push({process_id:selection.process_id,activity_type:selection.activity_type,variants});}
 if(selections.reduce((sum,x)=>sum+x.variants,0)>30)throw new Error('A request may create at most 30 activities');return {selections,additional_instruction:instruction,language:String(value.language||'').trim().slice(0,40)};
}
export function validateActivity(value,{type,process,imageIds}){
 if(value?.status==='NEEDS_SOURCE_REVIEW')return {...value,reason:requiredText(value.reason,'source review reason',2000)};
 if(value?.status!=='SUCCEEDED'||value.activity_type!==type)throw new Error('Invalid activity status or type');if(value.process_id!==process.process_id)throw new Error('Model changed process_id');
 requiredText(value.title,'title',300);requiredText(value.objective,'objective',1000);requiredText(value.instructions_markdown,'instructions');requiredText(value.solution_markdown,'solution');
 if(!Array.isArray(value.image_ids)||value.image_ids.some(id=>!imageIds.includes(id)))throw new Error('Unknown image reference');if(!Array.isArray(value.prerequisite_ids))throw new Error('Invalid prerequisite_ids');
 const allowed=new Set(process.prerequisites.map(x=>x.prerequisite_id));if(value.prerequisite_ids.some(id=>!allowed.has(id)))throw new Error('Unknown prerequisite reference');
 if(!Array.isArray(value.blocks)||!value.blocks.length||value.blocks.length>20)throw new Error('Activity requires 1–20 blocks');const blockIds=new Set();
 for(const block of value.blocks){requiredText(block.block_id,'block_id',80);requiredText(block.kind,'block kind',40);requiredText(block.markdown,'block markdown',8000);if(blockIds.has(block.block_id))throw new Error('Duplicate block_id');blockIds.add(block.block_id);}
 if(type==='MULTIPLE_CHOICE'){if(!Array.isArray(value.choices)||value.choices.length<3||value.choices.length>6)throw new Error('Multiple choice requires 3–6 choices');const ids=value.choices.map(x=>requiredText(x.choice_id,'choice_id',20));value.choices.forEach(x=>requiredText(x.text,'choice text',1000));if(new Set(ids).size!==ids.length||!ids.includes(value.correct_choice_id))throw new Error('Invalid multiple-choice answer');}else value.choices=[];
 return value;
}
export function validateMathAndReferences(activity,input){const combined=[activity.instructions_markdown,activity.solution_markdown,...activity.blocks.map(x=>x.markdown)].join('\n');if(/\b(?:undefined|NaN|Infinity)\b/.test(combined))throw new Error('Invalid mathematical token in generated content');const suppliedIds=new Set([input.process.process_id,...input.process.prerequisites.map(x=>x.prerequisite_id),...input.images.map(x=>x.id)]);for(const id of [...activity.prerequisite_ids,...activity.image_ids])if(!suppliedIds.has(id))throw new Error(`Unsupplied reference: ${id}`);if((combined.match(/\$/g)||[]).length%2)throw new Error('Unbalanced inline math delimiters');return true;}
export function validateSymbolicMath(activity,input){
 validateMathAndReferences(activity,input);
 const combined=[activity.instructions_markdown,activity.solution_markdown,...activity.blocks.map(x=>x.markdown),...activity.choices.map(x=>x.text)].join('\n');
 if(/\\[A-Za-z]+\b/.test(combined)||/\\[\[(]/.test(combined))throw new Error('Raw LaTeX command found; use visible Unicode mathematical symbols');
 return true;
}
