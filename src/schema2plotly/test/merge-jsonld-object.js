import test from 'node:test';
import assert from 'node:assert';

import jsonld from 'jsonld';
import link from 'jsonld-object-graph';
import { jsonld2obj } from '../helper.js';

test('mergeing jsonld graphs and turning into a referenced object', async t => {

	const graph0 = {
	 "@context":{ "@vocab":"https://schema.org/" },
	 "@graph": [
		{
		 "@type": "Person",
		 "@id": "me",
		 "alternateType": "https://w3id.org/dpv#DataSubject",
		 "subjectOf": {
		 	"@type": "DataDownload",
			"$ref": "#/",
			"alternateType": "https://w3id.org/dpv#PersonalData",
			"provider": {
				"@type": "Organization",
				"alternateType": "https://w3id.org/dpv#DataController",
				"name": "Spotify"
			}
		 }
		}
	 ]
	};
	const graph1 = structuredClone(graph0);
	graph1['@graph'][0].subjectOf.provider.name = "LinkedIn";

	let graph = jsonld.merge([graph0, graph1], graph0['@context']);
	await assert.doesNotReject(graph, 'graph merging failed');
	console.log('Merged graph', await graph);
	assert(Array.isArray(
		(await graph)['@graph'].find(obj => obj['@id'] == "me").subjectOf
	));
	graph = link.jsonld2objWithConfig({addSelfRef:false, addTypeRef:false,
		shouldResolveTypeObjects:false, idFieldName:'$id',
		typeFieldName:'$type' })(await graph);
	console.log('Object graph', await graph);
	let sut = (await graph).me['https://schema.org/subjectOf'];
	// TODO: github.com/vsimko/jsonld-object-graph/blob/master/src/index.js#L54-L75
	assert(sut?.constructor?.name == "MultiVal" || Array.isArray(sut),
		'Property subjectOf is no array or MultiVal');
});
