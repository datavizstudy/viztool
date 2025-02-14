import uniqid from 'uniqid';
import { lookup } from 'mrmime';

import { defined, register, array } from '../helper.js';


/**
 * transforms a file archive object into a Schema.org graph
 * @async
 * @param {object} data - file archive object
 * @returns {object} graph
 */
export default async function convert2graph(data) {
	if(!data) throw new Error('Argument `data` has to be a valid file tree JSON object');
	const objects = [], provider_id = uniqid('provider_');
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
				"@id": provider_id,
				"alternateType": "https://w3id.org/dpv#DataController",
				"name": "Facebook",
				"url": "https://facebook.com"
			},
			"about": objects
		 }
		}
	 ]
	};

	// helper methods
	function contactPointType(txt) {
		if(/[^@]+@[^@]+(\..{2,})?/.test(txt)) return "email";
		if(/^[+\s0-9.;,()\-#]+$/.test(txt)) return "telephone";
		return "identifier";
	}
	function jsonDateOrNull(seconds) {
		return seconds ? new Date(seconds*1000).toJSON() : null;
	}
	function attachmentsOrNull(object) {
		const data = (object.attachments ?? [])
			.map(attachment => attachment.data ?? []).flat()
			.filter(data => data);
		const attachments = data
			.map(data => [data.external_context, data.media]).flat()
			.filter(data => data);
		const places = attachments.map(data => data.place).filter(p=>p);
		const polls = attachments.map(data => data.poll).filter(p=>p);
		if(!attachments.length) return null;
		return attachments.map(attachment => {
			const url = attachment.url ?? attachment.uri,
				local = !!data[url],
				id = uniqid('creativework_'),
				ip = attachment.media_metadata?.photo_metadata?.upload_ip;
			if(ip) graph['@graph'].push({
				"@type": "CreateAction",
				agent: {"@id":"me"},
				object: {"@id":id},
				instrument: {
					"@type": "VirtualAction",
					"additionalType": "http://json-schema.org/draft-03/schema#ip-address",
					identifier: ip
				}
			});
			return defined({
				"@type": local ? "MediaObject" : "CreativeWork",
				"@id": id,
				name: attachment.title ?? attachment.name,
				description: attachment.name ?? attachment.description,
				contributor: !attachment.source ? null : {name:attachment.source},
				dateCreated: jsonDateOrNull(attachment.creation_timestamp),
				contentUrl: local ? 'data:' + lookup(url) + ';base64,' + btoa(new TextDecoder('utf8').decode(data[url])) : null,
				encodingFormat: local ? lookup(url) : null,
				url,
				usageInfo: attachment.media_metadata?.photo_metadata?.uri,
				locationCreated: places.map(place => defined({
					"@type": "Place",
					name: place.name,
					address: place.address,
					geo: !place.coordinate ? null : {
						"@type": "GeoCoordinates",
						latitude: place.coordinate.latitude,
						longitude: place.coordinate.longitude
					},
					url: place.url
				})),
				potentialAction: polls.map(poll => defined({
					"@type": "VoteAction",
					object: poll.question,
					endTime: jsonDateOrNull(object.timestamp),
					description: object.title,
					actionOption: poll.options?.map(option =>
							option.option
						).filter(o => o)
				}))
			});
		});
	}
	function commentsOrNull(object) {
		let comments = (object.data ?? []).map(data => data.comment ?? [])
			.flat();
		if(!comments.length) return null;
		return comments.map(comment => defined({
			"@type": "Comment",
			dateCreated: jsonDateOrNull(comment.timestamp),
			text: comment.comment,
			author: {
				"@type": "Person",
				name: comment.author
			},
			audience: {
				"@type": "Audience",
				name: comment.group
			}
		}));
	}
	function actionType(name) {
		if(/login|logged\bin/i.test(name)) return "ext:LoginAction";
		if(/change|update/i.test(name)) return "UpdateAction";
		if(/session\bterminate/i.test(name)) return "CheckOutAction";
		if(/checkpoint/i.test(name)) return "CheckInAction";
		if(/add/i.test(name) && /remove/i.test(name)) return "UpdateAction";
		if(/add/i.test(name)) return "AddAction";
		if(/remove/i.test(name)) return "DeleteAction";
		return "Action";
	}

	// about_you/your_address_books.json
	for(let person of data['about_you/your_address_books.json']?.address_book.address_book ?? []) {
		let id = uniqid('person_');
		graph['@graph'].push({
			"@type": "Person",
			"@id": id,
			knows: {"@id":"me"},
			name: person.name,
			contactPoint: person.details.map(d => ({
				"@type": "ContactPoint",
				[contactPointType(d.contact_point)]: d.contact_point
			}))
		});
		if(person.created_timestamp) graph['@graph'].push({
			"@type": "CreateAction",
			agent: {"@id":"me"},
			object: {"@id":id},
			startTime: jsonDateOrNull(person.created_timestamp)
		});
		if(person.updated_timestamp) graph['@graph'].push({
			"@type": "UpdateAction",
			agent: {"@id":"me"},
			object: {"@id":id},
			startTime: jsonDateOrNull(person.updated_timestamp)
		});
	}

	// ads/advertisers_who_uploaded_a_contact_list_with_your_information.json
	for(let advertiser of data['ads/advertisers_who_uploaded_a_contact_list_with_your_information.json']?.custom_audiences ?? []) graph['@graph'].push({
		"@type": "UpdateAction",
		object: {"@id":"me"},
		agent: {
			"@type": "Organization",
			name: advertiser
		}
	});

	// ads/advertisers_you_ve_interacted_with.json
	for(let advertiser of data['ads/advertisers_you_ve_interacted_with.json']?.history ?? []) graph['@graph'].push(defined({
		"@type": "InteractAction",
		name: advertiser.title,
		alternateName: advertiser.action,
		startTime: jsonDateOrNull(advertiser.timestamp)
	}));

	// apps_and_websites/apps_and_websites.json
	for(let app of data['apps_and_websites/apps_and_websites.json']?.installed_apps ?? []) graph['@graph'].push(defined({
		"@type": "InstallAction",
		name: app.object,
		startTime: jsonDateOrNull(app.added_timestamp)
	}));

	// apps_and_websites/posts_from_apps_and_websites.json
	for(let post of data['apps_and_websites/posts_from_apps_and_websites.json']?.app_posts ?? []) graph['@graph'].push(defined({
		"@type": "WriteAction",
		endTime: jsonDateOrNull(post.timestamp),
		result: {
			"@type": "SocialMediaPosting",
			headline: post.title,
			associatedMedia: attachmentsOrNull(post)
		}
	}));

	// comments/comments.json
	for(let comment of data['comments/comments.json']?.comments ?? []) graph['@graph'].push(defined({
		"@type": "Comment",
		headline: comment.title,
		dateCreated: jsonDateOrNull(comment.timestamp),
		about: !comment.data ? null : defined({
			"@type": "Comment",
			dateCreated: jsonDateOrNull(comment.data[0].comment.timestamp),
			author: {
				name: comment.data[0].comment.author
			},
			audience: !comment.data[0].comment.group ? null : {
				"@type": "Audience",
				name: comment.data[0].comment.group
			}
		}),
		associatedMedia: attachmentsOrNull(comment)
	}));

	// events/event_invitations.json
	for(let event of data['events/event_invitations.json']?.events_invited ?? []) graph['@graph'].push({
		"@type": "InviteAction",
		event: defined({
			"@type": "Event",
			name: event.name,
			startDate: jsonDateOrNull(event.start_timestamp),
			endDate: jsonDateOrNull(event.end_timestamp)
		})
	});

	// events/your_event_responses.json
	for(let event of data['events/your_event_responses.json']?.event_responses?.events_joined ?? []) graph['@graph'].push({
		"@type": "RsvpAction",
		agent: {"@id":"me"},
		rsvpResponse: {"@type":"RsvpResponseYes"},
		event: defined({
			"@type": "Event",
			name: event.name,
			startDate: jsonDateOrNull(event.start_timestamp),
			endDate: jsonDateOrNull(event.end_timestamp)
		})
	});
	for(let event of data['events/your_event_responses.json']?.event_responses?.events_declined ?? []) graph['@graph'].push({
		"@type": "RsvpAction",
		agent: {"@id":"me"},
		rsvpResponse: {"@type":"RsvpResponseNo"},
		event: defined({
			"@type": "Event",
			name: event.name,
			startDate: jsonDateOrNull(event.start_timestamp),
			endDate: jsonDateOrNull(event.end_timestamp)
		})
	});

	// `events/your_events.json
	for(let event of data['events/your_events.json']?.your_events ?? []) {
		const id = uniqid('event_');
		graph['@graph'].push({
			"@type": "InviteAction",
			agent: {"@id":"me"},
			event: defined({
				"@type": "Event",
				"@id": id,
				name: event.name,
				startDate: jsonDateOrNull(event.start_timestamp),
				endDate: jsonDateOrNull(event.end_timestamp),
				description: event.description,
				location: defined({
					"@type": "Place",
					name: event.name,
					address: event.address,
					geo: !event.coordinate ? null : {
						"@type": "GeoCoordinates",
						latitude: event.coordinate?.latitude,
						longitude: event.coordinate?.longitude
					}
				})
			})
		});
		graph['@graph'].push(defined({
			"@type": "CreateAction",
			agent: {"@id":"me"},
			result: {"@id":id},
			endTime: jsonDateOrNull(event.create_timestamp)
		}));
	}

	// following_and_followers/followed_pages.json
	for(let follow of data['following_and_followers/followed_pages.json']?.pages_followed ?? []) graph['@graph'].push(defined({
		"@type": "FollowAction",
		agent: {"@id":"me"},
		startTime: jsonDateOrNull(follow.timestamp),
		actionStatus: {"@type":"ActiveActionStatus"},
		object: defined({
			"@type": "WebPage",
			name: follow.name,
			headline: follow.title
		})
	}));

	// following_and_followers/followers.json
	for(let follow of data['following_and_followers/followers.json']?.followers ?? []) graph['@graph'].push(defined({
		"@type": "FollowAction",
		followee: {"@id":"me"},
		actionStatus: {"@type":"ActiveActionStatus"},
		agent: defined({
			"@type": "Person",
			name: follow.name
		})
	}));

	// following_and_followers/following.json
	for(let follow of data['following_and_followers/following.json']?.followers ?? []) graph['@graph'].push(defined({
		"@type": "FollowAction",
		followee: {"@id":"me"},
		startTime: jsonDateOrNull(follow.timestamp),
		actionStatus: {"@type":"ActiveActionStatus"},
		followee: !follow.name ? null : defined({
			"@type": "Person",
			name: follow.name
		})
	}));

	// following_and_followers/unfollowed_pages.json
	for(let follow of data['following_and_followers/unfollowed_pages.json']?.pages_unfollowed ?? []) graph['@graph'].push(defined({
		"@type": "FollowAction",
		agent: {"@id":"me"},
		endTime: jsonDateOrNull(follow.timestamp),
		actionStatus: {"@type":"CompletedActionStatus"},
		object: !follow.data?.[0]?.name ? null : defined({
			"@type": "WebPage",
			headline: follow.data?.[0]?.name
		}),
		description: follow.title
	}));

	// friends/friends.json
	for(let friend of data['friends/friends.json']?.friends ?? []) graph['@graph'].push(defined({
		"@type": "BefriendAction",
		endTime: jsonDateOrNull(friend.timestamp),
		participants: [
			{"@id":"me"},
			defined({
				"@type": "Person",
				name: friend.name,
				[contactPointType(friend.contact_info)]: friend.contact_info
			})
		]
	}));

	// friends/received_friend_requests.json
	for(let friend of data['friends/received_friend_requests.json']?.received_requests ?? []) graph['@graph'].push(defined({
		"@type": "BefriendAction",
		startTime: jsonDateOrNull(friend.timestamp),
		agent: {
			"@type": "Person",
			name: friend.name
		},
		object: {"@id": "me"}
	}));

	// friends/rejected_friend_requests.json
	for(let friend of data['friends/rejected_friend_requests.json']?.rejected_requests ?? []) graph['@graph'].push(defined({
		"@type": "BefriendAction",
		startTime: jsonDateOrNull(friend.timestamp),
		agent: {
			"@type": "Person",
			name: friend.name
		},
		object: {"@id": "me"},
		actionStatus: {"@type":"FailedActionStatus"},
		description: friend.marked_as_spam ? "Spam" : null
	}));

	// friends/removed_friends.json
	for(let friend of data['friends/removed_friends.json']?.deleted_friends ?? []) graph['@graph'].push(defined({
		"@type": "LeaveAction",
		agent: {"@id":"me"},
		endTime: jsonDateOrNull(friend.timestamp),
		object: {
			"@type": "Person",
			name: friend.name
		}
	}));

	// friends/sent_friend_requests.json
	for(let friend of data['friends/sent_friend_requests.json']?.sent_requests ?? []) graph['@graph'].push(defined({
		"@type": "BefriendAction",
		agent: {"@id":"me"},
		startTime: jsonDateOrNull(friend.timestamp),
		object: {
			"@type": "Person",
			name: friend.name
		}
	}));

	// groups/your_group_membership_activity.json
	for(let friend of data['groups/your_group_membership_activity.json']?.groups_joined ?? []) graph['@graph'].push(defined({
		"@type": "JoinAction",
		agent: {"@id":"me"},
		startTime: jsonDateOrNull(friend.timestamp),
		object: {
			"@type": "PeopleAudience",
			name: friend.name
		}
	}));

	// groups/your_groups.json
	for(let friend of data['groups/your_groups.json']?.groups_admined ?? []) graph['@graph'].push(defined({
		"@type": "CreateAction",
		agent: {"@id":"me"},
		endTime: jsonDateOrNull(friend.timestamp),
		object: {
			"@type": "PeopleAudience",
			name: friend.name
		}
	}));

	// groups/your_posts_and_comments_in_groups.json
	for(let post of data['groups/your_posts_and_comments_in_groups.json']?.group_posts?.activity_log_data ?? []) {
		const postings = post.data?.map(data => data.post).map(p => ({
			"@type": "SocialMediaPosting",
			headline: p
		})) ?? [];
		const comments = commentsOrNull(post) ?? [];
		graph['@graph'].push(defined({
			"@type": "CommentAction",
			agent: {"@id":"me"},
			description: post.name,
			startTime: jsonDateOrNull(post.timestamp),
			associatedMedia: attachmentsOrNull(post),
			result: postings.length || comments.length ?
				postings.concat(comments) : null,
			dateModified: jsonDateOrNull(post.update_timestamp)
		}));
	}

	// likes_and_reactions/pages.json
	for(let reaction of data['likes_and_reactions/pages.json']?.page_likes ?? []) graph['@graph'].push(defined({
		"@type": "LikeAction",
		agent: {"@id":"me"},
		startTime: jsonDateOrNull(reaction.timestamp),
		target: {
			"@type": "WebPage",
			name: reaction.name
		}
	}));

	// likes_and_reactions/posts_and_comments.json
	for(let reaction of data['likes_and_reactions/posts_and_comments.json']?.reactions ?? []) graph['@graph'].push(defined({
		"@type": "InteractAction",
		participant: [
			{"@id":"me"},
			...reaction.data.map(data => defined({
				"@type": "Person",
				name: data.reaction?.actor
			}))
		],
		description: reaction.title
	}));

	// location/where_i_have_been.json
	for(let loc of data['location/where_i_have_been.json']?.location_entries ?? []) graph['@graph'].push(defined({
		"@type": "TrackAction",
		provider: {"@id":provider_id},
		object: {"@id":"me"},
		instrument: {
			"@type": "VirtualLocation",
			"additionalType": "http://json-schema.org/draft-03/schema#ip-address",
			identifier: loc.ip_address
		},
		startTime: jsonDateOrNull(loc.timestamp),
		location: {
			"@type": "Place",
			name: loc.name,
			address: loc.address,
			geo: {
				"@type": "GeoCoordinates",
				latitude: loc.coordinate.latitude,
				longitude: loc.coordinate.longitude
			}
		}
	}));

	// marketplace/items_bought.json
	for(let item of data['marketplace/items_bought.json']?.items_buying ?? []) {
		const seller_id = uniqid('seller_');
		graph['@graph'].push(defined({
			"@type": "BuyAction",
			price: item.price,
			startTime: jsonDateOrNull(item.created_timestamp),
			seller: !item.seller ? null : {
				"@id": seller_id,
				name: item.seller
			},
			description: item.title,
			location: !item.location ? null : {
				"@type": "Place",
				name: item.location.marketplace,
				keywords: item.location.category,
				geo: !item.location.coordinate ? null : {
					"@type": "GeoCoordinates",
					latitude: item.location.coordinate.latitude,
					longitude: item.location.coordinate.longitude
				}
			},
			object: !item.description ? null : {
				"@type": "Offer",
				description: item.description,
				price: item.price,
				offeredBy: !item.seller ? null : {"@id":seller_id}
			}
		}));
	}

	// marketplace/items_s.json
	for(let item of data['marketplace/items_sold.json']?.items_selling ?? []) {
		const seller_id = uniqid('seller_');
		graph['@graph'].push(defined({
			"@type": "SellAction",
			price: item.price,
			startTime: jsonDateOrNull(item.created_timestamp),
			buyer: !item.seller ? null : {
				"@id": seller_id,
				name: item.seller
			},
			description: item.title,
			location: !item.location ? null : {
				"@type": "Place",
				name: item.location.marketplace,
				keywords: item.location.category,
				geo: !item.location.coordinate ? null : {
					"@type": "GeoCoordinates",
					latitude: item.location.coordinate.latitude,
					longitude: item.location.coordinate.longitude
				}
			},
			object: !item.description ? null : {
				"@type": "Offer",
				description: item.description,
				price: item.price,
				offeredBy: !item.seller ? null : {"@id":seller_id}
			}
		}));
	}

	// messages/inbox/*/message_[0-9]+.json
	for(let conv of Object.entries(data)
	 .filter(([file,content]) => /^messages\/inbox\/.*\/message_[0-9]+\.json$/i.test(file))
	 .map(([file,content]) => content)) {
		const id = uniqid('conversation_');
		graph['@graph'].push(defined({
			"@type": "Conversation",
			"@id": id,
			author: conv.participants.map(p => ({
				"@type": "Person",
				name: p.name
			})),
			headline: conv.title,
			url: conv.thread_path,
			additionalType: conv.thread_type,
			hasPart: conv.messages.map(m => defined({
				"@type": "CreativeWork",
				author: {
					"@type": "Person",
					name: m.sender_name
				},
				datePublished: jsonDateOrNull(m.timestamp_ms),
				text: m.content,
				additionalType: m.type
			}))
		}));
		if(conv.is_still_participant == false) graph['@graph'].push({
			"@type": "LeaveAction",
			"agent": {"@id":"me"},
			object: {"@id":id}
		});
	}

	// other_activity/polls_you_voted_on.json
	for(let vote of data['other_activity/polls_you_voted_on.json']?.poll_votes ?? []) {
		const options = vote.attachments?.map(attachment =>
				attachment.data
			).flat().map(data => data.poll?.options).filter(o => o);
		graph['@graph'].push(defined({
			"@type": "VoteAction",
			agent: {"@id":"me"},
			endTime: jsonDateOrNull(vote.timestamp),
			object: vote.question,
			description: vote.title,
			actionOption: options.map(option => option.option),
			result: options.filter(option => option.voted)
				.map(option => option.option)
		}));
	}

	// pages/your_pages.json
	for(let page of data['pages/your_pages.json']?.pages ?? []) graph['@graph'].push(defined({
		"@type": "WebPage",
		datePublished: jsonDateOrNull(page.timestamp),
		headline: page.name,
		url: page.url
	}));

	// payment_history/payment_history.json
	for(let payment of data['payment_history/payment_history.json']?.payments?.payments ?? []) graph['@graph'].push(defined({
		"@type": "PayAction",
		agent: {"@id":"me"},
		priceCurrency: payment.preferred_currency,
		startTime: jsonDateOrNull(payment.created_timestamp),
		price: payment.price
	}));

	// posts/other_people_s_posts_to_your_timeline.json
	for(let post of data['posts/other_people_s_posts_to_your_timeline.json']?.wall_posts_sent_to_you?.activity_log_data ?? []) graph['@graph'].push(defined({
		"@type": "SendAction",
		recipient: {"@id":"me"},
		description: post.title,
		endTime: jsonDateOrNull(post.timestamp),
		object: {
			"@type": "SocialMediaPosting",
			headline: post.data?.map(d => d.post).filter(h => h),
			dateModified: post.data?.map(d =>
					jsonDateOrNull(d.update_timestamp)
				).filter(h => h).sort().slice(-1)[0],
			sharedContent: attachmentsOrNull(post)
		}
	}));

	// posts/your_posts.json
	for(let post of data['posts/your_posts.json']?.status_updates ?? []) {
		graph['@graph'].push(defined({
			"@type": "SendAction",
			agent: {"@id":"me"},
			description: post.title,
			endTime: jsonDateOrNull(post.timestamp),
			object: {
				"@type": "SocialMediaPosting",
				headline: post.data?.map(d => d.post).filter(h => h),
				keywords: post.tags,
				dateModified: post.data?.map(d =>
						jsonDateOrNull(d.update_timestamp)
					).filter(h => h).sort().slice(-1)[0],
				associatedMedia: attachmentsOrNull(post)
			}
		}));
		const polls = post.attachments?.map(attachment =>
				attachment.data
			).flat().filter(d=>d)
			.map(data => data.poll).filter(p=>p) ?? [];
		const options = polls.map(poll => poll.options).filter(o=>o);
		for(let poll of polls) graph['@graph'].push(defined({
			"@type": "VoteAction",
			agent: {"@id":"me"},
			object: poll.question,
			endTime: jsonDateOrNull(post.timestamp),
			description: post.title,
			actionOption: options.map(option => option.option),
			result: options.filter(option => option.voted)
				.map(option => option.option)
		}));
	}

	// profile_information/profile_information.json
	let person = data['profile_information/profile_information.json']?.profile;
	if(person) {
		const contact_points = [];
		for(let email of (person.emails?.previous_emails ?? [])) {
			const id = uniqid('contact-point_');
			contact_points.push(id);
			graph['@graph'].push(defined({
				"@type": "DeleteAction",
				agent: {"@id":"me"},
				object: {
					"@type": "ContactPoint",
					"@id": id,
					email
				}
			}));
		}
		for(let email of (person.emails?.pending_emails ?? [])) {
			const id = uniqid('contact-point_');
			contact_points.push(id);
			graph['@graph'].push(defined({
				"@type": "ConfirmAction",
				agent: {"@id":"me"},
				actionStatus: {"@type":"ActiveActionStatus"},
				object: {
					"@type": "ContactPoint",
					"@id": id,
					email
				}
			}));
		}
		const previous_names = (person.previous_names ?? [])
			.sort((a,b) => a.timestamp-b.timestamp);
		for(let i = 0; i < previous_names; i++) {
			const id = uniqid('contact-point_');
			contact_points.push(id);
			graph['@graph'].push(defined({
				"@type": "ReplaceAction",
				agent: {"@id":"me"},
				endTime: jsonDateOrNull(previous_names[i].timestamp),
				startTime: !i ? null : jsonDateOrNull(previous_names[i-1].timestamp),
				targetCollection: {"@id":"me"},
				replacee: !i ? null : {
					"@type": "name",
					"@value": previous_names[i-1].name
				},
				replacer: {
					"@type": "name",
					"@value": previous_names[i].name
				}
			}));
		}
		for(let name of (person.previous_relationships ?? [])) graph['@graph'].push(defined({
			"@type": "LeaveAction",
			participant: [
				{"@id":"me"},
				{"@type":"Person", name}
			]
		}));
		const credentials = {
			educationalCredentialAwarded: [],
			occupationalCredentialAwarded: []
		};
		for(let exp of (person.education_experiences ?? [])) {
			const org_id = uniqid('org_');
			graph['@graph'].push(defined({
				"@type": "JoinAction",
				agent: {"@id":"me"},
				object: {
					"@type":"EducationalOccupationalProgram",
					provider: {
						"@type": /college|high\bschool/i.test(exp.school_type) ? "EducationalOrganization" : "Organization",
						"@id": org_id,
						name: exp.name
					}
				}
			}));
			if(exp.graduated) credentials[/college|high\bschool/i.test(exp.school_type) ? "educationalCredentialAwarded" : "occupationalCredentialAwarded"].push({
				"@type": "EducationalOccupationalCredential",
				recognizedBy: {"@id":org_id},
				about: exp.concentrations,
				description: exp.description
			});
		}
		for(let exp of (person.work_experiences ?? [])) graph['@graph'].push(defined({
			"@type": "Action",
			provider: {
				"@type": "Organization",
				name: exp.employer
			},
			location: defined({
				"@type": "PostalAddress",
				addressCountry: exp.location?.split(', ')[1],
				addressLocality: exp.location?.split(', ')[0]
			}),
			startTime: jsonDateOrNull(exp.start_timestamp),
			endTime: jsonDateOrNull(exp.end_timestamp),
			description: exp.description,
			object: {
				"@type": "JobPosting",
				name: exp.title
			}
		}));
		const phone_nrs = person.phone_numbers.map(nr => defined({
			"@type": "ContactPoint",
			"@id": nr.verified ? undefined : uniqid('cp_'),
			telephone: nr.phone_number,
			contactType: nr.phone_type
		}));
		for(let nr of phone_nrs.filter(nr => nr['@id'])) graph['@graph'].push({
			"@type": "ConfirmAction",
			actionStatus: "CompletedActionStatus",
			object: {"@id":nr.id}
		});
		for(let place of (person.places_lived ?? [])) graph['@graph'].push(defined({
			"@type": "MoveAction",
			agent: {"@id":"me"},
			startTime: jsonDateOrNull(place.start_timestamp),
			toLocation: {
				"@type": "Place",
				address: {
					"@type":"PostalAddress",
					addressCountry: place.place.split(', ')[1],
					addressLocality: place.place.split(', ')[0]
				}
			}					
		}));
		for(let page of (person.pages?.map(p => p.pages).filter(p=>p) ?? [])) graph['@graph'].push(defined({
			"@type": "ReadAction",
			agent: {"@id":"me"},
			object: {
				"@type": "WebPage",
				name: page
			}					
		}));
		for(let group of (person.groups ?? [])) graph['@graph'].push(defined({
			"@type": "JoinAction",
			agent: {"@id":"me"},
			startTime: jsonDateOrNull(group.timestamp),
			object: {
				"@type": "WebPage",
				name: group
			}					
		}));

		graph['@graph'].push(defined({
			"@type": "Person",
			"@id": "me",
			name: person.name.full_name,
			givenName: person.name.givenName,
			additionalName: person.name.middle_name,
			familyName: person.name.last_name,
			email: person.email,
			contactPoint: contact_points.map(cp => ({"@id":cp})),
			birthDate: new Date(person.birthday.year, person.birthday.month, person.birthday.day).toJSON(),
			gender: ({
					"male":"Male", "female":"Female"
				}[person.gender?.gender_option?.toLowerCase?.()]
				?? person.gender?.gender_option
				) + (
					person.gender?.gender_option != person.gender?.pronoun ? person.gender?.pronoun : ''
				),
			alternateName: person.other_names?.map(n => n.name),
			address: !person.current_city?.name ? null : {
				"@type": "PostalAddress",
				addressLocality: person.current_city?.name
			},
			homeLocation: !person.hometown.name ? null : {
				"@type": "Place",
				address: {
					"@type": "PostalAddress",
					addressLocality: person.hometown.name
				}
			},
			spouse: !/single/i.test(person.relationship?.status) ? null : {"@type":"Person"},
			sibling: person.family_members
				.filter(m => /bother|sister|sibling/i.test(m.relation))
				.map(m => ({"@type":"Person", name:m.name})),
			parent: person.family_members
				.filter(m => /father|mother|parent/i.test(m.relation))
				.map(m => ({"@type":"Person", name:m.name})),
			children: person.family_members
				.filter(m => /son|daughter|child/i.test(m.relation))
				.map(m => ({"@type":"Person", name:m.name})),
			...credentials,
			jobTitle: person.work_experiences?.filter(exp =>
					!exp.end_timestamp
				).map(exp => exp.title),
			worksFor: person.work_experiences?.filter(exp =>
					!exp.end_timestamp
				).map(exp => ({
					"@type": "Organization",
					name: exp.employer
				})),
			workLocation: person.work_experiences?.filter(exp =>
					!exp.end_timestamp
				).map(exp => ({
					"@type": "Place",
					address: defined({
						"@type": "PostalAddress",
						addressCountry: exp.location?.split(', ')[1],
						addressLocality: exp.location?.split(', ')[0]
					})
				})),
			knowsLanguage: person.languages.map(name => ({
				"@type": "Language",
				name
			})),
			contactPoint: person.screen_names?.map(cp => ({
				"@type": "ContactPoint",
				contactType: cp.service_name,
				identifier: cp.name
			})).concat(phone_nrs),
			address: !person.address ? null : defined({
				"@type": "PostalAddress",
				addressCountry: {
					"@type": "Country",
					name: person.address.country,
					identifier: person.address.country_code
				},
				addressLocality: person.address.city,
				addressRegion: person.address.region,
				postalCode: person.address.zipcode,
				streetAddress: person.address.street,
				description: person.address.neighborhood
			}),
			identifier: person.username,
			subjectOf: {
				"@type": "ProfilePage",
				url: person.profile_uri
			}
		}));
		graph['@graph'].push(defined({
			"@type": "RegisterAction",
			agent: {"@id":"me"},
			startTime: jsonDateOrNull(person.registration_timestamp)					
		}));
	}

	// profile_information/profile_update_history.json
	for(let update of data['profile_information/profile_update_history.json']?.profile_updates ?? []) graph['@graph'].push(defined({
		"@type": "UpdateAction",
		agent: {"@id":"me"},
		startTime: jsonDateOrNull(update.timestamp),
		targetCollection: {"@id":"me"},
		object: {"@type":"Thing", ...update}
	}));

	// saved_items_and_collections/saved_items_and_collections.json
	for(let object of data['saved_items_and_collections/saved_items_and_collections.json']?.saves_and_collections ?? []) graph['@graph'].push(defined({
		"@type": "BookmarkAction",
		agent: {"@id":"me"},
		startTime: jsonDateOrNull(object.timestamp),
		description: object.title,
		object: attachmentsOrNull(object)
	}));

	// search_history/your_search_history.json
	for(let search of data['search_history/your_search_history.json']?.searches ?? []) {
		const query_attachment = search.attachments?.map(a => a.data)
			.flat().filter(d=>d).map(d => d.text).join(', ') ?? [];
		const query_data = search.data?.map(d => d.text).join(', ') ?? [];
		graph['@graph'].push(defined({
			"@type": "SearchAction",
			agent: {"@id":"me"},
			startTime: jsonDateOrNull(search.timestamp),
			description: search.title,
			query: query_attachment == query_data ? query_attachment : query_attachment + ', ' + query_data
		}));
	}

	// security_and_login_information/authorized_logins.json
	var devices = data['security_and_login_information/authorized_logins.json']?.recognized_devices,
		device_id = (devices ?? []).map(_ => uniqid('device_'));
	if(devices?.length) {
		graph['@graph'].push(defined({
			"@type": "Person",
			"@id":"me",
			owns: devices.map((device,i) => ({
				"@type": "Product",
				"@id": device_id[i],
				additionalType: "authorized",
				brand: {
					"@type": "Brand",
					name: device.mobileBrand
				}
			}))
		}));
		for(let i = 0; i < devices.length; i++) graph['@graph'].push(defined({
			"@type": devices[i].created_timestamp ? "RegisterAction" : "UpdateAction",
			startDate: jsonDateOrNull(devices[i].created_timestamp || devices[i].updated_timestamp),
			object: {"@id":device_id[i]},
			agent: {"@id":"me"},
			instrument: defined({
				"@type": "VirtualLocation",
				additionalType: "http://json-schema.org/draft-03/schema#ip-address",
				identifier: devices[i].ip_address,
				name: devices[i].user_agent,
				description: !devices[i].datr_cookie ? null : ("DATR Cookie " + devices[i].datr_cookie)
			})
		}));
	}

	// security_and_login_information/used_ip_addresses.json
	for(let search of data['security_and_login_information/used_ip_addresses.json']?.used_ip_address ?? []) {
		graph['@graph'].push(defined({
			"@type": "ConsumeAction",
			agent: {"@id":"me"},
			instrument: !search.ip ? null : {
				"@type": "VirtualLocation",
				additionalType: "http://json-schema.org/draft-03/schema#ip-address",
				identifier: search.ip
			}
		}));
	}

	// USING SCHEMA EXTENSION
	// about_you/friend_peer_group.json
	for(let [category, result] of Object.entries(data['about_you/friend_peer_group.json']?.friend_peer_group)) graph['@graph'].push({
		"@type": "ext:InferenceAction",
		category,
		result
	});

	// ads/ads_interests.json
	let topics = data['ads/ads_interests.json']?.topics;
	if(topics?.length) graph['@graph'].push({
		"@type": "ext:InferenceAction",
		object: topics.map(topic => ({
			"@type": "WantAction",
			object: {
				"@type": "DataFeed",
				about: topic
			}
		}))
	});

	// security_and_login_information/account_activity.json
	for(let activity of (data['security_and_login_information/account_activity.json']?.account_activity ?? [])) graph['@graph'].push(defined({
		"@type": actionType(activity.action),
		agent: {"@id":"me"},
		name: activity.action,
		startDate: jsonDateOrNull(activity.timestamp),
		instrument: defined({
			"@type": "VirtualLocation",
			additionalType: "http://json-schema.org/draft-03/schema#ip-address",
			identifier: activity.ip_address,
			name: activity.user_agent,
			description: !activity.datr_cookie ? null : ("DATR Cookie " + activity.datr_cookie)
		})
	}));

	// security_and_login_information/administrative_records.json
	for(let record of (data['security_and_login_information/administrative_records.json']?.account_activity ?? [])) graph['@graph'].push(defined({
		"@type": actionType(record.action),
		agent: {"@id":"me"},
		name: record.action,
		startDate: jsonDateOrNull(record.session?.timestamp),
		instrument: defined({
			"@type": "VirtualLocation",
			additionalType: "http://json-schema.org/draft-03/schema#ip-address",
			identifier: record.session.ip_address,
			name: record.session.user_agent,
			description: !record.session.datr_cookie ? null : ("DATR Cookie " + record.session.datr_cookie)
		})
	}));

	// security_and_login_information/login_protection_data.json
	for(let login of (data['security_and_login_information/login_protection_data.json']?.account_activity ?? [])) graph['@graph'].push(defined({
		"@type": "LoginAction",
		agent: {"@id":"me"},
		startDate: jsonDateOrNull(login.session?.created_timestamp || login.session?.updated_timestamp),
		location: {
			"@type": "PostalCode",
			addressCountry: login.name?.split(', ')[1],
			addressLocality: login.name?.split(', ')[0]
		},
		instrument: defined({
			"@type": "VirtualLocation",
			additionalType: "http://json-schema.org/draft-03/schema#ip-address",
			identifier: login.session.ip_address,
			name: login.session.user_agent,
			description: !login.session.datr_cookie ? null : ("DATR Cookie " + login.session.datr_cookie)
		})
	}));

	// security_and_login_information/logins_and_logouts.json
	for(let access of (data['security_and_login_information/logins_and_logouts.json']?.account_accesses ?? [])) graph['@graph'].push(defined({
		"@type": actionType(access.action),
		agent: {"@id":"me"},
		startDate: jsonDateOrNull(access.timestamp),
		location: !access.site ? null : {
			"@type": "VirtualLocation",
			additionalType: "http://json-schema.org/draft-03/schema#ip-address",
			identifier: access.site,
			url: access.site
		},
		instrument: !access.ip_adress ? null : {
			"@type": "VirtualLocation",
			additionalType: "http://json-schema.org/draft-03/schema#ip-address",
			identifier: access.ip_adress
		}
	}));

	// security_and_login_information/where_you_re_logged_in.json
	for(let session of (data['security_and_login_information/where_you_re_logged_in.json']?.active_sessions ?? [])) graph['@graph'].push(defined({
		"@type": "ext:LoginAction",
		agent: {"@id":"me"},
		actionStatus: "ActiveActionStatus",
		startDate: jsonDateOrNull(session.created_timestamp || session.updated_timestamp),
		location: defined({
			"@type": "PostalAddress",
			addressCountry: session.location.split(', ')[1],
			addressLocality: session.location.split(', ')[0]
		}),
		instrument: defined({
			"@type": "VirtualLocation",
			additionalType: "http://json-schema.org/draft-03/schema#ip-address",
			identifier: session.ip_adress,
			name: session.name,
			alternateName: session.device,
			description: "App: " + session.app + "\nUser-Agent: " + session.user_agent,
			disambiguatingDescription: "DATR Cookie " + session.datr_cookie
		})
	}));

	// add @ids of objects to DataDownload
	function registerRecursive(object) {
		if(object == null || object["$ref"] === "#/"
			|| typeof object != "object") return;
		object["@id"] = register(objects, object["@id"], id => ({"@id":id}) );
		for(let key in object) array(object[key]).forEach(value =>
			registerRecursive(value)
		);
	}
	for(let object of graph['@graph']) registerRecursive(object);

	return graph;
}
