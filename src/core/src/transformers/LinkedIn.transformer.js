import uniqid from 'uniqid';

import { iso8601, explode, defined, register, array } from '../helper.js';


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
				"name": "LinkedIn",
				"url": "https://linkedin.com"
			},
			"about": objects
		 }
		}
	 ]
	};

	const empty = ['', 'null', 'n/a', 'N/A'];	// values to handle as empty

	// Ads Clicked.csv
	for(let ad of data['Ads Clicked.csv'] ?? []) graph['@graph'].push({
		"@type": "UserInteraction",
		startDate: iso8601(ad['Ad clicked Date'], 'date'),
		object: {
			"@type": "WPAdBlock",
			"@id": ad['Ad Title/Id']
		}
	});

	// Causes You Care About.csv
	for(let cause of data['Causes You Care About.csv'] ?? []) graph['@graph'].push({
		"@type": "FollowAction",
		agent: {"@id":"me"},
		object: {
			"@type": "DefinedTerm",
			"name": cause['Supported Cause']
		}
	});

	// Certifications.csv
	for(let crt of data['Certifications.csv'] ?? []) graph['@graph'].push(defined({
		"@type": "EducationalOccupationalCredential",
		credentialCategory: "certificate",
		name: crt['Name'],
		url: crt['Url'],
		recognizedBy: !crt['Authority'] ? undefined : {
			"@type": "Organization",
			"name": crt['Authority']
		},
		dateCreated: iso8601(crt['Started On'], 'date'),
		expires: crt['Finished On'],
		identifier: crt['License Number']
	}, empty));

	// Comments.csv
	for(let comment of data['Comments.csv'] ?? []) graph['@graph'].push({
		"@type": "Comment",
		datePublished: iso8601(comment['Date'], 'date'),
		about: {
			"@type": "Comment",
			"url": comment['Link']
		},
		text: comment['Message']
	});

	// Company Follows.csv
	for(let follow of data['Company Follows.csv'] ?? []) graph['@graph'].push({
		"@type": "FollowAction",
		agent: {"@id":"me"},
		object: {
			"@type": "Organization",
			name: follow['Organization']
		},
		startTime: iso8601(follow['Followed On'])
	});

	// Connections.csv
	for(let con of data['Connections.csv'] ?? []) graph['@graph'].push({
		"@type": "BefriendAction",
		participant: defined({
			"@type": "Person",
			givenName: con['First Name'],
			familyName: con['Last Name'],
			url: con['URL'],
			email: con['Email Address'],
			worksFor: !con['Company'] ? undefined : {
				"@type": "Organization",
				name: con['Company']
			},
			jobTitle: con['Position']
		}, empty),
		startTime: iso8601(con['Connected On'])
	});

	// Courses.csv
	for(let crs of data['Courses.csv'] ?? []) graph['@graph'].push(defined({
		"@type": "Course",
		name: crs['Name'],
		courseCode: crs['Number']
	}, empty));

	// Education.csv
	for(let edu of data['Education.csv'] ?? []) graph['@graph'].push(defined({
		"@type": "EducationEvent",
		about: {
			"@type": "EducationalOrganization",
			name: edu['School Name']
		},
		startDate: iso8601(edu['Start Date'], 'date'),
		endDate: iso8601(edu['End Date'], 'date'),
		description: edu['Notes'],
		educationalLevel: edu['Degree Name'],
		workPerformed: {
			"@type": "CreativeWork",
			description: edu['Activities']
		}
	}, empty));

	// Email Addresses.csv
	for(let email of data['Email Addresses.csv']){
	 let id = uniqid('contact-point_');
	 let object = {
		"@type": "ContactPoint",
		"@id": id,
		email: email['Email Address'],
		subjectOf: {
			"@type": "UpdateAction",
			startTime: iso8601(email['Updated On'])
		}
	 };
	 if(email['Primary']) object.additionalType = "primary";
	 graph['@graph'].push(object);
	 graph['@graph'].push({
		"@id":"me",
		contactPoint:{"@id":id}
	});
	 if(email['Confirmed'] == 'Yes') graph['@graph'].push({
		"@type": "ConfirmAction",
		object: {"@id":id}
	 });
	}

	// Endorsement_Given_Info.csv
	for(let line of data['Endorsement_Given_Info.csv'] ?? []) graph['@graph'].push({
		"@type": "EndorseAction",
		recipient: {
			"@type": "Person",
			givenName: line['Endorsee First Name'],
			familyName: line['Endorsee Last Name'],
			url: line['Endorsee Public Url']
		},
		startTime: iso8601(line['Endorsement Date']),
		actionStatus: {
			"@type": line['Endorsement Status'] == 'ACCEPTED' ?
				"ActiveActionStatus" : "PotentialActionStatus"
		}
	});

	// Endorsement_Received_Info.csv
	for(let line of data['Endorsement_Received_Info.csv'] ?? []) graph['@graph'].push({
		"@type": "EndorseAction",
		agent: {
			"@type": "Person",
			givenName: line['Endorser First Name'],
			familyName: line['Endorser Last Name'],
			url: line['Endorser Public Url']
		},
		startTime: iso8601(line['Endorsement Date']),
		actionStatus: {
			"@type": line['Endorsement Status'] == 'ACCEPTED' ?
				"ActiveActionStatus" : "PotentialActionStatus"
		}
	});

	// Events.csv
	for(let evt of data['Events.csv'] ?? []){
	 let id = uniqid('event_');
	 graph['@graph'].push(defined({
		"@type": "Event",
		"@id": id,
		name: evt['Event Name'],
		startDate: iso8601(evt['Event Time'].split(' - ')[0], 'date'),
		endDate: iso8601(evt['Event Time'].split(' - ')[1], 'date'),
		url: evt['External Url']
	 }, empty));
	 if(evt['Status']) graph['@graph'].push({
		"@type": "RsvpAction",
		object: {"@id":id},
		rsvpResponse: evt['Status'] == 'APPROVED' ? "yes"
			: (evt['Status'] == 'RELINQUISHED' ? "no" : "maybe")
	 });
	}

	// Hashtag_Follows.csv
	for(let htag of data['Hashtag_Follows.csv'] ?? []) {
	 let id = uniqid('action_');
	 graph['@graph'].push({
		"@type": "FollowAction",
		"@id": id,
		agent: {"@id":"me"},
		object: {
			"@type": "DataFeed",
			"name": "#" + htag['HashTag']
		},
		actionStatus: {
			"@type": htag['State'] == 'Follow' ? "ActiveActionStatus"
				: "CompletedActionStatus"
		}
	 });
	 graph['@graph'].push({
		"@type": "UpdateAction",
		targetCollection: {"@id":id},
		startTime: iso8601(htag['LastModifiedTime'])
	 });
	}

	// Honors.csv
	for(let line of data['Honors.csv'] ?? []) graph['@graph'].push(defined({
		"@type": "EducationalOccupationalCredential",
		credentialCategory: "honor",
		name: line['Title'],
		description: line['Description'],
		dateCreated: !line['Issued On'] ? undefined
			: iso8601(line['Issued On'], 'date')
	}, empty));

	// Invitations.csv
	for(let line of data['Invitations.csv'] ?? []) graph['@graph'].push(defined({
		"@type": "InviteAction",
		agent: {
			"@type": "Person",
			name: line['From']
		},
		recipient: {
			"@type": "Person",
			name: line['To']
		},
		startTime: iso8601(line['Sent At']),
		about: line['Message']
	}, empty));

	// Jobs/Saved Jobs.csv
	for(let job of data['Jobs/Saved Jobs.csv'] ?? []) graph['@graph'].push({
		"@type": "BookmarkAction",
		object: {
			"@type": "JobPostingContent",
			url: job['Job Url'],
			name: job['Job Title'],
			hiringOrganization: {
				"@type": "Organization",
				"name": job['Company Name']
			}
	 	},
		startTime: iso8601(job['Saved Date'])
	});

	// Languages.csv
	for(let lang of data['Languages.csv'] ?? []) graph['@graph'].push({
		"@type": "Language",
		name: lang['Name'],
		description: lang['Proficiency']
	});

	// Learning.csv
	for(let line of data['Learning.csv'] ?? []) {
	 let id = uniqid('crs_');
	 graph['@graph'].push(defined({
		"@type": "Course",
		name: line['Content Title'],
		description: line['Content Description']
	 }, empty));
	 graph['@graph'].push(defined({
		"@type": "NoteDigitalDocument",
		about: {"@id":id},
		text: line['Notes taken on videos (if taken)']
	 }, empty));
	 let watchAction = {
		"@type": "WatchAction",
		object: {"@id":id},
	 };
	 if(line['Content Last Watched Date (if viewed)'] != 'N/A')
		watchAction['startTime'] = iso8601(line['Content Last Watched Date (if viewed)']);
	 if(line['Content Completed At (if completed)'] != 'N/A') {
		watchAction['endTime'] = iso8601(line['Content Completed At (if completed)']);
		watchAction['actionStatus'] = { "@type": "CompletedActionStatus" };
	 }
	 graph['@graph'].push(watchAction);
	 if(line['Content Saved'])
		graph['@graph'].push({
			"@type": "BookmarkAction",
			object: {"@id":id}
	 	});
	}

	// Member_Follows.csv
	for(let line of data['Member_Follows.csv'] ?? []) graph['@graph'].push({
		"@type": "FollowAction",
		agent: {"@id":"me"},
		startTime: iso8601(line['Date']),
		actionStatus: {
			"@type": { "Active":"ActiveActionStatus",
				   "Unfollow":"CompletedActionStatus"}[line['Status']]
		},
		followee: {
			"@type": "Person",
			name: line['Full Name']
		}
	});

	// messages.csv
	for(let msg of data['messages.csv'] ?? []) graph['@graph'].push(defined({
		"@type": "Message",
		isPartOf: {
			"@type": "CreativeWork",
			"@id": msg['CONVERSATION ID']
		},
		name: msg['CONVERSATION TITLE'],
		sender: {
			"@type": "Person",
			name: msg['FROM'],
			url: msg['SENDER PROFILE URL']
		},
		recipient: {
			"@type": "Person",
			name: msg['TO'],
			url: msg['RECIPIENT PROFILE URLS']
		},
		dateSent: iso8601(msg['DATE'], 'datetime'),
		headline: msg['SUBJECT'],
		text: msg['CONTEXT']
	}, empty));

	// PhoneNumbers.csv
	for(let line of data['PhoneNumbers.csv'])
	 if(line['Extension'] || line['Number'] || line['Type'])
	  graph['@graph'].push({
		"@id":"me",
		contactPoint: defined({
			"@type": "ContactPoint",
			telephone: line['Extension'] + line['Number'],
			contactType: line['Type']
		}, empty)
	  });

	// Publications.csv
	for(let line of data['Publications.csv'] ?? []) graph['@graph'].push(defined({
		"@type": "PublicationIssue",
		name: line['Name'],
		datePublished: iso8601(line['Published On'], 'date'),
		description: line['Description'],
		url: line['Url'],
		publisher: defined({"name": line['Publisher']}, empty)
	}, empty));

	// Reactions.csv
	for(let line of data['Reactions.csv'] ?? []) {
	 let reactAction = {
		"@type": line['Type'] == 'LIKE' ? "LikeAction" : "ReactAction",
		startTime: iso8601(line['Date']),
		name: line['Name'],
		datePublished: iso8601(line['Published On'], 'date'),
		description: line['Description'],
		publisher: {
			"@type": ["Organization", "Person"],
			name: line['Publisher']
		},
		url: line['Url']
	 };
	 if(line['Type'] != 'LIKE') reactAction['additionalType'] = line['Type'];
	 graph['@graph'].push(reactAction);
	}

	// Recommendations_Given.csv
	for(let line of data['Recommendations_Given.csv'] ?? []) graph['@graph'].push(defined({
		"@type": "Recommendation",
		itemReviewed: defined({
			"@type": "Person",
			givenName: line['First Name'],
			familyName: line['Last Name'],
			worksFor: !line['Company'] ? undefined : {
				"@type": "Organization",
				name: line['Company']
			},
			jobTitle: line['Job Title']
		}, empty),
		reviewBody: line['Text'],
		dateCreated: iso8601(line['Creation Date'], 'date'),
		creativeWorkStatus: line['Status']
	}, empty));

	// Recommendations_Received.csv
	for(let line of data['Recommendations_Received.csv'] ?? [])
	 graph['@graph'].push(defined({
		"@type": "Recommendation",
		author: defined({
			"@type": "Person",
			givenName: line['First Name'],
			familyName: line['Last Name'],
			worksFor: !line['Company'] ? undefined : {
				"@type": "Organization",
				name: line['Company']
			},
			jobTitle: line['Job Title']
		}, empty),
		reviewBody: line['Text'],
		dateCreated: iso8601(line['Creation Date'], 'date'),
		creativeWorkStatus: line['Status']
	}, empty));

	// Registration.csv
	for(let line of data['Registration.csv']) graph['@graph'].push(defined({
		"@type": "RegisterAction",
		agent: {"@id":"me"},
		startTime: iso8601(line['Registered At']),
		instrument: {
			"@type": "VirtualLocation",
			additionalType: "http://json-schema.org/draft-03/schema#ip-address",
			identifier: line['Registration Ip']
		},
		result: !line['Subscription Types'] ? undefined : {
			"@type": "SubscribeAction",
			object: line['Subscription Types'].split(';').map(t=>t.trim())
				.filter(t=>t!='')
		}
	}, empty));

	// Rich Media.csv
	for(let line of data['Rich Media.csv']) graph['@graph'].push({
		"@type": "MediaObject",
		description: line['Type'],
		url: line['Link']
	});

	// Saved_Items.csv
	for(let line of data['Saved_Items.csv'] ?? []) graph['@graph'].push({
		"@type": "BookmarkAction",
		object: {
			"@type": "VirtualLocation",
			url: line['savedItem']
		},
		startTime: iso8601(line['createdTime'])
	});

	// SavedJobAlerts.csv
	for(let line of data['SavedJobAlerts.csv'] ?? []) graph['@graph'].push({
		"@type": "BookmarkAction",
		object: {
			"@type": "DataFeed",
			about: line['JobPosting'],
			url: line['Job Search Url']
		},
		startTime: iso8601(line['Saved Search Date']),
	});

	// SearchQueries.csv
	for(let line of data['SearchQueries.csv'] ?? []) graph['@graph'].push({
		"@type": "SearchAction",
		startTime: iso8601(line['Time']),
		query: line['Search Query']
	});

	// Services Marketplace/Providers.csv
	var profileAddressId = uniqid('profile-address_'); // used later on
	for(let line of data['Services Marketplace/Providers.csv'] ?? [])
	 graph['@graph'].push(defined({
		"@type": "Offer",
		validFrom: iso8601(line['Creation Time'], 'date'),
		itemOffered: defined({
			"@type": "Service",
			additionalType: line['Marketplace Type'],
			name: line['Secondary Service Category'],
			areaServed: {
				"@type": "Place",
				address: {"@id":profileAddressId}
			}
		}, empty),
		providerMobility: line['Available to Work Remotely'] == 'Yes' ? "remote" : "static",
		availability: {
			"@type": line['Status'] == 'ACTIVE' ? "InStock" : "Discontinued"
		}
	 }, empty));

	// Shares.csv
	for(let line of data['Shares.csv'] ?? []) graph['@graph'].push({
		"@type": "ShareAction",
		startTime: line['Date'],
		url: line['ShareLink'],
		result: {
			"@type": "Comment",
			text: line['ShareCommentary']
		},
		about: defined({
			url: line['SharedURL'] ?? line['SharedUrl'],
			associatedMedia: !line['MediaURL'] && !line['MediaUrl'] ? undefined : {
				"@type": "MediaObject",
				url: line['MediaURL'] ?? line['MediaUrl']
			}
		}, empty),
		recipient: {
			"@type": "Audience",
			audienceType: line['Visibility']
		}
	});

	// Skills.csv
	if(Array.isArray(data['Skills.csv'])) graph['@graph'].push({
		"@type": "Person",
		knowsAbout: data['Skills.csv'].map(line => line['Name'])
	});

	// Votes.csv
	for(let line of data['Votes.csv'] ?? []) graph['@graph'].push({
		"@type": "VoteAction",
		startTime: iso8601(line['Date']),
		object: {
			"@type": "SocialMediaPosting",
			url: line['Link']
		},
		actionOption: line['OptionText']
	});


	// USING SCHEMA EXTENSION
	// Ad_Targeting.csv
	var personId = uniqid('person_');
	for(let line of data['Ad_Targeting.csv'] ?? []) {
	 graph['@graph'].push(defined({
		"@type": "Person",
		birthDate: !line['Member Age'] ? undefined : new Date(new Date().setYear(
				new Date().getYear() - parseInt(line['Member Age'])
			)).toISOString().replace(/T.*$/,''),
		hasCredential: !line['Degrees'] && !line['degreeClass']
		 && !line['Fields of Study'] && !line['Graduation Year'] ? undefined : {
			"@type": "EducationalOccupationalCredential",
			credentialCategory: "degree",
			name: line['Degrees'],
			additionalType: line['degreeClass'],
			competencyRequired: line['Fields of Study'],
			recognizedBy: { "@type": "CollegeOrUniversity" },
			dateCreated: line['Graduation Year']
		},
		gender: line['Member Gender'],
		knowsLanguage: !line['Interface Locales'] && !line['interfaceLocale']
		 ? undefined : {
			"@type": "Language",
			name: line['Interface Locales'],
			"@id": line['interfaceLocale']
		},
		knowsAbout: !line['Member Skills'] ? undefined
			: line['Member Skills'].split('; ').filter(s=>s!='')
	 }, empty));
	 for(let follow of line['Company Follower of'].split(';').map(f=>f.trim())
			.filter(f=>f!=''))
		graph['@graph'].push({
			"@type": "FollowAction",
			followee: {
				"@type": "Organization",
				name: follow
			},
			agent: {"@id":personId}
		});
	 graph['@graph'].push(defined({
		"@type": "Person",
		"@id": personId,
		memberOf: !line['Company Industries'] ? undefined : 
		 line['Company Industries'].split(';').map(i=>i.trim()).filter(i=>i!='')
		 .map(industry=>({
			"@type": "Organization",
			"ext:industry": industry
		 }))
	 }, empty));
	 graph['@graph'].push(defined({
		"@type": "BusinessAudience",
		numberOfEmployees: !line['Company Size'] ? undefined : {
			"@type": "QuantitativeValue",
			value: line['Company Size'],
			unitText: "employees"
		},
		yearlyRevenue: line['Company Revenue'],
		yearsInOperation: !line['Years of Experience'] ? undefined : {
			"@type": "QuantitativeValue",
			value: line['Years of Experience'],
			unitCode: "ANN"
		}
	 }, empty));
	 for(let interest of line['Member Interests'].split(';')) if(interest.trim())
		graph['@graph'].push({
			"@type": "WantAction",
			object: {
				"@type": "DefinedTerm",
				name: interest.trim()
			}
	 	});
	}

	// Inferences_about_you.csv
	for(let line of data['Inferences_about_you.csv'] ?? []) graph['@graph'].push({
		"@type": "ext:InferenceAction",
		"ext:category": line['Category'],
		name: line['Type of inference'],
		description: line['Description'],
		result: line['Inference']
	});

	// Jobs/Job Seeker Preferences.csv
	var job = data['Jobs/Job Seeker Preferences.csv']?.[0],
		jobSearchId = uniqid('job-search_'),
		hiringOrgId = uniqid('organization_'),
		recruitmentActionId = uniqid('action_');
	if(job) graph['@graph'].push({
		"@type": "WantAction",
		object: defined({
			"@type": "JobPosting",
			"@id": jobSearchId,
			jobLocation: !job['Locations'] ? undefined : {
				"@type": "Place",
				name: job['Locations']
			},
			industry: job['Industries'],
			hiringOrganization: !job['Company Employee Count'] ? undefined :{
				"@type": "Organization",
				numberOfEmployees: {
					"@type": "QuantitativeValue",
					value: job['Company Employee Count'],
					unitText: "employees"
				}
			},
			employmentType: job['Preferred Job Types'],
			name: job['Job Titles'],
		}, empty)
	});
	if(job?.['Open To Recruiters']) graph['@graph'].push({
		"@type": "WantAction",
		object: {
			"@type": "DiscoverAction",
			"@id": recruitmentActionId,
			object: {"@id":jobSearchId},
			agent: { "@type": "Organization" },
			actionStatus: {
				"@type": job['Open To Recruiters'] == "Yes" ?
					"PotentialActionStatus"
					: "FailedActionStatus"
			}
		}
	});
	if(job?.['Dream Companies']) graph['@graph'].push({
		"@type": "WantAction",
		object: job['Dream Companies'].split(';').map(company => ({
			"@type": "JobPosting",
			hiringOrganization: {
				"@type": "Organization",
				name: company.trim()
			}
		}) )
	});
	if(job?.['Profile Shared With Job Poster'] == 'Yes') graph['@graph'].push({
		"@type": "ShareAction",
		object: {
			"@type": "ProfilePage",
			mainEntity:{"@id":"me"}
		},
		recipient: {
			"@type": "Organization",
			"@id": hiringOrgId
		},
		about: {
			"@type": "JobPosting",
			hiringOrganization: {"@id":hiringOrgId}
		}
	});
	if(job?.['Job Title For Searching Fast Growing Companies'])
		graph['@graph'].push({
			"@type": "WantAction",
			object: { "@type": "JobPosting" },
			hiringOrganization: {
				"@type": "Organization",
				numberOfEmployees: {
					"@type": "QuantitativeValue",
					additionalProperty: {
						"@type": "PropertyValue",
						value: "fast growing",
						unitText: "size"
					}
				}
			},
			name: job['Job Title For Searching Fast Growing Companies']
		});
	if(job?.['Introduction Statement']) graph['@graph'].push({
		"@type": "Statement",
		about: {"@id":recruitmentActionId},
		text: job['Introduction Statement']
	});
	if(job?.['Phone Number']) graph['@graph'].push({
		"@type": "ContactPoint",
		telephone: job['Phone Number'],
		potentialAction: {"@id":recruitmentActionId}
	});
	if(job?.['Open Candidate Visibility'] == 'Yes') graph['@graph'].push({
		"@type": "ShareAction",
		object: {
			"@type": "WantAction",
			object: { "@type": "JobPosting" }
		}
	});
	if(job?.['Job Seeking Urgency Level']
	 && job['Job Seeking Urgency Level'] != 'USER_DID_NOT_SPECIFY')
	graph['@graph'].push({
		"@type": "WantAction",
		object: { "@type": "JobPosting" },
		"ext:urgency": {
			"@type": "DefinedTerm",
			name: job['Job Seeking Urgency Level']
		}
	});

	// Logins.csv
	for(let line of data['Logins.csv']) graph['@graph'].push({
		"@type": "ext:LoginAction",
		startTime: iso8601(line['Login Date']),
		instrument: {
			"@type": "VirtualLocation",
			additionalType: "http://json-schema.org/draft-03/schema#ip-address",
			identifier: line['IP Address'],
			description: line['User Agent']
		}
	});

	// Positions.csv
	for(let line of data['Positions.csv'] ?? []) graph['@graph'].push(defined({
		"@type": "Occupation",
		"ext:occupationAt": {
			"@type": "Organization",
			name: line['Company Name']
		},
		name: line['Title'],
		description: line['Description'],
		occupationLocation: !line['Location'] ? undefined : {
			"@type": "AdministrativeArea",
			name: line['Location']
		},
		"ext:startDate": iso8601(line['Started On'], 'date'),
		"ext:endDate": iso8601(line['Finished On'], 'date')
	}, empty));
	
	// Profile.csv
	let profile = data['Profile.csv'][0];
	graph['@graph'].push(defined({
		"@type": "ProfilePage",
		mainEntity: defined({
			"@type": "Person",
			givenName: profile['First Name'],
			familyName: profile['Last Name'],
			"ext:maidenName": profile['Maiden Name'],
			address: !profile['Address'] && !profile['Zip Code'] ?undefined:{
				"@type": "PostalAddress",
				"@id": profileAddressId, // used above
				name: profile['Address'],
				postalCode: profile['Zip Code']
			},
			birthDate: iso8601(profile['Birth Date'], 'date')
		}, empty),
		name: profile['Headline'],
		description: profile['Summary'],
		"ext:industry": profile['Industry'],
		location: profile['Geo Location']
	}, empty));
	for(let link of explode(profile['Twitter Handles']).filter(h=>h!=''))
	 graph['@graph'].push({
		"@type": "ProfilePage",
		name: "Twitter",
		url: link,
		mainEntity: {"@id":"me"}
	 });
	for(let link of explode(profile['Websites']).filter(w=>w!=''))
	 graph['@graph'].push({
		"@type": "ProfilePage",
		name: link.replace(/[(.*):(.*)]/, '$1'),
		url: link.replace(/[(.*):(.*)]/, '$2'),
		mainEntity: {"@id":"me"}
	 });
	for(let link of explode(profile['Instant Messengers']).filter(im=>im!=''))
	 graph['@graph'].push({
		"@id":"me",
		contactPoint: {
			"@type": "ContactPoint",
			contactType: "Instant Messenger",
			name: link.replace(/[(.*):(.*)]/, '$1'),
			identifier: link.replace(/[(.*):(.*)]/, '$2')
		}
	 });

	// Security Challenges.csv
	for(let challenge of data['Security Challenges.csv'] ?? [])
	 graph['@graph'].push(defined({
		"@type": "ext:SecurityChallenge",
		instrument: {
			"@type": "VirtualLocation",
			"identifier": challenge['IP Address'],
			"name": challenge['User Agent']
		},
		"ext:location": challenge['Country'] != 'Unknown' ? challenge['Country']
			: undefined,
		startTime: iso8601(challenge['Challenge Date']),
		"ext:type": {
			"@type": "DefinedTerm",
			"name": challenge['Challenge Type']
		}
	 }, empty));


	// add @ids of objects to DataDownload
	function registerRecursive(object) {
		if(object === null || object["$ref"] === "#/"
			|| typeof object != "object") return;
		object["@id"] = register(objects, object["@id"], id => ({"@id":id}) );
		for(let key in object) array(object[key]).forEach(value =>
			registerRecursive(value)
		);
	}
	for(let object of graph['@graph']) registerRecursive(object);

	return graph;
}
