const fs = require('node:fs/promises');
const crypto = import('crypto-hash');

Promise.all(
	process.argv.slice(2).map(async path =>
		({path, stats: await fs.stat(path)})
	)
).then(entries => entries.filter(entry =>
	!entry.path.endsWith('README.md') && entry.stats.isFile()
))
.then(files => Promise.all(
 files.map(file =>
  fs.readFile(file.path, 'utf8')
  .then(async content => [
	await crypto.then(crypto => crypto.sha256(content)),
	file.path.split('/').slice(-1)[0]
  ])
 )
)).then(list => Object.fromEntries(list))
.then(object => process.stdout.write(JSON.stringify(object)));
