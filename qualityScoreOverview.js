/**
 * Quality Score Listings Overview
 * 
 * Used to generate quality score overview of each listing.
 *
 * Reference (https://github.com/sv-jschwarz/qualityScoreOverview) for instructions.
 * 
 * @version 1.0
 * @author sv-cmswo
 * @date 05/03/2019
 **/

var googleapisLib = require('@sv/googleapisLib');
var objectLib = require('@sv/objectLib');

(async function main() {
	const sheetId = 'INSERT YOUR SHEET ID HERE';

	let filters = {
		typeid : { '$in': [] } // typeids are populated programmatically
	};

	const options = {
		fields : {
			_id                      : 0,
			updated                  : 1,
			taid                     : 1,
			taoptin                  : 1,
			rankorder                : 1,
			description              : 1,
			phone                    : 1,
			email                    : 1,
			weburl                   : 1,
			company                  : 1,
			recid                    : 1,
			hasYelp                  : 1,
			hasTripAdvisor           : 1,
			hasDescription           : 1,
			typeid                   : 1,
			rankid                   : 1,
			rankname                 : 1,
			'social.smserviceid'     : 1,
			'social.value'           : 1,
			'media.mediatype'        : 1,
			'amenities_array.typeid' : 1
		}
	};

	let metricsTable = {
		total                    : 0,
		hasYelp                  : 0,
		hasTripAdvisor           : 0,
		hasDescription           : 0,
		hasPhone                 : 0,
		hasEmail                 : 0,
		hasWebUrl                : 0,
		hasNoImages              : 0,
		hasOneImage              : 0,
		hasTwoToFourImages       : 0,
		hasFiveToNineImages      : 0,
		hasTenToFourteenImages   : 0,
		hasFifteenOrMoreImages   : 0,
		hasNoAmenities           : 0,
		hasLessThanFiveAmenities : 0,
		hasFiveOrMoreAmenities   : 0,
		ranks                    : [{ 999 : { rankname : 'No Rank', count : 0 } }]
	};

	const sheetTitle = `${site.config.settings.clientLong} - Quality Score Overview`;

	await clearSheet(sheetId).catch(errorFn);
	await formatSheet(sheetId, sheetTitle).catch(errorFn);

	let listingMeta = await getListingMeta().catch(errorFn);
	filters.typeid['$in'] = listingMeta[0].listingtypes.map(t => t.typeid);

	let listings = await getListings(filters, options).catch(errorFn);
	let calculated = calculateReport(listings, metricsTable);
	let report = generateReport(calculated);
	let result = await populateSheet(sheetId, report).catch(errorFn);

	cb(null, result);
})();

function generateReport(data) {
	let output = [
		['Quality Score Summary Overview'],
		['Total number of listings', data.total],
		[''],

		['Listing Info Summary'],
		['Yelp ID', data.hasYelp],
		['TripAdvisor ID', data.hasTripAdvisor],
		['Description', data.hasDescription],
		['Phone number', data.hasPhone],
		['Email', data.hasEmail],

		[''],
		['Listing Image Summary', 'Note: counts include \'image\' type media items only'],
		['0 images', data.hasNoImages],
		['1 image', data.hasOneImage],
		['2 - 4 images', data.hasTwoToFourImages],
		['5 - 9 images', data.hasFiveToNineImages],
		['10 - 14 images', data.hasTenToFourteenImages],
		['15 or more images', data.hasFifteenOrMoreImages],
		['Total', data.totalImages],

		[''],
		['Listing Amenity Summary'],
		['0 amenities', data.hasNoAmenities],
		['4 or fewer amenities', data.hasLessThanFiveAmenities],
		['5 or more amenities', data.hasFiveOrMoreAmenities],
		['Total', data.totalAmenities],

		[''],
		['Listing Rank Summary']
	];

	Object.keys(data.ranks[0]).forEach(id => {
		let rank = data.ranks[0][id];
		output.push([`${rank.rankname} (${id})`, rank.count]);
	});

	output.push(['Total', data.totalRanks]);

	return output;
}

function calculateReport(listings, metrics) {
	listings.forEach(listing => {
		if (listing.hasYelp)        metrics.hasYelp++;
		if (listing.hasTripAdvisor) metrics.hasTripAdvisor++;
		if (listing.description)    metrics.hasDescription++;
		if (listing.phone)          metrics.hasPhone++;
		if (listing.email)          metrics.hasEmail++;
		if (listing.weburl)         metrics.hasWebUrl++;

		// calculate images
		if (listing.media) {
			let mapSchema = {
				_temp : {
					var : true,
					filterArray : {
						input   : { key : 'current.item.media' },
						cond    : { 'current.mediatype' : 'Image' }
					}
				},
				value : 'var._temp.length'
			};

			let imageCount = objectLib.deepMap({ item : listing }, mapSchema).value || 0;
			if (imageCount >= 15)                         metrics.hasFifteenOrMoreImages++;
			else if (imageCount < 15 && imageCount >= 10) metrics.hasTenToFourteenImages++;
			else if (imageCount < 10 && imageCount >= 5)  metrics.hasFiveToNineImages++;
			else if (imageCount < 5 && imageCount >= 2)   metrics.hasTwoToFourImages++;
			else if (imageCount === 1)                    metrics.hasOneImage++;
			else if (imageCount === 0)                    metrics.hasNoImages++;
		} else {
			metrics.hasNoImages++;
		}

		// calculate amenities
		if (listing.amenities_array === undefined)    metrics.hasNoAmenities++;
		else if (listing.amenities_array.length < 5)  metrics.hasLessThanFiveAmenities++;
		else if (listing.amenities_array.length >= 5) metrics.hasFiveOrMoreAmenities++;

		// calculate ranks
		if (listing.rankid !== undefined) {
			if (metrics.ranks[0][listing.rankid] === undefined) {
				metrics.ranks[0][listing.rankid] = {
					rankname : listing.rankname,
					count    : 1
				};
			} else {
				metrics.ranks[0][listing.rankid].count++;
			}
		} else {
			metrics.ranks[0][999].count++;
		}
	});

	// calculate totals
	metrics.total = listings.length;

	metrics.totalImages = metrics.hasFifteenOrMoreImages
                        + metrics.hasTenToFourteenImages
                        + metrics.hasFiveToNineImages
                        + metrics.hasTwoToFourImages
                        + metrics.hasOneImage
                        + metrics.hasNoImages;

	metrics.totalAmenities = metrics.hasNoAmenities
                           + metrics.hasLessThanFiveAmenities
                           + metrics.hasFiveOrMoreAmenities;

	metrics.totalRanks = Object.values(metrics.ranks[0]).map(r => r.count).reduce((total, current) => total + current);

	return metrics;
}

function getListings(filters, options) {
	return new Promise((resolve, reject) => {
		site.plugins.listings.apis.listings.find(filters, options, (err, data) => {
			if (err) { reject(err); }
			resolve(data);
		});
	});
}

function getListingMeta() {
	return new Promise((resolve, reject) => {
		site.plugins.listings.apis.listingmeta.find({}, (err, data) => {
			if (err) { reject(err); }
			resolve(data);
		});
	});
}

function populateSheet(sheetId, data) {
	return new Promise((resolve, reject) => {
		googleapisLib.callApi({
			service : 'sheets',
			apiArgs : { version : 'v4' },
			method : 'spreadsheets.values.batchUpdate',
			args : {
				spreadsheetId : sheetId,
				resource : {
					valueInputOption : 'USER_ENTERED',
					data : [
						{
							range : 'A1:ZZZ100000',
							values : data
						}
					]
				}
			},
			jwtArgs : {
				permissions : ['https://www.googleapis.com/auth/spreadsheets']
			}
		}, (err, result) => {
			if (err) { reject(err); }
			resolve(result);
		});
	});
}

function formatSheet(sheetId, title) {
	return new Promise((resolve, reject) => {
		googleapisLib.callApi({
			service : 'sheets',
			apiArgs : { version : 'v4' },
			method : 'spreadsheets.batchUpdate',
			args : {
				spreadsheetId : sheetId,
				resource : {
					requests : [
						{
							updateSpreadsheetProperties : {
								properties : {
									title : title
								},
								fields : 'title'
							}
						}
					]
				}
			},
			jwtArgs : {
				permissions : ['https://www.googleapis.com/auth/spreadsheets']
			}
		}, (err, result) => {
			if (err) { reject(err); }
			resolve(result);
		});
	});
}

function clearSheet(sheetId) {
	return new Promise((resolve, reject) => {
		googleapisLib.callApi({
			service : 'sheets',
			apiArgs : { version : 'v4' },
			method : 'spreadsheets.values.batchClear',
			args : {
				spreadsheetId : sheetId,
				resource : { ranges : 'A1:ZZZ100000' }
			},
			jwtArgs : {
				permissions : ['https://www.googleapis.com/auth/spreadsheets']
			}
		}, (err, results) => {
			if (err) { reject(err); }
			resolve(results);
		});
	});
}

function errorFn(err) {
	console.log(err);
	return err;
}
