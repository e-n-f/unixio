#!/usr/local/bin/node

'use strict';

let unixio = require('../index.js');

async function main() {
	while (true) {
		let s = unixio.stdin.gets();
		s = s instanceof Promise ? await s : s;

		if (s == null) {
			break;
		}

		let p = unixio.stdout.puts(s);
		p = p instanceof Promise ? await p : p;
	}
}

main().then(function() {
	;
}, function(err) {
	console.error(err);
	process.exit(1);
});
