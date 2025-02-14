import jsonld from 'jsonld';
import { jsonld2obj } from '../../helper.js';

let graph = {
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
				"name": "LinkedIn"
			}
		}
	}
 ]
};

jsonld.expand(graph)
.then(g => jsonld.compact(g, graph['@context']) )
.then(g => {console.log('COMPACT:', g);return g;})
.then(g => jsonld2obj(g, {"@vocab":"https://schema.org/", "dpv":"https://w3id.org/dpv#"}) )
.then(g => {console.log('LINKED:', g);return g;})
.catch(e => console.error(e))
.finally(_ => console.log('DONE'));
