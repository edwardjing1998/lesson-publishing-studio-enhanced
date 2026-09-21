export const c = {
 databricksHost:(process.env.DATABRICKS_HOST||'').replace(/\/$/,''),
 warehouseId:process.env.DATABRICKS_SQL_WAREHOUSE_ID,
 plans:'education_rag.silver.learning_plans',
 processes:'education_rag.silver.page_plans',
 prerequisites:'education_rag.silver.process_prerequisites',
 packages:'education_rag.gold.lesson_packages',
 pages:'education_rag.gold.lesson_pages',
 assets:'education_rag.gold.lesson_assets',
 activities:'education_rag.gold.lesson_activities',
 activityAssets:'education_rag.gold.lesson_activity_assets',
 publishedPrefix:(process.env.AZURE_STORAGE_PUBLISHED_PREFIX||'published/').replace(/^\/+|\/+$/g,''),
 templates:['classroom','colorful','worksheet','geometry','minimal']
};
export function requireConfig(){
 for(const key of ['DATABRICKS_HOST','DATABRICKS_CLIENT_ID','DATABRICKS_CLIENT_SECRET','DATABRICKS_SQL_WAREHOUSE_ID','AZURE_STORAGE_ENDPOINT','AZURE_STORAGE_CONTAINER','AZURE_OPENAI_ENDPOINT','AZURE_OPENAI_API_KEY','AZURE_OPENAI_DEPLOYMENT']) if(!process.env[key]) throw new Error(`${key} is missing in .env`);
 if(process.env.NODE_ENV==='production' && (!process.env.APP_USERNAME || (process.env.APP_PASSWORD||'').length<16)) throw new Error('Production requires APP_USERNAME and APP_PASSWORD (16+ characters).');
}
