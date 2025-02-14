import link from 'jsonld-object-graph';
import jsonld from 'jsonld';

const graph = {
	"@context":{ "@vocab":"https://schema.org/" },
	"@graph": [
		{
			"@type": "Person",
			"@id": "ID_PARENT",
			"@reverse": {
			 	"parent": {
					"@type": "Person",
					"@id": "ID_CHILD"
				}
			}
		}
	]
};

link.jsonld2objWithConfig({addSelfRef: false, addTypeRef: false,
 	shouldResolveTypeObjects: false,
 	// default, because idFieldName:"@id" deleted the @id property, …
  	idFieldName: "$id", typeFieldName: "$type"})(graph)
.then(result => console.log('jsonld2objWithConfig', result));
// RESULT: `jsonld-object-graph` removes all @reverse properties.

jsonld.flatten(graph)
.then(result => {
	console.log('jsonld.flatten', result);
	console.log('\texpects @reverse', result[0]['https://schema.org/parent']);
});
// RESULT: `jsonld.flatten` resolves **and removes** @reverse references
