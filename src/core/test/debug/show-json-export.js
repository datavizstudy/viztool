if(process.argv.length < 3)
	console.log('No file specified. Defaulting to LinkedIn dataset');

import fs from 'node:fs/promises';
import { default as path } from 'node:path';
import convert2json from '../../src/converter.js';

const example = path.dirname(process.argv[1]) + '/../../../../sample-exports/LinkedIn.zip';


const data = await fs.readFile(process.argv[2] ?? example).then(file =>
	convert2json(process.argv[2] ?? example, file)
);
export default data;


// direct call
if(import.meta.url === 'file://' + process.argv[1])
	console.log(data['Jobs/Job Seeker Preferences.csv']);
	//console.log(data['Jobs/Job Seeker Preferences.csv']);	// test resolved
	//console.log(data['Jobs/Job Seeker Preferences.csv']);	// test resolved 2
