import uniqid from 'uniqid';

import { iso8601, defined, register, array } from '../helper.js';


/**
 * transforms a file archive object into a Schema.org graph
 * @async
 * @param {object} data - file archive object
 * @returns {object} graph
 */
export default async function convert2graph(data) {
	if(!data) throw new Error('Argument `data` has to be a valid file tree JSON object');
	const objects = [];
	let graph = {
	 "@context":{ "@vocab":"https://schema.org/", "ext":"/#" },
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
				"name": "Spotify",
				"url": "https://spotify.com"
			},
			"about": objects
		 }
		}
	 ]
	};

	// Follow.json
	if(data['Follow.json']?.followerCount) graph['@graph'].push({
		"@type": "InteractionCounter",
		"interactionType": {
			"@type": "FollowAction",
			"followee": {"@id":"me"},
			"actionStatus": {
				"@type": "ActiveActionStatus"
			}
		},
		"userInteractionCount": data['Follow.json'].followerCount
	});
	if(data['Follow.json']?.followingUsersCount) graph['@graph'].push({
		"@type": "InteractionCounter",
		"interactionType": {
			"@type": "FollowAction",
			"agent": {"@id":"me"},
			"followee": {"@type":"Person"},
			"actionStatus": {
				"@type": "ActiveActionStatus"
			}
		},
		"userInteractionCount": data['Follow.json'].followingUsersCount
	});
	for(let artist of data['Follow.json']?.followingArtists ?? []) graph['@graph'].push({
		"@type": "FollowAction",
		"followee": {
			"name": artist
		},
		"agent": {"@id":"me"},
		"actionStatus": {
			"@type": "ActiveActionStatus"
		}
	});

	// SearchQueries.json
	for(let query of data['SearchQueries.json'] ?? []) graph['@graph'].push({
		"@type": "SearchAction",
		"instrument": defined({
			"@type":({
				"DESKTOP":"DesktopWebPlatform",
				"WIN32":"DesktopWebPlatform",
				"MOBILE":"MobileWebPlatform",
				"ANDROID":"MobileWebPlatform"
			 })[query.platform?.split('_')?.[0]] ?? undefined,
			name:query.platform
		}),
		"startTime": iso8601(query.searchTime, "time"),
		"query": query.searchQuery,
		"result": query.searchInteractionURIs.map(uri => ({
			"@type": "InteractAction",
			"target": uri
		 }))
	});

	// YourLibrary.json
	graph['@graph'].push({
		"@type": "Collection",
		"author": {"@id":"me"},
		"hasPart": data['YourLibrary.json'].tracks.map(item =>
				({"@type":"MusicRecording", "name":item.track,
					"byArtist":{"name":item.artist},
					"inAlbum":{"name":item.album} })
			).concat(data['YourLibrary.json'].albums.map(item =>
				({"@type":"MusicAlbum", "name":item.album,
					"byArtist":{"name":item.artist} })
			)).concat(data['YourLibrary.json'].shows.map(item =>
				({"@type":"CreativeWorkSeries", "name":item.name,
					"publisher":{"name":item.publisher} })
			)).concat(data['YourLibrary.json'].episodes.map(item =>
				({...item, "@type":"Episode"})
			)).concat(data['YourLibrary.json'].other.map(item =>
				typeof item == "string" ? {'@id':item} : thing(item)
			))
	});
	if(data['YourLibrary.json'].bannedTracks.length) graph['@graph'].push({
		"@type": "DislikeAction",
		"object": data['YourLibrary.json'].bannedTracks.map(item => ({
			"@type": "MusicRecording",
			"name": item.track,
			"byArtist": {"name":item.artist},
			"inAlbum": {"name":item.album}
		}))
	});

	// Playlist[0-9]*\.json
	for(let playlist of Object.entries(data)
		.filter(([name,_]) => /^Playlist[0-9]*\.json$/.test(name))
		.map(([name,file]) => file.playlists).flat()
	) {
		let id = uniqid("playlist_");
		graph['@graph'].push(defined({
			"@type": "MusicPlaylist",
			"@id": id,
			"name": playlist.name,
			"dateModified": iso8601(playlist.lastModifiedDate, 'date'),
			"track": playlist.items.map(item => {
				let track = {
					"@type": "MusicRecording",
					"name": item.track.trackName,
					"byArtist": {"name":item.track.artistName},
					"inAlbum": {"name":item.track.albumName},
					"url": item.localTrack
				};
				if(item.episode != null) track.hasPart = {
					"@type": "Episode",
					"name": item.episode
				};
				return track;
			}),
			"description": playlist.description
		}));
		graph['@graph'].push({
			"@type": "InteractionCounter",
			"interactionType": {
				"@type":"FollowAction",
				"object": {"@id":id}
			},
			"userInteractionCount": playlist.numberOfFollowers
		});
	}

	// StreamingHistory(_music_)?[0-9]*\.json
	for(let stream of Object.entries(data)
		.filter(([name,_]) => /^StreamingHistory(_music_)?[0-9]*\.json$/.test(name))
		.map(([_,file]) => file).flat()
	) graph['@graph'].push({
		"@type": "ListenAction",
		"endTime": iso8601(stream.endTime, 'time'),
		"object": {
			"@type": "MusicRecording",
			"name": stream.trackName,
			"byArtist": {"name":stream.artistName}
		},
		"startTime": iso8601(new Date(
			Date.parse(iso8601(stream.endTime, 'time'))
			- stream.msPlayed
		 ).toString(), 'time')
	});

	// USING SCHEMA EXTENSION
	// Inferences.json
	for(let inference in data['Inferences.json']?.inferences ?? [])
	 graph['@graph'].push({
		"@type": "ext:InferenceAction",
		"description": inference,
		"result": inference
	 });

	// Payments.json
	if(data['Payments.json']?.payment_method) {
	 let provider = data['Payments.json'].payment_method.match(/^[^(]+\b/u)?.[0];
	 let expiry = data['Payments.json'].payment_method.match(/\d\d\D\d{2,4}/u)?.[0]?.split(/\D/); // e.g. 12/24 for Dez 2024
	 graph['@graph'].push(defined({
		"@type": "CreateAction",
		"startTime": iso8601(data['Payments.json'].creation_date, 'time'),
		"object": defined({
			"@type": "PaymentCard",
			"name": provider ? null :
				data['Payments.json'].payment_method,
			"provider": provider ? {"name":provider} : null,
			"additionalType": !provider ? null :
				"http://purl.org/goodrelations/v1#"
				+ provider.replace(/\s/gu, ''),
			"identifier": data['Payments.json'].payment_method
				.match(/\(([\w\s]+)\)/u)?.[1],
			"areaServed": data['Payments.json'].postal_code
					&& data['Payments.json'].country ? {
				"@type": "Place",
				"address": defined({
				 "@type": "PostalAddress",
				 "postalCode": data['Payments.json'].postal_code,
				 "addressCountry": data['Payments.json'].country
				})
			} : null,
			"expires": !expiry ? null :
				new Date(expiry[1], expiry[0], 0).toJSON().split('T')[0]
		})
	 }));
	}

	// Userdata.json
	var profile = defined({
		"@type": "Person",
		"@id": "me",
		"name": data['Userdata.json'].username,
		"email": data['Userdata.json'].email,
		"birthDate": data['Userdata.json'].birthdate,
		"gender": ({
			"male":"Male",
			"female":"Female"
		 })[data['Userdata.json'].gender] ?? data['Userdata.json'].gender,
		"telephone": data['Userdata.json'].mobileNumber
	});
	if(data['Userdata.json'].postalCode || data['Userdata.json'].country)
	 profile.address = defined({
		"@type": "PostalAddress",
		"postalCode": data['Userdata.json'].postalCode,
		"country": data['Userdata.json'].country
	 });
	if(data['Userdata.json'].facebookUid !== null) profile.mainEntityOfPage = {
		"@type": "ProfilePage",
		"url": "https://facebook.com/" + data['Userdata.json'].facebookUid
	};
	if(data['Userdata.json'].mobileBrand != null) profile.owns = [{
		"@type": "Product",
		"brand": {
			"@type": "Brand",
			"name": data['Userdata.json'].mobileBrand
		}
	}];
	graph['@graph'].push(profile);
	if(data['Userdata.json'].mobileOperator != null) graph['@graph'].push({
		"@type": "ConsumeAction",
		"agent": {"@id":"me"},
		"object": {
			"@type": "Service",
			"provider": {
				"@type": "Organization",
				"name": data['Userdata.json'].mobileOperator
			}
		}
	});

	graph['@graph'].push({
		"@type": "RegisterAction",
		"agent": {"@id":"me"},
		"startTime": iso8601(data['Userdata.json'].creationTime, 'time')
	});
	if(data['Userdata.json'].createdFromFacebook
	 && data['Userdata.json'].facebookUid != null) graph['@graph'].push({
		"@type": "CreateAction",
		"object": {
			"@type": "ProfilePage",
			"mainEntity": {"@id": "#me"}
		},
		"instrument": {
			"@type": "ProfilePage",
			"url": "https://facebook.com/"+ data['Userdata.json'].facebookUid
		}
	});


	// add @ids of objects to DataDownload
	function registerRecursive(object) {
		if(object === null || typeof object != "object"
			|| object["$ref"] === "#/") return;
		object["@id"] = register(objects, object["@id"], id => ({"@id":id}) );
		for(let key in object) for(let value of array(object[key]))
			registerRecursive(value);
	}
	for(let object of graph['@graph']) registerRecursive(object);

	return graph;
}
