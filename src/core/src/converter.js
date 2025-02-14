import { parse as parseHtml } from 'himalaya';
import { parse as csv2json } from 'csv-parse/browser/esm/sync';
import { unzipSync } from 'fflate';		// sync because Proxy object getter
import { promisify } from 'node:util';


/**
 * convert arbitrary format to JSON structure
 * @description Uses `Proxy` objects under the hood, enabling lazy conversion of
 *	e.g. zip file entries to their JSON counterpart.
 * @param {string} type - input type; if type unknown the function just returns
 *	`data`. Both filenames (e.g. `example.json`) or suffixes (e.g. `json`)
 *	allowed
 * @param {Uint8Array} data - file contents to be converted
 * @param {{matches:function,convert:function}[]} [converters=[]] - list of custom
 *	converters for transforming file contents to a JSON object. The `matches`
 *	function accepts the file suffix (`string`) and returns whether it matches
 *	the given `convert` function accepting the input being converted to JSON.
 *	The convert function must return either a Promise or its resolved value
 *	directly.
 * @returns {object} parsed JSON object
 */
export default function convert2json(type, data, converters = []) {
 type = '.'+type.toLowerCase();		// allow for both filenames and suffixes
 try{
	// pre-define only converters needed by ≥1 transformers
	if(type.endsWith('.json'))
		return JSON.parse(new TextDecoder().decode(data));
	else if(type.endsWith('.csv')) {
		let content = new TextDecoder().decode(data);
		let escape = content.match(/([\\"])"/i)?.[1];
		let table = csv2json(content, {bom:true, columns:false, escape,
			comment:'#', comment_no_infix:true,
			relax_column_count:true });
		if(table < 2) return [];

		let offset = 0;			// remove csv notes			
		while(offset < table.length	// shift until empty line or end
			 && !table.slice(offset)[0].every(cell => cell == ''))
			offset++;
		if(offset < table.length
			 && table.slice(offset)[0].every(cell => cell == ''))
			offset++;
		else offset = 0;
		
		return table.slice(offset+1).map(line =>
			table[offset].reduce(
				(object, key, i) => ({...object, [key]:line[i]}),
				{}
			)
		);
	} else if(type.endsWith('.html')) {
		return parseHtml(new TextDecoder().decode(data));
	} else if(type.endsWith('.zip')) {
		var files = unzipSync(data), prefix = '';

		// find longest common prefix (as directory)
		while(true) {
			let test = prefix + Object.keys(files)[0]
				.substring(prefix.length).split('/',2)[0];
			if(Object.keys(files).some(e => e != test
			 && !e.startsWith(test+'/')))
				break;
			prefix = test;
			try { // if not removed: no further common prefixes
				Reflect.deleteProperty(files, prefix);
				prefix += '/';
				Reflect.deleteProperty(files, prefix);
			} catch(e) {
				break;
			}
		}
		if(prefix != '') { // remove top level dir from all entries
			try {
				Reflect.deleteProperty(files, prefix.replace(/\/$/,''));
				Reflect.deleteProperty(files, prefix);
			} catch(e) {}
			Object.keys(files).forEach(key => {
				Reflect.set(files, key.slice(prefix.length),
					Reflect.get(files, key)
				);
				Reflect.deleteProperty(files, key);
			});
		}
		
		// lazy convert csv/json/… string to json
		let cache = [];
		return new Proxy(files, {
			get(target, prop, receiver) {
			 if(!cache.includes(prop) && Reflect.has(target, prop)) {
				Reflect.set(target, prop,
				 	convert2json(prop,
				 		Reflect.get(target, prop),
				 		converters)
				);
				cache.push(prop);
			 }
			 return Reflect.get(...arguments);
		 	}
		 });
		}

	// custom + default converters
	else for(let converter of converters) if(converter.match(type))
	 return converter.convert(data);
	return data; // i.e. pdf
 } catch(e) {
	throw new Error('"'+type.slice(1)+'" conversion failed: '+e.message)
 }
}
