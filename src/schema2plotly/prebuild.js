import jsonld from 'jsonld';
import fs from 'node:fs/promises';
import regex_escape from 'escape-string-regexp';

import { jsonld2obj, array } from './helper.js';


const schema = await Promise.all(
	process.argv.slice(2).map(file => fs.readFile(file, 'utf8').then(txt => JSON.parse(txt)))
 ).then(schemata => jsonld.merge(schemata))
 .then(schema => jsonld2obj(schema));



/** not necessarily a recursive schema:subPropertyOf of schema:Date,
 * because types may be disjoint among property hierarchy (e.g.
 * https://schema.org/legislationDate being a subtype of
 * https://schema.org/dateCreated with no common types)
 * Thus rdfs:subPropertyOf is the only relation to take into account.
 */
function propsWithType(pointer, jsgraph, types = []) {
	if(!types.length || !jsgraph || !pointer
		|| !array(pointer['@type'])
		   .some(type => ['http://www.w3.org/1999/02/22-rdf-syntax-ns#Property',
				'http://www.w3.org/2002/07/owl#ObjectProperty'].includes(type)
		   )
		) return [];
	const props = array(pointer['http://www.w3.org/2000/01/rdf-schema#subPropertyOf'])
		.map(parent => propsWithType(parent, jsgraph, types)).flat();
	if(props.length || array(pointer['https://schema.org/rangeIncludes'])
		.some(type => types.includes(type['@id']))
	) props.push(pointer['@id']);
	return props;
}


/** any rdf:Property|owl:ObjectProperty which
 * - itself is rdfs:subClassOf schema:Date
 * - schema:rangeIncludes schema:Date as property
 */
const timeProperties = [];

const base_date_types = ['https://schema.org/Date','https://schema.org/DateTime','https://schema.org/Time'];
const dateTypes = Object.values(schema).filter(type =>
	array(type['@type']).includes('https://schema.org/DataType')
	&& (
		base_date_types.includes(type['@id'])
		|| array(type['http://www.w3.org/2000/01/rdf-schema#subClassOf']).some(sup =>
			base_date_types.includes(sup['@id'])
	))
).map(type => type['@id']);

for(let type of Object.values(schema))
	for(let prop of propsWithType(type, schema, dateTypes))
		if(!timeProperties.includes(prop)) timeProperties.push(prop);

// TODO: find automated way to get context? s. above
// if automation for https://schema.org = @vocab, remove default override param in transformer.js:transform2timeseries
let context = {'https://schema.org/':['@vocab'], '/#':['ext']};

fs.writeFile('json/time-props.json', JSON.stringify({
	context,
	time_properties: timeProperties
}));



fs.writeFile('json/schema-labels.json', JSON.stringify(Object.fromEntries(
	Object.values(schema).map(def => [
		def['@id'],
		(def['http://www.w3.org/2000/01/rdf-schema#comment'] ??
			def['https://www.w3.org/2000/01/rdf-schema#comment'] ??
			def['http://w3.org/2000/01/rdf-schema#comment'] ??
			def['https://w3.org/2000/01/rdf-schema#comment'])?.replace(/\\n/g, '\n').replace(/<\/?code>|\[|\]/gi, '')
	])
)));
