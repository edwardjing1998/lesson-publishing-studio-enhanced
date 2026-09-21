// Keep the provider schema within Azure OpenAI structured-output's supported subset.
// Length/count rules are enforced again in domain.mjs after JSON decoding.
const string={type:'string'};
export function schemaFor(type,processId){
 const choice={type:'object',additionalProperties:false,required:['choice_id','text'],properties:{choice_id:string,text:string}};
 const imageRequest={type:'object',additionalProperties:false,required:['image_id','purpose','prompt'],properties:{image_id:string,purpose:string,prompt:string}};
 return {name:`lesson_activity_${type.toLowerCase()}`,strict:true,schema:{type:'object',additionalProperties:false,required:['status','reason','activity_type','process_id','title','objective','instructions_markdown','blocks','choices','correct_choice_id','solution_markdown','prerequisite_ids','image_ids','image_requests'],properties:{status:{type:'string',enum:['SUCCEEDED','NEEDS_SOURCE_REVIEW']},reason:{type:'string'},activity_type:{type:'string',enum:[type]},process_id:{type:'string',enum:[processId]},title:string,objective:string,instructions_markdown:string,blocks:{type:'array',items:{type:'object',additionalProperties:false,required:['block_id','kind','markdown'],properties:{block_id:string,kind:{type:'string',enum:['CONTENT','QUESTION','HINT','PROOF_STEP','REFLECTION','RUBRIC']},markdown:string}}},choices:{type:'array',items:choice},correct_choice_id:{type:'string'},solution_markdown:string,prerequisite_ids:{type:'array',items:{type:'string'}},image_ids:{type:'array',items:{type:'string'}},image_requests:{type:'array',items:imageRequest}}}}};
}
