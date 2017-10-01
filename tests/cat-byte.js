#!/usr/local/bin/node

'use strict';

let unixio = require('../index.js');

async function main() {
	while (true) {
		let b = unixio.stdin.getb();
		b = b instanceof Promise ? await b : b;

		if (b == unixio.EOF) {
			break;
		}

		let p = unixio.stdout.putb(b);
		p = p instanceof Promise ? await p : p;
	}
}

main().then(function() {
	;
}, function(err) {
	console.error(err);
	process.exit(1);
});
