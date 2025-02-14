import test from 'node:test';
import assert from 'node:assert';

import { jsonld2obj } from '../helper.js';

test('resolving @reverse-only references', async t => {
	const ID_CHILD = Math.random().toString(16).slice(2),
		ID_PARENT = Math.random().toString(16).slice(2);

	const data = {
	 "@context":{ "@vocab":"https://schema.org/" },
	 "@graph": [
		{
			"@type": "Person",
			"@id": ID_PARENT,
			"@reverse": {
			 	"parent": {
					"@type": "Person",
					"@id": ID_CHILD,
				}
			}
		}
	 ]
	};

	let graph = jsonld2obj(data, data['@context']);
	await assert.doesNotReject(graph, 'graph conversion failed');
	graph.then(graph => graph.console.log(graph));
	assert.equal((await graph)[ID_CHILD].parent?.['@id'], ID_PARENT,
		'@reverse was not resolved');
});
