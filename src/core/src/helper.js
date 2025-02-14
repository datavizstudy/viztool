import uniqid from 'uniqid';
import * as chrono from 'chrono-node';	// more extensive than Date.parse()

/**
 * converts Dates to ISO 8601, as required by Schema.org
 * @param {string} datetime - date and/or time information
 * @param {string} [type="time"] - return types, either 'time', 'datetime' or 'date'.
 *	`time` or `date` always include `datetime` as possible return
 * @return {string?} Schema.org DateTime and either Time or Date. If no time given,
 *	even though type=time, then 00:00:00 is assumed. If `datetime` is falsy, undefined
 *	is returned.
 */
export function iso8601(datetime, type = 'time') {
 if(!datetime) return undefined;				// ''|null|undef
 let dt = chrono.parse(datetime)[0];
 if(!dt && new Date(datetime).getFullYear() == datetime)	// year-only
 	dt = chrono.parse('Jan '+datetime)[0];
 if(!dt) throw RangeError('"'+datetime+'" could not be parsed to `datetime`');
 let isTime = !dt.start.isCertain('year') && !dt.start.isCertain('month');
 if(isTime && type != 'time')
	throw RangeError('`datetime` does not contain day information');

 return dt.start.imply('timezoneOffset', 0).date().toISOString().replace({
	 time: new RegExp(isTime ? '^.*T|\.\d{3}' : '\.\d{3}', 'g'),
	 date: /T00:00:00\.000(Z|(\+|-)00:00)?$/,
	 datetime: /\.\d{3}/
	}[type], '');
}

/**
 * converts comma delimited strings to arrays
 * @description just string.split(',') would return [''] for string=''
 * @param {string} string - the comma delimited string
 * @return {[]} the parsed array
 */
export function explode(string) {
 return string.length ? string.split(',') : [];
}

/** removes object properties with value undefined
 * @param {object} object - the object to remove undefined properties from
 * @param {[]} empty - also exclude all keys with any value occuring in `empty`
 *	(additionally to `undefined`)
 * @returns {object} the sanitized object *or* `undefined` if the sanitized object
 *	would be empty
 */
export function defined(object, empty = []) {
	const entries = Object.entries(object)
		.filter(([_,v]) => v !== undefined && !empty.includes(v));
	return entries.length ? Object.fromEntries(entries) : undefined;
}

/** ensure array */
export function array(object) {
	return Array.isArray(object) ? object : (object !== undefined ? [object] : []);
}

/** creates ephemeral ID, adds it to array and returns the ID
 * @param {[]} [array=[]] - array (if available) where to add the ID
 * @param {string} [id="_:b…"] – override ID to a fixed value
 * @param {function} [map=_=>_] – transform the ID before adding to array
 * @returns {string} ephemeral ID
 */
export function register(array = [], id = uniqid('_:b'), map = _=>_) {
	array.push(map(id));
	return id;
}
