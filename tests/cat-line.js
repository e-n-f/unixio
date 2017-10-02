#!/usr/local/bin/node

'use strict';

let unixio = require('../index.js');

async function cat(fp) {
	while (true) {
		let s = fp.gets();
		s = s instanceof Promise ? await s : s;

		if (s == null) {
			break;
		}

		let p = unixio.stdout.puts(s);
		p = p instanceof Promise ? await p : p;
	}
}

async function main() {
	if (process.argv.length > 2) {
		let i;
		for (i = 2; i < process.argv.length; i++) {
			let fp = await unixio.fopen(process.argv[i], "r");
			await cat(fp);
			await fp.close();
		}
	} else {
		await cat(unixio.stdin);
	}
}

main().then(function() {
	;
}, function(err) {
	console.error(err);
	process.exit(1);
});
