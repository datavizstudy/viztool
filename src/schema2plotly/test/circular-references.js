/**
 * @file contains test for library capability of resolving circular references
 */

import test from 'node:test';
import assert from 'node:assert';
import { promisify } from 'node:util';

/** resolves JSON+LD @id references */
import { jsonld2obj } from '../helper.js';


/*
 * Failing packages:
 * - npmjs.com/package/ld-query: github.com/goofballLogic/ld-query#examples
 *	- `doc.query("description @value");	// "Linked person"` doesn't work
 */
test('resolving references', async t => {
	const TEST_NAME = Math.random().toString(16).slice(2);
	
	let jsonld = {
		"@context": { "@vocab": "https://schema.org/" },
		"@graph": [
			{
				"@id": "org",
				"@type": "Organization",
				"name": TEST_NAME
			},
			{
				"@id": "person",
				"@type": "Person",
				"memberOf": {"@id":"org"}
			}
		]
	};
	
	let graph = jsonld2obj(jsonld, jsonld['@context']);
	await assert.doesNotReject(graph, 'query library does not resolve at all');
	graph.then(graph => console.log(graph));
	assert.equal((await graph)['person'].memberOf.name, TEST_NAME,
		'query library did not resolve circular references');
});
