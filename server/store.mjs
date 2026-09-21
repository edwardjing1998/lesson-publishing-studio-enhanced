import {execute,parameter} from './databricks.mjs';
import {c} from './config.mjs';

export const sql=(statement,values={})=>execute(c,statement,Object.entries(values).map(([name,value])=>parameter(name,value??'')));
export const approvedPlan="generation_status='SUCCEEDED' AND review_status='APPROVED' AND input_json IS NOT NULL";

export async function planBundle(planId){
 const [plan]=await sql(`SELECT * FROM ${c.plans} WHERE plan_id=:planId AND ${approvedPlan} LIMIT 1`,{planId});
 if(!plan)throw new Error('Learning plan is missing, incomplete, or not approved');
 let source;
 try{source=JSON.parse(plan.input_json);}catch{throw new Error('Approved learning plan has invalid input_json');}
 if(!source?.document_id||!source?.markdown||!Array.isArray(source.images))throw new Error('Approved learning plan source snapshot is incomplete');
 const processes=await sql(`SELECT * FROM ${c.processes} WHERE plan_id=:planId ORDER BY sequence_number,process_id`,{planId});
 if(!processes.length)throw new Error('Approved learning plan has no page processes');
 const prerequisites=await sql(`SELECT * FROM ${c.prerequisites} WHERE plan_id=:planId ORDER BY process_id,sequence_number,prerequisite_id`,{planId});
 for(const process of processes)process.prerequisites=prerequisites.filter(item=>item.process_id===process.process_id);
 return {plan,source,processes};
}

export async function updatePackage(packageId,status,error=''){
 await sql(`UPDATE ${c.packages} SET generation_status=:status,generation_error=:error,updated_at=current_timestamp() WHERE package_id=:packageId`,{packageId,status,error});
}
