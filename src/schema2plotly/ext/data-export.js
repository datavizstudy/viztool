import { transform2raw, transform2timeseries, src_map } from '../transformer.js';
import { jsonld2obj, array, first, thing, transpose, unique, expand, count } from '../helper.js';


export default {
 context:[
	{ match:/^https?:\/\/schema.org(\/|#)/, canonical:"https://schema.org/" },
	{ match:/^\/#/, canonical:"/#" }
 ],

 /**
  * transformer function from Schema.org data export extension objects to plotly
  *	objects
  * @async
  * @param {object[]} graph - Flattened JSON+LD object with canonical schema
  *	identifiers (s. above)
  *	@see https://w3.org/TR/json-ld11/#expanded-document-form
  * @param {string} subjects - list of JSON+LD `@id`s of the objects representing
  *	the data subjects. These may identify both different subjects as well as
  *	the same subject with multiple IDs. Append to this list in-place / by
  *	reference. You have to filter out graph nodes yourself by comparing with
  *	the passed `visualized_nodes`.
  * @param {boolean|function(string):Promise} enrich - function to ask the user,
  *	whether data requests to external APIs should be sent to enrich data e.g.
  *	music data with album cover. If this is
  *	- `true`, all external requests are automatically granted,
  *	- `false`, all external requests are automatically forbidden,
  *	- a function, then this function is called. It must return a `Promise`
  *		resolving to one of the values above. Rejection of the promise is
  *		equivalent to `false`. The function expects one parameter being an
  *		explanatory display message for the external request. Function
  *		responses are not cached.
  *	@see index.js:schema2plotly~enrich
  * @returns {(object|object[])[]} plotly.js chart object(s). If the list element
  *	is an `object` it represents a plain
  *	[Plotly](https://plotly.com/javascript) graph, else if `object[]` a group
  *	of graphs. You can pass both directly to
  *	[Plotly](https://plotly.com/javascript). Each object contains a `meta`
  *	property indicating whether data is `raw` i.e. just a table of all data
  *	and a proposed categorising `section` being an breadcrumb array.
  * @see raw.githubusercontent.com/plotly/plotly.js/v2.26.0/dist/plot-schema.json
  */
 transform: async (graph, subjects, enrich) => {
	const schema = "https://raw.githubusercontent.com/plotly/plotly.js/v2.27.0/dist/plot-schema.json";
	graph = await jsonld2obj(graph, {
		"@vocab": "https://schema.org/",
		"ext":"/#"
	});
	var plotly = [];
	const srcMap = src_map(graph, subjects);

	// SecurityChallenge
	let challenges = Object.values(graph).filter(object =>
		object['@type'] == 'ext:SecurityChallenge');
	if(challenges.length) {
	 plotly.push(transform2raw(["Security", "Login Challenges"], challenges));
	 let grpByCountry = Object.groupBy(challenges, c => c['ext:location'] );
	 plotly.push({
		$schema:schema,
		meta:{ section:["Security","Login Challenges"],
			amountOfUsedObjects:challenges.length },
		type:"scattergeo",
		colorbar: { title:"Recent", ticksuffix:"days ago",
			showticksuffix:'first' },
		locations: Object.keys(grpByCountry),
		locationmode: 'country names',
		marker:{
			sizemin:5, cmin:5, cmax:30,
			size:Object.values(grpByCountry).map(items => items.length),
			colorscale: [ [0,"#072140"], [1,"#3070b3"] ],
			color:Object.values(grpByCountry).map(items =>
				(Date.now()
				 -
				 Math.max(...items
					.filter(item => item.startTime?.toString())
					.map(item => Date.parse(item.startTime))
				 )
				) / (1000 * 60 * 60 * 24)
			 ),
			text:Object.values(grpByCountry).map(items => {
				let types = Object.entries(count(items,
					obj => thing(obj['ext:type']).name
				 ));
				let sum = types.reduce((sum, val) => sum + val[1], 0);
				return types.map(([key, amount]) =>
					(amount/sum).toFixed(0) + '% '
					+ key.replace(/_challenge/i,'')
						.replace(/_/g,' ')
				 ).join('\n');
			 })
		}
	 });
	}

	// LoginAction
	var logins = Object.values(graph).filter(object =>
		object['@type'] == 'ext:LoginAction');
	if(logins.length) {
	 plotly.push(...transform2timeseries(["Security", "Logins"], logins, srcMap));
	 plotly.push(transform2raw(["Security", "Logins"], logins));
	}

	// Occupation (incl. ext:occupationAt)
	let occs = Object.values(graph).filter(object =>
		object['@type'] == 'Occupation');
	if(occs.length) {
	 let parentsMap = occs.map(occ => thing(occ['ext:occupationAt']).name
		?? occ['ext:occupationAt']?.toString?.() ?? 'Other'
	 );
	 let parents = unique(parentsMap);
	 let treemap = {
		$schema:schema,
		meta:{ section:["Profile", "Occupations"],
			amountOfUsedObjects:occs.length },
		type: "treemap",
		hoverinfo:"label", textinfo:"label+text",
		branchvalues:"remainder",
		pathbar:{visible:true},
		ids: parents.concat(occs.map(occ => occ['@id'])),
		labels: parents.concat(occs.map(occ => occ.name ?? 'Other')),
		parents: Array(parents.length).fill('').concat(parentsMap),
		text: Array(parents.length).fill('').concat(occs.map(occ =>
			(typeof thing(occ.occupationLocation).name == 'string' ?
			 	'<i>Location:</i> ' + thing(occ.occupationLocation).name + '<br>'
			 	: '')
			+ (occ['ext:startDate'] == null && occ['ext:endDate'] == null ?
			    '' : (
				'<i>Date/Time:</i>'
				+ (occ['ext:startDate'] != null ? ' ' +
					new Date(occ['ext:startDate']).toLocaleString()
					: '')
				+ (occ['ext:endDate'] != null ? ' until ' +
					new Date(occ['ext:endDate']).toLocaleString()
					: '')
				) + '<br>'
			  )
			+ (occ.description ? '<br>' + occ.description + '<br>': '')
			+ (occ['@id'] in srcMap ? '<br><i>Data source: '
				+ srcMap[occ['@id']].join(', ') + '</i>' : '')
		))
	 };
	 if(occs.every(occ => occ['ext:startDate'] != null)) // size=duration
	  treemap.values = Array(parents.length).fill(0).concat(occs.map(occ =>
		(occ['ext:endDate']!=null ? Date.parse(occ['ext:endDate']) : Date.now())
		- Date.parse(occ['ext:startDate'])
	  ));
	 plotly.push(treemap);
	 plotly.push(transform2raw(["Profile", "Occupations"], occs));
	}


	// TODO: Spotify
	//	Inferences.json
	//	Payments.json

	// PaymentCard
	/*plotly.push({
		$schema:schema,
		meta: { section:["Billing"] },
		type:"table",
		name:"PaymentMethod",
		header:
	});*/

	// TODO: LinkedIn
	//	Ad_Targeting.csv
	//	Inferences_about_you.csv
	//	Jobs/Job Seeker Preferences.csv
	//	Profile.csv (continued where possible in transformer.js, else here in ext/data-export.js)

	// https://plotly.com/javascript/statistical-charts/
	// https://plotly.com/javascript/scientific-charts/
	// https://plotly.com/javascript/basic-charts/

	return plotly;
 }
};
