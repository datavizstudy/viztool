import Ajv from 'ajv/dist/2020.js';
import { default as jsonata } from 'jsonata';
import fs from 'node:fs/promises';
import { default as predefinedTransformers } from './transformers/_export.js';
import { default as convert2json } from './converter.js';

export { default as transformers } from './transformers/_export.js';

/**
 * transforms the data export to a unified data format
 * @param {ReadableStream|Uint8Array} input - zip file
 *	- browser: pass `files[0].stream()`
 *	- node:
 *		- `import { Readable } from 'node:stream';` and pass
 *			`Readable.toWeb(…)`
 *		- `import { ReadableStream } from 'node:stream/web';`
 * @param {string} [transformers=null] - transformers for data exporters, possible
 *	values:
 *	- `null`: auto-detect transformer from pre-delivered transformers
 *	- `[{schema:URL|object, transformer:URL|string}]`: auto-detect `schema` for
 *		input validation and apply `transformer`
 *	- `schema` and `transformer` can either be a `URL` to load the schema /
 *		transformer from or the actual schema/transformer data
 * @param {boolean} [addTransformers=true] - whether to add the given `transformers`
 *	to the predefined transformers list (`true`) or whether `transformers`
 *	should overwrite the predefined list of available transformers (`false`)
 * @param {{matches:function,convert:function}[]} [converters=[]] - list of custom
 *	converters for transforming file contents to a JSON object. The `matches`
 *	function accepts the file suffix (`string`) and returns whether it matches
 *	the given `convert` function accepting the input being converted to JSON.
 *	The convert function must return either a Promise or its resolved value
 *	directly.
 * @returns {Promise<{schema:string,result:object}[]>} Promise resolving to list of
 *	matching schema ids of a transformer and transformed JSON objects. Multiple
 *	objects are possible e.g. with multiple Google services in a single data
 *	export. A list of `Promise`s allows for timely selection of returned objects
 *	e.g. with `Promise.any()`.
 */
export default function transform(input, transformers = null, addTransformers = true, converters = []) {
	if(input instanceof ReadableStream)
	 input = new Response(input).arrayBuffer().then(buffer => new Uint8Array(buffer));
	else if(input instanceof Uint8Array)
	 input = Promise.resolve(input);
	else
	 throw new Error('Please provide a ReadableStream or Uint8Array as `input`');
	if(transformers != null && !Array.isArray(transformers))
		throw new TypeError('The argument `transformers` must either be null or an array');

	// auto-load predefined transformers
	if(transformers == null || addTransformers)
		transformers = (transformers ?? []).concat(predefinedTransformers);
	for(let i = 0; i < transformers.length; i++) {
		if(typeof transformers[i].schema instanceof URL)
			transformers[i].schema = import(transformers[i].schema);
		if(typeof transformers[i].transformer instanceof URL)
			transformers[i].transformer = import(transformers[i].transformer);
	}

	// initialise validator (async)
	const validator = Promise.resolve().then(async _ =>
		new Ajv({schemas:transformers.map(t=>t.schema), strict:false}) );

	// convert file recursively to JSON (async)
	let data = input.then(input => convert2json('zip', input, converters));

	// auto detect matching transformers
	let matches = Promise.all([validator, data]).then( ([validator, data]) =>
		transformers.filter(transformer => 
			validator.getSchema(transformer.schema.$id)(data)
		)
	);

	// unpack and asynchronously execute transformers
	let transformed = matches.then(matches => Promise.all(matches.map(async transformer =>
		transformer.transformer(await data)
		.then(result => ({schema: transformer.schema.$id, result }) )
	)));

	return transformed;
}
