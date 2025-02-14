/**
 * @file This file contains the default transformation function for exporting
 *	Schema.org objects into a list of data visualisation objects in plotly.js
 *	format. THIS TRANSFORMATION IS INCOMPLETE AND ONLY TRANSFORMS NEEDED
 *	SCHEMA OBJECTS.
 * @see raw.githubusercontent.com/plotly/plotly.js/v2.26.0/dist/plot-schema.json
 */
import pkg from './package.json' assert { type:'json' };
import jsonld from 'jsonld';
import regex_escape from 'escape-string-regexp';
import * as chrono from 'chrono-node';
import WordCloud from 'almete.wordcloud';
import { jsonld2obj, array, thing, unique, transpose, expand, random, count, wait, camelCase2titleCase } from './helper.js';

import timeProps from './json/time-props.json' assert { type:'json' };
import schema_labels from './json/schema-labels.json' assert { type:'json' };

const schema = "https://raw.githubusercontent.com/plotly/plotly.js/v2.27.0/dist/plot-schema.json";

export default {

 /**
  * list of context schemata, which have to be included so that the transformer
  *	can be applied (i.e. a Schema.org object). One object is for an idempotent
  *	set of schemata matching the same regular expression in `match` e.g.
  *	`http://schema.org/` and `https://schema.org/`. All matching contexts are
  *	converted to their `canonical` version, before being passed to the
  *	transformer.
  */
 context:[
 	{ match:/^https?:\/\/schema.org(\/|#)/, canonical:"https://schema.org/" }
 ],

 /**
  * transformer function from Schema.org objects to plotly objects
  * @async
  * @param {object[]} graph - Flattened JSON+LD object with canonical schema
  *	identifiers (s. above)
  *	@see https://w3.org/TR/json-ld11/#expanded-document-form
  * @param {string[]} subjects - list of JSON+LD `@id`s of the objects representing
  *	the data subjects. These may identify both different subjects as well as
  *	the same subject with multiple IDs.
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
	if(typeof enrich == "boolean") enrich = async ()=>enrich;
	graph = await jsonld2obj(graph, {"@vocab": "https://schema.org/"});
	var plotly = [];
	const srcMap = src_map(graph, subjects);

	// FollowAction
	var follows = Object.values(graph).filter(object =>
		object['@type'] == 'FollowAction'
		&& subjects.some(id =>
			array(object.agent).map(agent => agent['@id']).includes(id)
		)
	);
	var relevant = follows.filter(object =>
		expand(object.followee ?? object.object).some(o => o.name)
	);
	var unknowns = follows.filter(object =>
		expand(object.followee ?? object.object).every(o => !o.name)
	);
	if(relevant.length + unknowns.length)
	 plotly.push(transform2raw(["Interests", "Follows"], relevant.concat(
		unknowns.map(object => {
		 const amount = expand(
			object['@reverse']?.interactionType
		 ).reduce(
			(s,ref) => s + ref.userInteractionCount ?? 1,
			0
		 )
		 || 1;
		 return {...object,	// structured clone
			...(amount < 2 ? {} : {'@type':amount+'x'
				+ (object['@type'] ? ' ' + object['@type'] : '')
			})
		 };
		})
	), relevant.length + unknowns.length));
	var labels = unique(
		relevant
		.filter(action => // only current follows
			action.actionStatus?.["@type"] != "CompletedActionStatus")
		.map(action => expand(action.followee ?? action.object) )
		.flat().filter(action => action.name),
	 l=>JSON.stringify([ l['@type']??'…', l.name ]) );
	var typeMap = labels.map(l => l["@type"] ?? '…'),
	 types = unique(typeMap);
	var sumUnknowns = unknowns
		.filter(action => // only current follows
			action.actionStatus?.["@type"] != "CompletedActionStatus")
		.reduce((sum,action) => sum + (
			expand(action['@reverse']?.interactionType).reduce(
				(s,obj) => s + obj.userInteractionCount ?? 1,
				0
			) || expand(action.followee ?? action.object).length || 1
		), 0);
	if(types.length + labels.length || sumUnknowns) plotly.push({
		$schema:schema,
		meta: { section:["Interests", "Follows"],
			amountOfUsedObjects:types.length + labels.length
		},
		type:"sunburst",
		ids: types.concat(labels.map(l => l['@id']))
			.concat(sumUnknowns ? ['OTHER'] : []),
		labels: types.concat(labels.map(l => l.name))
			.concat(sumUnknowns ? [sumUnknowns + ' Other'] : []),
		parents: Array(types.length).fill('').concat(typeMap)
			.concat(sumUnknowns ? [''] : [])
	});

	// SearchAction
	var relevant = Object.values(graph).filter(object =>
		object["@type"] == "SearchAction"
	);
	if(relevant.length) {
	 plotly.push(transform2raw(["Searches", "Searches"], relevant));
	 const map = relevant.map(q =>
		 q.query?.split?.(' ')?.map(frag => [frag, srcMap[q['@id']] ?? []])
		).filter(w => w).flat().reduce((map,q) => ({...map,
			// map[q[0]] may contain a src multiple times (=#occurence)
			[q[0]]: q[0] in map ? map[q[0]].concat(q[1]) : q[1]
		}), {});
	 const wordcloud = WordCloud(
	  Object.entries(map).map(([text,src]) => ({text, weight:src.length}))
		.sort((a,b) => b.weight - a.weight).slice(0,200), // capacity limit
	  400, 325, {fontFamily:'sans-serif'});
	 const partials = [];
	 for(const src of unique(Object.values(map).flat())) {
	  const words = wordcloud.filter(word => map[word.text].includes(src));
	  partials.push({
		$schema:schema,
		meta:{
		 section:["Searches", "Searches"],
		 amountOfUsedObjects:relevant.length,
		 layout:{
			xaxis:{ showgrid:false, visible:false, range:[0,400] },
			yaxis:{ showgrid:false, visible:false, range:[0,325] }
		 },
		 config:{ displayModeBar:false }
		},
		type:"scatter", name:src,
		mode:"text", hoverinfo:"text",
		textposition:"middle center", textfont:{
			size:words.map(word => word.fontSize),
			family:words.map(word => word.fontFamily)
		},
		marker:{ colorbar:{ showticklabels:false } },
		x: words.map(word => word.centerLeft),
		y: words.map(word => word.centerTop),
		text: words.map(word => word.text)
	  });
	 }
	 plotly.push(partials);
	}

	// ContactPoint (incl. registration data), Person (excl. Person.uses→Service)
	var registrations = Object.values(graph).filter(object =>
		object['@type'] == 'RegisterAction' && subjects.some(id =>
			array(object.agent).some(item => item?.['@id'] == id)
		)
	);
	var contact_points = Object.values(graph).filter(object =>
		object['@type'] == 'ContactPoint'
		// ensure action of subject, not any other e.g. orga
		&& subjects.some(id =>
			object['@reverse'] && (
			 array(object['@reverse'].contactPoint).some(item => item['@id'] == id)
			 || array(object['@reverse'].homeLocation).some(item => item['@id'] == id)
			 || array(object['@reverse'].workLocation).some(item => item['@id'] == id)
			)
		)
	);
	var profiles = Object.values(graph).filter(object =>
		object['@type'] == 'Person' && subjects.includes(object['@id'])
	);
	var addresses = Object.values(graph).filter(object =>
		object['@type'] == 'PostalAddress'
		// ensure action of subject, not any other e.g. orga
		&& subjects.some(id =>
			object['@reverse'] && (
			 array(object['@reverse'].address).some(item => item['@id'] == id)
			 || array(object['@reverse'].homeLocation).some(item => item['@id'] == id)
			 || array(object['@reverse'].workLocation).some(item => item['@id'] == id)
			)
		)
	);
	if(profiles.length + addresses.length + contact_points.length) {
	 plotly.push({
		$schema:schema,
		meta: { section:["Profile", "Personal Information"],
			amountOfUsedObjects:profiles.length + addresses.length
				+ contact_points.length
		},
		type:"table",
		header:{ values:["Name", "Value"].map(h=>h.bold()) },
		cells:{ values:transpose([
			[ "Name", unique(
					profiles.map(p=>array(p.name)).flat()
				).join(', ') ],
			[ "Birth", unique(
					profiles.map(p=>array(p.birthDate)).flat()
				).join(', ') ],
			[ "Gender", unique(
					profiles.map(p=>expand(p.gender)).flat()
				).map(g=> g['@type'] ?? g.name).join(', ') ],
			[ "Address", addresses.map(a=>[
				a.streetAddress,
				a.postOfficeBoxNumber == null ? null : 'PO '+a.postOfficeBoxNumber,
				a.postalCode, a.addressLocality,
				a.addressRegion, a.addressCountry
			 ].filter(a=>a!=null).join(', ') ).join('\n') ],
			[ "E-Mail",
				unique(
				 contact_points.filter(cp => cp.email)
				 .sort((a,b)=> (b.additionaType=='primary') - (a.additionalType=='primary') )
				 .map(e=> e.email + (e.additionalType=='primary' ? ' (primary)' : '') )
				 .concat(profiles.map(p=>array(p.email)).flat())
				).join(', ')
			],
			[ "Phone",
				unique(
				 contact_points.filter(cp => cp.telephone)
				 .map(nr=> nr.telephone + (nr.contactType ? ' (' + nr.contactType + ')' : '') )
				 .concat(profiles.map(p=>array(p.telephone)).flat())
				).join(', ')
			],
			[ "Instant Messenger",
				contact_points.filter(cp =>
					cp.contactType == "Instant Messenger"
					&& cp.name && cp.identifier)
				.map(cp => cp.name + ': ' + cp.identifier)
				.join(',')
			]
		 ]) }
	 });
	 if(profiles.length) plotly.push(transform2raw(["Profile", "Profile Information"], profiles));
	 if(addresses.length) plotly.push(transform2raw(["Profile", "Addresses"], addresses));
	 if(contact_points.length) plotly.push(transform2raw(["Profile", "Contact Points"], contact_points));
	}
	if(registrations.length + profiles.length) {
	 plotly.push({
		$schema:schema,
		meta: { section:["Profile", "Account Information"],
			amountOfUsedObjects:registrations.length + profiles.length },
		type:"table",
		header:{ values:["Name", "Value"].map(h=>h.bold()) },
		cells:{ values:transpose([
			[ "Registration",
				registrations.map(r => [
					r.startTime ? r.startTime : null,
					!expand(r.instrument).length ? null : 'with ' +
						expand(r.instrument).map(i =>
							i["@type"] == "VirtualLocation" ?
							i.identifier : i.name)
						.filter(i => i != null).join(', '),
					[array(r.result)
					  .filter(res => res["@type"]=="SubscribeAction")
					  .map(res => thing(res.object).name).join(',')
					 ].map(value => !value ? null
						: 'as subscription types ' + value)[0]
				].filter(partial => partial != null).join(' '))
			],
			[ "External Source",
				profiles.map(p=>expand(p['@reverse']?.object)).flat()
				.filter(parent => parent['@type'] == "CreateAction"
					&& parent.instrument?.url)
				.map(parent => parent.instrument.url).join(', ')
			],
			[ "Profiles and References",
				profiles.map(p=>expand(p.mainEntityOfPage)).flat()
				.concat(profiles.map(p=>
					expand(p['@reverse']?.mainEntity)
				))
				.map(page => page.url).join(', ')
			]
		 ]) }
	 });
	 if(registrations.length) plotly.push(transform2raw(["Profile", "Registration"], registrations));
	}
	var types = unique(
		profiles.map(p=>expand(p.owns)).flat()
		.map(o => o['@type']).filter(t=>t!=null)
	);
	if(types.length) {
	 plotly.push({
		$schema:schema,
		meta:{ section:["Third Assets", "Ownerships"],
			amountOfUsedObjects:types.length },
		type:"sunburst",
		ids: types.concat(
			profiles.map(p=>expand(p.owns)).flat().map((_,i) => 'child'+i)
		),
		labels: types.concat(
			profiles.map(p=>expand(p.owns)).flat().map(o => o.name)
		),
		parents: new Array(types.length).fill('').concat(
			profiles.map(p=>expand(p.owns)).map(o => o['@type'] ?? '…')
		)
	 });
	 plotly.push(transform2raw(["Third Assets", "Ownerships"],
		profiles.map(p=>expand(p.owns)).flat() ));
	}
	var actions = Object.values(graph).filter(obj =>
		obj['@type'] == "ConsumeAction"
		&& subjects.includes(obj.agent?.['@id'])
		&& obj.object?.['@type'] == "Service"
	);
	var orgs = unique(actions.map(a => thing(a.provider).name).filter(t=>t!=null));
	if(actions.length) {
	 plotly.push({
		$schema:schema,
		meta: { section:["Third Assets", "Service Usage"],
			amountOfUsedObjects:actions.length },
		type:"sunburst",
		ids: orgs.concat(
			actions.map(a=>thing(a).name).filter(a=>a!=null)
			.map((_,i) => 'child'+i)
		),
		labels: orgs.concat(
			actions.map(a=>thing(a).name).filter(a=>a!=null)
			.map(a => thing(a).name)
		),
		parents: new Array(orgs.length).fill('').concat(
			actions.map(a=>a).filter(a=>a?.name!=null)
			.map(a => thing(a.provider).name ?? '…')
		)
	 });
	 plotly.push(transform2raw(["Third Assets", "Service Usage"], actions));
	}

	// Collection → MusicRecording
	var tracks = Object.values(graph).filter(obj => obj['@type'] == 'Collection'
		&& subjects.includes(obj.author?.['@id'])
		&& obj.hasPart
	).map(obj => array(obj.hasPart).filter(track => 
		track['@type'] == 'MusicRecording'
	)).flat();
	if(tracks.length) {
	 var images;
	 if(await enrich('Do you allow fetching album covers from the MusicBrainz API? Your album, track and artist names will be transmitted to the MetaBrainz Foundation.')) {
	  images = tracks.map(track => ({ title:track.name, artist:thing(track.byArtist).name,
		release:thing(track.inAlbum).name })
	  ).map(params => Object.entries(params).filter(([_,v])=>v)
		.map(([k,v])=>k+':"'+v.replace(/"/g,'\\"')+'"')
		.join(' AND ')
	  ).map(query => ()=>
		new Promise(async (resolve,reject) => {	// handle rate limit
			var response, trials = 10;
			do {
				// musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting#Source_IP_address
				if(response?.status == 503) await wait(1000);

				response = await fetch(
				 'https://musicbrainz.org/ws/2/recording?query='
					+encodeURIComponent(query)+'&limit=1',
				 {headers:{
					'Accept':'application/json',
					'User-Agent':pkg.name+'/'+pkg.version
				 }}
				);
			} while((!response.ok || response.status == 503) && --trials);
				// TODO: `!response.ok` necessary, because musicbrainz doesn't support CORS on rate limit hit
			if(response.ok) resolve(response.json()); else reject(response);
		}).then(response=> response.recordings[0].releases.map(release =>
			'https://coverartarchive.org/release/'+release.id+'/front-250'
		)).then(urls => {			// filter for available cover arts
			const abort = new AbortController();
			return Promise.any(urls.map(url =>
				fetch(url, {method:'HEAD', signal:abort.signal})
				.then(r => {
					if(!r.ok) throw new Error("No cover art found");
					return url;
				})
			)).then(url => {
				abort.abort();
				return url;
			});
		}).catch(e=>undefined)
	  );
	 } else images = tracks.map(track => async()=>undefined);
	 plotly.push({
		$schema:schema,
		meta: { section:["Library", "Tracks"], wide:true,
			amountOfUsedObjects:tracks.length,
			// imgs = [ column= [async cell(), …] | async firstCell(), … ]
			images: [images]
		},
		type:"table",
		header:{ values:["Cover", "Track", "Album", "Artist"].map(h=>h.bold()) },
		hoverinfo:'text',
		cells:{
			// even though beneficial for fixed size album covers, height is buggy
			values:transpose(tracks.map(track =>
				[ '', track.name,
					thing(track.inAlbum).name ?? '',
					thing(track.byArtist).name ?? '' ]
			)),
			height:70
		}
	 });
	 plotly.push(transform2raw(["Library", "Tracks"], tracks));
	}

	// TODO: Spotify
	//	YourLibrary.json: MusicAlbum (name, byArtist.name), CreativeWorkSeries (name, publisher.name), Episode (name?, …), other? (name?, …)
	//	Playlist[0-9]*\.json
	//	StreamingHistory[0-9]*\.json


	// TODO: LinkedIn
	//	Ads Clicked
	//	Certifications.csv → table
	//	Comments.csv → treemap (comments of comments)
	//	Connections.csv → sunburst? how to fetch profile imgs?
	//	Courses.csv → table
	//	Education.csv → table
	//	Endorsement_Given_Info.csv
	//	Endorsement_Received_Info.csv
	//	Events.csv
	//	Honors.csv
	//	Invitations.csv
	//	Jobs/Saved Jobs.csv
	//	Languages.csv
	//	Learning.csv
	//	messages.csv
	//	Publications.csv
	//	Reactions.csv
	//	Recommendations_Given.csv
	//	Recommendations_Received.csv
	//	Registration.csv
	//	Rich Media.csv
	//	Saved_Items.csv
	//	SavedJobAlerts.csv
	//	SearchQueries.csv
	//	Services Marketplace/Providers.csv
	//	Shares.csv
	//	Skills.csv
	//	Votes.csv

	// https://plotly.com/javascript/statistical-charts/
	// https://plotly.com/javascript/scientific-charts/
	// https://plotly.com/javascript/basic-charts/

	// *automated:* time series
	// TODO: more intelligent section hierarchy
	plotly.push(...Object.entries(
		Object.groupBy(Object.values(graph), node => array(node['@type']).sort()[0])
	 ).map(([type,nodes]) => {
		// remove any IRI at beginning
		const iri = Object.keys(timeProps.context).find(iri => type.startsWith(iri));
		const title = camelCase2titleCase(
			iri ? type.replace(new RegExp('^'+regex_escape(iri)), '') : type
		);

		const description = schema_labels[(iri ?? 'https://schema.org/') + type];
		const charts = transform2timeseries(['…', title], nodes, srcMap, null, description);
		return charts.length ? [...charts, transform2raw(['…', title, title], nodes, null, description)] : [];
	 }).flat()
	);

	// fallback
	// TODO: Plotly.js has no auto-floating network graph yet (2024-3-12)
/* USES A LOT OF BROWSER RESRC
	var labels = Object.values(graph).map(node =>
		(node['name'] || null)
		?? node['@type']
		?? (typeof node != 'object' ? node.toString() : '…')
	 ),
	 parents = Object.values(graph).map(node => {
		if(subjects.includes(node['@id'])) return ''; // force root
		if(!node['@reverse']) return '';
		let pointer = Object.values(node['@reverse']);
		if(!pointer.length) return '';
		pointer = array(pointer[0])
		if(!pointer.length) return '';
		return pointer[0]['@id'] ?? '';
	 }),
	 ids = Object.keys(graph);
	for(let id in graph) // add attributes
	 for(let key in graph[id])
	  if(typeof graph[id][key] != 'object') {
		ids.push(JSON.stringify([id,key]));
		labels.push(key + ': ' + graph[id][key]);
		parents.push(id);
	  }
	if(ids.length) plotly.push({
		$schema:schema,
		meta: { section:["…", "All Relations"],
			amountOfUsedObjects:ids.length },
		type:"treemap", maxdepth:3,
		ids, labels, parents
	});
*/
	return plotly;
 }
};


/**
 * dynamically generates the raw display table
 * @param {string[]} section - table category/section and name
 * @param {object[]} objects - Schema.org objects
 * @param {number} [amount=null] - override amount of used objects for this chart
 * @param {string} [description=null] - description of what objects the chart
 *	displays
 * @returns {object} plotly.js table graph
 */
export function transform2raw(section, objects, amount = null, description = null) {
	const header = unique(objects.map(object => Object.keys(object)).flat())
		.filter(key => key != '@reverse')
		.sort((a,b) => { // Name, Type, …
			if(a == 'name' && b == '@type') return -1;
			if(a == '@type' && b == 'name') return 1;
			if(a == 'name' || a == '@type') return -1;
			if(b == 'name' || b == '@type') return 1;
			return 0; // in order of appearance
		});
	return {
		$schema:schema, type:"table",
		meta:{ section, raw:true, description,
			amountOfUsedObjects:amount ?? objects.length
		},
		header:{ values:header.map(key =>
			camelCase2titleCase(key.replace(/^@|.+?:/gu,''))
		 ).map(h=>h.bold()) },
		cells:{ values:header.map(key =>
			objects.map(object => expand(object[key])
				.map(value => array(value.name ?? value.identifier
					?? (!value.description ? null
					 : array(value.description).map(v=>v.slice?.(0,30)))
					?? value['@type'] ?? value['@id']
				 ).map(value => value.toString()).join(', '))
				.filter(value => value !== undefined && value !== null)
				.join(', ')
			)
		) }
	};
}

/**
 * dynamically generates the time series display table
 * @param {string[]} section - table category/section and name
 * @param {object[]} objects - Schema.org objects. These are automatically filtered for time data
 * @param {string:string[]} source_map - map from object IDs to source names
 * @param {number} [amount=null] - override amount of used objects for this chart
 * @param {string} [description=null] - description of what objects the chart
 *	displays
 * @returns {object[]} plotly.js table graphs
 */
export function transform2timeseries(section, objects, source_map, amount = null, description = null) {
	const charts = [];

	const timeProperties = timeProps.time_properties.map(prop => {
		const iri = Object.entries(timeProps.context).find(iri => prop.startsWith(iri[0]));
		return iri === undefined ? prop : iri[1].map(name => prop.replace(
			new RegExp('^'+regex_escape(iri[0])),
			name == '@vocab' ? '' : (name+':')
		));
	}).flat();

	let times = objects.map(object => timeProperties.map(prop =>
			({prop,time:object[prop],
			 src:source_map[object['@id']]?.sort?.()?.join?.(', ')
			})
		)).flat().filter(time => time.time).sort((a,b) => a.time.localeCompare(b.time));
	if(!times.length) return charts;

	// set min range of 1 week
	const range = [];
	let diff = Date.parse(times.slice(-1)[0].time) - Date.parse(times[0].time);
	if(diff <= 7*24*60*60*1000) {
		if(Date.now() - 7*24*60*60*1000 < times.slice(-1)[0].time)
			range[1] = new Date()
		else
			range[1] = new Date(times.slice(-1)[0].time)
		range[0] = new Date(range[1] - 7*24*60*60*1000).toJSON()
		range[1] = new Date(+range[1] + 24*60*60*1000).toJSON() // ensure display
	}

	const types = [], regex = {time:/\d\d:\d\d:\d\d/, date:/\d\d\d\d-\d\d-\d\d/};
	if(times.some(time => regex.date.test(time.time)))
		types.push('date');
	if(times.some(time => regex.time.test(time.time) && !time.time.includes('00:00:00')))
		types.push('time');

	// cache for efficiency
	const timeProperties_titleCase = Object.fromEntries(timeProperties.map(prop =>
		[prop, camelCase2titleCase(prop.replace(/^.+?:/gu,''))]
	));

	const partials = [],
		srcs = unique(times.map(time => time.src).filter(src => src));
	if(srcs.length > 1) srcs.unshift(null);
	 for(let src of srcs) for(let prop of timeProperties) {
	  const x = times // one sum plot + plots per src
		.filter(time => time.src == (src ?? time.src) && time.prop == prop)
		.map(time => time.time);
	  if(!x.length) continue;
	  partials.push({
		$schema:schema,
		meta:{ section:[...section, section.slice(-1)[0]],
			description,
			amountOfUsedObjects:amount ?? x.length,
			layout:{
				xaxis:{
					type:'date',
					range: range.length ? range : undefined
				},
				yaxis:{minallowed:0}
			}
		},
		type:"histogram", histfunc:"count",
		name:timeProperties_titleCase[prop] + (src ? ' (' + src + ')' : ''),
		x
	  });
	}
	charts.push(partials);

	const day_as_ms = 1000*60*60*24;
	const days = Math.trunc(
		(Date.parse(times.slice(-1)[0].time) - Date.parse(times[0].time))
		/ day_as_ms
	) + 1; // if first day == last day: still 1d difference

	if(types.includes('date')) {
	 const weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
	 const partials = [];
	 for(let src of srcs) for(let prop of timeProperties) {
		const timesOfProp = times.filter(time =>
			time.src == (src ?? time.src) && time.prop == prop);
		if(!timesOfProp.length) continue;
		const weekgrp = count(
			timesOfProp,
			time => weekdays[new Date(Date.parse(time.time)).getDay()]
		);
		const weeks = Math.trunc(days / 7) + 1; // if first week == last week: still 1w difference
		partials.push({
			$schema:schema,
			meta:{
				section:[...section, section.slice(-1)[0]+' (Weekly)'],
				description,
				amountOfUsedObjects:amount ?? timesOfProp.length,
				layout:{yaxis:{minallowed:0}}
			},
			type:"lines",
			name:timeProperties_titleCase[prop] + (src ? ' (' + src + ')' : ''),
			x:weekdays,
			y:weekdays.map(day => (weekgrp[day] ?? 0) / weeks)
		 });
	 }
	 charts.push(partials);
	}

	if(types.includes('time')) {
	 const partials = [];
	 for(let src of srcs) for(let prop of timeProperties) {
		const timegrp = Object.entries(count(
			times.filter(time => time.src == (src ?? time.src)
				&& time.prop == prop),
			time => chrono.parse(time.time)[0]?.start.date().valueOf() % day_as_ms
		)).sort(([a,_],[b,__])=>a-b);
		if(!timegrp.length) continue;
		partials.push({
			$schema:schema,
			meta:{
				section:[...section, section.slice(-1)[0]+' (Daily)'],
				description,
				amountOfUsedObjects:amount ?? timegrp.reduce(
					(sum,[_,count]) => sum + count, 0),
				layout:{
					xaxis:{
						type:'date', tickformat:'%X',
						range:[ new Date(0), new Date(day_as_ms) ]
					},
					yaxis:{ minallowed:0 }
				}
			},
			type:"histogram", histfunc:"sum",
			name:timeProperties_titleCase[prop] + (src ? ' (' + src + ')' : ''),
			x: timegrp.map(([time,_]) => new Date(parseInt(time)).toJSON()),
			xbins:{ size:60*60*1000 },
			y: timegrp.map(([_,evts]) => evts / days)
		});
	 }
	 charts.push(partials);
	}

	return charts;
}

/**
 * generates a source map of object IDs
 * @param {object} graph - the graph
 * @param {string[]} subjects - IDs of the data subjects
 * @returns {{string:string[]}} map from object IDs to source names
 */
export function src_map(graph, subjects) {
	return Object.values(graph)
	 .filter(object => subjects.includes(object['@id']))
	 .map(object => expand(object.subjectOf)
		.filter(of => of['@type'] == 'DataDownload' && of['$ref'] == '#/')
	 ).flat().map(datadl => {
		const name = thing(datadl.provider).name ?? [];
		const map = {};
		for(let object of expand(datadl.about))
		 map[object['@id']] = (map[object['@id']] ?? []).concat([name]);
		return map;
	 }).reduce((map,next) => {
		for(const k in next) map[k] = (map[k] ?? []).concat(next[k]);
		return map;
	 });
}
