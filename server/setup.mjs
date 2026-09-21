import {readFile} from 'node:fs/promises';
import {execute} from './databricks.mjs';
import {c} from './config.mjs';
for(const statement of (await readFile(new URL('../sql/setup.sql',import.meta.url),'utf8')).split(';').filter(x=>x.trim())) await execute(c,statement);
console.log('Five Gold lesson-publishing tables are ready. Silver learning-plan tables were not altered.');
