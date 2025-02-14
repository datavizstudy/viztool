import jsonld from 'jsonld';
import { promisify } from 'node:util';

import schema from './transformer.js';
import { jsonld2obj, array } from './helper.js';


/**
 * converts Schema.org objects and extensions into Plotly JSON diagram objects
 * @async
 * @param {object} graph - Schema.org graph
 * @param {{"schema":RegExp, "transform":function}[]} [extensions=[]] - object of
 *	`transform`er functions for non-Schema.org schemata, which URI matches
 *	`schema`. The `transform`er function consumes …
 *	- the list of graph objects
 *	- a list of JSON+LD `@id`s of the objects representing the data subjects
 *		These may identify both different subjects as well as the same
 *		subject with multiple IDs.
 *	- the `enrich` function passed to this method
 *	Transformer functions may be async, and return a list of
 *	[Plotly](https://plotly.com/javascript) JSON diagram objects.
 *	They are applied in descending order of specialisation i.e. number of
 *	matching schemata. The default Schema.org transformer is applied last.
 *	If no transformer can transform a Schema.org object, it is obviously not
 *	transformed and thus omitted from the return list.
 * @param {boolean|function(string):Promise} [enrich= msg => window.confirm ? Promise.resolve(window.confirm(msg)) : false] - whether external data requests to
 *	enrich the data are allowed e.g. fetching album covers. If this is
 *	- `true`, all external requests are automatically granted,
 *	- `false`, all external requests are automatically forbidden,
 *	- a function, then this function is called. It must return a `Promise`
 *		resolving to one of the values above. Rejection of the promise is
 *		equivalent to `false`. The function expects one parameter being an
 *		explanatory display message for the external request. Function
 *		responses are not cached.
 * @returns {(object|object[])[]} list of corresponding
 *	[Plotly](https://plotly.com/javascript) JSON diagram objects / object-groups.
 */
export default async function schema2plotly(graph, extensions = [],
	enrich = msg => Promise.resolve(window?.confirm?.(msg) ?? false)) {
 graph = await jsonld.expand(structuredClone(graph), {safe:false});	// canonical
	// safe = no relative IDs
 let IRIs = new Set();
 JSON.stringify(graph, (key, value) => {
 	if(typeof key == 'string') IRIs.add(key);
 	if(typeof value == 'string') IRIs.add(value);
 	return value;
 });
 if(!IRIs.size) throw new Error('No IRIs found');
 IRIs = [...IRIs];

 // load transformers
 extensions.push(schema);				// default
 let transformers = extensions
  .sort((a,b) => b.context.length - a.context.length)	// special(more) before general(less)

 // identify data subjects (multiple possible)
 let referencedGraph = await jsonld2obj(graph, {'@vocab':	// flatten
 	IRIs.map(iri => /^https?:\/\/schema.org(\/|#)/.exec(iri)?.[0])
 	.find(ctx => ctx != undefined)
  });
 let subjects = Object.values(referencedGraph).filter(object =>
	array(object['@type']).concat(array(object.alternateType))
		.includes('https://w3id.org/dpv#DataSubject')
	&& array(object.subjectOf).some(obj =>
		obj.alternateType == 'https://w3id.org/dpv#PersonalData'
 		&& ['#/', '#/@graph'].includes(obj.$ref)
	)
  ).map(subject => subject['@id']);

 // transform
 let plotly = [];
 for(let transformer of transformers) {
	// canonicalize all IRIs matching transformer.context[].match
	let matches = new Map();			// key -n–1→ value
	for(let iri of IRIs) {				// matching contexts
		for(let ctx of transformer.context) {
		 let match = ctx.match.exec(iri)?.[0];
		 if(match !== undefined) matches.set(match, ctx);
		}
	}
	matches = [...matches.entries()].map(([iri,context])=>({iri,context}));
	let charts = jsonld.compact(graph, Object.fromEntries(	// alias all IRIs
		matches.map((match, i) => ['tmp'+i,match.iri])
	)).then(compact => {
		compact['@context'] = Object.fromEntries(	// canonical IRIs
			matches.map((match, i) => ['tmp'+i,match.context.canonical])
		);
		return compact;
	}).then(compact =>			// expand for uniform structure
		jsonld.expand(compact, {safe:false /*safe = no relative IDs*/}))

	 // ensure direct/isolated access on every node
	.then(expanded => jsonld.flatten(expanded))
	// execute transformer
	.then(graph => transformer.transform(graph, subjects, enrich));
	plotly.push(charts);
 }
 return Promise.all(plotly).then(plotly => plotly.flat());
}
